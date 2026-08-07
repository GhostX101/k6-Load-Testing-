# K6 Project — Load Testing Suite

Performance test suite built with [k6](https://k6.io/), organized into three scripts of increasing complexity: a baseline load test, a request-grouping test, and a weighted traffic-distribution test. HTML reports are generated automatically via `k6-reporter`.

**Targets differ by script:**
- `first-k6script.js` hit [test.k6.io](https://test.k6.io/).
- `user-groups.js` and `traffic-distribution.js` hit [test.k6.io](https://test.k6.io/) — k6's own public test site — via a `BASE_URL` environment variable that defaults to `https://test.k6.io` but can be overridden at run time.

## Project Structure

```
K6 PROJECT/
├── screenshoot/               # Report/result screenshots
├── script/
│   ├── first-k6script.js      # Baseline load test (ramping VUs)
│   ├── traffic-distribution.js# Weighted/mixed traffic pattern test
│   └── user-groups.js         # Scenario-based test for distinct user segments
├── .gitignore
├── README.md
└── report.html                # Latest generated HTML report
```

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally (`k6 version` to confirm)
- Internet access to `www.saucedemo.com` and to `raw.githubusercontent.com` (the HTML reporter is pulled in as a remote module at runtime, so no `npm install` step is needed)

## Scripts

### 1. `first-k6script.js` — Baseline Load Test

This is the entry-point test: a single GET request against the SauceDemo homepage, run under a ramping virtual-user (VU) load profile.

**Load profile (`stages`):**

| Stage | Duration | Target VUs | Purpose |
|---|---|---|---|
| Ramp-up | 10s | 10 | Warm up, catch immediate failures |
| Sustain | 1m | 20 | Steady-state load at peak concurrency |
| Ramp-down | 30s | 0 | Graceful cool-down, observe recovery |

**What it does per VU iteration:**
- Sends `GET https://www.saucedemo.com/`
- Asserts the response status is `200` via `check()`
- Sleeps 1s between iterations to simulate realistic user think-time (prevents unrealistically hammering the server)

**Threshold (pass/fail gate):**
- `http_req_duration: p(95)<500` — the test is considered **failed** if the 95th percentile response time exceeds 500ms. This is what k6 uses to set a non-zero exit code, which is useful for wiring this into CI.

**Reporting:**
- `handleSummary()` overrides k6's default end-of-run summary and instead writes a styled `report.html` (via the [k6-reporter](https://github.com/benc-uk/k6-reporter) library, loaded directly from GitHub — no local install needed) to the project root.

**Run it:**
```bash
k6 run script/first-k6script.js
```
This produces/overwrites `report.html` in the directory you run the command from. Open it in a browser to see request breakdowns, threshold pass/fail, and response time distribution.

### 2. `user-groups.js` — Grouped Multi-Page Journey Test

Targets `test.k6.io` (overridable via `BASE_URL`) and walks every virtual user through the **same fixed sequence of three pages**, each wrapped in a k6 [`group()`](https://k6.io/docs/using-k6/tags-and-groups/) so results are broken out per page in the report rather than lumped into one aggregate metric:

1. **Open Homepage** — `GET {BASE_URL}/`
2. **Open New Page** — `GET {BASE_URL}/news.php`
3. **Open Blog Page** — `GET {BASE_URL}/about.php`

Each request is checked for `status === 200`, with a 1s `sleep()` between each group to simulate think-time. Same ramping VU profile and `p(95)<500ms` threshold as `first-k6script.js`.

Because every request is grouped, `report.html` will show response time and pass/fail broken down by "Open Homepage" / "Open New Page" / "Open Blog Page" individually — useful for spotting whether one specific page is dragging down the overall p(95), which a flat single-request test can't tell you.

**Run it:**
```bash
k6 run script/user-groups.js
# or against a different target:
k6 run -e BASE_URL=https://staging.example.com script/user-groups.js
```

### 3. `traffic-distribution.js` — Weighted Traffic Distribution Test

Also targets `test.k6.io` (overridable via `BASE_URL`), but instead of every VU hitting all three pages in sequence, **each iteration picks exactly one page to hit**, based on a weighted random split defined at the top of the script:

```js
const traffic_split = {
  homepage: 0.5, // 50% of traffic to homepage
  news: 0.3,     // 30% of traffic to news page
  blog: 0.2,     // 20% of traffic to blog page
};
```

A single `Math.random()` value per iteration is bucketed against these thresholds to decide which group (`Open Homepage`, `Open News Page`, or `Open Blog Page`) runs that iteration — approximating a realistic traffic mix where the homepage gets the most hits and the blog the least, rather than testing all pages equally. Same ramping VU profile, 1s sleep, and `p(95)<500ms` threshold as the other scripts.

This is the script to reach for when you want the *load itself* to reflect real-world usage patterns (most users bounce off the homepage, fewer go deeper), as opposed to `user-groups.js`, which measures every page under the same guaranteed load.

**Run it:**
```bash
k6 run script/traffic-distribution.js
# or against a different target:
k6 run -e BASE_URL=https://staging.example.com script/traffic-distribution.js
```

> Note: since `traffic_split` values are compared as running thresholds (`< 0.5`, `< 0.8`, `< 1.0`), they must sum to `1.0` (or less — anything above the last threshold with no matching branch simply results in no request being sent that iteration) if you adjust the ratios.

## Reports

Every script currently writes its summary to `report.html` in the project root via `handleSummary()` and the k6-reporter library. Since all three scripts write to the same filename, **running a second script will overwrite the previous report** — rename or move `report.html` between runs if you want to keep a history (the `screenshoot/` folder in this repo suggests that's the current workaround: capturing screenshots of results before they're overwritten).

Suggested improvement: output per-script reports, e.g.
```js
return { "report-first-k6script.html": htmlReport(data) };
```

## Interpreting Results

- **Green threshold in `report.html`** → p(95) response time stayed under 500ms across the run.
- **Red/failed threshold** → more than 5% of requests exceeded 500ms; check the response time trend graph for when degradation started (usually correlates with the ramp-up to 20 VUs).
- **Failed checks** → any non-200 response from SauceDemo; worth cross-referencing with k6's `http_req_failed` metric.

## Notes & Caveats

- Target site is a third-party demo (`saucedemo.com`) — be considerate with VU counts and run frequency; this is not infrastructure you control.
- No environment variables or `.env` config are currently used — target URL, VU counts, and stage durations are hardcoded in each script. Consider extracting these to `k6` environment variables (`__ENV`) if you need to point the suite at different environments.
- `.gitignore` is present but its contents weren't reviewed here — worth double-checking `report.html` and `screenshoot/` are excluded if these are meant to be regenerated per-run rather than versioned.

## Next Steps

- [ ] Namespace HTML report output per script to avoid overwrites
- [ ] Extend `first-k6script.js` to use `__ENV.BASE_URL` like the other two scripts, for consistency
- [ ] Consider parameterizing load stages (VU counts, durations) via `__ENV` as well