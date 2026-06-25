# Watertight Vortex — Claude Code Context

## What this is
The Watertight Vortex is an internal tool hub for Watertight, a boutique wellness influencer agency. It centralizes agency workflows: influencer list management, UTM building, contract generation, client call recaps, and ad performance analysis.

## Repo
- **GitHub:** `ianjwt/watertight-hub`
- **Primary deployment:** Vercel (`watertight-hub.vercel.app`) — auto-deploys on push to main
- **Secondary deployment:** Render (`watertight-hub.onrender.com`) — also auto-deploys on push to main, but Vercel is the canonical URL
- **Custom domain (pending):** `vortex.watertight.co` — CNAME to be added in AWS Route 53 by Ariana

## Architecture
- Single-page HTML app (`index.html`) with a JS router for multi-view navigation
- All tools live in `index.html` except The Shortlist, which is a standalone page at `shortlist.html`
- Serverless functions live in `api/` — Vercel and Render both serve these
- No framework, no build step — plain HTML, CSS, vanilla JS

## Auth
- Browser-side password gate using SHA-256 hash via Web Crypto API
- `login.html` — branded login page, checks password against hash, stores `wt_auth=true` in `sessionStorage`
- `index.html` and `shortlist.html` both check `sessionStorage` on load and redirect to `login.html` if not authenticated
- `api/auth.js` and `api/verify.js` exist in the repo but are not currently used (auth is fully client-side)
- Password hash lives in `login.html` as `CORRECT_HASH`

## Tools live in the Vortex
- **UTM Link Builder** — original tool, fully live
- **Contract Generator** — built for Deliciously Ella; copies rich HTML + plain text to clipboard
- **Recap Generator** — ingests Read AI transcripts, calls Anthropic API via `api/anthropic.js` proxy
- **The Shortlist** — standalone page at `shortlist.html` (see below)
- **Creative Analyst** — Meta Ads audit tool, client-side XLSX parsing via SheetJS
- **TalentTight** — external link card to `cm.watertight.co`

## The Shortlist (`shortlist.html`)
The main influencer directory tool. Key details:
- 2,259 influencers embedded as `INFLUENCERS_DATA` JSON in the file
- Each influencer object: `{ name, handle, url, platform, email, clients[], followers, tier, location, reach_score, eng_score, score_campaigns, tags[], agent_email }`
- 48 influencers have performance scores (reach + engagement) computed from real campaign data, log-normalized 0–100
- Multi-select client pill toggles (Barriere, Deliciously Ella, EVOLV, Sollis, SoWell, ZOE)
- Filters: client, tier, platform, follower count, tags, search
- Circle checkbox selection → "Generate Google Sheet" exports CSV with `=HYPERLINK()` formulas
- "+ Add" modal commits new influencers directly to GitHub via GitHub API (`GITHUB_TOKEN` env var required)
- When updating `INFLUENCERS_DATA` via GitHub API commit, use regex replace on the existing array in the file

## Clients
Barriere, Deliciously Ella, EVOLV, Sollis, SoWell, ZOE

## Creator Tags (10 total)
**Archetype:** Fitness Guru, Medical Legitimacy, Momfluencer, Optimizer, Podcast
**Value Prop:** Connector, High-End UGC, Converter
**Brand:** Multi-Brand Partner, Use Case

## Key colleagues
- **Ariana** — manages DNS/Route 53, primary Contract Generator user
- **Tania** — leads influencer, internal approver
- **Maria** — Contract Generator user
- **Walker** and **Mikayla** — staff with list pull workflows

## Environment variables
Set in both Vercel and Render dashboards:
- `ANTHROPIC_API_KEY` — for Recap Generator proxy
- `GITHUB_TOKEN` — for Shortlist add-influencer GitHub commits (repo scope)
- `SITE_PASSWORD` — shared team password (also hashed in login.html)
- `SESSION_SECRET` — used by api/auth.js (currently unused but set)

## Visual style
- Font: Poppins (Google Fonts)
- Primary green: `#116E53`
- Dark green: `#0d5540`
- Light green: `#e8f4f0`
- Background: `#faf9f7` (cream)
- Border: `#e2e8e5`
- Border radius: 14px
- Shadows: `0 2px 12px rgba(17,110,83,0.08)`

## Key technical patterns
- **Large JSON in HTML:** inject via string replacement of a placeholder token, use `json.dumps(data, separators=(',',':'))` for compact output
- **Tooltip layering:** tooltips inside `overflow:hidden` containers use `position:fixed` with JS-calculated coords via `getBoundingClientRect()`
- **GitHub API commits:** GET file to get SHA → PUT with base64-encoded updated content
- **Auth:** `sessionStorage.getItem('wt_auth') === 'true'` check at top of every protected page
