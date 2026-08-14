# Watertight creative edit tracker — spec

## Purpose

Replace the current Google Sheet edit tracker with a lightweight internal app. The sheet works but has three specific failures this app needs to fix:

1. **Briefs go into a black hole.** Once Mikayla briefs an editor, there's no visibility into whether it's been picked up, and no prompt if it stalls.
2. **Status and person are conflated.** Current statuses like "AE to Edit," "MK to Edit," "IB to Edit," and even a bare name ("MARIA") bake a specific person's initials into the status itself. Every editor rotation requires editing the dropdown. This app separates *stage* (status) from *who's responsible* (owner) so the process survives editor turnover.
3. **No aggregate visibility.** The CEO and Ian need a glance-level view of what's in flight and what's stuck, without reading every row.

This is an internal tool. Clients never see it.

## Users and roles

Roles are the system's vocabulary, not people's names — the app should read "Editor" and "Creative Strategist" everywhere, with the actual person shown as whoever currently fills that role. This is the fix for the current sheet's core problem (see Purpose below): statuses like "AE to Edit" and "MK to Edit" bake specific initials into the process itself, so the process breaks every time someone rotates in or out. Titles don't change when people do.

| Role | What they do | Who holds it today |
|---|---|---|
| Creative strategist | Writes briefs, assigns editors, sends to review, sends to client | Mikayla |
| Editor | Executes briefs | Andrew (roster should support additional/rotating editors — see Roster below) |
| Reviewer | Reviews before something goes to client; default reviewer | Ian |
| Reviewer (script) | Reviews script-driven creatives specifically | Ariana |
| Visibility only | Client-centric dashboard view, no required actions | Ian, CEO |

## Data model

### Creative (core record)

| Field | Type | Notes |
|---|---|---|
| `name` | text | Creator/ad name |
| `client` | reference | See Clients below |
| `platform_type` | enum | `video` \| `image` |
| `status` | enum | See Status below |
| `status_updated_at` | timestamp | Auto-set on every status change. Drives staleness. |
| `editor` | reference to roster (role: Editor) | Whoever currently holds the Editor role |
| `reviewer` | reference to roster (role: Reviewer) | Default reviewer unless the creative is script-driven, in which case the script reviewer |
| `briefed_by` | reference to roster (role: Creative strategist) | Auto-stamped when status → Briefed |
| `briefed_at` | timestamp | Auto-stamped when status → Briefed |
| `current_link` | url, nullable | Single field — always the most current deliverable. Mikayla overwrites on re-edit. Manual paste for v1; Drive automation is a future improvement, not v1 scope. |
| `internal_notes` | text | Freeform, carried over from the sheet's Internal Notes column |

### Clients

Structured list, not a free-text field or sheet section. **Cuyama Buckhorn is explicitly excluded from this app** — it's not Watertight work and should not be selectable when creating a creative. Enforce this at the data layer (not just by omission in seed data), so it can't be added back by accident.

### Roster

Simple list of people, each tagged with a role: Editor, Reviewer, or Creative strategist. Andrew is seeded as the (currently) sole Editor. This list is what makes onboarding a new editor "add a row," not "explain the whole system" — and it's what makes the rest of the app (statuses, owner rules, alerts) never need to know a specific person's name.

### Status

Fixed set for v1. Each status has an **owner rule** (who's responsible while a creative sits in that status) and a **staleness threshold** (hours before it's flagged). `null` threshold = never flags.

| Status | Meaning | Owner (role) | Threshold |
|---|---|---|---|
| Needs brief | Raw content in, not yet briefed | Creative strategist | 48h |
| Briefed | Handed to editor, not yet started | Editor | 24h |
| In edit | Editor actively working | Editor | 72h |
| Ready for review | Submitted for review | Reviewer | 24h |
| Ready for client | Reviewed, awaiting send | Creative strategist | 24h |
| Client requested changes | Reopened after client feedback | Editor | 48h |
| Live | Delivered, done | — (no threshold) |
| On hold | Manually paused (e.g. client asked to wait) | — (no threshold) |
| Cancelled | No longer in production | — (no threshold) |

Statuses, owner rules, and thresholds should live as **data, not hardcoded UI strings** — e.g. a config table — so they can be edited later without a code change. A self-service settings screen is explicitly **out of scope for v1** (see below); for now these values ship as seeded config that an engineer (or Claude Code) can edit directly.

### Status transitions

