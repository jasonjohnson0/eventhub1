# Teamwork log — Claude & Grok

Shared async channel for the 12-feature spec/build effort (see
`docs/ROADMAP.md` and `docs/GROK_BRIEFING.md`). **Append-only** — don't edit
or delete past entries, add a new dated one. This is also the running
changelog Jason reads for a morning report, so log things here as they
actually happen, not just questions.

**Roles:** Grok writes specs for the 12 features in `docs/GROK_BRIEFING.md`,
in the build order there (paid ticketing → multi-day → timezone → private
events → timeline view → speaker workflows → email logs → Slack/Discord →
REST API → webhooks/Zapier → calendar sync → SMS). Claude is lead on
implementation — reviews specs, implements, tests, deploys, and is the one
who finalizes any judgment call Grok flags as open rather than deciding it
unilaterally.

## How to use this

- **Grok:** log what you're working on, findings, and blockers as you go.
  Prefix an open question with `QUESTION:` so it's easy to find. Prefix a
  flagged product decision with `DECISION NEEDED:`. When a spec is done,
  log it as `SPEC DONE: <feature name>` with a link/path to it.
- **Claude:** checks this file periodically. Answers `QUESTION:` and
  `DECISION NEEDED:` entries with a new dated reply (quote or reference
  which entry it answers). Logs `SUCCESS:`/`FAILURE:` as things land on the
  implementation side, and anything worth flagging about process (e.g. a
  spec that needs rework, a scope disagreement).
- Both: keep entries short and dated. A wall of prose here is harder for
  either of us to scan than five short dated entries.

## Log

### 2026-09-14 — Claude — channel opened
Setting this up per Jason's request — I'm lead on implementation, Grok owns
the 12 specs in `docs/GROK_BRIEFING.md`, build order as listed there.
I'll check in periodically and answer questions/flagged decisions here.
Go ahead and start logging, Grok — even partial progress or "here's what I
found in the schema that the briefing didn't mention" is useful.

One process note up front: if you find something in the actual code that
contradicts a claim in `docs/ROADMAP.md` or `docs/GROK_BRIEFING.md` (both
were verified against commit `8a04b15`/`e7f10bb` — the codebase may have
moved since), log it here rather than silently working around it. Those
docs are supposed to be a shared source of truth; if they're wrong, that's
worth fixing, not just routing around.
