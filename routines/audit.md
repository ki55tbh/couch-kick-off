# Couch Kick-Off weekly accuracy audit (instructions for the Monday routine)

You are independently auditing Gareth's public website **Couch Kick-Off** (https://couchkickoff.co.uk), a guide to men's football on UK TV. Do not use em dashes in anything you write. Check the current UK date and time first (Europe/London).

The site is `index.html` on branch `main` of this repository; GitHub Pages republishes it about a minute after every push. A separate daily routine (09:39 UK, instructions in `routines/daily.md`) maintains the data; this audit checks its work. Read `routines/daily.md` for the data format (UPDATED, RAW, KIT, AUDITS, channel tokens, Expected "?" tokens). Only edit those data parts; never change layout, scripts, the About section, Report links or the Cloudflare Web Analytics snippet just before `</body>` (`tools/validate.py` fails if it is missing). The older claude.ai artifact pages are retired: ignore them.

Gareth forwards this report to another reviewer who re-checks a sample of the listed matches, so every checked match must be named with its source.

## Step 1: is the daily routine healthy?

Read UPDATED. Flag a problem if status is 'failed', or last_ok is more than 26 hours before now, or the summary looks wrong. Also run `git log -5 --format='%h %ad %s' --date=iso` and flag it if there is no "Daily update" commit in the last 26 hours.

## Step 2: accuracy. Audit every listed game in the next 7 days (today to today+6)

Skip games the website does not show. The page hides women's football: any RAW line whose home team, away team or competition matches the `WOMENS` pattern in `index.html` (e.g. "(W)" teams, WSL, WCL, WLC, Frauen-Bundesliga) is filtered out before display. Do not audit those lines, do not count them in any total, and do not add or fix them in step 3 or 4.

Audit every RAW line in the window whose CHANNELS is a real broadcaster (not NOTV, not TBC, not a placeholder with empty Away), including Expected ("?") lines. Also spot-check NOTV and TBC lines: Saturday 3pm PL games still at 3pm, TBC games not since picked, blackout NOTV lines for LaLiga/Serie A/Bundesliga really not live in the UK. Every line you look at counts as checked.

Give each checked line TWO separate verdicts. Never let one decide the other.

**A) Fixture verdict: date, UK kick-off and the two teams.**
- Official sources only: competition sites (premierleague.com, efl.com, spfl.co.uk, laliga.com, legaseriea.it, bundesliga.com, uefa.com), club sites, or a broadcaster's own schedule.
- CORRECT: an official source matches. INCORRECT: an official source clearly differs. UNVERIFIED: no official source reached, or official sources conflict.

**B) Broadcast verdict: the UK channel(s) as listed, or the "not on UK TV" claim.**
- Official sources only: Sky Sports, TNT Sports, BBC Sport / iPlayer / ALBA, ITV / ITVX, Premier Sports, DAZN, Prime Video, Disney+, or a competition or club announcement naming the UK broadcaster for that match.
- Rights ownership is never proof of an individual broadcast. A blanket statement ("every match live on X") counts only if it is official and clearly covers this match; say so in the evidence line.
- A confirmed line (no "?") is CORRECT only if an official source lists that specific match on that broadcaster. INCORRECT if it is clearly absent from that broadcaster's published schedule or shown on another channel. Otherwise UNVERIFIED.
- An Expected line is CORRECT only when an official source confirms that specific match on that broadcaster; then also promote it in step 4. Rights ownership alone is NOT enough: if the broadcaster holds the competition's rights but nothing official names this match, the broadcast verdict is UNVERIFIED. INCORRECT if an official source shows a different broadcaster or not on UK TV.
- Never two broadcasters on one game unless an official source shows that match on both.

**Aggregators** (FotMob, live-footballontv.com, wheresthematch.com, 101greatgoals, footballwebpages, fantacalcio.it and similar) only help you find things to check. An aggregator alone, or several agreeing, never makes either verdict CORRECT or INCORRECT.

**Prime Video pay-per-view exceptions.** For every checked line listing Prime Video PPV where you could not find an official Prime Video UK offer for that specific match, add it to the PPV exceptions list (date, match, what you searched). These are normally UNVERIFIED broadcasts.

For every checked line record: date, UK time, home v away, competition, what the page said (channels, and whether Expected), fixture verdict, broadcast verdict, and the source (site and URL) for each verdict.

Record all verdicts BEFORE fixing anything.

## Step 3: completeness. Missing televised games in the same 7 days

Go the other way round: take the official UK TV schedules for the window (Sky Sports, TNT Sports, BBC, ITV, Premier Sports, DAZN, Prime Video, Disney+; aggregators only to find candidates). Count as MISSING any live men's game broadcast in the UK that has no RAW line at all, in a covered competition (Premier League, Championship, League One, League Two, EFL Trophy, FA Cup, Carabao Cup, Scottish Premiership and cups, Champions/Europa/Conference League, LaLiga, Serie A, Bundesliga, Nations League, Euro qualifiers, friendlies involving home nations or major nations). A listed placeholder/TBC since confirmed is INCORRECT, not MISSING; a listed Expected game counts as listed.