Two mechanisms, both always available:

1. **Guided quick actions** — one-click buttons for the common path:
   - Needs brief → Briefed
   - Briefed → In edit *or* → Ready for review (a briefed item can skip straight to review — e.g. a script or quick asset that doesn't need a formal edit pass)
   - In edit → Ready for review
   - Ready for review → Ready for client
   - Ready for client → Live
   - Client requested changes → In edit (reopens)
2. **Manual override** — a status selector on every creative that can jump to *any* status at any time, including On hold and Cancelled. This is the escape hatch for exceptions the guided flow doesn't anticipate. Every status change, guided or manual, updates `status_updated_at` (and `briefed_at`/`briefed_by` specifically when entering Briefed).

## Staleness and Slack alerts

A scheduled job (e.g. Vercel Cron, running hourly) checks every non-terminal creative:

- If `now - status_updated_at >= threshold[status]`, and it hasn't already been alerted for this specific status period, post to a shared Slack channel (e.g. `#creative-status`) naming the creative, client, current status, hours elapsed, and tagging whoever currently holds the owner role for that status (e.g. the Editor role resolves to Andrew today, but the alert logic only ever knows "Editor").
- Track alert-state per creative (e.g. `last_alerted_status`, `last_alerted_at`) so the same stale item doesn't repost every hour — alert once when it crosses the threshold, and again only if it changes status and re-crosses a (possibly different) threshold, or on a longer repeat interval (e.g. once every 24h while still stale) — pick one and keep it simple for v1.
- On hold and Cancelled never alert.

This requires a persistent data store with that alert-state tracking — not just reading/writing the Google Sheet — so plan for a real database from the start (see Tech notes).

## View

**Client-centric, not a board and not a personal queue.** Home screen lists clients as sections; each section lists its creatives as flat rows. Everyone — Mikayla, Andrew, Ian, the CEO — sees the same view.

### Summary row (top of page)
Three glance metrics: creatives needing attention (stale, any status), count in edit, count ready for client.

### Each creative row shows
- Name, platform icon (video/image)
- Status pill
- Role/owner line — leads with the role, person as detail — e.g. "Briefed → Editor (Andrew)," "In review · Reviewer (Ariana)," "Reviewed by Reviewer (Ian)" — so the app always reads generically even though it's naming who to act
- Time since last status change, with its threshold shown inline (e.g. "updated 61h ago (limit 24h)"), visually flagged (icon + color) when stale
- When stale: a line indicating the Slack alert (channel + who's tagged)
- Current link — icon button if present, "No link yet" if not
- Quick-action button(s) for the guided next step(s)
- Manual status override selector

### Visual direction
Flat, modular rows — no cards-with-shadows, no gradients. A single left-edge color bar per row is the primary status signal; everything else (pill, timestamp) is secondary and quiet. This intentionally avoids a Trello-style board, per the brief: the team doesn't want board complexity, they want a clear, low-effort list they can scan and act on quickly.

## Migration from the current sheet

The current status values conflate stage and person (e.g. "AE to Edit," "MK to Edit," "IB to Edit," "MK to Brief," "Ready for IR," "MARIA"). **Do not attempt an automated 1:1 status mapping** — several of these are ambiguous (e.g. "Edited" and "Revisions" could map to more than one new status depending on context) and one is literally just a person's name with no recoverable stage information.

Recommended approach: build a one-time import script that pulls every row from the sheet and presents each *unique existing status value* to Mikayla once, asking her to map it to a new status + (if relevant) owner. Apply that mapping across all matching rows. This is a single short manual pass, not per-row work.

## Tech notes

- New app in the existing `watertight-hub` repo (Next.js, deployed on Vercel), alongside Deck Builder — inherits existing auth/config patterns rather than starting a separate project.
- Data store: Postgres (e.g. Supabase) rather than reading/writing the Google Sheet directly — needed for alert-state tracking and structured roster/config data. The sheet can be the one-time import source, not the ongoing source of truth.
- Slack: incoming webhook for the staleness alerts; scoped to a single shared channel for v1.
- Vercel Cron for the hourly staleness check.

## Explicitly out of scope for v1

- Self-service settings UI for editing statuses/thresholds/roster (ships as seeded config instead)
- Google Drive folder structure / auto-synced current-link (Mikayla pastes manually for now)
- Any client-facing view
- Per-status alert channel/audience customization (single shared channel, fixed audience rule, for now)
