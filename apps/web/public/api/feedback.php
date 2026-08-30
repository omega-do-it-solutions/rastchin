<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const MAX_FIELD_LENGTH = 4000;
const MAX_BODY_BYTES = 16384;
const RATE_LIMIT_SECONDS = 10;

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clean_string(mixed $value, int $maxLength = MAX_FIELD_LENGTH): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = trim(str_replace(["\r\n", "\r"], "\n", $value));

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLength, 'UTF-8');
    }

    return substr($value, 0, $maxLength);
}

function html_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function get_config(): array
{
    $config = [
        'api_key' => getenv('SENDGRID_API_KEY') ?: '',
        'to_email' => getenv('RASTCHIN_FEEDBACK_TO') ?: '',
        'from_email' => getenv('RASTCHIN_FEEDBACK_FROM') ?: '',
        'from_name' => getenv('RASTCHIN_FEEDBACK_FROM_NAME') ?: 'راست‌چین',
        'reply_to_email' => getenv('RASTCHIN_FEEDBACK_REPLY_TO') ?: '',
        'reply_to_name' => getenv('RASTCHIN_FEEDBACK_REPLY_TO_NAME') ?: '',
    ];

    $configPaths = array_filter([
        getenv('RASTCHIN_FEEDBACK_CONFIG') ?: '',
        getenv('HOME') ? rtrim((string) getenv('HOME'), '/') . '/rastchin-feedback.config.php' : '',
        dirname(__DIR__, 2) . '/rastchin-feedback.config.php',
    ]);

    foreach (array_unique($configPaths) as $configPath) {
        if (is_readable($configPath)) {
            $fileConfig = require $configPath;
            if (is_array($fileConfig)) {
                $config = array_merge($config, array_filter($fileConfig, static fn($value) => $value !== ''));
            }
            break;
        }
    }

    return $config;
}

function rate_limit(): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = hash('sha256', $ip);
    $file = sys_get_temp_dir() . '/rastchin-feedback-' . $key;
    $now = time();

    $handle = fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        respond(503, ['ok' => false, 'error' => 'rate_limit_unavailable']);
    }

    rewind($handle);
    $last = (int) stream_get_contents($handle);
    $retryAfter = $last > 0 ? RATE_LIMIT_SECONDS - ($now - $last) : 0;

    if ($retryAfter > 0) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respond(429, [
            'ok' => false,
            'error' => 'rate_limited',
            'retry_after' => $retryAfter,
        ]);
    }

    ftruncate($handle, 0);
    rewind($handle);
    if (fwrite($handle, (string) $now) === false || !fflush($handle)) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respond(503, ['ok' => false, 'error' => 'rate_limit_unavailable']);
    }

    flock($handle, LOCK_UN);
    fclose($handle);
}

function send_with_sendgrid(array $config, string $subject, string $textBody, string $htmlBody): void
{
    if (!function_exists('curl_init')) {
        respond(500, ['ok' => false, 'error' => 'curl_missing']);
    }

    $payload = [
        'personalizations' => [
            [
                'to' => [
                    ['email' => $config['to_email']],
                ],
            ],
        ],
        'from' => [
            'email' => $config['from_email'],
            'name' => $config['from_name'],
        ],
        'reply_to' => [
            'email' => $config['reply_to_email'] ?: $config['from_email'],
            'name' => $config['reply_to_name'] ?: $config['from_name'],
        ],
        'subject' => $subject,
        'content' => [
            [
                'type' => 'text/plain',
                'value' => $textBody,
            ],
            [
                'type' => 'text/html',
                'value' => $htmlBody,
            ],
        ],
    ];

    $ch = curl_init('https://api.sendgrid.com/v3/mail/send');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $config['api_key'],
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 12,
    ]);

    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    if ($response === false || $error !== '') {
        respond(502, ['ok' => false, 'error' => 'sendgrid_transport_failed']);
    }

    if ($status < 200 || $status >= 300) {
        $reason = match ($status) {
            401 => 'sendgrid_unauthorized',
            403 => 'sendgrid_forbidden',
            default => 'sendgrid_rejected',
        };

        respond(502, ['ok' => false, 'error' => $reason, 'status' => $status]);
    }
}

