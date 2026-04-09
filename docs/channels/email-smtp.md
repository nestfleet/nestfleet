# Email Channel Setup

NestFleet can send and receive email via SMTP, Postmark, or Resend. This channel is used for operator notifications, AI auto-replies to customers, and inbound signal ingestion.

## Configuration

Set **one** of the three provider options in your `.env` file. NestFleet checks them in order: SMTP_HOST, then Postmark, then Resend.

`SMTP_FROM` is required for all options -- it must be a verified sender address for your provider.

### Option A: Generic SMTP

```env
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-smtp-password
SMTP_FROM=support@yourdomain.com
```

### Option B: Postmark

```env
POSTMARK_API_KEY=your-postmark-server-token
SMTP_FROM=support@yourdomain.com
```

Get your server token from the [Postmark dashboard](https://account.postmarkapp.com/) under your server's API Tokens tab.

### Option C: Resend

```env
RESEND_API_KEY=re_your_resend_api_key_here
SMTP_FROM=support@yourdomain.com
```

The `SMTP_FROM` domain must be verified in your [Resend dashboard](https://resend.com/domains).

## Inbound Email Signals

NestFleet can receive inbound emails as signals that create or update Cases. Two approaches:

### Forward to NestFleet Webhook

Configure your email provider to forward incoming emails to NestFleet's webhook endpoint:

```
POST https://<your-domain>/webhooks/email/inbound
```

Most providers (Postmark, Resend, SendGrid) support inbound webhook forwarding. Point the inbound webhook URL to the endpoint above.

### Direct SMTP Receive

If you run your own mail server, configure it to relay inbound messages to NestFleet's webhook endpoint via an HTTP POST on delivery.

## Testing

1. Configure your email provider in `.env` and restart: `docker compose restart api`
2. Open the console and navigate to a product
3. Send a test email to your configured support address
4. Verify a new Case appears in the product inbox
5. Check `docker compose logs api` if the case does not appear

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SMTP_FROM` | Yes | Sender address (must be verified with your provider) |
| `SMTP_HOST` | Option A | SMTP server hostname |
| `SMTP_PORT` | Option A | SMTP port (typically 587 for TLS) |
| `SMTP_USER` | Option A | SMTP username |
| `SMTP_PASS` | Option A | SMTP password |
| `POSTMARK_API_KEY` | Option B | Postmark server API token |
| `RESEND_API_KEY` | Option C | Resend API key |
