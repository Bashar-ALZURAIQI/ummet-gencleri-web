# Render static-site network probe — isolated from Union production

This is a read-only trial, not a live migration. Branch: `experiment/render-static-isolated-20261029`.

## Goal
Test a third CDN hostname (**onrender.com**) from the exact Wi-Fi and mobile networks that struggle with `*.vercel.app` and `*.pages.dev`.

## Isolation
- Vercel production continues on `main` and `ummet-genc.vercel.app`.
- No Vercel/Supabase DNS, GitHub main, users, database or mail-relay settings are modified.
- **Do not** enter real student credentials, register users, assign activities or send mail from the trial.
- The only page to test at first is `/hosting-check.html`. It is entirely static with no Supabase access.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain unset deliberately. The normal React app is therefore **not ready for functional testing**. Never paste or upload service-role keys, Gmail app passwords, relay secrets, or other server secrets into static build variables.
- After confirming access, a staging Supabase database is required for safe write tests, or carefully planned read-only tests against production.
- Vercel's `/api/send-union-mail` is not available at Render. Existing emails still depend on the original Vercel function through Supabase's Edge Function. Do not switch the official domain without confirming those dependencies.
- Password recovery and verification redirect allowlists must be revised if a real migration is approved.

## Deployment
- Connect the Render App in ChatGPT (optional, enables direct testing and deployment).
- Or use Render > New > Static Site and connect the GitHub repo.
- Choose **Branch** `experiment/render-static-isolated-20261029` and **Name** `ummet-gencleri-render-test`.
- Build command: `npm ci && npm run build`, Publish Directory: `dist`.
- If using Render Blueprint instead, select this branch's `render.yaml`.
- Do not choose the main branch.
- Open the actual Render domain with `/hosting-check.html` (do not assume the hostname is available before the service exists).
- Compare against `ummet-genc.vercel.app` on >1 known failing networks for 10-20 attempts and record failures/time to connect.

## Success criteria
- Opens reliably in repeated fresh-window tests on multiple failing devices.
- HTTP 200/TLS valid from those networks (external data-center tests are not sufficient).
- Only then configure build-time **public** Supabase variables and test read-only pages.
- Run full login, permissions, email, reset and SPA route tests safely before future cutover; use a separate staging backend for writes.
- For production, a custom independent domain is reasonable but not guaranteed to solve filtering; test the final hostname before moving users.
