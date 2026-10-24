# No-domain Gmail email relay (safe rollout)

This is **not deployed by opening this pull request**. It preserves the working
Supabase Auth password-reset SMTP configuration and existing database contents.

## Why

The existing \`send-application-notification\` Edge Function calls Resend,
which rejects the \`gmail.com\` sender with HTTP 403 because that domain
cannot be verified by this organization. The Vercel-hosted site needs no
custom domain to use Gmail SMTP for the union's operational messages.

## Security & secrets (configure only inside dashboards)

1. In **Vercel Project → Settings → Environment Variables**, create encrypted
   production values:
   - \`GMAIL_SMTP_APP_PASSWORD\`: a **new dedicated** Google App Password for the
     association's Gmail account. Do not reuse the existing Supabase Auth
     application password. Keep it out of source code and conversations.
   - \`MAIL_RELAY_SECRET\`: a long randomly generated secret (at least 32 random
     bytes) shared only with the Supabase function.
   - Optional \`GMAIL_SMTP_USER\`: defaults to the association Gmail address
     used by the existing site; override only if sender account changes.
2. In **Supabase → Edge Functions → Secrets**, create
   \`APPLICATION_EMAIL_RELAY_SECRET\` with **exactly the same value** as the
   \`MAIL_RELAY_SECRET\` above. Do not disclose it publicly.
3. Confirm \`SITE_PUBLIC_URL\` is a valid HTTPS address and matches the
   website for email links.
4. Test on a safe preview/staging environment; review the PR, deploy the
   Vercel route first, then deploy the updated Supabase function as
   \`verify_jwt=false\` (existing function checks application permissions itself).
5. Send **one** real test application notification, and confirm delivery and
   an audit status of \`SENT\`. Only then use the existing retry UI for older
   FAILED notifications **selectively**, after checking the applicant's current
   status and dates. Do not bulk retry old interview invitations.

## Operational notes

- Only Supabase chooses recipients and renders existing branded Arabic/Turkish
  templates; the protected relay rejects arbitrary callers without the key.
- One email/recipient per relay request, no client-controlled sender.
- No automatic retries on uncertain SMTP outcomes. Check Gmail Sent and
  recipient inbox before retrying after a timeout.
- Gmail's consumer limits are shared with password reset and other account
  email; volume must remain within Google policy and deliverability limits.
- Browser push opt-in settings are unchanged.
- Email announcements/news/tasks are **not** auto-activated by this patch:
  add separate authorization, recipient selection, consent/unsubscribe handling,
  per-recipient outbox and throttling before introducing broadcasts.
- Do not alter \`AUTH\` custom SMTP or the already-working reset-password flow.
