# Initial Page Load Phase 1 Results

## Git State

branch: perf/initial-page-load
SHA: 5ba0792d9d541b07e2565bc9e2b2b438495ba861

## Verification

tests: 1969 passed
typecheck: PASS
build: PASS
lint errors: 11
lint warnings: 0
new lint errors: NO
diff-check: PASS

## Baseline

entry JS:
2235615 bytes

JS asset count:
1

CSS:
73439 bytes

total JS:
2235615 bytes

## Post-Splitting Build

entry JS filename: index-GDX-vXmL.js
entry JS bytes: 1621177
JS asset count: 32
total JS bytes: 2247502
CSS asset count: 1
total CSS bytes: 73754

## Entry Payload Comparison

before: 2235615 bytes
after: 1621177 bytes
byte reduction: 614438 bytes
percentage reduction: 27.48%

Explain:
This metric measures the entry bundle only and is not equal to total site JS. Route splitting keeps the total JavaScript similar across the site while significantly reducing the amount required on first route load.

## Route Chunk Evidence

| Route | Separate lazy build chunk/group present | Build filename/evidence |
|---|---|---|
| Home | YES | `HomePage-C7Zb7fi_.js` |
| About | YES | `AboutPage-Dbb9bOCM.js` |
| Programs | YES | `ProgramsPage-BRKCG-Sn.js` |
| Contact | YES | `ContactPage-DDd58xCX.js` |
| Gallery | YES | `MediaGallery-CInsXDQ7.js` |
| News | YES | `NewsPage-CnNo315f.js` |
| Guide | YES | `StudentGuide-DqwqNjBw.js` |
| FAQ | YES | `FAQPage-J1bIB4tf.js` |
| Auth | YES | `AuthPages-5yI01AWL.js` |
| Student Dashboard | YES | `StudentDashboard-C3-gyxya.js` |
| Admin Dashboard | YES | `AdminDashboard-DY2bjBXE.js` |
| Board | YES | `BoardPage-CJPx-xAE.js` |
| Committee | YES | `CommitteePage-CKX6zleu.js` |

## Key Findings

- Route splitting exists: build output confirms separate JS assets generated for each configured route.
- Main entry is smaller: reduced by 614,438 bytes (27.48% smaller).
- Number of generated JS assets changed: increased from 1 to 32.
- Protected route modules are no longer eager route imports: they load on demand.
- Runtime request behavior is NOT yet proven by build output.

## Remaining Questions for Task 7

- Does anonymous Home request AdminDashboard chunk?
- Does anonymous Home request StudentDashboard chunk?
- Does anonymous Home request Guide/Gallery chunks?
- Does second Guide visit trigger fresh transfer?
- Which network resources keep browser loading active?
- Which Supabase calls still occur globally?