function format_value(string $value): string
{
    return $value !== '' ? $value : '-';
}

function build_plain_text(array $feedback): string
{
    $lines = [
        'بازخورد راست‌چین',
        '',
        'موضوع: ' . $feedback['type_label'],
        'نام: ' . format_value($feedback['name']),
        'ایمیل پاسخ: ' . format_value($feedback['email']),
        'منبع: ' . format_value($feedback['source']),
        $feedback['related'] !== '' ? 'بخش مرتبط: ' . $feedback['related'] : null,
        'IP: ' . format_value($feedback['ip']),
        'User-Agent: ' . format_value($feedback['user_agent']),
        '',
        'پیام:',
        $feedback['message'],
        $feedback['expected'] !== '' ? "\nنتیجه مورد انتظار:\n" . $feedback['expected'] : null,
    ];

    return implode("\n", array_filter($lines, static fn($line) => $line !== null));
}

function meta_row(string $label, string $value, string $dir = 'rtl'): string
{
    return '<tr dir="rtl" style="direction:rtl;text-align:right;">'
        . '<td align="right" dir="rtl" style="width:128px;padding:8px 0 8px 16px;color:#6f6875;font-size:13px;white-space:nowrap;vertical-align:top;text-align:right;direction:rtl;">' . html_escape($label) . '</td>'
        . '<td align="right" dir="' . html_escape($dir) . '" style="padding:8px 0;color:#201a26;font-size:14px;vertical-align:top;text-align:right;direction:' . html_escape($dir) . ';">' . html_escape(format_value($value)) . '</td>'
        . '</tr>';
}

function build_html_email(array $feedback): string
{
    $metaRows = [
        meta_row('موضوع', $feedback['type_label']),
        meta_row('نام', $feedback['name']),
        meta_row('ایمیل پاسخ', $feedback['email'], 'ltr'),
        meta_row('منبع', $feedback['source']),
        $feedback['related'] !== '' ? meta_row('بخش مرتبط', $feedback['related']) : '',
        meta_row('IP', $feedback['ip'], 'ltr'),
        meta_row('User-Agent', $feedback['user_agent'], 'ltr'),
    ];

    $expected = $feedback['expected'] !== ''
        ? '<div dir="rtl" style="margin-top:20px;direction:rtl;text-align:right;">'
            . '<div align="right" dir="rtl" style="margin-bottom:8px;color:#6f6875;font-size:13px;font-weight:700;text-align:right;direction:rtl;">نتیجه مورد انتظار</div>'
            . '<div align="right" dir="rtl" style="white-space:pre-wrap;line-height:1.9;color:#201a26;text-align:right;direction:rtl;">' . html_escape($feedback['expected']) . '</div>'
            . '</div>'
        : '';

    return '<!doctype html>'
        . '<html lang="fa" dir="rtl">'
        . '<body dir="rtl" style="margin:0;background:#f8f4f6;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Tahoma,Arial,sans-serif;color:#201a26;direction:rtl;text-align:right;">'
        . '<div dir="rtl" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e7e1ea;border-radius:10px;overflow:hidden;direction:rtl;text-align:right;">'
        . '<div dir="rtl" align="right" style="padding:22px 24px;background:#b42345;color:#ffffff;direction:rtl;text-align:right;">'
        . '<img src="https://rastchin.tools/brand/rastchin-logo.png" width="32" height="32" alt="راست‌چین" style="display:inline-block;width:32px;height:32px;border-radius:8px;margin-left:10px;vertical-align:middle;">'
        . '<div style="display:inline-block;font-size:14px;color:#ffe8ee;vertical-align:middle;">راست‌چین</div>'
        . '<h1 align="right" dir="rtl" style="margin:10px 0 0;font-size:22px;line-height:1.5;text-align:right;direction:rtl;">' . html_escape($feedback['type_label']) . '</h1>'
        . '</div>'
        . '<div dir="rtl" align="right" style="padding:22px 24px;direction:rtl;text-align:right;">'
        . '<table role="presentation" dir="rtl" align="right" style="width:100%;border-collapse:collapse;border-bottom:1px solid #eee7f0;margin-bottom:22px;direction:rtl;text-align:right;">'
        . implode('', $metaRows)
        . '</table>'
        . '<div align="right" dir="rtl" style="margin-bottom:8px;color:#6f6875;font-size:13px;font-weight:700;text-align:right;direction:rtl;">پیام</div>'
        . '<div align="right" dir="rtl" style="white-space:pre-wrap;line-height:1.9;color:#201a26;font-size:15px;text-align:right;direction:rtl;">' . html_escape($feedback['message']) . '</div>'
        . $expected
        . '</div>'
        . '</div>'
        . '</body>'
        . '</html>';
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''), 2)[0]));
if ($contentType !== 'application/json') {
    respond(415, ['ok' => false, 'error' => 'unsupported_media_type']);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > MAX_BODY_BYTES) {
    respond(413, ['ok' => false, 'error' => 'payload_too_large']);
}

