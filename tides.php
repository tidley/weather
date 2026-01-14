<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$apiKey = getenv('UKHO_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'UKHO_KEY is not set.']);
    exit;
}

$station = isset($_GET['station']) ? $_GET['station'] : '0085';
$baseUrl = 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/';
$url = $baseUrl . rawurlencode($station) . '/TidalEvents';

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Ocp-Apim-Subscription-Key: ' . $apiKey,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($err) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream fetch failed.', 'details' => $err]);
    exit;
}

if ($httpCode < 200 || $httpCode >= 300) {
    http_response_code($httpCode);
    echo json_encode(['error' => 'Upstream error', 'details' => $response]);
    exit;
}

echo $response;
