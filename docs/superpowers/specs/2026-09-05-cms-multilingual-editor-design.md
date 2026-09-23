
# Architectural Design Specification: Inline Multilingual CMS Editing Experience & Fixed System Enum Localization

- **Document ID**: `2026-09-05-cms-multilingual-editor-design`
- **Branch**: `feature-multilingual-ar-tr-en`
- **Task**: 7C2 (Architecture Specification Only)
- **Target File**: `docs/superpowers/specs/2026-09-05-cms-multilingual-editor-design.md`
- **Status**: Approved Architectural Design

---

## 1. Context and Goals

### 1.1 Context
Following the completion of Task 7A (Domain Foundation & Resolution Engine), Task 7B (Repository Contract & In-Memory Adapter), and Task 7C1 (Schema Allowlist & Safe Extraction), the platform has established a pure, deterministic multilingual foundation. Arabic (`ar`) is the sole canonical source of truth and editorial authority, while Turkish (`tr`) and English (`en`) operate as localized overlays.

Currently, CMS content editing occurs in two primary user interfaces:
1. **In-Context Inline Editing** (`src/components/InlineEditOverlay.tsx`): On-page edit pencil buttons that open focused modal editors for homepage hero sections, stats cards, about previews, and footer content.
2. **Centralized Admin Content Modals** (`src/pages/AdminDashboard.tsx`): Detailed CRUD modals for structured entity types including Events, News, Media Gallery, Student Guide, FAQ, Executive Plans, Administrative Reports, and Committees.

However, all existing editing workflows only operate on Arabic text, and system enums (such as event categories) currently display raw Arabic keys in administrative tables and dropdown options even when viewing the application in Turkish or English.

### 1.2 Core UX Mandate: Same-Place Multilingual Editing
**Editors MUST translate content in the SAME place where they already edit it.**

Forcing an editor to navigate away from an active editing session to a separate, remote translation management screen creates friction, context fragmentation, and editorial disconnect. An editor updating an announcement, hero headline, or event description must be empowered to author, inspect, and verify the Turkish and English translations within that exact same modal dialog.

### 1.3 System Enum Presentation Correction
Fixed system enums (such as event categories `workshop`, `lecture`, `volunteer`, `training`, `trip`, `entertainment`, `visit`) represent machine-level invariants. They must never be treated as translatable CMS content, never stored in `cms_localizations`, and never submitted to machine translation. However, their visible labels must render in the active UI locale using centralized presentation mappers (`src/domain/eventCategoryPresentation.ts` and `src/domain/executivePresentation.ts`). Task 7C2 incorporates correcting administrative forms and tables so that system options display localized labels while preserving canonical machine keys.

---

## 2. Non-Goals

1. **No Production Implementation in 7C2 Spec Task**: This task produces architectural documentation only. No production code (`src/*`), tests (`tests/*`), or dependencies (`package.json`) are modified in this step.
2. **No Fake or Mocked Auto-Translation**: Task 7C2 will NOT simulate machine translation with hardcoded strings or mock network delays. Machine translation provider integration belongs exclusively to Task 7D.
3. **No Direct Translation Provider Integration**: No client-side or server-side calls to Azure Translator, OpenAI, or external MT APIs will be made in 7C2.
4. **No Remote Supabase Migrations or Database Mutations**: Task 7C2 interacts strictly via the `CmsLocalizationRepository` abstraction. Physical Supabase tables (`cms_localizations`), RLS policies, indexes, and migrations belong to a dedicated persistence phase.
5. **No Route-Based Language Prefixes**: Routing remains locale-independent. URLs such as `/ar/events`, `/tr/news`, or `/en/admin` are strictly forbidden.
6. **No Translation of Identity or Technical Fields**: Usernames, member names, account emails, phone numbers, UUIDs, numeric metrics, timestamps, dates, and media URLs are strictly excluded from localization.
7. **No Elimination of Canonical Arabic Authority**: Arabic remains the singular canonical source of truth. Turkish and English cannot exist as standalone canonical entities without an Arabic parent.

---

## 3. Existing Architecture Foundation

Task 7C2 builds directly upon the established domain modules without introducing architectural regressions:

### 3.1 Domain Contracts (`src/domain/cmsLocalization.ts`)
- **`CmsLocalizationRecord<T>`**: The standardized container for localized overlays containing `target`, `locale`, `payload`, `status`, `sourceHash`, `stalePaths`, `manualPaths`, `updatedAt`, and `updatedBy`.
- **`LocalizationStatus`**: Strict 4-state lifecycle: `'missing' | 'draft' | 'fresh' | 'stale'`.
- **`markLocalizationStale` & `isLocalizationPathStale`**: Pure path normalization and staleness tracking helpers.
- **`isLocalizationPathManual`**: Protects human-edited paths from automated overwrite.
- **`computeSourceHash`**: Deterministic 32-bit FNV-1a fingerprint of canonical source payloads.
- **`resolveCmsLocalization`**: Pure resolution engine enforcing public visibility of stale translations and complete privacy of drafts.

### 3.2 Repository Layer (`src/domain/cmsLocalizationRepository.ts`)
- **`CmsLocalizationRepository`**: Pure interface defining partitioned operations:
  - `getPublished`, `savePublished`, `deletePublished`
  - `getDraft`, `saveDraft`, `deleteDraft`
  - `resolveCmsTargetForLocale`
- **`InMemoryCmsLocalizationRepository`**: Fully isolated in-memory implementation supporting concurrency verification (`expectedSourceHash`, `expectedVersion`), deep-cloning, and error handling (`INVALID_LOCALE`, `CONFLICT`, `NOT_FOUND`).
- **Isolation Invariant**: Arabic (`ar`) records are strictly rejected by the repository (`INVALID_LOCALE`); only `tr` and `en` records may be persisted.

