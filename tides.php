<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$apiKey = getenv('UKHO_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'UKHO_KEY is not set.']);
    exit;
}

$station = isset($_GET['station']) ? (string)$_GET['station'] : '';
if ($station === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing station parameter.']);
    exit;
}

// Optional manual override: refresh=1 forces upstream fetch regardless of cache.
$forceRefresh = (isset($_GET['refresh']) && (string)$_GET['refresh'] === '1');

$cacheFile = __DIR__ . '/tides-cache.json';

// Secondary safety TTL (optional but recommended). Set to 0 to disable TTL checks.
$ttlSeconds = 0; // e.g. 10 * 60 for 10 minutes
$minDaysRequired = 6;

function read_cache(string $path): array {
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function write_cache(string $path, array $cache): void {
    $json = json_encode($cache, JSON_UNESCAPED_SLASHES);
    if ($json === false) return;
    @file_put_contents($path, $json, LOCK_EX);
}

/**
 * Count distinct local-date days present in a UKHO tidal events payload.
 * Payload is expected to be either an array of events or an object containing an array.
 */
function count_distinct_days_from_payload($decoded): int {
    $events = [];

    if (is_array($decoded)) {
        // Could be either list-of-events or associative object
        $isList = array_keys($decoded) === range(0, count($decoded) - 1);
        if ($isList) {
            $events = $decoded;
        } else {
            // Try common container keys
            foreach (['items', 'data', 'events', 'TidalEvents'] as $k) {
                if (isset($decoded[$k]) && is_array($decoded[$k])) {
                    $events = $decoded[$k];
                    break;
                }
            }
        }
    }

    $days = [];
    foreach ($events as $e) {
        if (!is_array($e)) continue;
        $dt =
            $e['EventDateTime'] ??
            $e['EventDateTimeUtc'] ??
            $e['DateTime'] ??
            $e['dateTime'] ??
            $e['time'] ??
            $e['Time'] ??
            null;

        if (!is_string($dt) || $dt === '') continue;

        $ts = strtotime($dt);
        if ($ts === false) continue;

        // Normalise to YYYY-MM-DD
        $days[date('Y-m-d', $ts)] = true;
    }

    return count($days);
}

/**
 * Returns an array with:
 *  - payload_string (string|null)
 *  - days (int)
 *  - ts (int)
 */
function get_cached_entry(array $cache, string $station): array {
    if (!isset($cache[$station]) || !is_array($cache[$station])) {
        return ['payload_string' => null, 'days' => 0, 'ts' => 0];
    }
    $entry = $cache[$station];
    $payload = $entry['payload'] ?? null;
    $storedDays = isset($entry['days']) ? (int)$entry['days'] : 0;
    $ts = isset($entry['ts']) ? (int)$entry['ts'] : 0;

    // payload stored as raw JSON string
    if (!is_string($payload) || $payload === '') {
        return ['payload_string' => null, 'days' => 0, 'ts' => 0];
    }

    // Always recompute days from payload so coverage matches the stored data.
    $decoded = json_decode($payload, true);
    $payloadDays = is_null($decoded) ? 0 : count_distinct_days_from_payload($decoded);
    $days = $payloadDays > 0 ? $payloadDays : $storedDays;

    return ['payload_string' => $payload, 'days' => $days, 'ts' => $ts];
}

$cache = read_cache($cacheFile);
$now = time();

$cached = get_cached_entry($cache, $station);

$ttlOk = true;
if ($ttlSeconds > 0 && $cached['ts'] > 0) {
    $ttlOk = (($now - $cached['ts']) < $ttlSeconds);
}

$coverageOk = ($cached['days'] >= $minDaysRequired);

$canServeCache = (!$forceRefresh && $cached['payload_string'] !== null && $coverageOk && $ttlOk);

if ($canServeCache) {
    header('X-Cache: HIT');
    header('X-Coverage-Days: ' . $cached['days']);
    echo $cached['payload_string'];
    exit;
}

// Fetch from UKHO because:
// - no cache, or
// - cached dataset covers < 6 days, or
// - forceRefresh, or
// - TTL expired (if ttlSeconds > 0)
$baseUrl = 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/';
$url = $baseUrl . rawurlencode($station) . '/TidalEvents';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Ocp-Apim-Subscription-Key: ' . $apiKey,
        'Accept: application/json',
    ],
    CURLOPT_TIMEOUT => 15,
]);

$response = curl_exec($ch);
$err = curl_error($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream fetch failed.', 'details' => $err]);
    exit;
}

if ($httpCode < 200 || $httpCode >= 300) {
    http_response_code($httpCode);
    echo json_encode(['error' => 'Upstream error', 'details' => $response]);
    exit;
}

// Compute coverage days for the new payload
$decoded = json_decode($response, true);
$newDays = is_null($decoded) ? 0 : count_distinct_days_from_payload($decoded);

// Cache it regardless; if UKHO gives fewer days sometimes, you’ll still store latest payload.
$cache[$station] = [
    'ts' => $now,
    'days' => $newDays,
    'payload' => $response, // raw JSON string
];
write_cache($cacheFile, $cache);

header('X-Cache: MISS');
header('X-Coverage-Days: ' . $newDays);
echo $response;
