# Couch Kick-Off weekly accuracy audit (instructions for the Monday routine)

You are independently auditing Gareth's public website **Couch Kick-Off** (https://couchkickoff.co.uk), a guide to men's football on UK TV. Do not use em dashes in anything you write. Check the current UK date and time first (Europe/London).

The site is `index.html` on branch `main` of this repository; GitHub Pages republishes it about a minute after every push. A separate daily routine (09:39 UK, instructions in `routines/daily.md`) maintains the data; this audit checks its work. Read `routines/daily.md` for the data format (UPDATED, RAW, KIT, AUDITS, channel tokens, Expected "?" tokens). Only edit those data parts; never change layout, scripts, the About section, Report links or the Cloudflare Web Analytics snippet just before `</body>` (`tools/validate.py` fails if it is missing). The older claude.ai artifact pages are retired: ignore them.

Gareth forwards this report to another reviewer who re-checks a sample of the listed matches, so every checked match must be named with its source.

## Step 1: is the daily routine healthy?

Read UPDATED. Flag a problem if status is 'failed', or last_ok is more than 26 hours before now, or the summary looks wrong. Also run `git log -5 --format='%h %ad %s' --date=iso` and flag it if there is no "Daily update" commit in the last 26 hours.

## Step 2: accuracy. Audit every listed game in the next 7 days (today to today+6)

For each RAW line in the window whose CHANNELS is a real broadcaster (not NOTV, not TBC, not a placeholder with empty Away), including Expected ("?") lines:
- Verify date, UK kick-off and UK channel(s) against OFFICIAL sources first: Sky Sports, TNT Sports, BBC Sport / iPlayer / ALBA, ITV / ITVX, Premier Sports, DAZN, Prime Video, Disney+, and competition or club sites (premierleague.com, efl.com, spfl.co.uk, laliga.com, legaseriea.it, bundesliga.com, uefa.com, club fixture pages).
- Aggregators (FotMob, live-footballontv.com, wheresthematch.com, 101greatgoals, footballwebpages) only help you find things to check. An aggregator alone, or two agreeing, does NOT count as verification.
- Expected vs confirmed. Rights ownership is never proof of an individual broadcast. Keep fixture accuracy (date and kick-off) separate from broadcast confirmation.
  - A confirmed line (no "?") is CORRECT only if an official source lists that specific match on that broadcaster. If the only support is rights ownership, it is UNABLE TO VERIFY. If it is clearly absent from the broadcaster's published schedule or on another channel, it is INCORRECT.
  - An Expected line is CORRECT if date and kick-off are right and the broadcaster really holds the competition's (or slot's) UK rights. It never counts as a confirmed broadcast. If an official schedule now confirms it, it is still CORRECT and you promote it in step 4 (remove the "?", use the exact channel if listed). If an official source shows a different broadcaster or not on UK TV, it is INCORRECT.
  - Never two broadcasters on one game unless an official source shows that match on both (LaLiga's Saturday night game is Disney+ only).
- Also spot-check NOTV and TBC lines in the window: Saturday 3pm PL games still at 3pm, TBC games not since picked, blackout NOTV lines for LaLiga/Serie A/Bundesliga really not live in the UK (only an official UK source counts). Count any wrong one as INCORRECT and include it in the checked total.
- Buckets: a) CONFIRMED CORRECT, b) INCORRECT (official source clearly contradicts the page), c) UNABLE TO VERIFY (no official source, or sources conflict; never counted as correct).
- For every audited game record: date, UK time, home v away, competition, what the page said (channels, and whether Expected), bucket, source (site and URL).
- Record the buckets BEFORE fixing anything.

## Step 3: completeness. Missing televised games in the same 7 days

Go the other way round: take the official UK TV schedules for the window (Sky Sports, TNT Sports, BBC, ITV, Premier Sports, DAZN, Prime Video, Disney+; aggregators only to find candidates). Count as MISSING any live men's game broadcast in the UK that has no RAW line at all, in a covered competition (Premier League, Championship, League One, League Two, EFL Trophy, FA Cup, Carabao Cup, Scottish Premiership and cups, Champions/Europa/Conference League, LaLiga, Serie A, Bundesliga, Nations League, Euro qualifiers, friendlies involving home nations or major nations). A listed placeholder/TBC since confirmed is INCORRECT, not MISSING; a listed Expected game counts as listed. Record the missing list BEFORE adding anything, then add each confirmed missing game as a new RAW line in date order.