### 3.3 Translatable Schema Allowlist (`src/domain/cmsTranslatableFields.ts`)
- **`CMS_TRANSLATABLE_SCHEMA`**: Strict allowlist of translatable dot-paths across all 15 CMS targets.
- **`isCmsPathTranslatable(target, path)`**: Fail-closed guard returning true only if an exact match or wildcard rule exists.
- **`extractTranslatableCmsFields(target, payload)`**: Safe extraction utility returning only allowlisted, non-empty human strings.
- **`EXCLUDED_FIELD_CATEGORIES`**: Formal exclusion of IDs, media URLs, contacts, dates, counts, system roles, person names, and brand assets.

### 3.4 Presentation Mappers
- **`src/domain/eventCategoryPresentation.ts`**: Provides `getEventCategoryLabel(category, t)` and `EVENT_CATEGORY_MAP`.
- **`src/domain/executivePresentation.ts`**: Provides `getExecutiveRoleLabel(role, t)` and `getExecutiveSectionLabel(sectionId, t)`.

---

## 4. Fixed System Values vs Editorial Text Classification

A central principle of the editorial architecture is the rigorous distinction between **Fixed System Enums** and **Free-Form Editorial Text**.

```
+-------------------------------------------------------------------------------+
|                             CMS Content Boundary                              |
+---------------------------------------+---------------------------------------+
|          Fixed System Values          |         Editorial Free-Form Text      |
+---------------------------------------+---------------------------------------+
| - Event Category (workshop, lecture)  | - Event Title & Description           |
| - Activity Type (MANDATORY, OPTIONAL) | - News Excerpt & Full Body            |
| - Plan Quarter (Q1, Q2, Q3, Q4)       | - FAQ Question & Answer               |
| - Report Type (financial, admin)      | - Student Guide Headings & Body       |
| - Executive Fixed Roles (PRESIDENT)   | - Homepage Hero Badges & Headlines    |
| - Event Status (upcoming, past)       | - Committee Descriptions & Vision     |
|                                       | - Member Manual Position Description  |
|                                       | - Report Free-Form Period Text        |
+---------------------------------------+---------------------------------------+
| Storage: Canonical machine token only | Storage: AR canonical + TR/EN overlay |
| UI: Localized via static i18n mapping | UI: Editable via multilingual fields  |
| Machine Translation: NEVER            | Machine Translation: Eligible (7D)    |
| Persistence: No cms_localizations     | Persistence: Stored in localization   |
+---------------------------------------+---------------------------------------+
```

### 4.1 Value-Aware Handling for Ambiguous Fields (`location`)
Certain fields may contain either human-language descriptions or technical URLs. The primary example is `event.location`:
- **Human Editorial Text**: e.g., `"قاعة المؤتمرات - جامعة أتاتورك"` or `"المكتبة المركزية"`. This is editorial content and MUST receive translation inputs.
- **URL / Map Link**: e.g., `"https://maps.google.com/?q=..."` or `"https://goo.gl/maps/xyz"`. This is technical navigational data and MUST NEVER be translated.

#### Value-Aware Safe Detection Rule
When evaluating whether a `location` field receives a translation editor:
```typescript
export function isTranslatableLocationValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  
  // Exclude web URLs and map coordinates
  const isUrl = /^(https?:\/\/|www\.|geo:|maps:)/i.test(trimmed);
  const isCoordinate = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed);
  
  return !isUrl && !isCoordinate;
}
```
If `isTranslatableLocationValue(currentValue)` evaluates to `false`, the translation UI for `location` is omitted, and the canonical value is preserved directly.

### 4.2 Strict Person Name Invariant
Person names (e.g., `"مريم شاهين"`, `"بشار الزريقي"`) represent personal identities. They must NEVER be passed through translation workflows or extracted for localization overlays.
- Committee Head names and Executive Board member names remain immutable across all locales.
- Free-form role descriptions authored for ordinary members (e.g., `members.*.position = "مسؤول المونتاج والتصاميم"`) are translatable allowlisted paths.

### 4.3 Brand Identity Special Architecture
Organizational branding does not use generic dynamic CMS extraction. It maintains its dedicated dual-field presentation architecture:
- `brand.name`: Canonical Arabic identity (`"اتحاد أمة واحدة"`).
- `brand.nameTr`: Canonical Turkish identity (`"Ümmet Gençleri"`).
- English display uses the approved international presentation fallback.
Brand fields are explicitly excluded from standard translation extraction to avoid clobbering organizational identity tokens.

---

## 5. Inline Editing UX (In-Context Editing)

### 5.1 Evolution of `EditableField`
In `src/components/InlineEditOverlay.tsx`, clicking the edit pencil on a homepage element currently opens a modal with a single input or textarea. Under Task 7C2, this modal evolves into a dual-tiered, same-place editor:

```
+-------------------------------------------------------------+
| تعديل: عنوان البانر الرئيسي (Edit Hero Title)             [X] |
+-------------------------------------------------------------+
| [ العربية — المصدر الأساسي (RTL) ]                           |
| +---------------------------------------------------------+ |
| | شباب الأمة: نبني الغد بالمعرفة والعمل                    | |
| +---------------------------------------------------------+ |
|                                                             |
| > الترجمات (Translations) [TR: طازجة ✓] [EN: بحاجة لتحديث ⚠] |
| +---------------------------------------------------------+ |
| | Türkçe (LTR)                           [حفظ كمسودة | نشر] | |
| | +-----------------------------------------------------+ | |
| | | Ümmet Gençliği: Yarını bilgi ve amel ile inşa       | | |
| | | ediyoruz.                                           | | |
| | +-----------------------------------------------------+ | |
| |                                                         | |
| | English (LTR)                          [حفظ كمسودة | نشر] | |
| | +-----------------------------------------------------+ | |
| | | Ummah Youth: Building Tomorrow with Knowledge & Action| |
| | +-----------------------------------------------------+ | |
| +---------------------------------------------------------+ |
|                                                             |
|                          [إلغاء] [حفظ التعديلات ونشر الكل]   |
+-------------------------------------------------------------+
```

