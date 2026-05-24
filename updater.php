<?php

require_once __DIR__ . '/version.php';

header('Content-Type: application/json; charset=utf-8');

class WeatherUpdater {
  const RELEASE_API = 'https://api.github.com/repos/%s/releases/latest';
  const PACKAGE_ASSET = 'weather.zip';
  const STATUS_FILE = 'update-status.json';

  public static function getUpdateStatus() {
    $currentVersion = self::normalizeVersion(WEATHER_VERSION);
    $installEnabled = self::configuredUpdateToken() !== '';
    $zipAvailable = class_exists('ZipArchive');

    try {
      $release = self::getLatestRelease();
      $asset = self::findAsset($release, self::PACKAGE_ASSET);
    } catch (Exception $error) {
      return [
        'success' => true,
        'currentVersion' => WEATHER_VERSION,
        'latestVersion' => '',
        'latestTag' => '',
        'releaseName' => '',
        'releaseUrl' => null,
        'publishedAt' => null,
        'updateAvailable' => false,
        'installEnabled' => $installEnabled,
        'zipAvailable' => $zipAvailable,
        'assetName' => self::PACKAGE_ASSET,
        'assetUrl' => null,
        'assetDigest' => null,
        'assetSize' => null,
        'message' => $error->getMessage(),
      ];
    }

    $latestTag = (string) ($release['tag_name'] ?? '');
    $latestVersion = self::normalizeVersion($latestTag);
    $updateAvailable =
      $latestVersion !== '' &&
      version_compare($latestVersion, $currentVersion, '>');

    return [
      'success' => true,
      'currentVersion' => WEATHER_VERSION,
      'latestVersion' => $latestVersion,
      'latestTag' => $latestTag,
      'releaseName' => $release['name'] ?? $latestTag,
      'releaseUrl' => $release['html_url'] ?? null,
      'publishedAt' => $release['published_at'] ?? null,
      'updateAvailable' => $updateAvailable,
      'installEnabled' => $installEnabled,
      'zipAvailable' => $zipAvailable,
      'assetName' => self::PACKAGE_ASSET,
      'assetUrl' => $asset['browser_download_url'] ?? null,
      'assetDigest' => $asset['digest'] ?? null,
      'assetSize' => $asset['size'] ?? null,
    ];
  }

  public static function installLatest($token) {
    self::verifyUpdateToken($token);

    if (function_exists('set_time_limit')) {
      @set_time_limit(300);
    }
    if (function_exists('ignore_user_abort')) {
      @ignore_user_abort(true);
    }

    try {
      self::writeInstallStatus('starting', 'Starting update...');

      if (!class_exists('ZipArchive')) {
        throw new Exception('PHP ZipArchive extension is required for updates.');
      }

      self::writeInstallStatus('checking', 'Checking latest release...');
      $status = self::getUpdateStatus();
      if (empty($status['updateAvailable'])) {
        $result = [
          'success' => true,
          'updated' => false,
          'message' => 'Already up to date.',
          'currentVersion' => $status['currentVersion'],
          'latestVersion' => $status['latestVersion'],
        ];
        self::writeInstallStatus('current', 'Already up to date.', $result);
        return $result;
      }

      $assetUrl = $status['assetUrl'] ?? '';
      self::validateAssetUrl($assetUrl, $status['latestTag']);

      $stamp = gmdate('Ymd-His') . '-' . self::randomSuffix();
      $updatesDir = self::dataDir() . '/updates';
      $backupDir = self::dataDir() . '/update-backups/' . $stamp;
      $workDir = $updatesDir . '/' . $stamp;
      $zipPath = $workDir . '/release.zip';
      $extractDir = $workDir . '/extract';

      self::ensureDataDir();
      self::ensureDir($workDir);
      self::ensureDir($extractDir);
      self::ensureDir($backupDir);

      self::writeInstallStatus('downloading', 'Downloading update package...', [
        'tag' => $status['latestTag'],
        'assetSize' => $status['assetSize'] ?? null,
      ]);
      self::downloadFile($assetUrl, $zipPath);

      self::writeInstallStatus('verifying', 'Verifying update package...', [
        'tag' => $status['latestTag'],
      ]);
      self::verifyDigest($zipPath, $status['assetDigest'] ?? null);

      self::writeInstallStatus('extracting', 'Extracting update package...', [
        'tag' => $status['latestTag'],
      ]);
      self::extractZip($zipPath, $extractDir);

      $packageRoot = self::findPackageRoot($extractDir);
      $installRoot = __DIR__;
      $entries = self::listPackageFiles($packageRoot);

      self::writeInstallStatus('checking_files', 'Checking file permissions...', [
        'tag' => $status['latestTag'],
      ]);
      self::preflightWritable($installRoot, $entries);

      self::writeInstallStatus('installing', 'Installing update files...', [
        'tag' => $status['latestTag'],
      ]);
      self::copyPackage($packageRoot, $installRoot, $backupDir, $entries);

      if (function_exists('opcache_reset')) {
        @opcache_reset();
      }

      self::removeDir($workDir);

      $result = [
        'success' => true,
        'updated' => true,
        'version' => $status['latestVersion'],
        'tag' => $status['latestTag'],
        'backupDir' => $backupDir,
      ];
      self::writeInstallStatus('complete', 'Update installed.', $result);
      return $result;
    } catch (Exception $error) {
      self::writeInstallStatus('failed', $error->getMessage(), [
        'updated' => false,
        'error' => $error->getMessage(),
      ]);
      throw $error;
    }
  }

