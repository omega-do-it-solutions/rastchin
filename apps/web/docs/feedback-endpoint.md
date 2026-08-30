# Feedback endpoint

The website feedback form posts JSON to `/api/feedback.php`. The endpoint lives
at `public/api/feedback.php`, so `pnpm build` copies it into
`out/api/feedback.php` with the rest of the static export.

This is the website's only trusted server boundary. It sends feedback through
SendGrid; it is not a general-purpose API and it does not receive content from
the browser, VS Code, or desktop integrations.

## Request contract

The endpoint accepts `POST` requests with an `application/json` content type.
Requests are limited to 16 KiB.

```text
type       suggestion | bug | support | other
name       optional
email      optional; validated when present
message    required
source     optional; defaults to website
company    hidden honeypot
```

Legacy `description`, `related`, and `expected` fields remain accepted so old
cached pages and extension links fail gracefully.

## Runtime requirements

- PHP 8.4
- PHP cURL extension
- SendGrid Web API v3 access
- An authenticated SendGrid sender address or domain
- A writable system temporary directory for the short per-IP rate-limit marker

## Server-only configuration

Never put SendGrid credentials in browser JavaScript, the static export, or a
committed file. Copy `.env.example` to an ignored `.env` for local reference,
but inject production values through the host environment or a protected file
outside the document root.

Supported environment variables:

```text
SENDGRID_API_KEY
RASTCHIN_FEEDBACK_TO
RASTCHIN_FEEDBACK_FROM
RASTCHIN_FEEDBACK_FROM_NAME
RASTCHIN_FEEDBACK_REPLY_TO
RASTCHIN_FEEDBACK_REPLY_TO_NAME
RASTCHIN_FEEDBACK_CONFIG
```

The default protected-file location is `$HOME/rastchin-feedback.config.php`.
`RASTCHIN_FEEDBACK_CONFIG` can point to another absolute server path.

```php
<?php
return [
    'api_key' => 'SENDGRID_API_KEY_HERE',
    'to_email' => 'hi' . '@' . 'rastchin.tools',
    'from_email' => 'no-reply' . '@' . 'rastchin.tools',
    'from_name' => 'راست‌چین',
    'reply_to_email' => 'no-reply' . '@' . 'rastchin.tools',
    'reply_to_name' => 'راست‌چین',
];
```

## Security and privacy controls

- POST and JSON only
- 16 KiB request-body limit and bounded field lengths
- hidden honeypot
- validated optional reply address
- atomic, per-IP 10-second rate limit using an exclusive file lock
- 12-second SendGrid timeout
- stable JSON errors that do not expose credentials or provider response bodies
- plain-text and escaped RTL HTML email bodies

The generated support email includes the fields entered by the user, the form
source, IP address, and User-Agent. SendGrid processes the message for delivery.
The public privacy page discloses these fields and a maximum 12-month retention
period. Do not add logging or another processor without updating that policy.

The temporary rate-limit filename contains only a SHA-256 digest of the IP; its
contents are a timestamp. Host- or CDN-level abuse controls can supplement this
small-instance safeguard if traffic grows.

## Verification

Before a release:

1. Run `php -l public/api/feedback.php` with PHP 8.4.
2. Run `pnpm build` and confirm `out/api/feedback.php` exists.
3. On a configured staging host, verify wrong methods, wrong content types,
   oversized bodies, invalid email, rate limiting, SendGrid failure, and a valid
   submission.
4. Confirm the sender/domain remains authenticated and the API key has only the
   Mail Send permission it needs.

Production deployment and live feedback submission require explicit owner
authorization.
