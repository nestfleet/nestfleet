# Team & Roles

NestFleet uses role-based access control (RBAC) with six built-in roles. Every authenticated user has exactly one role per Product. This guide explains what each role can do, how to invite teammates, how to change roles, and how to enable GitHub OAuth.

## The six roles

| Role | Cases | Auto-reply approval | Change Requests | Knowledge Base | Team & billing | Product config |
|------|-------|---------------------|-----------------|----------------|----------------|----------------|
| **Admin** | Full | Approve / send | Approve / merge | Full | Manage users, view billing | Edit all |
| **Operator** | Read & resolve, reply manually | Send only if pre-approved | Read | Read | — | Read |
| **Support Lead** | Full, can reassign | **Approve / reject** drafts, set thresholds | Read | Read, propose entries | View team | Read |
| **Change Lead** | Read | — | **Approve / reject / merge**, manage PR templates | Read | View team | Read GitHub config |
| **Product Lead** | Read | — | Read | Read | View team | Read all settings |
| **Knowledge Lead** | Read | — | Read | **Full** — accept/reject proposals, manage sources | View team | Read |

### Role notes

- **Admin** is the only role that can change other users' roles or invite new users.
- **Operator** is the day-to-day workhorse — they can resolve cases, reply to customers, and pause channels, but cannot approve AI-drafted replies or change requests.
- **Support Lead** owns reply quality. They tune the auto-send threshold and review borderline drafts.
- **Change Lead** owns code-change governance. They are the human gate between the LLM and your repo's `main` branch.
- **Product Lead** is intentionally read-only on operations but sees full analytics — designed for founders / PMs who want visibility without operational risk.
- **Knowledge Lead** curates the KB. In small teams this often pairs with Support Lead in a single person.

> **Tip:** roles are *additive within seniority lanes* — an Admin can do everything a Lead can do. But Leads are siloed from each other; a Change Lead cannot approve auto-replies.

## Inviting users

1. Open **Settings → Team**
2. Click **Invite member**
3. Enter an email address and pick a role
4. Optionally write a short welcome note
5. Click **Send invite**

The invitee receives an email with a single-use link valid for 7 days. Clicking it lands them on a sign-up page where they set their password (or sign in with GitHub — see below). After their first login, the invite is consumed and they appear in the team list as `active`.

If your SMTP isn't configured yet, the invite link is displayed in the dialog after creation — copy and send it manually.

> **Note:** while `REGISTRATION_ENABLED=false`, invites are the *only* way to add users. This is the recommended setting for production.

## Assigning and changing roles

From **Settings → Team**, click a user row. The slide-over panel shows:

- Current role and the date it was last changed
- A dropdown to set a new role (Admin only)
- A list of recent actions (audit trail)
- A **Deactivate** button (preserves history; the user can no longer log in)
- A **Remove** button (Admin-only; soft-deletes after a 30-day grace period)

Role changes take effect on the user's next request. If they're currently logged in, their session is re-evaluated against the new permissions automatically — no logout required.

## GitHub OAuth login

Instead of password login, users can sign in with GitHub. This is recommended for engineering teams since it removes one credential to manage.

### Setup (Admin, one-time)

1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set the callback URL to `https://<your-host>/api/auth/github/callback`
3. Copy the Client ID and Client Secret
4. In NestFleet, **Settings → Auth → GitHub OAuth**, paste both values
5. Toggle **Enable GitHub sign-in**

Set the following env vars (or use the settings page, which writes them for you):

```bash
GITHUB_OAUTH_CLIENT_ID=Iv1.xxxxxxxxxxxxx
GITHUB_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OAUTH_CALLBACK_URL=https://app.example.com/api/auth/github/callback
```

### User experience

On the login page, users see a **Sign in with GitHub** button. The first time someone signs in, NestFleet checks for an invite matching their GitHub email; if found, the invite is consumed and the user is created with the invited role. If no invite matches and `REGISTRATION_ENABLED=false`, sign-in is rejected.

> **Tip:** you can restrict GitHub sign-in to a specific organisation by setting `GITHUB_OAUTH_REQUIRE_ORG=your-org`. Members outside the org are denied even with a valid GitHub token.

## See also

- [Settings](./settings.md) — registration lock, OAuth env vars
- [Cases](./cases.md) — what each role sees in the queue
- [Change Requests](./change-requests.md) — Change Lead workflow in depth
