# NestFleet Channel Integration — Richness Gap & Architecture Options

> **Status:** Draft — 2026-04-02
> **Context:** Analysed when mapping DocuGardener × NestFleet integration use cases.
> **Related:** `docs/specs/FEAT-002-onboarding-channels-hub-refactor.md`, `docs/active/v1-epics-and-user-stories.md §DEFERRED-01..18`

---

## 1. The problem

NestFleet normalises every inbound signal to a flat structure:

```
signal.normalized_payload = {
  fromEmail:  string,
  fromName:   string,
  subject:    string,
  signalText: string   // plain text body
}
```

This works when P1's channels are also flat (email, contact form). It breaks when
P1 has richer communication surfaces than NestFleet can model.

---

## 2. Richness loss matrix

| P1 channel capability | What NestFleet receives today | What is lost |
|----------------------|------------------------------|--------------|
| Telegram thread reply (user replies to bot message) | New signal — no thread context | Threading: NestFleet creates a new case instead of appending |
| Telegram media (screenshot, log file) | Text only — attachment dropped | The screenshot showing the actual error |
| Discord thread in #support channel | Text body | Thread history, channel context |
| WhatsApp Business (read receipts, templates) | Nothing — channel not implemented | Entire channel |
| In-app chat with file upload | Text body | Config file or screenshot needed for diagnosis |
| Telegram voice message | Nothing | Audio content |
| Rich in-app context (current page, user state) | Nothing | Context that would reduce triage effort |
| SMS / phone callback request | Nothing | Entire channel |

---

## 3. The structural problem none of the channel options solve: conversation threading

When a user replies to NestFleet's Telegram message, NestFleet creates a **new case**
instead of appending to the existing conversation:

```
Signal 1: "my batch ZK is timing out" → case_A created
Auto-reply sent → Telegram message_id: 9921

User replies to message 9921: "tried batch of 10, still failing"
  → Telegram: { text: "tried...", reply_to_message_id: 9921 }
  → NestFleet has no mapping: message_id 9921 → case_A
  → NEW case_B created  ← wrong
```

**Root cause:** `conversation_ids[]` on cases is wired only for the chat widget
(SSE session-based). It is not generalised across channels.

**Fix required:** `channel_thread_id` field on signals + a lookup:
"does incoming signal reference a thread_id that maps to an existing open case?"
If yes → append to conversation, do not create new case.

---

## 4. Three architectural options

### Option A — Rich channel adapters (extend NestFleet ingress)

Each channel adapter extracts structured richness before normalisation:

```
Telegram message with attachment
  → adapter: download attachment → extract text (OCR / file parse)
  → store in signal.attachments[] (new field)
  → normalized_payload.signalText includes extracted content
```

- **Works for:** file attachments, structured metadata (current page, user context)
- **Does not work for:** voice, video, channel-native UX (reactions, threads as UX)
- **Cost:** one rich adapter per channel — scales linearly in engineering effort

### Option B — NestFleet as backend, P1 owns the channel frontend

P1 retains full ownership of the channel UX. NestFleet is called as an API service.

```
P1 Telegram Bot receives message (full Telegram richness)
  → P1 Bot: extract text + attachments, build NestFleet signal payload
  → POST /api/v1/products/:id/signals  (P1 calls NestFleet)
  → NestFleet: triage, case, auto-reply draft returned in response body
  → P1 Bot: sends reply via Telegram native API
     (formatted as Telegram message, not NestFleet email-style reply)
```

NestFleet never touches Telegram directly. P1 acts as the channel adapter.

- **Works for:** any channel P1 supports, full native UX preserved
- **Requires:** P1 team to build and maintain the adapter
- **Correct long-term pattern** — NestFleet becomes a headless ops API

### Option C — Split reply path (ops ≠ comms)

NestFleet manages the ops workflow. P1's channel handles the user-facing reply.

```
P1 Telegram → NestFleet (triage, case, CR, routing)
  → NestFleet produces: auto-reply draft text
  → NestFleet fires callback webhook to P1:
    POST P1_CALLBACK_URL {
      caseId,
      replyText,
      channel: "telegram",
      threadId: "tg_chat_123456/9921"
    }
  → P1 receives webhook → sends reply via native Telegram API in correct thread
```

- **Works for:** any channel, minimal NestFleet changes (outbound webhook only)
- **Requires:** P1 implements the callback receiver and native send logic
- **Pragmatic middle ground** — lower cost than Option B, channel richness preserved

---

## 5. The architectural investment that unlocks all options

A generic `channel_context` blob on signals eliminates most per-channel adapter work:

```typescript
interface SignalChannelContext {
  platform:          string                    // "telegram" | "discord" | "whatsapp" | ...
  thread_id:         string | null             // for conversation threading
  attachments:       ChannelAttachment[]       // extracted content from media
  platform_metadata: Record<string, unknown>   // platform-specific, passed through opaquely
}

interface ChannelAttachment {
  type:           "image" | "file" | "audio_transcript"
  original_url:   string
  extracted_text: string | null                // OCR / parse result
  mime_type:      string
}
```

NestFleet triage reads `channel_context.attachments[].extracted_text` — gets the file
content without caring it came from Telegram. The outbound webhook carries
`channel_context.thread_id` back to P1 so it can reply in the correct thread.

**One schema change, every current and future channel benefits.**

---

## 6. Recommended sequencing

| Phase | Action | Rationale |
|-------|--------|-----------|
| Now | Implement `channel_thread_id` dedup on signal ingress | Fixes case fragmentation — affects all existing channels, not just future ones |
| v2.0 | Add `signal.channel_context` blob to schema (nullable — no migration pain) | Unlocks Option C for Telegram at minimal cost |
| v2.1 | Implement Option C (outbound callback webhook) | Low effort, immediately enables Telegram, Discord, WhatsApp at P1's discretion |
| v2.1 | Telegram native adapter (Option A) | First-party — P1 owners shouldn't need to build their own bot adapter for the most common community channel |
| v2.2+ | Rich attachment extraction (OCR, file parse) | High value for developer-tool ICP (config files, stack traces in screenshots) |

---

## 7. What this means for the DocuGardener × NestFleet integration specifically

DocuGardener's users are developers — their primary channel is GitHub Issues (already
fully integrated). The richness gap is minimal there: GitHub issues are structured
text, NestFleet handles them natively.

The gap appears when DG adds a chat widget (DG-07, already shipped) or Telegram
community support. For the chat widget: conversation threading via SSE session ID is
already wired. For Telegram: Option C (outbound callback) is the right approach — DG
owns the Telegram bot, NestFleet handles triage and draft, DG sends the reply in the
thread.

The P1 integration pattern is therefore:
- GitHub Issues → NestFleet natively (already working)
- Chat widget → NestFleet natively (SSE, already working)
- Contact form → NestFleet natively (already working)
- Email → NestFleet natively (already working)
- Telegram → Option C (DG bot → NestFleet API → NestFleet callback → DG bot sends)
- Any future rich channel → Option B or C (P1 owns UX, NestFleet owns ops)