  public static function getInstallStatus() {
    $path = self::statusPath();
    if (!is_file($path)) {
      return [
        'success' => true,
        'state' => 'idle',
        'message' => 'No update has been run yet.',
      ];
    }

    $data = json_decode((string) @file_get_contents($path), true);
    if (!is_array($data)) {
      return [
        'success' => true,
        'state' => 'unknown',
        'message' => 'Update status is unavailable.',
      ];
    }

    $data['success'] = true;
    return $data;
  }

  private static function getLatestRelease() {
    $url = sprintf(self::RELEASE_API, self::updateRepo());
    $response = self::httpGet($url, self::githubHeaders([
      'Accept: application/vnd.github+json',
      'User-Agent: Weather/' . WEATHER_VERSION,
      'X-GitHub-Api-Version: 2022-11-28',
    ]));

    $release = json_decode($response, true);
    if (!is_array($release)) {
      throw new Exception('Invalid GitHub release response.');
    }
    if (isset($release['message']) && !isset($release['tag_name'])) {
      throw new Exception('GitHub release lookup failed: ' . $release['message']);
    }

    return $release;
  }

  private static function findAsset($release, $name) {
    $assets = isset($release['assets']) && is_array($release['assets'])
      ? $release['assets']
      : [];
    foreach ($assets as $asset) {
      if (($asset['name'] ?? '') === $name) {
        return $asset;
      }
    }

    throw new Exception('Release asset not found: ' . $name);
  }

  private static function normalizeVersion($version) {
    return ltrim(trim((string) $version), "vV \t\n\r\0\x0B");
  }

  private static function updateRepo() {
    $repo = self::envValue('WEATHER_UPDATE_REPO');
    if ($repo === '') {
      $repo = WEATHER_UPDATE_REPO;
    }
    if (!preg_match('/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/', $repo)) {
      throw new Exception('WEATHER_UPDATE_REPO must be in owner/repository format.');
    }
    return $repo;
  }

  private static function validateAssetUrl($url, $tag) {
    $expectedPrefix =
      'https://github.com/' .
      self::updateRepo() .
      '/releases/download/' .
      rawurlencode($tag) .
      '/';
    if ($url === '' || strncmp($url, $expectedPrefix, strlen($expectedPrefix)) !== 0) {
      throw new Exception('Unexpected release asset URL.');
    }
  }