### 5.2 Collapsible Translation Accordion
To maintain visual ergonomics and prevent compact modals from expanding excessively:
1. **Collapsed State (Default for quick Arabic edits)**:
   - Displays a compact summary bar: `"الترجمات (Translations)"`.
   - Renders inline status badges:
     - `TR: مكتملة ✓` (fresh/published)
     - `EN: بحاجة لتحديث ⚠` (stale)
     - `TR: غير مترجمة ✕` (missing)
   - Clicking anywhere on the summary bar toggles expansion.
2. **Expanded State**:
   - Reveals the Turkish (`tr`) and English (`en`) field inputs.
   - Each input is rendered with its appropriate content text direction (`dir="ltr"` for TR and EN, `dir="rtl"` for AR).
   - Each locale card exposes its individual lifecycle status and action triggers (`Save Draft`).

### 5.3 Multi-Field Cards (`EditableCard`)
For grouped inline components (such as Hero Badges or Stats Cards):
- Non-translatable fields (e.g., metric numbers, icon pickers, image uploads) appear **once** in the common/canonical section.
- Translatable text labels (e.g., `stats.0.label`) render with the collapsible translation section immediately beneath their respective Arabic inputs.

---

## 6. Large Create/Edit Modals UX

For structured administrative entities (Events, News, Gallery, Student Guide, FAQ, Plans, Reports, Committees) managed in `src/pages/AdminDashboard.tsx`, modals manage dozens of parameters.

### 6.1 Unified Layout Architecture
The modal architecture separates **Technical/Shared Fields** from **Editorial Content**:

```
+------------------------------------------------------------------------+
| تعديل الفعالية: ندوة مستقبل الذكاء الاصطناعي                      [X]   |
+------------------------------------------------------------------------+
| [ البيانات الأساسية والمشتركة (Shared Technical Data) ]                 |
|                                                                        |
| التصنيف (Category):          نوع النشاط (Activity Type):                |
| [ محاضرة (Lecture)      v ]  [ إلزامي (Mandatory)                 v ]  |
|                                                                        |
| التاريخ (Date):              الوقت (Time):          السعة (Capacity):    |
| [ 2026-10-15             ]   [ 14:00             ]  [ 120            ] |
|                                                                        |
| صورة الفعالية (Image):        رابط المنشور (URL):                       |
| [ ManagedFileField       ]   [ https://instagram.com/p/...        ltr ] |
+------------------------------------------------------------------------+
| [ المحتوى التحريري متعدد اللغات (Multilingual Editorial Content) ]      |
|                                                                        |
| +-------------------+--------------------+--------------------+        |
| | العربية (المصدر)  | Türkçe [طازجة ✓]   | English [مسودة ✎]  |        |
| +-------------------+--------------------+--------------------+        |
| |                                                                      |
| | عنوان الفعالية (Event Title) [RTL]                                    |
| | [ ندوة مستقبل الذكاء الاصطناعي وتطبيقاته في البحث العلمي         ]    |
| |                                                                      |
| | وصف الفعالية (Description) [RTL]                                     |
| | [ ندوة متخصصة تناقش دور الذكاء الاصطناعي التوليدي في دعم مسيرة...  ] |
| |                                                                      |
| | موقع الفعالية (Location) [RTL]                                       |
| | [ قاعة المؤتمرات المركزية - جامعة أتاتورك                        ]    |
| +----------------------------------------------------------------------+
|                                                                        |
| [إجراءات النشر الطارئ]                 [إلغاء] [حفظ كمسودة] [نشر التغييرات] |
+------------------------------------------------------------------------+
```

### 6.2 Structural Principles for Large Modals
1. **Zero Technical Duplication**: Numeric inputs, file uploads, date-pickers, status selects, and external URLs are NEVER duplicated across language tabs. They exist once in the canonical form state.
2. **Language Tabs for Editorial Fields**: Editorial fields switch seamlessly between `[ العربية (المصدر) ]`, `[ Türkçe ]`, and `[ English ]`.
3. **Tab Status Indicators**: Each tab label displays its real-time localization status badge (e.g., `Türkçe [طازجة ✓]`, `English [بحاجة لتحديث ⚠]`).
4. **Independent Tab Dirty States**: Editing Turkish text marks the Turkish localization overlay dirty without corrupting the canonical Arabic payload.

---

## 7. Event Form Detailed Field Breakdown

To ensure zero ambiguity during implementation, the following matrix defines the exact handling of every field in the Event Form (`AdminDashboard.tsx`):

