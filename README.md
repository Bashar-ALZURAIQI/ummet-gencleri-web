# 🌐 Ümmet Gençleri Web

### Multilingual Student Organization and Management Platform

Ümmet Gençleri Web is a full-stack web platform designed to support both the public website and the internal management workflows of Ümmet Gençleri.

The platform combines a multilingual user experience with secure authentication, student profiles, executive role management, membership workflows, content management, notifications, and Supabase-backed authorization.

---

## 🚀 Project Overview

The platform supports both public-facing content and authenticated organization management.

### Main Capabilities

* Arabic, Turkish, and English multilingual support
* Student registration and authentication
* Student profiles and account management
* Executive board and role management
* Membership application workflows
* Website and content management
* Secure authorization using Supabase
* Row Level Security
* Protected server-side operations
* Web Push notifications
* Automated testing and validation
* Responsive user interface

---

## 🛠️ Core Technologies

`React` · `TypeScript` · `Vite` · `Tailwind CSS` · `Supabase` · `PostgreSQL` · `Git` · `GitHub`

---

## 🔗 Live Website

The deployed version is available at:

https://ummet-genc.vercel.app/

---

## 💻 Local Development

### Requirements

* Node.js 22 or later
* A configured Supabase project
* The required environment variables

### Install Dependencies

```bash
npm install
```

### Start the Development Server

```bash
npm run dev
```

### Build the Project

```bash
npm run build
```

### Run Tests and Validation

```bash
npm test
npm run typecheck
npm run lint
```

---

## 🔐 Environment Variables

Create a local `.env` file:

```text
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_VAPID_PUBLIC_KEY=<your-public-vapid-key>
```

Never commit `.env` files, private credentials, administrative keys, or secret values.

Administrative or private keys must never be exposed through variables beginning with `VITE_`, because those variables are accessible to browser-side code.

The local `.env` file must remain excluded from Git.

---

## 🔔 Web Push Notifications

Web Push notifications are available only to students whose official application status is `accepted` and whose profile is `active`.

The subscription control is not available to:

* Visitors
* Pending applicants
* Applicants awaiting interviews
* Rejected applicants
* Removed or inactive users

Interview, acceptance, and rejection notifications continue to use email where applicable.

### Generate VAPID Keys

Generate the VAPID key pair once:

```bash
npx --yes web-push@3.6.5 generate-vapid-keys --json
```

Keep the same key pair permanently. Changing the keys invalidates previous browser subscriptions.

Place only the public key in the frontend `.env` file:

```text
VITE_VAPID_PUBLIC_KEY=<publicKey>
```

### Supabase Edge Function Secrets

In:

`Supabase Dashboard → Edge Functions → Secrets`

add:

```text
VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:president@ummet.org
PUSH_WEBHOOK_SECRET=<random-32-byte-base64url-value>
```

Never place `VAPID_PRIVATE_KEY` or `PUSH_WEBHOOK_SECRET` in the Vite frontend environment.

### Local Edge Function Development

Create the ignored file:

```text
supabase/functions/.env.local
```

Add the required secret values, then run:

```bash
npx supabase functions serve send-web-push --env-file supabase/functions/.env.local
```

### Supabase Vault Configuration

After applying the required database migrations and deploying the `send-web-push` Edge Function, configure the following Vault values:

```text
accepted_student_push_webhook_url=<your-send-web-push-function-url>
accepted_student_push_webhook_secret=<same PUSH_WEBHOOK_SECRET value>
```

The secure push-dispatch migration uses `pg_net` when new rows are inserted into:

```text
public.push_notifications
```

The webhook URL and secret are read securely from Supabase Vault.

Do not create a second duplicate webhook through the dashboard, because doing so may cause notifications to be sent twice.

### Browser Requirements

The Service Worker can operate on `localhost` during development because browsers treat it as a secure development context.

Production deployments require HTTPS.

For iPhone and iPad devices, Web Push requires iOS/iPadOS 16.4 or later. The website must be added to the Home Screen and opened from the installed icon before notification permission can be enabled.

---

## 🗄️ Supabase Setup

Apply the files inside:

```text
supabase/migrations
```

in the correct order after confirming that the local project is connected to the intended Supabase environment.

The database structure includes:

* `profiles` linked to Supabase Auth UUIDs
* `executive_assignments` for organization roles
* `edit_requests` with Row Level Security
* Public avatar storage
* Realtime synchronization
* Protected membership application access
* Secure administrative RPC functions

### Avatar Storage

The public `avatars` bucket supports:

* JPEG
* PNG
* WebP

Users can manage files only inside the folder associated with their own UUID.

The current file-size limit is:

```text
5 MB
```

### Membership Application Security

Students can access only their own application data.

The currently authorized president can access the complete application workflow.

Direct browser-side modification of protected application records is not permitted.

Administrative actions are handled through protected server-side functions and reviewed database policies.

---

## 👤 Initial President Bootstrap

**تهيئة الرئيس الأول:** يتم إنشاء حساب الرئيس الأول عبر Supabase Authentication أولًا، ثم ربط UUID الخاص به بمنصب PRESIDENT من خلال إجراء التهيئة الآمن الموضح أدناه.

