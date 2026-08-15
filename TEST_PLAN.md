# Test Plan K6 Load Testing Suite

## 1. Purpose

This suite validates that the applications under test can sustain a moderate concurrent load (10–20 virtual users) while keeping response times acceptable. It is intentionally split into three scripts of increasing sophistication — a single-request baseline, a grouped multi-page journey, and a weighted traffic-distribution model — to demonstrate different load-testing approaches rather than duplicate one test three times.

## 2. Scope

### In scope
- HTTP level load and response time testing of public, unauthenticated pages
- Status code validation (`200 OK`) as the correctness check
- Response-time thresholds under ramping concurrent load
- Comparing uniform vs. weighted traffic patterns across the same target application

### Out of scope
- Authentication / session based flows (login, cart, checkout)  none of the three scripts currently exercise these
- Data validation beyond HTTP status (no response body/schema assertions)
- Stress testing to find breaking points (max VUs here is 20 this is load testing, not capacity/stress testing)
- Soak/endurance testing (longest run is ~1m40s total; no multi hour runs)
- Browser-level (frontend rendering, JS execution) testing this is protocol level (HTTP) testing only

## 3. Applications & Environments Under Test

| Script | Target | Configurable? |
|---|---|---|
| `first-k6script.js` | `https://www.saucedemo.com/` | No hardcoded |
| `user-groups.js` | `https://test.k6.io` (default) | Yes  via `BASE_URL` env var |
| `traffic distribution.js` | `https://test.k6.io` (default) | Yes  via `BASE_URL` env var |

**Known inconsistency:** `first-k6script.js` does not yet support `BASE_URL` override. Tracked as a follow-up (see README "Next Steps").

## 4. Test Scenarios

### 4.1 `first-k6script.js`  Baseline Load Test
**Objective:** Establish a response-time baseline for a single endpoint under ramping load, with no internal breakdown by page or path.

**Steps:**
1. `GET /` on SauceDemo
2. Assert `status === 200`
3. Sleep 1s, repeat for the duration of the run

### 4.2 `user-groups.js` Grouped Multi-Page Journey
**Objective:** Simulate a user who visits every page in a fixed order, with results broken out per page (via k6 `group()`), to catch a single slow page that a flat aggregate metric would hide.

**Steps (every VU, every iteration):**
1. Group "Open Homepage": `GET {BASE_URL}/` → assert `200`
2. Sleep 1s
3. Group "Open New Page": `GET {BASE_URL}/news.php` → assert `200`
4. Sleep 1s
5. Group "Open Blog Page": `GET {BASE_URL}/about.php` → assert `200`

### 4.3 `traffic-distribution.js` Weighted Traffic Distribution
**Objective:** Model realistic, non uniform traffic where the homepage receives more hits than deeper pages, rather than testing every page under identical load.

**Traffic split (per iteration, one page only):**
| Page | Weight |
|---|---|
| Homepage (`/`) | 50% |
| News (`/news.php`) | 30% |
| Blog (`/about.php`) | 20% |

**Steps (every VU, every iteration):**
1. Draw one random number
2. Route to exactly one grouped request based on the weight table above
3. Assert `status === 200`
4. Sleep 1s

## 5. Load Profile (shared across all three scripts)

| Stage | Duration | Target VUs |
|---|---|---|
| Ramp-up | 10s | 0 → 10 |
| Sustain (peak) | 1m | 20 |
| Ramp-down | 30s | 20 → 0 |

**Total run time:** ~1m40s per script.

**Rationale:** 20 concurrent VUs represents a moderate, realistic peak for a small-to-mid-traffic site rather than a stress ceiling. The ramp-up/ramp-down phases exist to observe behavior during load *transitions* (often where connection pooling or autoscaling issues surface), not just at steady state.

## 6. Pass/Fail Criteria

| Metric | Threshold | Meaning if failed |
|---|---|---|
| `http_req_duration` (p95) | `< 500ms` | 95th-percentile response time exceeded 500ms degraded performance under load |
| `check()` status 200 | Implicit (checks logged, not a hard threshold) | Any non 200 response is recorded as a failed check but does not by itself fail the k6 run unless combined with a `checks` threshold |

**Note:** currently only `http_req_duration` has a formal threshold. Adding a `checks` threshold (e.g. `checks: ['rate>0.99']`) is recommended so a spike in non-200 responses also produces a non-zero exit code for CI gating — see Section 9.

## 7. Test Data

No test data / fixtures are required  all three scripts hit static, unauthenticated public pages. No accounts, tokens, or seeded data are used.

## 8. Reporting

- Each script's `handleSummary()` writes `report.html` (via [k6-reporter](https://github.com/benc-uk/k6-reporter)) to the directory the command is run from.
- **Current limitation:** all three scripts write to the same `report.html` filename, so running a second script overwrites the first script's report. The `screenshoot/` folder is the current manual workaround for preserving results.
- **Planned fix:** namespace output per script, e.g. `report-user-groups.html`, `report-traffic-distribution.html`.

## 9. How to Run

```bash
# Baseline (SauceDemo, fixed target)
k6 run script/first-k6script.js

# Grouped journey (test.k6.io by default)
k6 run script/user-groups.js

# Weighted distribution (test.k6.io by default)
k6 run script/traffic-distribution.js

# Override target for the two configurable scripts
k6 run -e BASE_URL=https://staging.example.com script/user-groups.js
k6 run -e BASE_URL=https://staging.example.com script/traffic-distribution.js
```

Exit code is non zero if the `http_req_duration` p95 threshold is breached suitable for CI gating (see `.github/workflows/` once added).

## 10. Risks & Limitations

- **No auth coverage** Real user journeys through SauceDemo (login → cart → checkout) are not tested; current coverage is limited to public pages.
- **Third-party target for `first-k6script.js`** — SauceDemo is not infrastructure we control; be considerate with VU counts and run frequency, and expect this target to be less stable/representative for CI use than `test.k6.io`.
- **No response-body assertions** A `200` with an empty or malformed body would still pass; only status code is validated today.
- **Report overwrite risk**  Seee Section 8; results from successive local runs are not preserved automatically.
- **Single-region execution**  All runs originate from wherever k6 is executed (local machine or CI runner); no multi-region/geo-distributed load is modeled.

## 11. Future Improvements

- [ ] Add `checks` rate threshold so failed status checks also fail the run
- [ ] Namespace HTML reports per script
- [ ] Add `BASE_URL` support to `first-k6script.js` for consistency
- [ ] Add authenticated-flow scenarios (login, cart, checkout) for SauceDemo
- [ ] Wire into CI (GitHub Actions) for automated runs on PR/push
- [ ] Add response-body/schema validation, not just status code