| Field Identifier | Technical Data Type | Classification | Storage Destination | Translation Handling | UI Presentation & Direction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `title` | `string` | Free-Form Editorial | AR: Canonical Event<br>TR/EN: Overlay | Extracted & Translatable (7C2 manual, 7D auto) | AR: RTL input<br>TR/EN: LTR input |
| `description` | `string` (multiline) | Free-Form Editorial | AR: Canonical Event<br>TR/EN: Overlay | Extracted & Translatable (7C2 manual, 7D auto) | AR: RTL textarea<br>TR/EN: LTR textarea |
| `category` | `EventCategory` enum | **Fixed System Enum** | Canonical Event ONLY (`workshop`, `lecture`, etc.) | **STRICTLY EXCLUDED** from MT & CMS overlay | Select option values = canonical enum.<br>Visible labels = `getEventCategoryLabel(c, t)`. |
| `activityType` | `ActivityType` enum | **Fixed System Enum** | Canonical Event ONLY (`MANDATORY`, `OPTIONAL`, `PAID`) | **STRICTLY EXCLUDED** from MT & CMS overlay | Localized via static dictionary: `t('admin.events.modal.activityTypes.*')`. |
| `capacity` | `number` | Technical Numeric | Canonical Event ONLY | No translation | Shared numeric input (`min=1`). |
| `pointsValue` | `number` | Technical Numeric | Canonical Event ONLY | No translation | Shared numeric input (`min=0`). |
| `date` | `string` (`YYYY-MM-DD`) | Technical Temporal | Canonical Event ONLY | No translation | Shared HTML5 date-picker. Locale formatting applied at view layer. |
| `time` | `string` (`HH:mm`) | Technical Temporal | Canonical Event ONLY | No translation | Shared HTML5 time-picker. |
| `registrationDeadline` | `string` (ISO datetime) | Technical Temporal | Canonical Event ONLY | No translation | Shared HTML5 datetime-local picker. |
| `image` | `string` (Asset URL) | Media Asset Link | Canonical Event ONLY | No translation | `ManagedFileField` upload component. |
| `eventUrl` | `string` (HTTP URL) | External Web Link | Canonical Event ONLY | No translation | Shared LTR text input with URL format validation. |
| `location` | `string` | **Value-Aware Editorial** | If text: AR canonical + TR/EN overlay.<br>If URL: Canonical ONLY. | Conditionally translatable via `isTranslatableLocationValue(...)`. | If text: AR RTL, TR/EN LTR.<br>If URL: Shared LTR text input. |
| `status` | `'upcoming' \| 'past'` | Fixed System State | Canonical Event ONLY | No translation | Select option values = canonical key.<br>Visible labels = localized static i18n string. |

### 7.1 Rectifying Existing Event Form & Table Defects
Inspection of `src/pages/AdminDashboard.tsx` revealed that lines 1938 and 1978 currently read:
```tsx
// Table row category badge (line 1938):
<span className={`... ${categoryColors[e.category]}`}>{categoryLabels[e.category]}</span>

// Modal category select dropdown (line 1978):
{(Object.keys(categoryLabels) as EventCategory[]).map((c) => (
  <option key={c} value={c}>{categoryLabels[c]}</option>
))}
```
Because `categoryLabels` in `mockData.ts` contains hardcoded Arabic text (`'ورشة عمل'`, etc.), this forces Arabic text to display even when the Admin UI is rendered in Turkish or English.

**Approved 7C2 Correction**:
```tsx
// Table row category badge:
<span className={`... ${categoryColors[e.category]}`}>
  {getEventCategoryLabel(e.category, t)}
</span>

// Modal category select dropdown:
{(Object.keys(categoryLabels) as EventCategory[]).map((c) => (
  <option key={c} value={c}>
    {getEventCategoryLabel(c, t)}
  </option>
))}
```
The stored canonical form value remains the exact canonical key (`c`), while the visible option text is translated via `getEventCategoryLabel`.

---

## 8. Localization Status Lifecycle

Every localized entity overlay exists in one of four mutually exclusive states defined in `src/domain/cmsLocalization.ts`:

```
                  +-----------------------------------+
                  |              MISSING              |
                  | (No record exists in repository)  |
                  +-----------------------------------+
                                    |
                    Editor types in / saves draft
                                    v
                  +-----------------------------------+
                  |               DRAFT               |
                  | (Work-in-progress, hidden from    |
                  |  public read resolution)          |
                  +-----------------------------------+
                                    |
                    Explicit Publish Action confirmed
                                    v
                  +-----------------------------------+
        +-------->|               FRESH               |
        |         | (Synchronized with Arabic source; |
        |         |  sourceHash matches canonical)    |
        |         +-----------------------------------+
        |                           |
  Editor updates      Canonical Arabic source changes
  translation and                   |
  re-publishes                      v
        |         +-----------------------------------+
        +---------|               STALE               |
                  | (Canonical changed; visible to    |
                  |  public with stale debt flag)     |
                  +-----------------------------------+
```

### 8.1 Human-Centric Status Presentation
Internal technical keys must not be exposed to editors. Status badges must render with clear, localized indicators:

| Status Key | Arabic UI Badge | Turkish UI Badge | English UI Badge | Semantic Meaning & UI Treatment |
| :--- | :--- | :--- | :--- | :--- |
| `fresh` | `طازجة ✓` (Emerald) | `Güncel ✓` | `Up to date ✓` | Translation matches the latest Arabic source. |
| `stale` | `بحاجة لتحديث ⚠` (Amber) | `Güncelleme Gerekli ⚠` | `Needs Update ⚠` | Arabic source was modified after this translation was published. |
| `draft` | `مسودة ✎` (Sky) | `Taslak ✎` | `Draft ✎` | Translation has saved human edits that are not yet published. |
| `missing` | `غير مترجمة ✕` (Slate) | `Çevrilmedi ✕` | `Missing ✕` | No translation exists for this locale. |

---

## 9. Draft vs. Published Isolation

To protect public readers from incomplete, broken, or raw working text, draft and published translations are partitioned into strictly isolated storage domains within `CmsLocalizationRepository`:

1. **`getDraft(target, locale)` & `saveDraft(record)`**:
   - Stores work-in-progress translations.
   - Saves occur without affecting the public site.
   - Accessible only within editorial administrative sessions.
2. **`getPublished(target, locale)` & `savePublished(record)`**:
   - Stores approved, published translations.
   - Public resolution queries (`resolveCmsTargetForLocale`) ONLY read from this partition.
3. **Publish Validation Guard**:
   - The editor UI must NEVER automatically promote a draft to published status upon autosave.
   - Promoting a draft to published status requires an explicit **"نشر التغييرات" (Publish Changes)** user action.
   - If an editor modifies Arabic canonical content and saves, any existing draft translations for TR/EN remain isolated in the draft partition until explicitly published.

---

## 10. Stale Behavior and Source Change Invariant

When an editor modifies canonical Arabic content:

### 10.1 Preservation Invariant
- **Existing translations are NEVER deleted.**
- **Existing translations are NEVER wiped to empty strings.**
- **Human edits are NEVER silently reverted.**

