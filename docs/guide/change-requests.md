# Change Requests

A **Change Request** (CR) is NestFleet's bridge between customer signal and code change. When the pipeline decides a Case represents a real, novel problem — something the Knowledge Base does not already cover and that probably needs a fix, not a reply — it opens a CR and (optionally) drafts a pull request against your repo.

## When NestFleet creates a CR

Triage produces a `type` and a `confidence`. The CR branch is taken when **all** of the following hold:

1. `type` is `bug` or `feature`
2. No KB entry exceeded the match threshold (default cosine similarity `0.78`)
3. Confidence in the triage classification is above the auto-route threshold
4. The Product has a connected GitHub repo *or* a designated Change Lead

If a repo is connected, NestFleet immediately enqueues a `cr.draft_pr` job. If not, the CR is created in `proposed` state and waits for the Change Lead to act.

> **Note:** Operators can also create CRs manually from any case. See *Manual CR creation* below.

## The CR detail view

Open **Change Requests** in the side nav, or click the CR badge from a Case. The detail view has four sections:

### Summary

A one-paragraph problem statement, generated from the Case's signal(s) and triage rationale. Editable by Change Lead.

### Affected surfaces

A list of code paths, API endpoints, console pages, or docs pages that the LLM (using your repo's code search) believes are involved. Each entry links directly to the file at the inferred line range.

### Risk level

One of `low`, `medium`, `high`. Computed from: blast radius of affected surfaces, whether migrations are involved, presence of auth/billing code, and historical CR data. Risk drives which approver is recommended.

### Recommended approver

Defaults to the Change Lead, but escalates to Admin for `high`-risk CRs that touch auth, billing, or DB migrations.

## Approval workflow

A CR moves through:

```
proposed  ──►  pr_drafted  ──►  pr_ready  ──►  approved  ──►  merged
                                            └►  rejected
                                            └►  changes_requested
```

From the detail view, an authorised reviewer (Change Lead or Admin) has three buttons:

- **Approve** — marks the CR `approved`. If a PR exists, NestFleet posts an approving review and (optionally) merges if `auto_merge=true`.
- **Reject** — marks the CR `rejected`. The linked PR is closed with a referencing comment. The parent Case returns to `triaged` for alternative handling (e.g. manual reply).
- **Request changes** — keeps the CR open and posts a comment on the PR with the requested change. NestFleet's PR-revision agent will attempt one revision pass.

## GitHub PR drafting

When the `cr.draft_pr` job runs:

1. NestFleet clones a sparse checkout of the affected files into an ephemeral workspace
2. The `LLM_MODEL_COMPLEX` tier is invoked with the case context, KB excerpts, and existing code
3. A unified diff is produced and applied
4. A branch is created (`nestfleet/cr-<id>`), pushed, and a PR is opened via the GitHub API
5. CI status updates stream back into the CR via the GitHub webhook

The CR detail view shows the live PR status: branch name, commit SHA, files changed, CI checks, review threads.

> **Tip:** if CI fails, NestFleet automatically attempts up to `CR_AUTO_FIX_RETRIES` (default `1`) revision pass. After that, the CR is flagged for human attention.

## After approval vs rejection

**Approval path:**

1. CR marked `approved`, PR review submitted
2. If `auto_merge=true` and CI is green, NestFleet merges
3. The parent Case enters `resolved`
4. If reporter contact is known, NestFleet drafts a follow-up reply: *"This is fixed in version X — thanks for reporting."*
5. Notifications fire to: Change Lead, Support Lead, original reporter (optional)

**Rejection path:**

1. CR marked `rejected`, PR closed with reason
2. Parent Case returns to `triaged`
3. Notification fires to the operator who originally handled the case

Both transitions are recorded in the Case lineage and the CR audit log.

## Manual CR creation from a case

From any Case detail view, click **Create Change Request** in the actions menu. You'll be asked for:

- A one-line title
- A problem statement (pre-filled from the case)
- Optional affected surfaces (autocomplete from the repo)
- Risk level (defaults to `medium`)

The CR is created in `proposed` state. Click **Draft PR** at any time to invoke the same drafting pipeline used by automatic CRs.

## See also

- [Cases](./cases.md) — the parent Case lifecycle
- [Settings](./settings.md#github) — connecting a repo and configuring auto-merge
- [Team & Roles](./team-and-roles.md) — Change Lead permissions
