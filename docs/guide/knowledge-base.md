# Knowledge Base

The **Knowledge Base** (KB) is NestFleet's long-term memory. Everything the AI pipeline "knows" beyond the model's pretraining lives here: your product docs, FAQs, runbooks, past case resolutions, internal policy notes. Without a populated KB, NestFleet can still triage and route, but auto-reply quality is poor and the rate of true `match` outcomes is low. With a good KB, NestFleet becomes substantially more autonomous.

## How the KB feeds the pipeline

Two pipeline steps read from the KB:

1. **Triage** — when classifying a case, the triage prompt is given the top-K most similar KB chunks. This grounds the severity/type decision and lets the LLM say "this looks like the known issue documented in *Password reset returns 500*" instead of inventing context.
2. **Auto-reply** — the auto-reply agent retrieves KB chunks scoped to the case's inferred topic and quotes them (with internal citations) when drafting the response.

Retrieval uses vector similarity over OpenAI-compatible embeddings stored in **pgvector**. Default settings retrieve the top 8 chunks above cosine similarity `0.72`.

## Adding knowledge sources

Open **Knowledge Base → Sources**. Three ways to add content:

### Manual entry

Click **New entry**. Pick a type (`faq`, `runbook`, `policy`, `doc`, `past_resolution`), give it a title, and write the body in Markdown. Tags and a product-area field improve retrieval precision.

### Document upload

Drag a file in (`.md`, `.pdf`, `.txt`, `.html`). NestFleet parses, splits into chunks, embeds each chunk, and stores them. The original file is kept for re-embedding when you change the embedding model.

### URL crawl

Paste a URL or sitemap. NestFleet crawls (respecting `robots.txt`), extracts main content, and ingests each page as an entry. Set a re-crawl schedule (`daily`, `weekly`, `monthly`, `never`) per source.

> **Tip:** if your docs site is in a Git repo, add it via **Sources → Git** and NestFleet will re-sync on every push using the GitHub webhook.

## Auto-proposed KB updates

When a case is resolved — manually or via auto-reply — a `kb.propose` job runs. The agent looks at the original Signal, the actual resolution (reply text or CR diff), and the current KB. It then drafts one of three outputs:

| Proposal kind | When it triggers |
|---------------|------------------|
| **New entry** | The case is genuinely novel and no existing KB chunk overlaps |
| **Entry update** | A close-but-stale KB entry exists; the proposal patches it |
| **No-op** | The resolution adds no new information |

Proposals appear under **Knowledge Base → Proposals** with a diff view (for updates) or a preview (for new entries).

## Reviewing proposals

The Knowledge Lead (or any Admin) sees pending proposals. For each:

- **Accept** — adds the entry / applies the patch and re-embeds. The original case is linked as the proposal source.
- **Edit & accept** — opens an inline editor before saving.
- **Reject** — discards. Optionally captures a one-line reason that feeds a "rejected proposals" filter used to tune the proposer prompt.

> **Note:** rejecting many similar proposals is a strong signal that your retrieval threshold or proposer temperature needs adjusting. Check [Analytics](./analytics.md) → KB hygiene.

## Chunking & embedding (conceptual)

You do not configure chunking directly, but it helps to know what's happening:

- Documents are split by semantic boundaries (headings first, paragraphs second, hard 1200-token max)
- Each chunk gets a metadata envelope: source, type, tags, parent doc, position
- Chunks are embedded with the configured embedding model (default `text-embedding-3-small`, 1536 dims)
- Vectors and metadata are stored in the `kb_chunks` table with an HNSW index

Changing the embedding model triggers a background re-embed of all entries. NestFleet keeps both vector sets until the new one is fully populated, then switches atomically.

## Best practices for KB content

A small, well-structured KB beats a huge dumped one. Guidelines:

1. **One concept per entry.** If a FAQ answer covers two unrelated problems, split it. RAG retrieves chunks; tight chunks score higher.
2. **Lead with the symptom, not the cause.** Users describe symptoms; the embedding will match better if your KB does too. *"Login button does nothing"* beats *"NextAuth session race condition."*
3. **Include the user-visible message verbatim.** Quote the exact error text — this is gold for similarity matching.
4. **Date your runbooks.** Add a `last_verified: YYYY-MM-DD` line. The auto-reply agent treats stale entries with lower confidence.
5. **Use `past_resolution` aggressively.** Accept the auto-proposed entries — they encode real, lived support knowledge in the exact words your users used.
6. **Tag by surface, not by team.** *"billing-portal"* is a better tag than *"team-payments"*. Surfaces are stable; teams reorganise.

## See also

- [Cases](./cases.md) — where KB matches surface in the triage pane
- [Analytics](./analytics.md) → KB hygiene metrics
- [Settings](./settings.md#embedding) — choosing an embedding provider and dimensions
