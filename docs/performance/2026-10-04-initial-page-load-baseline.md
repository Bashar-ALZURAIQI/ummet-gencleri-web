# Initial Page Load Baseline

## Git State
branch: perf/initial-page-load
SHA: 93938f5fa4747bd6dd7eb649c1427f1ce99f67dc
Vercel deployment status: SUCCESS
Preview application URL: NOT AVAILABLE

## Verification
tests: 1957 passed
typecheck: passed
build: passed
lint exact: CURRENT PERFORMANCE WORK LINT BASELINE:
11 errors
0 warnings

## Existing Lint Baseline
- `src/context/AppContext.tsx:983` - @typescript-eslint/no-explicit-any - Unexpected any. Specify a different type
- `src/context/AppContext.tsx:986` - @typescript-eslint/no-explicit-any - Unexpected any. Specify a different type
- `src/domain/sessionDraft.ts:135` - @typescript-eslint/no-explicit-any - Unexpected any. Specify a different type
- `src/domain/sessionDraft.ts:184` - @typescript-eslint/no-explicit-any - Unexpected any. Specify a different type
- `src/domain/sessionDraft.ts:224` - @typescript-eslint/no-unused-vars - 'err' is defined but never used
- `src/domain/sessionDraft.ts:236` - @typescript-eslint/no-unused-vars - 'err' is defined but never used
- `src/domain/sessionDraft.ts:244` - @typescript-eslint/no-unused-vars - 'err' is defined but never used
- `src/domain/sessionDraft.ts:282` - @typescript-eslint/no-unused-vars - 'err' is defined but never used
- `src/domain/sessionDraft.ts:343` - @typescript-eslint/no-unused-vars - 'err' is defined but never used
- `src/domain/studentSuggestionGateway.ts:76` - @typescript-eslint/no-explicit-any - Unexpected any. Specify a different type
- `src/services/accountService.ts:268` - @typescript-eslint/no-unused-vars - 'error' is defined but never used

## Build Output
entry JS: index-KAB58OMC.js (2235615 bytes)
CSS: index-fQ2jYcAA.css (73439 bytes)
JS asset count: 1
total JS bytes: 2235615
largest JS assets:
- index-KAB58OMC.js (2235615 bytes)
full relevant chunk list:
- index-KAB58OMC.js

## Runtime Baseline

| Flow | Cache mode | Requests | Transferred | DOMContentLoaded | Load | FCP | LCP | Last significant resource | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Cold Home | disable cache | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| F5 Home | normal reload | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| Guide | normal reload | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| F5 Guide | normal reload | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| Anonymous Admin | disable cache | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| Anonymous Student | disable cache | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |

## Initial Network Observations
- Supabase requests visible on Home: NOT AVAILABLE
- image requests: NOT AVAILABLE
- font/third-party requests: NOT AVAILABLE
- suspected final resource keeping the load indicator active: NOT AVAILABLE

## Baseline Conclusions
- The initial JavaScript payload is monolithic, resulting in one large entry chunk containing all application code.
- No route-level code splitting is currently active.
- Real runtime network metrics are not available in this environment.