### 10.2 Automated Staleness Flagging
1. Upon saving changes to an Arabic target, the system calculates the new source hash via `computeSourceHash(updatedCanonicalPayload)`.
2. For each published locale (`tr`, `en`), the system compares the previous canonical hash with the new hash.
3. If hashes diverge, `markLocalizationStale(existingRecord, affectedPaths)` updates the record:
   - `status` is transitioned to `'stale'`.
   - `stalePaths` stores the exact list of modified dot-paths (e.g., `['title', 'description']`).
4. **Public Site Behavior**: In accordance with the Task 7A specification, **stale published translations remain visible to the public**. Readers continue to see the existing Turkish or English text rather than experiencing an abrupt fallback to Arabic, while administrative editors are alerted that the translation needs updating.
5. **Editor UI Behavior**: The editor highlights the stale fields with an amber outline and an advisory note: `"تم تعديل النص العربي الأصلي، يرجى مراجعة وتحديث الترجمة."`.

---

## 11. `manualPaths` Protection Against Automated Machine Overwrites

In Task 7C2, human editors can manually craft or adjust Turkish and English text. These human contributions must be permanently protected against being blindly overwritten by future automated machine translations (Task 7D).

### 11.1 Tracking Manual Edits
- When an editor changes the value of a localized field in the UI, that field's path is added to the record's `manualPaths` array via `normalizeLocalizationPaths`:
  ```typescript
  const updatedManualPaths = normalizeLocalizationPaths([
    ...(record.manualPaths ?? []),
    fieldPath,
  ]);
  ```
- `isLocalizationPathManual(path, record.manualPaths)` returns `true` for all recorded paths.

### 11.2 Task 7D Protection Contract
When automated translation is executed in Task 7D:
- Any path where `isLocalizationPathManual(path) === true` is **skipped by default**.
- The machine translation engine is prohibited from overwriting manual paths unless the editor explicitly checks an emergency override: `[ ] استبدال الترجمات اليدوية بالترجمة الآلية (Overwrite manual translations)`.

---

## 12. Component Architecture

To prevent duplication and guarantee consistent behavior across all 15 CMS targets, Task 7C2 defines four reusable, modular presentation components:

```
+-----------------------------------------------------------------------------------+
|                            Admin Dashboard / Modal                                |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | CmsTranslationSection (Collapsible Accordion / Container)                   |  |
|  |                                                                             |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | LocaleTranslationTabs                                                 |  |  |
|  |  | [ العربية (المصدر) ]  [ Türkçe  <TranslationStatusBadge /> ]          |  |  |
|  |  |                       [ English <TranslationStatusBadge /> ]          |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |                                                                             |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | LocalizedFieldEditor (Content-Directional Input / Textarea)           |  |  |
|  |  | - RTL for 'ar'                                                        |  |  |
|  |  | - LTR for 'tr' & 'en'                                                 |  |  |
|  |  | - Amber border if isStale                                             |  |  |
|  |  | - Protected badge if isManual                                         |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 12.1 `TranslationStatusBadge`
- **Responsibility**: Renders a compact, color-coded status badge with localized text.
- **Props**:
  - `status: LocalizationStatus`
  - `size?: 'sm' | 'md'` (default: `'sm'`)
  - `className?: string`
- **Dependencies**: Uses `useTranslation` for localized text (`t('cms.status.fresh')`, etc.).

### 12.2 `LocalizedFieldEditor`
- **Responsibility**: Renders a single localized text input or textarea with strict content-level text directionality.
- **Props**:
  - `target: CmsTarget | string`
  - `locale: LocalizedCmsLocale | CanonicalCmsLocale`
  - `path: string`
  - `label: string`
  - `value: string`
  - `kind: CmsFieldKind` (`'title' | 'description' | 'richText' | 'text'`)
  - `isStale: boolean`
  - `isManual: boolean`
  - `disabled?: boolean`
  - `onChange: (newValue: string) => void`
- **Direction Invariant**:
  - `locale === 'ar'` -> `dir="rtl"` with `font-sans` (Cairo typography).
  - `locale === 'tr' || locale === 'en'` -> `dir="ltr"` with Latin system typography.
  - Direction is derived strictly from the **content locale being edited**, regardless of the active Admin UI language.

### 12.3 `LocaleTranslationTabs`
- **Responsibility**: Switches active language view in large entity modals while displaying real-time status pills for each locale.
- **Props**:
  - `activeLocale: CmsLocale`
  - `statuses: Record<LocalizedCmsLocale, LocalizationStatus>`
  - `onSelectLocale: (locale: CmsLocale) => void`
  - `canonicalLabel?: string` (default: `'العربية (المصدر)'`)

### 12.4 `CmsTranslationSection`
- **Responsibility**: Manages the complete translation lifecycle for a given target entity. Handles fetching existing draft/published overlays from `CmsLocalizationRepository`, tracking dirty states, rendering collapsible accordion UI for inline modals or embedded tabbed panels for large modals, and providing save hooks.
- **Props**:
  - `target: CmsTarget | string`
  - `canonicalPayload: unknown`
  - `translatablePaths: readonly string[]`
  - `mode?: 'accordion' | 'embedded'` (default: `'accordion'`)
  - `onDraftSaved?: (locale: LocalizedCmsLocale) => void`
  - `onPublished?: (locale: LocalizedCmsLocale) => void`

---

## 13. Repository Interaction & In-Memory Adapter

### 13.1 Context Injection Architecture
UI components NEVER interact directly with global variables or database clients. A React Context (`CmsLocalizationRepositoryContext`) injects the repository abstraction:

```typescript
export interface CmsLocalizationContextValue {
  repository: CmsLocalizationRepository;
}

export const CmsLocalizationContext = createContext<CmsLocalizationContextValue | null>(null);

