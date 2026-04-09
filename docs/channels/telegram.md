# Telegram Bot Channel Setup

NestFleet can receive messages via a Telegram bot. Users send messages to your bot, and NestFleet creates Cases from them.

## 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to choose a name and username
3. BotFather will respond with a **bot token** (format: `123456:ABC-DEF1234...`)
4. Copy the token

## 2. Configure NestFleet

Add the bot token to your `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

Restart the API:

```bash
docker compose restart api
```

## 3. Register the Webhook

Telegram needs to know where to send messages. Register your NestFleet instance as the webhook endpoint:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<your-domain>/webhooks/telegram"}'
```

Replace `<YOUR_BOT_TOKEN>` with your actual token and `<your-domain>` with your NestFleet domain.

You should receive:

```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

> **Note:** The webhook URL must be HTTPS. For local development, use a tunnel service (e.g., ngrok) to expose your local instance.

## 4. Enable in Console

1. Log in to the NestFleet console
2. Go to **Settings** and then **Channels**
3. Enable the **Telegram** channel for the relevant product

## 5. Testing

1. Open Telegram and find your bot by its username
2. Send a message (e.g., "Hello, I need help with my account")
3. Open the NestFleet console -- a new Case should appear in the product inbox
4. If no case appears, check logs: `docker compose logs api --tail 50`

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
