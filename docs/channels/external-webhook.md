# External Webhook Channel Setup

The external webhook channel lets any system send signals to NestFleet via a simple HTTP POST. Use it to route messages from Slack bots, Discord bots, Zapier, n8n, custom scripts, or any other source that isn't covered by the built-in channel integrations.

Each inbound message creates or threads into an existing Case in your product inbox, and runs through the standard triage and auto-reply pipeline.

---

## 1. Enable the Channel

1. Log in to the NestFleet console
2. Go to **Settings** → **Channels**
3. Enable **External Webhook** for the relevant product
4. The console will generate an API key — copy it

---

## 2. Send a Signal

Post a JSON body to:

```
POST https://<your-domain>/webhooks/external/<PRODUCT_ID>
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `threadId` | string | Yes | Stable identifier for the conversation thread. Messages with the same `threadId` are grouped into one Case. |
| `senderName` | string | Yes | Human-readable display name of the sender. |
| `senderRef` | string | Yes | Stable unique identifier for the sender within your system (e.g. `slack:U0123456`, `discord:123456789`). |
| `message` | string | Yes | Message body (plain text, up to 10,000 characters). |
| `channelContext` | object | No | Arbitrary metadata stored with the signal — useful for outbound reply routing (e.g. `chat_id`, `guild_id`, `channel_id`). |

### Example

```bash
curl -X POST https://nestfleet.yourcompany.com/webhooks/external/prod_abc123 \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "slack-thread-C01ABC123-1712345678.000200",
    "senderName": "Alice Example",
    "senderRef": "slack:U0123456ABC",
    "message": "Hey, the export button is not working for large datasets.",
    "channelContext": {
      "channel_id": "C01ABC123",
      "team_id": "T0MAIN123"
    }
  }'
```

### Response

```json
{
  "ok": true,
  "caseId": "case_01abc...",
  "signalId": "sig_01def...",
  "duplicate": false
}
```

| Field | Description |
|---|---|
| `caseId` | ID of the Case created or updated. |
| `signalId` | ID of the ingested signal record. |
| `duplicate` | `true` if this exact payload was already ingested (idempotent — safe to retry). |
| `canary` | `true` if the signal was a smoke-test canary (auto-resolved, no triage run). |

---

## 3. Thread Grouping

NestFleet uses `threadId` to group messages into Cases:

- First message with a given `threadId` → creates a new Case
- Subsequent messages with the same `threadId` (while the Case is open) → appended as follow-up signals to the existing Case, not a new one

Use a stable, deterministic `threadId` that maps to a conversation in your system — for example, a Slack thread timestamp (`channel_id:thread_ts`) or a Discord message thread ID.

---

## 4. Idempotency

NestFleet deduplicates signals using a hash of `productId + threadId + senderRef + message`. Sending the same payload twice is safe — the second request returns `duplicate: true` with no duplicate Case created.

---

## 5. Outbound Replies

NestFleet does not yet call back to external systems automatically. When the AI drafts a reply or an operator composes one, it appears in the Case detail view. Your integration is responsible for polling or subscribing to the NestFleet API to pick up outbound replies and deliver them to the original channel.

> Outbound webhook callbacks are planned for a future release.

---

## 6. Smoke Testing

Send a smoke-test signal to verify your integration without creating real Cases. Use `senderName: "smoke-test"` or `channelContext: { "source": "smoke-test" }`:

```bash
curl -X POST https://nestfleet.yourcompany.com/webhooks/external/prod_abc123 \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "smoke-check-001",
    "senderName": "smoke-test",
    "senderRef": "smoke:canary",
    "message": "Connectivity check"
  }'
```

The response will include `"canary": true`. The Case is created for traceability but immediately auto-resolved — no triage job is dispatched and no operator notification is sent.

---

## 7. Security

- The API key is stored encrypted in the database. Rotate it from **Settings → Channels → External Webhook → Regenerate Key**.
- Use HTTPS only. Never send the API key over plain HTTP.
- Restrict the API key to the minimum scope needed — it grants write access to Cases for a single product.
- If your sending system is a server-side process, keep the key in an environment variable or secret manager, not in client-side code.

---

## 8. Environment Variables Reference

The external webhook channel has no global environment variables. The per-product API key is managed in the console under **Settings → Channels**.

---

## 9. Troubleshooting

**401 Unauthorized**
The `Authorization: Bearer <key>` header is missing or the key does not match the product. Regenerate the key in Settings if unsure.

**400 Bad Request**
A required field (`threadId`, `senderName`, `senderRef`, `message`) is missing or the JSON is malformed. Check the response body for details.

**Case not appearing in inbox**
Check `docker compose logs api | grep external` for ingestion errors. Also verify the product's external webhook channel is toggled on in Settings.

**Outcome Unit limit reached**
If the product has hit its monthly OU cap, new Cases from the external webhook are blocked. Check usage in Settings → Usage. Raise `COMMUNITY_OU_LIMIT` in `.env` if needed.
