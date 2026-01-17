<?php
// weather.php
// Server-side cached proxy for Open-Meteo forecast.
// Cache semantics: serve cached response if it is < 1 hour old unless refresh=1.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$TTL_SECONDS = 7200; // 2 hours
$CACHE_FILE = __DIR__ . '/weather-cache.json';

function send_json($payload, $status = 200) {
  http_response_code($status);
  echo $payload;
  exit;
}

function send_payload($payload, $status = 200) {
  http_response_code($status);
  echo $payload;
  exit;
}

function set_cache_headers($ttlSeconds, $fetchedAt = null) {
  header('Cache-Control: public, max-age=' . $ttlSeconds . ', stale-while-revalidate=60');
  if ($fetchedAt) {
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', intval($fetchedAt)) . ' GMT');
  }
}

function cache_read($path) {
  if (!file_exists($path)) return null;
  $raw = @file_get_contents($path);
  if ($raw === false) return null;
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) return null;
  return $decoded;
}

function cache_write($path, $data) {
  $tmp = $path . '.tmp';
  @file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  @rename($tmp, $path);
}

$force = isset($_GET['refresh']) && (string)$_GET['refresh'] === '1';

// Build a safe Open-Meteo URL from a strict allowlist of query parameters.
$allow = [
  'latitude',
  'longitude',
  'timezone',
  'wind_speed_unit',
  'forecast_days',
  'current',
  'hourly',
  'daily',
  'temperature_unit',
  'precipitation_unit',
  'timeformat',
];

$params = [];
foreach ($allow as $k) {
  if (!isset($_GET[$k])) continue;
  $v = $_GET[$k];
  // Basic hardening: cap size to avoid log/cache abuse.
  if (is_string($v) && strlen($v) > 4000) continue;
  $params[$k] = $v;
}

// Provide sensible defaults if caller didn't pass them.
if (!isset($params['timezone'])) $params['timezone'] = 'Europe/London';
if (!isset($params['wind_speed_unit'])) $params['wind_speed_unit'] = 'kn';
if (!isset($params['current'])) {
  $params['current'] = 'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
}
if (!isset($params['hourly'])) {
  $params['hourly'] = 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover';
}

$cache = cache_read($CACHE_FILE);
$cache_age = null;
if (is_array($cache) && isset($cache['fetched_at'])) {
  $cache_age = time() - intval($cache['fetched_at']);
}

$query = http_build_query($params);
$url = 'https://api.open-meteo.com/v1/forecast' . ($query ? ('?' . $query) : '');

// Only serve cache if it matches the exact upstream URL we would request.
if (
  !$force &&
  is_array($cache) &&
  isset($cache['data'], $cache['fetched_at'], $cache['upstream_url']) &&
  is_string($cache['upstream_url']) &&
  $cache['upstream_url'] === $url &&
  $cache_age !== null &&
  $cache_age >= 0 &&
  $cache_age < $TTL_SECONDS
) {
  $fetchedAt = intval($cache['fetched_at']);
  if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
    $since = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
    if ($since !== false && $since >= $fetchedAt) {
      header('X-Cache: HIT');
      header('X-Cache-Age-Seconds: ' . $cache_age);
      header('X-Updated-At: ' . gmdate('c', $fetchedAt));
      set_cache_headers($TTL_SECONDS, $fetchedAt);
      http_response_code(304);
      exit;
    }
  }
  header('X-Cache: HIT');
  header('X-Cache-Age-Seconds: ' . $cache_age);
  header('X-Updated-At: ' . gmdate('c', $fetchedAt));
  set_cache_headers($TTL_SECONDS, $fetchedAt);
  if (isset($cache['payload']) && is_string($cache['payload'])) {
    send_payload($cache['payload']);
  }
  send_json(json_encode($cache['data'], JSON_UNESCAPED_SLASHES));
}

$context = stream_context_create([
  'http' => [
    'method' => 'GET',
    'timeout' => 12,
    'header' => "User-Agent: weather-proxy/1.0\r\nAccept: application/json\r\n",
  ],
]);

$response = @file_get_contents($url, false, $context);

if ($response === false) {
  // If upstream fails, serve stale cache if present.
  if (is_array($cache) && isset($cache['data'])) {
    header('X-Cache: STALE');
    if ($cache_age !== null) header('X-Cache-Age-Seconds: ' . $cache_age);
    if (isset($cache['fetched_at'])) header('X-Updated-At: ' . gmdate('c', intval($cache['fetched_at'])));
    set_cache_headers($TTL_SECONDS, isset($cache['fetched_at']) ? intval($cache['fetched_at']) : null);
    if (isset($cache['payload']) && is_string($cache['payload'])) {
      send_payload($cache['payload'], 200);
    }
    send_json(json_encode($cache['data'], JSON_UNESCAPED_SLASHES), 200);
  }
  header('X-Cache: MISS');
  send_json(json_encode(['error' => 'Failed to fetch weather upstream']), 502);
}

$decoded = json_decode($response, true);
if (!is_array($decoded)) {
  header('X-Cache: MISS');
  send_json(json_encode(['error' => 'Upstream returned invalid JSON']), 502);
}

cache_write($CACHE_FILE, [
  'fetched_at' => time(),
  'upstream_url' => $url,
  'data' => $decoded,
  'payload' => $response,
]);

header('X-Cache: MISS');
header('X-Updated-At: ' . gmdate('c', time()));
set_cache_headers($TTL_SECONDS, time());
send_json($response, 200);
