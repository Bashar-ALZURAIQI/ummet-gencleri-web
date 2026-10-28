# Cloudflare Pages isolated connectivity trial (not a production migration)

This branch is `experiment/cloudflare-pages-isolated`, forked from `main` at `6b656ee3fccc72b538d2b769c2b6acbd9de5941e` on 2026-10-29.

## Non-negotiable isolation

- Do **not** merge this branch into `main`, repoint Vercel domains, change Vercel environment settings, or change the Supabase project while testing.
- Keep Vercel Production connected to `main`. Use a separate Cloudflare Pages project whose **production branch is this trial branch**.
- `public/hosting-check.html` is a standalone same-origin connection probe. It requires no Supabase credentials, creates no accounts, and performs no database mutations.
- Cloudflare Pages will serve the same React/Vite application from `dist`. If connected to production Supabase, the UI is connected to **real production data**. Test only public/read-only pages at first. Avoid registration, profile edits, point changes, attendance registration, admin decisions, news edits, and emails on the trial site. For write tests, first provision a fully separate staging Supabase project (including schema, safe sample data, and staging credentials).
- `api/send-union-mail.mjs` is Vercel-specific and is **not** migrated to Cloudflare Pages in this connectivity test. Existing production email relay stays on Vercel. Do not change any Supabase Edge Function endpoint, relay secret, or webhook.
- Password recovery URLs and email confirmation redirects remain configured for the Vercel site until a separate migration is explicitly approved. Do not send trial-site password-reset links.

## Configure the Cloudflare Pages project

1. Open Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git. Select GitHub repository `Bashar-ALZURAIQI/ummet-gencleri-web` and authorize access.
2. Choose an unused project name such as `ummet-gencleri-trial` (the exact `*.pages.dev` name is only assigned on creation).
3. **Production branch:** `experiment/cloudflare-pages-isolated` (do not choose `main`). In branch deployment controls set preview branches to **None**, to keep the trial from rebuilding unrelated GitHub branches.
4. **Framework:** React (Vite) or None. **Root directory:** `/` (repo root). **Build command:** `npm run build`. **Build output directory:** `dist`.
5. Set `NODE_VERSION=22` if an explicit Node version is needed.
6. To use the full React app, set the following **public browser build environment variables** in Cloudflare Pages > Settings > Environment variables (do not commit values):
   - `VITE_SUPABASE_URL` = the existing Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` = existing **public anon/publishable key** (NEVER service-role or secret key).
   - `VITE_VAPID_PUBLIC_KEY` is optional for this test. Do not enable push notifications on the trial origin.
   The values are embedded at build time; redeploy after adding/changing them.
7. The initial browser test is `https://<actual-project>.pages.dev/hosting-check.html`. This is independent of Supabase and should work even if the main app has no build-time environment values yet.
8. Test `/`, `/news`, `/programs`, direct refresh and lazy page navigation after build settings are correct. **Do not perform write operations** until a staging DB exists.
9. Compare the new hostname vs `ummet-genc.vercel.app` on the same affected Wi-Fi and mobile networks; record the displayed connection check and browser errors.
10. Only after successful trials discuss production cutover and explicit changes to Supabase Auth allowed URLs, email relay, push worker registration and frontend settings.

## Revert/stop

- The existing Vercel project, domain, and Supabase production configuration were not modified by this branch.
- Cloudflare trial can be paused/deleted independently in its dashboard. There is no DNS to revert.
- Keep the Git branch isolated until the team explicitly approves a production migration.

## Why no _redirects file

Cloudflare Pages serves SPA routes when no top-level 404.html is present. Using a global rewrite like `/* /index.html 200` can hide missing JavaScript chunks behind HTML (the very failure fixed on Vercel). Verify direct deep links on deployed Pages before considering any routing overrides.

## Local preflight

```bash
npm ci
npm test
npm run typecheck
npm run build
```

The built `dist/hosting-check.html` should be present. Do not publish `.env` or secret config files.