Note exactly which of those eight broadcasters' schedules you could open. If ANY could not be checked, completeness is PARTIAL: it only describes the schedules you did check, and the report must name the ones you could not.

Record the missing list BEFORE adding anything, then add each confirmed missing game as a new RAW line in date order.

## Step 4: fix confirmed errors only

- Correct each INCORRECT fixture or broadcast from the official source (keep team spellings and formats). Promote Expected lines an official source now confirms. Never change UNVERIFIED items and never remove a "?" without official confirmation. Never guess.
- Update UPDATED.summary to mention the audit (e.g. "Weekly audit: 2 corrections, 1 missing game added, 5 Expected games confirmed"). Leave last_ok and last_attempt alone.
- Append this week's entry to AUDITS, on ONE line, keeping earlier entries exactly as they are:
  `{week:'<Monday YYYY-MM-DD>', method:2, f_checked:N, f_correct:N, f_incorrect:N, f_unverified:N, b_checked:N, b_correct:N, b_incorrect:N, b_unverified:N, missing:N, completeness:'full' or 'partial', fixed:N, expected:N, promoted:N, ppv_exceptions:N}`
  f_ = fixture verdicts, b_ = broadcast verdicts (f_checked and b_checked are both the number of lines checked). Entries without `method:2` used the old single-score method.
- Rebuild the team pages: `node tools/build_pages.mjs`. It regenerates the team folders (e.g. `liverpool/index.html`), `sitemap.xml`, the team links between the TEAMPAGES markers and the "On UK TV today" summary between the TODAYTV markers in `index.html` from RAW. Never edit those by hand.
- Run `python3 tools/validate.py`. It checks index.html AND that every team page and the sitemap exactly match RAW. If it fails, fix the problem, then run `node tools/build_pages.mjs` and `python3 tools/validate.py` once more (one retry only). If it still fails, publish NOTHING: run `git checkout . && git clean -fd` so the last fully validated website stays live, and report the failure clearly with the validator's error. Never publish index.html without matching team pages.
- Confirm `git diff --stat` and `git status --short` only touch index.html, sitemap.xml and team page folders.
- Commit and push: `git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "Weekly audit YYYY-MM-DD: <summary>"` then `git push origin HEAD:main` (if rejected because main moved, `git pull --rebase origin main` once and push again; if refused, e.g. 403, do not retry). Confirm with `git ls-remote origin main`.

## Step 5: report (every Monday, as your final message, plain text Gareth can copy in full)

Definitions (all counts are from BEFORE corrections; every percentage must show its numerator and denominator):
- Fixture verified = f_correct + f_incorrect. Fixture accuracy = f_correct / fixture verified. Fixture coverage = fixture verified / f_checked.
- Broadcast verified = b_correct + b_incorrect. Broadcast accuracy = b_correct / broadcast verified. Broadcast coverage = broadcast verified / b_checked.
- UNVERIFIED items never count as correct and never appear in an accuracy numerator or denominator.
- Completeness = listed televised games / (listed + missing), on the schedules you could check only.

```
Couch Kick-Off weekly accuracy audit (Mon DD Mon to Sun DD Mon)
Method: 2 (separate fixture and broadcast scores)
Games checked: N

FIXTURES (date, kick-off, teams)
Accuracy: NN.N% (C of V verified)
Coverage: NN.N% (V of N checked)
Incorrect before fixing: N, all fixed / N fixed
Unverified: N

BROADCASTS (UK channels)
Accuracy: NN.N% (C of V verified)
Coverage: NN.N% (V of N checked)
Incorrect before fixing: N, all fixed / N fixed
Unverified: N
Expected listings: N (N now confirmed and promoted)
Prime Video PPV exceptions: N

COMPLETENESS
NN.N% (L of L+M televised games listed) on schedules checked: <list>
FULL / PARTIAL: could not check <list>
Missing games found: N, all added / N added

Daily update health: PASS / FAIL: <what>
Website updated by this audit: Yes (commit <hash>) / No: <why>
Team pages: OK (<N> pages, <N> fixture rows, matching the main data) / FAILED, nothing published: <why>
Trend: method 2 weeks from AUDITS, oldest first. List method 1 weeks separately, marked "old method, not directly comparable".
```

If either coverage figure is below 75%, say plainly that that accuracy figure is weak evidence this week.

Then short lines for each error found (say whether it was a fixture or broadcast error), each missing game added, and each unverified item, with sources.

Then a section headed "Prime Video PPV exceptions" listing each one, or "None".

Then a section headed "Every match checked" listing EVERY checked game, one line each, in date order, e.g.:
`Sat 21 Nov 12:30 Chelsea v Arsenal (PL): page TNT Sports 1, HBO Max. Fixture: CORRECT (premierleague.com/...). Broadcast: UNVERIFIED (tntsports.co.uk blocked).`
Include source URLs. Do not shorten this list. End with https://couchkickoff.co.uk.
