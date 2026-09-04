# Pipeline Tracker — v1 Build Spec

## What this is
A new read-only view in the Vortex (`watertight-hub`) called **Pipeline
Tracker**. It shows one row per influencer per client, with their current
stage across the full content lifecycle and a timeline of how they got
there. v1 is scoped to **Evolv only**.

The seven lifecycle stages:
1. Organic content briefed
2. Organic content created
3. Organic content live
4. Edited for paid
5. Shared with client
6. Launched in paid
7. Performing in paid

This is read-only. It reflects state pulled from existing sources — it is
not a new place for the team to update status by hand.

## Prerequisites (Ian completes before build starts)
- [ ] Create a Google Cloud service account, enable the Sheets API for it
- [ ] Share each of the 3 source Google Sheets below with the service
      account's email (viewer access is enough)
- [ ] Add the service account's JSON key to Vercel as an env var
      (e.g. `GOOGLE_SERVICE_ACCOUNT_KEY`, base64- or JSON-encoded — Claude
      Code should pick the cleaner option for Node)
- [ ] Confirm current Vercel Hobby plan cron job count/frequency limits
      before adding a new cron — if constrained, fold this sync into the
      existing daily cron endpoint rather than adding a second one

## Data sources (Evolv only, v1)

| Stage(s) | Source | Type |
|---|---|---|
| 1–3 | *Q3-26 Evolv Pitch Tracker | Google Sheet |
| 4–5 | Edit Tracker | existing GitHub-JSON (no new integration) |
| 6 | *Shared_Evolv Paid Media & Whitelisting → "Influencer Video Ad Tracker" tab | Google Sheet |
| 7 | Evolv Paid Media Results Tracker | Google Sheet |

### Field mapping

**Stages 1–3 — Pitch Tracker**
- Only rows with `Partnership Status = Confirmed` are lifecycle-relevant.
  Contacted / In Talks / Passed / Offer Out rows are outreach pipeline,
  not content lifecycle — exclude them.
- Stage 1 (Briefed): `Brief Sent` column populated
- Stage 2 (Created): `Content in drive` link populated
- Stage 3 (Live): `Posted Content` link populated
- Influencer identity: `Name` column
- Note: this is a quarterly sheet (new spreadsheet each quarter). v1 should
  point at the current quarter's sheet by ID/URL via config, not assume a
  stable name pattern — expect to update this pointer manually each quarter
  until there's a reason to automate it.

**Stages 4–5 — Edit Tracker**
- No new integration — read the existing GitHub-JSON Edit Tracker data,
  matched by influencer name.

**Stage 6 — Whitelisting sheet ("Influencer Video Ad Tracker" tab)**
- Header is NOT flat — it's split into a "METS / TikTok" divider row with
  repeated field names (Whitelist usage?, Live?, Start Date...) under each
  platform block. Parse as two column-groups, not one uniform table.
- Signal for "launched": `Live?` = truthy under either the Meta or TikTok
  block
- Also carries whitelisting window data (start/end dates, Spark Ads Code) —
  not needed for v1's stage tracking, but worth keeping in the raw pull in
  case it's useful for a later usage-rights view

**Stage 7 — Evolv Paid Media Results Tracker**
- Weekly rows: Week Start, Week End, Influencer Orders, Total Orders,
  Influencer % of Orders, Influencer CPA, Overall CPA
- This is account-level, not per-influencer — v1 can only say "content
  from this influencer is live in a period where paid performance data
  exists," not attribute individual performance per influencer. Flag this
  limitation in the UI copy (e.g. a note that per-ad attribution is a
  planned upgrade), not silently.

### Name matching (important)
Influencer names are NOT written consistently across sources (e.g. "Roma
Abdesselam" in one sheet vs. "SAHD / Roma" in another). Build a small
alias/canonical-name table, stored the same way as other Vortex config
(GitHub-JSON), mapping known variants to one canonical name per influencer.
The sync step should check this table before joining records across
sources. Don't assume exact string matches will hold.

## Data model
One JSON record per influencer per client, committed via GitHub Contents
API (same pattern as Edit Tracker):

```json
{
  "influencer": "canonical name",
  "client": "Evolv",
  "currentStage": "launched_in_paid",
  "stages": {
    "briefed": { "reached": true, "date": "2026-06-01" },
    "created": { "reached": true, "date": "2026-06-10" },
    "live_organic": { "reached": true, "date": "2026-06-12" },
    "edited_for_paid": { "reached": true, "date": null },
    "shared_with_client": { "reached": true, "date": null },
    "launched_in_paid": { "reached": true, "date": null },
    "performing_in_paid": { "reached": false, "date": null }
  },
  "sourceLinks": {
    "pitchTrackerRow": "...",
    "whitelistingRow": "..."
  },
  "lastSynced": "2026-09-04T13:00:00Z"
}
```
Adjust field names/structure as makes sense once real data is in hand —
this is a starting shape, not a fixed contract.

## Backend
- New `api/pipeline-sync.js` (or folded into existing cron endpoint per
  the prerequisite above): reads the 3 Google Sheets via the Sheets API,
  reads Edit Tracker's existing JSON, joins on canonical influencer name,
  writes one JSON file per client to the repo via GitHub Contents API
- New `api/pipeline-tracker.js`: serves the current JSON to the frontend
  (same pattern as other tools' read endpoints)

## UI
- New Vortex view, "Pipeline Tracker" in the nav alongside Edit Tracker,
  Shortlist, etc.
- Table: one row per influencer, columns for client, current stage
  (visually — a simple progress indicator across the 7 stages works better
  than a plain text label), last synced time
- Row expand or detail view: timeline showing dates/links for each stage
  reached
- Filter by client (only Evolv selectable for now, but build the filter
  as if more clients are coming)
- No write actions — this view does not let users edit stage data directly

## Out of scope for v1
- SoWell, Aroe — add once Evolv version is validated
- Per-ad/per-influencer paid performance attribution (stage 7 is
  account-level only for now)
- Any write-back to the source Google Sheets
- Slack digest / AI narrative layer on top of this data — that's a
  separate later project, but this tracker is the data source it'll
  eventually read from
