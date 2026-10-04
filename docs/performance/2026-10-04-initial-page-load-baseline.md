# Initial Page Load Baseline

## Git State
branch: perf/initial-page-load
SHA: 93938f5fa4747bd6dd7eb649c1427f1ce99f67dc

## Verification
tests: 1957 passed
typecheck: passed
build: passed
lint exact: 11 errors, 0 warnings

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
