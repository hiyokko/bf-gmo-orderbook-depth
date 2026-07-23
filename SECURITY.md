# Security Policy

## Secrets

This is a public repository. Never open an issue or pull request containing a Slack Webhook URL, token, credential, `.env` file, or Actions log with sensitive data.

The production Slack Webhook must exist only as the repository Actions Secret named `SLACK_WEBHOOK_URL`.

## If a secret is exposed

1. Revoke or rotate the Slack Incoming Webhook immediately.
2. Replace the `SLACK_WEBHOOK_URL` repository secret.
3. Treat removal from the latest commit as insufficient because Git history and caches may retain the value.

## Reporting

Report security concerns privately to the repository owner rather than creating a public issue.