$input = fopen('php://input', 'rb');
if ($input === false) {
    respond(400, ['ok' => false, 'error' => 'invalid_body']);
}

$raw = stream_get_contents($input, MAX_BODY_BYTES + 1);
fclose($input);

if ($raw === false) {
    respond(400, ['ok' => false, 'error' => 'invalid_body']);
}

if (strlen($raw) > MAX_BODY_BYTES) {
    respond(413, ['ok' => false, 'error' => 'payload_too_large']);
}

$data = json_decode($raw, true);

if (!is_array($data)) {
    respond(400, ['ok' => false, 'error' => 'invalid_json']);
}

if (clean_string($data['company'] ?? '', 100) !== '') {
    respond(200, ['ok' => true]);
}

$typeLabels = [
    'suggestion' => 'پیشنهاد',
    'bug' => 'گزارش مشکل',
    'support' => 'پشتیبانی',
    'other' => 'سایر',
    // Legacy values kept for old extension links or cached static pages.
    'feature' => 'پیشنهاد',
    'site' => 'درخواست پشتیبانی از سایت جدید',
];

$type = clean_string($data['type'] ?? 'suggestion', 32);
if (!isset($typeLabels[$type])) {
    $type = 'suggestion';
}

$name = clean_string($data['name'] ?? '', 200);
$email = clean_string($data['email'] ?? '', 320);
$message = clean_string($data['message'] ?? ($data['description'] ?? ''));
$related = clean_string($data['related'] ?? '', 500);
$expected = clean_string($data['expected'] ?? '');
$source = clean_string($data['source'] ?? 'website', 80);

if ($message === '') {
    respond(422, ['ok' => false, 'error' => 'message_required']);
}

if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    respond(422, ['ok' => false, 'error' => 'invalid_email']);
}

$config = get_config();
foreach (['api_key', 'to_email', 'from_email'] as $key) {
    if (($config[$key] ?? '') === '') {
        respond(500, ['ok' => false, 'error' => 'missing_server_config']);
    }
}

rate_limit();

$feedback = [
    'type_label' => $typeLabels[$type],
    'name' => $name,
    'email' => $email,
    'message' => $message,
    'related' => $related,
    'expected' => $expected,
    'source' => $source,
    'ip' => clean_string($_SERVER['REMOTE_ADDR'] ?? '', 80),
    'user_agent' => clean_string($_SERVER['HTTP_USER_AGENT'] ?? '', 500),
];

$textBody = build_plain_text($feedback);
$htmlBody = build_html_email($feedback);

send_with_sendgrid($config, '[راست‌چین] ' . $typeLabels[$type], $textBody, $htmlBody);

respond(200, ['ok' => true]);