export function useCmsLocalizationRepository(): CmsLocalizationRepository {
  const ctx = useContext(CmsLocalizationContext);
  if (!ctx) {
    throw new Error('useCmsLocalizationRepository must be used within CmsLocalizationProvider');
  }
  return ctx.repository;
}
```

### 13.2 Development & Testing Isolation
In development, test suites, and preview environments, the application provides `InMemoryCmsLocalizationRepository`:
- Supports full draft and published isolation.
- Enforces source hash mismatch detection.
- Guarantees zero remote database calls.
- Guarantees that Arabic write requests throw `INVALID_LOCALE`.

---

## 14. Persistence Task Boundary (Post-7C2)

The 7C2 design strictly isolates frontend editorial state from physical database infrastructure. The following concerns are formally designated as **OUT OF SCOPE for 7C2** and deferred to a dedicated persistence task:

1. **Supabase Table Creation**: The physical `public.cms_localizations` table DDL.
2. **Draft Storage Partitioning**: Database schema partitioning (e.g., dedicated `is_draft` column or separate draft table).
3. **Database RLS Policies**: Row Level Security policies for role-based reading and editing.
4. **Triggers & Stored Procedures**: Remote Postgres functions for automatic source hashing or publication locking.
5. **Database Migration Scripts**: Executing `supabase db push` or deploying migration files.

---

## 15. Translation Provider Task Boundary (Task 7D)

Task 7C2 creates the editorial canvas and state contracts; it does **NOT** perform machine translation. The following capabilities belong strictly to **Task 7D**:

1. **`TranslationProvider` Interface**: Formal contract for external MT engines (`translateText(sourceText, from, to)`).
2. **Azure Translator Edge Function**: The server-side proxy (`supabase/functions/translate-cms-content`) that securely holds Azure API keys and authenticates callers.
3. **Automatic AR -> TR/EN Translation**: Generating initial draft text from Arabic source.
4. **Retry & Backoff Logic**: Managing rate limits, timeout handling, and failure recovery.
5. **UI Constraint**: Task 7C2 will **NOT** render fake or non-functional "ترجمة آلية (Auto Translate)" buttons. If a button cannot execute real translation, it must remain hidden until Task 7D to avoid user confusion.

---

## 16. Public Read Integration Boundary

### 16.1 Target Public Architecture
In the final architecture, public client pages will consume localized data via `resolveCmsTargetForLocale(repository, target, activeLocale, canonicalPayload)`:
- `ar` -> Returns canonical Arabic immediately (0ms, 0 repository queries).
- `tr` / `en` -> Queries published localization overlay; if fresh or stale, overlays translated fields onto canonical payload; if missing or draft, falls back to Arabic.

### 16.2 Rollout Recommendation
To avoid destabilizing public page rendering during authoring workflow development, **Public Read Integration is explicitly decoupled from Task 7C2A**.
- **Phase 7C2A**: Focuses exclusively on the authoring and editing experience within administrative and inline modals, plus correcting the Event Form enum bug.
- **Phase 7C2B**: Migrates public page data hooks (`useSiteContent`, etc.) to resolve published localizations dynamically.

---

## 17. Access Control and Authorization

### 17.1 Inherited Editorial Permissions
Translation editing authority mirrors canonical target editing permissions:
- An editor who holds authorized edit permissions for a canonical section (e.g., Media Head editing News or Events) automatically holds edit permissions for the Turkish and English translations of that section.
- If an editor has view-only access (e.g., non-presidential roles on locked sections), all translation inputs render in a disabled, view-only state.

### 17.2 President-Only Emergency Arabic Publish
In urgent operational scenarios (e.g., an urgent safety alert, sudden schedule change, or time-sensitive announcement), waiting for Turkish and English translations to be drafted and reviewed may be unacceptable.

The design incorporates an **Emergency Arabic-Only Publish** workflow:
- **Authorized Role**: Strictly restricted to `PRESIDENT`.
- **Deliberate Confirmation**: Clicking "نشر طارئ باللغة العربية فقط (Emergency Arabic Publish)" opens a modal detailing:
  > **تحذير: نشر طارئ باللغة العربية فقط**  
  > سيتم نشر التعديلات العربية فوراً إلى الموقع العام. الترجمات للتركية والإنجليزية غير مكتملة وستبقى معلّمة كدين ترجمة (Translation Debt). سيشاهد زوار اللغات الأخرى النص المترجم السابق أو النص العربي كاحتياط.
- **Integrity Guarantee**: Emergency publishing marks the Arabic content live and sets the TR/EN records to `stale` (or leaves them `missing`). It **NEVER** fraudulently marks missing or stale translations as fresh.

---

## 18. Error Handling and Unsaved Changes UX

### 18.1 Failure Recovery
1. **Draft Save Failure**: If saving a localized draft fails (e.g., network error or concurrency conflict), the error is displayed in an alert badge within the translation section. The canonical Arabic draft remains completely untouched and safe.
2. **Optimistic Concurrency Conflict (`CONFLICT`)**: If another editor modified the Arabic source or translation record concurrently, the repository throws `CmsLocalizationRepositoryError('CONFLICT')`. The modal prompts: `"تم تعديل المحتوى في جلسة أخرى. هل ترغب في إعادة تحميل أحدث نسخة؟"`.
3. **Partial Save Resilience**: Canonical Arabic save and localized overlay saves are decoupled. A failure in Turkish translation persistence cannot cause the loss of approved Arabic canonical edits.

### 18.2 Unsaved Changes Guard
If an editor inputs changes into any Arabic, Turkish, or English field and attempts to dismiss the modal (via backdrop click, Escape key, or Cancel button) while `isDirty === true`:
- The modal dismiss action is intercepted.
- A confirmation dialog appears:
  > **تعديلات غير محفوظة**  
  > لديك تعديلات غير محفوظة في هذا النموذج. هل أنت متأكد من الإغلاق وفقدان التغييرات؟  
  > `[ متابعة التعديل ]` `[ إغلاق وتجاهل التعديلات ]`

---

## 19. Directionality and Content Typography

A frequent bug in multilingual CMS tools is forcing text inputs to inherit the application interface's layout direction. In this design:

1. **Content-Driven Directionality**:
   - Arabic canonical inputs: Always `dir="rtl"` with `font-sans` (Cairo/Tajawal).
   - Turkish translation inputs: Always `dir="ltr"` with system Latin typography.
   - English translation inputs: Always `dir="ltr"` with system Latin typography.
   - Technical URLs, emails, and identifiers: Always `dir="ltr"`.
2. **Interface Independence**:
   - If an administrator uses the Admin Dashboard in English (`locale === 'en'`), the Arabic canonical text field inside the modal remains strictly `dir="rtl"`.
   - If an administrator uses the Admin Dashboard in Arabic (`locale === 'ar'`), the Turkish and English translation fields inside the modal remain strictly `dir="ltr"`.

---

## 20. Comprehensive Testing Strategy (28 Mandatory TDD Scenarios)

Implementation of Task 7C2 must adhere to Test-Driven Development (TDD), fulfilling the following 28 automated test specifications before declaring completion:

### Category A: Visual & Directionality Invariants
1. **`test_inline_hero_shows_ar_source_and_translation_section`**: Verifies that opening `EditableField` for `hero.title` renders the Arabic source field and the collapsible translation container.
2. **`test_turkish_field_is_ltr`**: Asserts that `LocalizedFieldEditor` with `locale="tr"` renders with `dir="ltr"`.
3. **`test_english_field_is_ltr`**: Asserts that `LocalizedFieldEditor` with `locale="en"` renders with `dir="ltr"`.
4. **`test_arabic_field_is_rtl`**: Asserts that `LocalizedFieldEditor` with `locale="ar"` renders with `dir="rtl"`.

### Category B: Schema Allowlist & Safe Exclusions
5. **`test_only_allowlisted_paths_receive_translation_editors`**: Confirms that only paths satisfying `isCmsPathTranslatable` generate translation inputs; unlisted fields are skipped.
6. **`test_urls_never_receive_translation_editors`**: Validates that image URLs, document URLs, and social links never produce translation fields.
7. **`test_person_names_never_receive_translation_editors`**: Confirms that Executive Board names and Committee Head names are strictly excluded from translation extraction.
8. **`test_event_title_receives_localization_editor`**: Verifies that `events.title` generates a valid multilingual editor.
9. **`test_event_description_receives_localization_editor`**: Verifies that `events.description` generates a valid multiline multilingual editor.
10. **`test_event_category_does_not_receive_cms_translation_editor`**: Verifies that `events.category` does NOT generate a translation field in the CMS translation overlay.
11. **`test_event_category_label_is_localized_through_fixed_presentation`**: Asserts that the category dropdown renders options using `getEventCategoryLabel(c, t)`.
12. **`test_event_category_stored_value_remains_canonical`**: Asserts that selecting an option saves the canonical English key (`workshop`, `lecture`) to the form state.
13. **`test_numeric_fields_have_no_translation_ui`**: Verifies that `capacity` and `pointsValue` have no localization tabs or inputs.
14. **`test_datetime_fields_have_no_translation_ui`**: Verifies that `date`, `time`, and `registrationDeadline` have no localization UI.
15. **`test_human_text_location_is_translatable`**: Confirms that a textual location (e.g. `"قاعة المؤتمرات"`) generates translation editors.
16. **`test_url_shaped_location_is_excluded`**: Confirms that a Google Maps link in `location` does NOT generate a translation editor.

### Category C: Status Lifecycle & Staleness
17. **`test_missing_status_shown_correctly`**: Confirms that an unlocalized entity displays the `'missing'` badge.
18. **`test_draft_status_shown_correctly`**: Confirms that saving a draft updates the badge to `'draft'`.
19. **`test_fresh_status_shown_correctly`**: Confirms that a published translation with matching hash displays `'fresh'`.
20. **`test_stale_status_shown_correctly`**: Confirms that modifying Arabic canonical content transitions published translations to `'stale'`.
21. **`test_arabic_source_change_preserves_existing_tr_en`**: Confirms that updating Arabic content does not delete or blank existing Turkish/English strings.

### Category D: Manual Overrides & Storage Isolation
22. **`test_manual_paths_preserved`**: Confirms that modifying a Turkish field adds its dot-path to `manualPaths` and persists across saves.
23. **`test_saving_tr_draft_cannot_publish_accidentally`**: Asserts that `saveDraft` writes strictly to the draft partition and does not alter the published partition.
24. **`test_published_localization_and_draft_stay_isolated`**: Confirms that editing a draft does not leak into public resolution queries until published.

### Category E: Regressions & Boundaries
25. **`test_existing_inline_edit_behavior_remains_functional`**: Validates that standard single-language Arabic edits through `EditableField` continue saving properly.
26. **`test_existing_event_form_remains_functional`**: Validates that creating and editing events in `AdminDashboard.tsx` functions seamlessly without regressions.
27. **`test_existing_auth_permission_behavior_unchanged`**: Validates that non-authorized roles are barred from opening edit modals.
28. **`test_no_supabase_remote_interaction`**: Asserts that all tests execute completely in-memory with zero network or Supabase database calls.

---

## 21. Recommended Scope Decomposition

To guarantee manageable PR sizes, zero regressions, and high architectural quality, implementing Task 7C2 as a single monolithic PR is strongly discouraged. The recommended decomposition is structured into three sequential phases:

```
+-----------------------------------------------------------------------------------+
|                        Phase 7C2A: Core Foundation & In-Context                   |
| - Reusable UI components (CmsTranslationSection, LocalizedFieldEditor, Badges)   |
| - InlineEditOverlay.tsx integration (Homepage Hero, Stats, About In-Context)      |
| - AdminDashboard Event category presentation bugfix (getEventCategoryLabel)       |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Phase 7C2B: Large Admin Content Modals                     |
| - Events form multilingual tabs & location value-aware handling                   |
| - News, Media Gallery, FAQ, Student Guide modals multilingual editing            |
| - Executive Plans, Reports, and Committees multilingual editing                   |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Phase 7C2C: Translation Debt Monitoring                    |
| - Admin Dashboard "Translation Monitoring" tab (Read-Only metrics)                |
| - Entity-by-entity completion gauges (% translated, missing, stale counts)        |
| - Direct deep-links from debt table to in-context edit modals                     |
+-----------------------------------------------------------------------------------+
```

### 21.1 Phase 7C2A: Core Reusable UI Foundation & Inline Editing
- **Scope**:
  - Build `TranslationStatusBadge`, `LocalizedFieldEditor`, `LocaleTranslationTabs`, and `CmsTranslationSection`.
  - Integrate `CmsTranslationSection` into `InlineEditOverlay.tsx` (`EditableField` and `EditableCard`).
  - Fix the raw Arabic event category display bug in `AdminDashboard.tsx` using `getEventCategoryLabel(c, t)`.
  - Wire `InMemoryCmsLocalizationRepository` into React context for development and automated tests.
- **Estimated Size**: ~400 lines of modular component code + comprehensive unit test suite.

### 21.2 Phase 7C2B: Large Admin Content Modals
- **Scope**:
  - Refactor `AdminDashboard.tsx` modal dialogs to adopt `LocaleTranslationTabs` and `CmsTranslationSection` across:
    - Events (Title, Description, Location)
    - News (Title, Excerpt, Full Body)
    - Media Gallery (Album Title, Description, Location, Captions)
    - Student Guide & FAQ (Headings, Questions, Answers, Tips)
    - Plans & Reports (Titles, Summaries, Free-form Period)
    - Committees (Descriptions, Vision, Goals, Member Positions)
- **Estimated Size**: Concentrated in `AdminDashboard.tsx` and modal sub-components.

### 21.3 Phase 7C2C: Central Translation Debt Monitoring Dashboard
- **Scope**:
  - Add an optional monitoring tab in `AdminDashboard.tsx`: **"حالة الترجمة" (Translation Status)**.
  - Read-only audit view displaying completion ratios across all 15 CMS targets (e.g., `Events: TR 100%, EN 85%`).
  - Lists stale and missing debt items with a **"تعديل في المكان" (Edit in Place)** button that deep-links directly to the relevant edit modal.
  - No translation editing takes place inside this dashboard; it serves solely as an executive audit cockpit.

---

## 22. Explicit Acceptance Criteria

To declare Task 7C2 successfully implemented upon execution of the phases above, the system must fulfill the following criteria:

- [ ] **Same-Place Editing**: An editor editing a homepage headline or an event description can input Turkish and English translations directly within the existing modal without navigating away.
- [ ] **Collapsible Accordion**: In `EditableField`, the translation section is collapsed by default showing compact status pills (`TR ✓`, `EN ⚠`) and expands smoothly on click.
- [ ] **Language Tabs**: In large entity modals, shared technical fields appear once, while editorial fields are organized under clean `[ العربية ] [ Türkçe ] [ English ]` tabs.
- [ ] **Directionality Enforcement**: Arabic inputs strictly render `dir="rtl"`; Turkish and English inputs strictly render `dir="ltr"`, regardless of active Admin UI language.
- [ ] **Fixed Enum Localization**: Event categories and activity types display localized labels in Admin tables and dropdowns while storing canonical keys.
- [ ] **Safe Schema Compliance**: Only fields explicitly allowlisted in `CMS_TRANSLATABLE_SCHEMA` render translation inputs.
- [ ] **Location Value-Awareness**: Human text locations offer translation inputs; URL or map link locations do not.
- [ ] **Identity Protection**: Person names, dates, numbers, and file URLs never render translation inputs.
- [ ] **Staleness Tracking**: Modifying Arabic canonical content transitions existing translations to `stale` with highlighted paths, while preserving the existing strings.
- [ ] **Manual Override Protection**: Human edits to translations populate `manualPaths` to prevent future automated overwrite.
- [ ] **Draft Isolation**: Saving a translation draft writes strictly to the draft partition and does not leak to the public site.
- [ ] **Zero Database Dependencies**: All interactions route through `CmsLocalizationRepository`; no Supabase tables or migrations are executed.
- [ ] **Zero Fake Auto-Translation**: No non-functional machine translation buttons are rendered.
- [ ] **All 28 TDD Scenarios Pass**: The automated test suite executes cleanly and comprehensively.

---

## 23. Risks, Edge Cases, and Mitigation Strategies

| Risk / Edge Case | Architectural Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Rich Text Line-Break Discrepancies** | Formatting breaks between Arabic paragraphs and translated equivalents. | Markdown and multiline textareas normalize `\r\n` to standard `\n` on extraction and save. |
| **Accidental Modal Dismissal** | Editor loses multi-language draft work on accidental backdrop click. | Implement dirty-state confirmation dialog on modal close when `isDirty === true`. |
| **URL-like Place Names** | A human place name containing `.com` or `/` is mistakenly flagged as a URL. | The regex strictly requires protocol (`http://`, `https://`, `geo:`) or exact coordinate syntax. |
| **Simultaneous Source & Translation Edits** | Editor updates Arabic title and Turkish title in the same session. | Save pipeline executes canonical update first, obtains new `sourceHash`, then binds that hash to the new Turkish translation record, ensuring immediate `fresh` status. |
| **Modal Height Overflow on Mobile** | Multilingual fields expand modal beyond mobile viewport. | Modal body enforces `max-h-[80vh] overflow-y-auto` with sticky action footer buttons. |
| **Large Modal Complexity in `AdminDashboard.tsx`** | Adding translation state blows up `AdminDashboard.tsx` file size (>3500 lines). | Extract modal forms into dedicated feature components (e.g. `src/components/admin/EventModal.tsx`) during Phase 7C2B. |
