<?php
// Static development server. Only public/ is exposed; there is no application backend.
declare(strict_types=1);

if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    exit;
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}
$root = realpath(__DIR__ . '/../public');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (str_contains($path, "\0") || str_contains($path, '\\')) {
    http_response_code(400);
    exit;
}
$file = realpath($root . ($path === '/' ? '/index.html' : $path));
if (!$file || !is_file($file) || !str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    exit('Recurso no encontrado.');
}
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
// Older static-server MIME tables do not recognize ES modules.
if (pathinfo($file, PATHINFO_EXTENSION) === 'mjs') {
    header('Content-Type: text/javascript; charset=utf-8');
    header('Content-Length: ' . filesize($file));
    if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') {
        readfile($file);
    }
    return true;
}
return false;
