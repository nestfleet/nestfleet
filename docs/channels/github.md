# GitHub App / Webhook Channel Setup

NestFleet integrates with GitHub to receive issue and PR events as signals and to draft pull requests for Change Requests.

## 1. Create a GitHub App

1. Go to **GitHub** then **Settings** then **Developer settings** then **GitHub Apps** then **New GitHub App**
2. Fill in the details:
   - **App name:** e.g., `NestFleet - YourCompany`
   - **Homepage URL:** your NestFleet domain
   - **Webhook URL:** `https://<your-domain>/webhooks/github/events/<PRODUCT_ID>`
     (replace `<PRODUCT_ID>` with your NestFleet product ID -- find it in Console under the product's settings)
   - **Webhook secret:** generate one with `openssl rand -hex 20`
3. Set permissions:
   - **Repository permissions:**
     - Contents: **Read & write** (for PR drafting)
     - Pull requests: **Read & write**
     - Issues: **Read-only**
     - Metadata: **Read-only** (auto-selected)
   - **Subscribe to events:** Pull request, Issues, Push
4. Click **Create GitHub App**
5. Note the **App ID** from the app's settings page
6. Under **Private keys**, click **Generate a private key** -- a `.pem` file will download

## 2. Configure NestFleet

Add the credentials to your `.env`:

```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

For the private key, you can either:
- Paste the full PEM content with `\n` for line breaks (as shown above)
- Base64-encode it: `cat your-key.pem | base64 | tr -d '\n'` and use `GITHUB_APP_PRIVATE_KEY_B64` instead

Alternatively, if you prefer a simpler setup without a GitHub App, you can use a Personal Access Token:

```env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

Restart the API:

```bash
docker compose restart api
```

## 3. Install the App on Your Org/Repo

1. Go to your GitHub App's page: `https://github.com/apps/<your-app-name>`
2. Click **Install** and select the organization or repositories you want to connect
3. Approve the requested permissions

## 4. How Events Create Cases

When NestFleet receives GitHub webhook events:

- **New issue opened** -- creates a Case with the issue body as the initial signal
- **Pull request opened** -- creates a Case linked to the PR, tracks CI status
- **PR review requested / comments** -- attaches as follow-up signals to the existing Case
- **Push events** -- used internally for Change Request CI tracking

NestFleet matches events to products using the `github_repo` field configured in each product's support policy.

## 5. Troubleshooting

**Webhook returns 401**
Verify that `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret in your GitHub App's webhook settings exactly. Regenerate both if unsure.

**Events not creating Cases**
Check that the GitHub App is installed on the correct repository and that the product's `support_policy.github_repo` is set to `owner/repo` format.

**Webhook delivery failures**
Go to your GitHub App's settings, click **Advanced**, and review recent webhook deliveries for error details.

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `GITHUB_APP_ID` | For App auth | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | For App auth | PEM private key (newlines as `\n`) |
| `GITHUB_TOKEN` | For PAT auth | Personal Access Token (alternative to App) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Must match the secret in GitHub webhook config |