A new database does not initially contain a president account with administrative authority.

First, create the president account normally through Supabase Authentication.

Then execute the following procedure once from the Supabase SQL Editor using project-owner privileges.

Replace the placeholder UUID with the real Auth UUID of the first president.

```sql
DO $bootstrap_first_president$
DECLARE
  v_first_president uuid := '00000000-0000-4000-8000-000000000000'::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = v_first_president
  ) THEN
    RAISE EXCEPTION 'The selected Auth user does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.executive_assignments
    WHERE position_key = 'PRESIDENT'
  ) THEN
    RAISE EXCEPTION 'A president is already assigned';
  END IF;

  INSERT INTO public.executive_assignments (
    user_id,
    position_key,
    committee_key,
    assigned_by
  )
  VALUES (
    v_first_president,
    'PRESIDENT',
    'presidency',
    NULL
  );

  UPDATE public.profiles
  SET status = 'active'
  WHERE id = v_first_president;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected Auth profile does not exist';
  END IF;
END
$bootstrap_first_president$;
```

> Note: The bootstrap explicitly assigns `position_key, committee_key` as `'PRESIDENT', 'presidency'`.


This procedure must not be executed from the browser.

Do not expose administrative database credentials to frontend code.

After the first president is initialized, future executive-role transfers must use the application's protected role-management workflow.

---

## 👤 Accounts and Profiles

**بريد الدخول:** هو البريد المرتبط بحساب Supabase Auth والمستخدم لتسجيل الدخول.

**البريد للتواصل:** هو البريد العام الموجود في الملف الشخصي، وهو منفصل عن بريد الدخول ولا يغيّر هوية تسجيل الدخول.

**كلمة المرور:** تُدار من خلال Supabase Auth، ويستطيع المستخدم تغيير كلمة مرور حسابه فقط. لا توجد كلمة مرور إدارية مشتركة.

Authentication credentials are managed by Supabase Auth.

The login email is separate from the public contact email stored in the user's profile.

Users can manage profile information such as:

* Name
* University
* Academic major
* Academic year
* Phone number
* Public biography
* Profile picture
* Public contact email

Changing public profile information does not change authentication identity.

Password changes apply only to the authenticated user's own account.

The application does not use a shared administrative password.

---

## 🏛️ Executive Role Management

Executive roles are stored in:

```text
executive_assignments
```

and are associated with the user's UUID.

Roles are not determined by:

* Display name
* Public email
* Contact email

This prevents identity changes from accidentally changing permissions.

### President Transfer Testing

**نقل الرئيس:** يتم نقل صلاحية الرئيس من خلال مسار إدارة الأدوار المحمي، وليس بتغيير الاسم أو البريد الإلكتروني.

To test a president transfer:

1. Sign in as the current president.
2. Select another active student account.
3. Transfer the president role.
4. Confirm the authorization change.
5. Verify that the previous president loses president privileges.
6. Sign in using the new president account.
7. Verify that the new account receives the correct dashboard and permissions.
8. Restart the application or test from another device to confirm that the role persists correctly.

Changing a user's name or contact email must not transfer executive authority.

---

## 📝 Membership Applications

User creation, profile creation, and the initial membership application record are handled through the authenticated backend workflow.

The frontend displays only records permitted by Row Level Security policies.

Protected decisions such as interview scheduling, acceptance, and rejection use server-side authorization.

The application does not use `localStorage` as the authoritative source for official student applications or administrative decisions.

---

## 📜 Edit and Decision Logs

**سجل التعديلات:** يخضع الوصول إلى سجلات التعديلات والقرارات لصلاحيات المستخدم الحالية كما هو موضح أدناه.

Access to administrative logs depends on the user's current role.

### President

The current president can review the complete edit and decision history.

### Executive Members

Executive members can access only the authorized records associated with their own identity and permissions.

### Students and Visitors

Students and visitors do not have access to protected administrative logs.

Legacy local records are not treated as authoritative permission data.

---

## 🗑️ Deprecated Administrative Flow

The legacy:

```text
setup-board-accounts
```

function is permanently disabled and returns:

```text
HTTP 410
```

It must not:

* Create privileged accounts
* Distribute predefined login addresses
* Use shared passwords
* Grant administrative access

Accounts are created through Supabase Auth.

Executive roles are assigned through the protected role-management system.

---

## 🛡️ Security

Administrative operations are protected using:

* Supabase Authentication
* Row Level Security
* Server-side authorization
* Protected RPC functions
* UUID-based identity
* Supabase Vault
* Edge Function secrets
* Controlled Storage policies

Private credentials must never be committed to the repository.

---

## ✅ Verification

Run the following checks before production deployment:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

These checks help verify:

* Authentication behavior
* Authorization rules
* RLS and RPC behavior
* Profile workflows
* Password workflows
* Role management
* Application behavior
* TypeScript correctness
* Production build integrity

---

## 📌 Project Direction

The project is being developed as a secure, maintainable, and multilingual platform for managing both the public presence and internal workflows of Ümmet Gençleri.

Future development will continue to focus on:

* Security
* Reliability
* User experience
* Multilingual accessibility
* Maintainable architecture
* Automated testing
* Clear administrative workflows