## Step 4: fix confirmed errors only

- Correct each INCORRECT line from the official source (keep team spellings and formats). Promote Expected lines an official source now confirms. Never change UNABLE TO VERIFY lines and never remove a "?" without official confirmation. Never guess.
- Update UPDATED.summary to mention the audit (e.g. "Weekly audit: 2 corrections, 1 missing game added, 5 Expected games confirmed"). Leave last_ok and last_attempt alone.
- Append this week's entry to AUDITS (keep earlier entries): `{week:'<Monday YYYY-MM-DD>', checked:N, correct:N, incorrect:N, unverified:N, missing:N, fixed:N, expected:N, promoted:N, bcast_confirmed:N}` (expected = Expected lines audited; promoted = Expected lines confirmed this week; bcast_confirmed = audited lines whose specific broadcast an official source confirmed).
- Rebuild the team pages: `node tools/build_pages.mjs`. It regenerates the team folders (e.g. `liverpool/index.html`), `sitemap.xml`, the team links between the TEAMPAGES markers and the "On UK TV today" summary between the TODAYTV markers in `index.html` from RAW. Never edit those by hand.
- Run `python3 tools/validate.py`. It checks index.html AND that every team page and the sitemap exactly match RAW. If it fails, fix the problem, then run `node tools/build_pages.mjs` and `python3 tools/validate.py` once more (one retry only). If it still fails, publish NOTHING: run `git checkout . && git clean -fd` so the last fully validated website stays live, and report the failure clearly with the validator's error. Never publish index.html without matching team pages.
- Confirm `git diff --stat` and `git status --short` only touch index.html, sitemap.xml and team page folders.
- Commit and push: `git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "Weekly audit YYYY-MM-DD: <summary>"` then `git push origin HEAD:main` (if rejected because main moved, `git pull --rebase origin main` once and push again; if refused, e.g. 403, do not retry). Confirm with `git ls-remote origin main`.

## Step 5: report (every Monday, as your final message, plain text Gareth can copy in full)

Definitions: verified = correct + incorrect. Accuracy = correct / verified (before corrections). Coverage = verified / checked. Completeness = listed televised games / (listed + missing), before additions. Broadcast confirmation = bcast_confirmed / checked.

```
Couch Kick-Off weekly accuracy audit (Mon DD Mon to Sun DD Mon)
Fixtures checked: N
Confirmed correct: N
Incorrect (found before fixing): N, all fixed / N fixed
Unable to verify: N
Missing televised games found: N, all added / N added
Expected listings checked: N (N now confirmed and promoted)
Accuracy: NN.N% (C of V verified fixtures, before corrections)
Coverage: NN.N% (V of N fixtures independently verified)
Completeness: NN.N% (L of L+M televised games were listed)
Broadcast confirmation: NN.N% (B of N listed broadcasts confirmed by an official source)
Trend: last 4 weeks from AUDITS, oldest first, or "first audit"
Daily update health: OK / PROBLEM: <what>
Website updated by this audit: Yes (commit <hash>) / No: <why>
Team pages: OK (<N> pages, <N> fixture rows, matching the main data) / FAILED, nothing published: <why>
```

Then short lines for each error found, each missing game added and each unverifiable game, with sources. If coverage is below 75%, say plainly that this week's accuracy figure is weak evidence. If you could not check a main broadcaster's schedule for completeness, say which.

Then a section headed "Every match checked" listing EVERY audited game, one line each, in date order, grouped under "Correct", "Incorrect", "Unable to verify", e.g.:
`Sat 21 Nov 12:30 Chelsea v Arsenal (PL): page TNT Sports 1, HBO Max. Source: premierleague.com/news/...`
Include source URLs. Do not shorten this list. End with https://couchkickoff.co.uk.
