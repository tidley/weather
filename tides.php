<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$apiKey = getenv('UKHO_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'UKHO_KEY is not set.']);
    exit;
}

$station = isset($_GET['station']) ? (string)$_GET['station'] : '0085';
$forceRefresh = (isset($_GET['refresh']) && (string)$_GET['refresh'] === '1');

$cacheFile = __DIR__ . '/tides-cache.json';
$ttlSeconds = 10 * 60; // 10 minutes

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

// Serve cached payload if present and fresh
$cache = read_cache($cacheFile);
$now = time();

if (!$forceRefresh && isset($cache[$station]) && is_array($cache[$station])) {
    $entry = $cache[$station];
    $ts = isset($entry['ts']) ? (int)$entry['ts'] : 0;
    $payload = $entry['payload'] ?? null;

    if ($payload !== null && ($now - $ts) < $ttlSeconds) {
        header('X-Cache: HIT');
        echo is_string($payload) ? $payload : json_encode($payload);
        exit;
    }
}

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

// Update cache
$cache[$station] = [
    'ts' => $now,
    'payload' => $response, // store raw JSON string
];
write_cache($cacheFile, $cache);

header('X-Cache: MISS');
echo $response;
