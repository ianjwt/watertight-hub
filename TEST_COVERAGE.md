# Test Coverage Analysis

## Current State: 0% coverage

The project has no tests — no test framework, no test files, no CI/CD pipeline.
Everything lives in two files: `index.html` (3,962 lines) and `api/anthropic.js`.
All JavaScript is embedded in `<script>` tags and business logic is tightly coupled to the DOM.

---

## Priority Areas

### 1. `sanitize()` — Pure function, highest ROI

**Location:** `index.html:3838`

Completely pure, no DOM dependency. Cases to cover:

- Spaces → hyphens: `"Hello World"` → `"hello-world"`
- Multiple consecutive spaces collapse: `"a  b"` → `"a-b"`
- Mixed case lowercased: `"CamelCase"` → `"camelcase"`
- Special characters stripped: `"foo@bar!"` → `"foobar"`
- Allowed characters (`a-z`, `0-9`, `-`, `_`) preserved unchanged
- Empty string input → empty string output

---

### 2. `formatRecapDate()` — Pure date formatter

**Location:** `index.html:3687`

The `T12:00:00` suffix prevents UTC midnight off-by-one errors. Tests should verify:

- Known date string produces expected output (`"2024-03-15"` → `"Mar 15, 2024"`)
- Month/year boundary dates are correct (Dec 31, Jan 1)
- The noon-time trick prevents the off-by-one: `"2024-01-01"` does **not** become Dec 31

---

### 3. `buildGDocPlainText()` — Core contract output

**Location:** `index.html:3519`

This produces the final contract text exported to Google Docs. It is the most important
business function in the codebase. It takes 12 parameters and reads from global state
(`tcClauses`, `tcEdits`, `activeClient`).

Tests should cover:

- Output contains all 13 expected grid fields (Effective Date, Influencer, Brand, etc.)
- Each field is padded to column width (30 chars) correctly
- The signature block is present and correctly formatted
- When `tcEdits` overrides exist, edited text replaces the original clause
- The header `INFLUENCER SERVICES & CONTENT AGREEMENT` is always present
- Separator lines (`─`.repeat(60)) appear at expected positions

The dependency on `activeClient` / `tcEdits` globals means tests need to set up this
state in `beforeEach` hooks, or these should be refactored as injected parameters.

---

### 4. UTM URL construction inside `buildUTM()` — Critical user-facing output

**Location:** `index.html:3878–3890`

The URL-building logic is simple enough to extract and test independently:

```js
const sep = base.includes('?') ? '&' : '?';
const full = params.length ? base + sep + params.join('&') : base;
```

Cases to test:

- Base URL without existing query params → `?` separator
- Base URL already containing `?foo=bar` → `&` separator
- All 5 UTM params present → all appear in output URL
- Optional params absent → not included in URL string
- Empty destination URL with no params → graceful no-op
- URL length > 420 chars → `over` CSS class applied to char count element
- URL length 361–420 chars → `warn` CSS class applied
- URL length ≤ 360 chars → no warning class

---

### 5. `api/anthropic.js` — Only backend code, completely untested

**Location:** `api/anthropic.js`

A Vercel serverless handler. Can be unit tested with mocked `req`, `res`, and `fetch`:

- Non-POST method → `405` with `{ error: 'Method not allowed' }`
- Successful POST proxies request body and returns Anthropic's response status + JSON
- Anthropic API non-2xx → that status code is forwarded through unchanged
- `fetch` throws (network failure) → `500` with `{ error: err.message }`
- `x-api-key` header is set from `process.env.ANTHROPIC_API_KEY`
- `anthropic-version` header is always `"2023-06-01"`

---

### 6. Input validation in `generateRecap()` — Untestable alert-based guards

**Location:** `index.html:3698–3701`

```js
if (!client)                  { alert('Please select a client.'); return; }
if (!contact)                 { alert('Please enter the client contact name.'); return; }
if (!dateVal)                 { alert('Please select the call date.'); return; }
if (transcript.length < 80)   { alert('Please paste the Read AI transcript before generating.'); return; }
```

These `alert()`-based guards cannot be automated as-is. Extracting them into a pure
`validateRecapInputs(inputs)` function that returns an error string or `null` would make
them trivially testable without changing any user-visible behaviour.

---

### 7. `handleRoute()` — Hash-based routing

**Location:** `index.html:3826`

Tests (with jsdom or Playwright) should verify:

- Empty hash or no hash → `view-home` visible, all others hidden
- `#utm` → only `view-utm` visible
- `#contract` → only `view-contract` visible
- `#recap` → only `view-recap` visible
- Unknown hash → falls back to home view

---

## Recommended Setup

The project currently has no `package.json`. The lowest-friction path forward:

1. **Add `package.json`** with [Vitest](https://vitest.dev/) — zero-config, fast, works
   with vanilla JS
2. **Extract pure functions** (`sanitize`, `formatRecapDate`, the URL-building core of
   `buildUTM`, recap validation logic) into a `src/utils.js` module that tests can import
3. **Add `api/anthropic.test.js`** using Vitest with `vi.stubGlobal('fetch', ...)` for
   the fetch mock and simple `req`/`res` objects
4. **Add Playwright** for end-to-end tests covering: UTM build → copy flow, and Recap
   generate → copy flow

Steps 2 and 3 are the fastest wins. Pure function tests require no browser environment
and run in milliseconds. They can be added without restructuring the rest of the codebase.