  private static function httpGet($url, $headers = []) {
    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => $headers,
      ]);

      $body = curl_exec($ch);
      $error = curl_error($ch);
      $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);

      if ($body === false || $status >= 400) {
        throw new Exception($error ? $error : 'HTTP request failed with status ' . $status);
      }
      return $body;
    }

    $context = stream_context_create([
      'http' => [
        'method' => 'GET',
        'header' => implode("\r\n", $headers),
        'timeout' => 30,
        'follow_location' => 1,
        'max_redirects' => 5,
        'ignore_errors' => true,
      ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
      throw new Exception('HTTP request failed.');
    }
    $status = 200;
    if (isset($http_response_header) && is_array($http_response_header)) {
      foreach ($http_response_header as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
          $status = (int) $matches[1];
        }
      }
    }
    if ($status >= 400) {
      $decoded = json_decode($body, true);
      $message = is_array($decoded) && isset($decoded['message'])
        ? $decoded['message']
        : 'HTTP request failed with status ' . $status;
      throw new Exception($message);
    }
    return $body;
  }

  private static function downloadFile($url, $path) {
    $fp = fopen($path, 'wb');
    if ($fp === false) {
      throw new Exception('Could not write update package.');
    }

    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_LOW_SPEED_LIMIT => 1024,
        CURLOPT_LOW_SPEED_TIME => 20,
        CURLOPT_HTTPHEADER => self::githubHeaders(['User-Agent: Weather/' . WEATHER_VERSION]),
      ]);
      $ok = curl_exec($ch);
      $error = curl_error($ch);
      $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);
      fclose($fp);

      if ($ok === false || $status >= 400) {
        throw new Exception($error ? $error : 'Download failed with status ' . $status);
      }
      return;
    }

    $body = self::httpGet($url, self::githubHeaders(['User-Agent: Weather/' . WEATHER_VERSION]));
    fwrite($fp, $body);
    fclose($fp);
  }

  private static function githubHeaders($headers = []) {
    $token = self::envValue('WEATHER_GITHUB_TOKEN');
    if ($token !== '') {
      $headers[] = 'Authorization: Bearer ' . $token;
    }
    return $headers;
  }

  private static function verifyDigest($path, $digest) {
    if (!is_string($digest) || $digest === '') return;
    $parts = explode(':', $digest, 2);
    if (count($parts) !== 2 || strtolower($parts[0]) !== 'sha256') return;
    $actual = hash_file('sha256', $path);
    if (!hash_equals(strtolower($parts[1]), strtolower($actual))) {
      throw new Exception('Update package digest did not match.');
    }
  }

  private static function extractZip($zipPath, $extractDir) {
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
      throw new Exception('Could not open update package.');
    }
    if (!$zip->extractTo($extractDir)) {
      $zip->close();
      throw new Exception('Could not extract update package.');
    }
    $zip->close();
  }

  private static function findPackageRoot($extractDir) {
    if (is_file($extractDir . '/index.html') && is_file($extractDir . '/app.js')) {
      return $extractDir;
    }
    $entries = scandir($extractDir);
    foreach ($entries as $entry) {
      if ($entry === '.' || $entry === '..') continue;
      $path = $extractDir . '/' . $entry;
      if (is_dir($path) && is_file($path . '/index.html') && is_file($path . '/app.js')) {
        return $path;
      }
    }
    throw new Exception('Update package root was not found.');
  }

  private static function listPackageFiles($packageRoot) {
    $files = [];
    $iterator = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($packageRoot, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
      if (!$file->isFile()) continue;
      $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($packageRoot) + 1));
      if (self::shouldSkipPackageFile($relative)) continue;
      $files[] = $relative;
    }
    return $files;
  }

  private static function shouldSkipPackageFile($relative) {
    $skip = [
      '.env',
      'weather-cache.json',
      'waves-cache.json',
      'tides-cache.json',
    ];
    return in_array($relative, $skip, true);
  }

  private static function preflightWritable($installRoot, $entries) {
    foreach ($entries as $relative) {
      $target = $installRoot . '/' . $relative;
      if (file_exists($target) && !is_writable($target)) {
        throw new Exception('File is not writable: ' . $relative);
      }
      $parent = dirname($target);
      if (!is_dir($parent)) {
        $parent = dirname($parent);
      }
      if (!is_writable($parent)) {
        throw new Exception('Directory is not writable: ' . str_replace($installRoot . '/', '', $parent));
      }
    }
  }

  private static function copyPackage($packageRoot, $installRoot, $backupDir, $entries) {
    foreach ($entries as $relative) {
      $source = $packageRoot . '/' . $relative;
      $target = $installRoot . '/' . $relative;
      $targetDir = dirname($target);
      if (!is_dir($targetDir)) {
        self::ensureDir($targetDir);
      }

      if (file_exists($target)) {
        $backupPath = $backupDir . '/' . $relative;
        self::ensureDir(dirname($backupPath));
        if (!copy($target, $backupPath)) {
          throw new Exception('Could not back up file: ' . $relative);
        }
      }

      if (!copy($source, $target)) {
        throw new Exception('Could not install file: ' . $relative);
      }
    }
  }

  private static function verifyUpdateToken($token) {
    $configured = self::configuredUpdateToken();
    if ($configured === '') {
      throw new Exception('Set WEATHER_UPDATE_TOKEN in .env before installing updates.');
    }
    if (!hash_equals($configured, (string) $token)) {
      throw new Exception('Invalid update token.');
    }
  }

  private static function configuredUpdateToken() {
    $token = self::envValue('WEATHER_UPDATE_TOKEN');
    if ($token === '') {
      $token = self::envValue('UPDATE_TOKEN');
    }
    return $token;
  }

  private static function envValue($key) {
    $value = getenv($key);
    if ($value !== false && trim($value) !== '') {
      return trim($value);
    }
    $env = self::readDotEnv();
    return isset($env[$key]) ? trim((string) $env[$key]) : '';
  }

  private static function readDotEnv() {
    static $env = null;
    if ($env !== null) return $env;
    $env = [];
    $path = __DIR__ . '/.env';
    if (!is_file($path)) return $env;
    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) return $env;
    foreach ($lines as $line) {
      $line = trim($line);
      if ($line === '' || $line[0] === '#') continue;
      $parts = explode('=', $line, 2);
      if (count($parts) !== 2) continue;
      $key = trim($parts[0]);
      $value = trim($parts[1]);
      if (
        strlen($value) >= 2 &&
        (($value[0] === '"' && substr($value, -1) === '"') ||
          ($value[0] === "'" && substr($value, -1) === "'"))
      ) {
        $value = substr($value, 1, -1);
      }
      $env[$key] = $value;
    }
    return $env;
  }

  private static function dataDir() {
    return __DIR__ . '/.weather-update-data';
  }

  private static function ensureDataDir() {
    self::ensureDir(self::dataDir());
    $htaccess = self::dataDir() . '/.htaccess';
    if (!is_file($htaccess)) {
      @file_put_contents($htaccess, "deny from all\n");
    }
    $index = self::dataDir() . '/index.html';
    if (!is_file($index)) {
      @file_put_contents($index, "<!doctype html><title></title>\n");
    }
  }

  private static function statusPath() {
    self::ensureDataDir();
    return self::dataDir() . '/' . self::STATUS_FILE;
  }

  private static function writeInstallStatus($state, $message, $extra = []) {
    $payload = array_merge(
      [
        'state' => $state,
        'message' => $message,
        'time' => gmdate('c'),
      ],
      $extra
    );
    @file_put_contents(
      self::statusPath(),
      json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
      LOCK_EX
    );
  }

  private static function ensureDir($dir) {
    if (is_dir($dir)) return;
    if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
      throw new Exception('Could not create directory: ' . $dir);
    }
  }

  private static function removeDir($dir) {
    if (!is_dir($dir)) return;
    $items = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
      RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
      if ($item->isDir()) {
        @rmdir($item->getPathname());
      } else {
        @unlink($item->getPathname());
      }
    }
    @rmdir($dir);
  }

  private static function randomSuffix() {
    if (function_exists('random_bytes')) {
      return bin2hex(random_bytes(4));
    }
    return substr(sha1(uniqid('', true)), 0, 8);
  }
}

function send_update_json($payload, $status = 200) {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
  $body = json_decode((string) file_get_contents('php://input'), true);
  if (is_array($body) && isset($body['action'])) {
    $action = (string) $body['action'];
  }
}

try {
  if ($action === 'status') {
    send_update_json(WeatherUpdater::getUpdateStatus());
  }
  if ($action === 'install-status') {
    send_update_json(WeatherUpdater::getInstallStatus());
  }
  if ($action === 'install') {
    if ($method !== 'POST') {
      send_update_json(['success' => false, 'error' => 'POST is required.'], 405);
    }
    $token = $_SERVER['HTTP_X_WEATHER_UPDATE_TOKEN'] ?? '';
    send_update_json(WeatherUpdater::installLatest($token));
  }

  send_update_json(['success' => false, 'error' => 'Unknown update action.'], 400);
} catch (Exception $error) {
  send_update_json(['success' => false, 'error' => $error->getMessage()], 500);
}
