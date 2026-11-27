// Builds static team pages (e.g. /liverpool/) from the fixture data in index.html.
// Run: node tools/build_pages.mjs           (from the repo root) to write the pages
//      node tools/build_pages.mjs --check   to verify the files on disk match what would be built (used by validate.py)
// The pages are plain HTML so search engines can read them. Never edit them by hand.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Team pages are made for every club in these leagues (taken from the fixture data, so promotions are automatic)
const LEAGUES = ['Premier League', 'Championship', 'League One', 'League Two', 'Scottish Premiership', 'Scottish Championship', 'Scottish League One', 'Scottish League Two'];
// Scottish clubs are listed by hand because most lower-league games are never televised, so many clubs never appear in the data.
// Update these lists each summer after promotions and relegations (2026/27 season). English clubs come from the data automatically.
const SCOTTISH = {
  'Scottish Premiership': ['Aberdeen', 'Celtic', 'Dundee', 'Dundee United', 'Falkirk', 'Hearts', 'Hibernian', 'Kilmarnock', 'Motherwell', 'Rangers', 'St Johnstone', 'St Mirren'],
  'Scottish Championship': ['Arbroath', 'Ayr United', 'Dunfermline Athletic', 'Greenock Morton', 'Inverness CT', 'Livingston', 'Partick Thistle', "Queen's Park", 'Raith Rovers', 'Stenhousemuir'],
  'Scottish League One': ['Airdrieonians', 'Alloa Athletic', 'Cove Rangers', 'East Fife', 'East Kilbride', 'Hamilton Academical', 'Montrose', 'Peterhead', 'Queen of the South', 'Ross County'],
  'Scottish League Two': ['Annan Athletic', 'Clyde', 'Dumbarton', 'Edinburgh City', 'Elgin City', 'Forfar Athletic', 'Kelty Hearts', 'Stirling Albion', 'Stranraer', 'The Spartans'],
};

const SITE = 'https://couchkickoff.co.uk';
const CHECK = process.argv.includes('--check');
const problems = [];
// Every output goes through out(): written normally, or compared with the file on disk in --check mode
const ROUND_RX = /^(First|Second|Third|Fourth|Fifth|Sixth) round( replays?)?$|^(Quarter|Semi)-finals?( (first|second) legs?)?$|^Final$|^Play-off (semi-)?finals?$|^Round of (16|32)$|^Group stage$|^League phase$/i;
const isRound = n => !!n && ROUND_RX.test(n.trim());
function out(path, content) {
  if (!CHECK) { fs.writeFileSync(path, content); return; }
  let disk = null; try { disk = fs.readFileSync(path); } catch { }
  if (disk === null) problems.push(`${path} is missing`);
  else if (!disk.equals(Buffer.from(content))) problems.push(`${path} is out of date`);
}
let src = fs.readFileSync('index.html', 'utf8');

// ---- Reuse the site's own data, parsing and badge colours ----
const cut = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); if (i < 0 || j < 0) throw new Error('Marker not found: ' + from); return src.slice(i, j); };
const code = cut('const CH = {', 'const ALLTEAMS') + cut('const BRAND=[', 'function cls(') + cut('const CH_URL=', '// Match venues');
const { data, UPDATED, expStyle, brandStyle, chURL } = new Function(code + '; return {data, UPDATED, expStyle, brandStyle, chURL};')();
// ---- "What changed in this morning's update" (shown behind the (i) next to "TV picks updated") ----
// Worked out from the data, not written by hand: when the daily update sets a new UPDATED.last_ok, compare its
// fixture list with the last committed one (HEAD). Otherwise keep the summary already committed, so ordinary
// design publishes never change it.
function dataFrom(html) {
  const c = (from, to) => { const i = html.indexOf(from), j = html.indexOf(to, i); if (i < 0 || j < 0) return null; return html.slice(i, j); };
  const a = c('const CH = {', 'const ALLTEAMS'); if (!a) return null;
  try { return new Function(a + '; return {data, UPDATED};')(); } catch { return null; }
}
function diffData(oldD, newD, today) {
  const NOTTV = new Set(['TV pick TBC', 'Not on UK TV']);
  const tv = m => m.ch.filter(c => !NOTTV.has(c));
  const live = m => m.d !== 'TBC' && m.d >= today;
  const pool = new Map(); for (const m of oldD) { const k = m.h + '|' + m.a + '|' + m.c; if (!pool.has(k)) pool.set(k, []); pool.get(k).push(m); }
  const take = m => { const l = pool.get(m.h + '|' + m.a + '|' + m.c); if (!l || !l.length) return null; let i = l.findIndex(o => o.d === m.d); if (i < 0) i = 0; return l.splice(i, 1)[0]; };
  const cnt = { added: 0, confirmed: 0, exact: 0, channels: 0, times: 0, moved: 0, notv: 0 }, items = [];
  const nice = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0];
  for (const m of newD) {
    if (!m.a) continue;
    const o = take(m); if (!live(m)) continue;
    const nt = tv(m), game = `${m.h} v ${m.a}`;
    if (!o) { if (nt.length) { cnt.added++; items.push([1, m, game, `added, on ${nice(nt)}`]); } continue; }
    const ot = tv(o);
    if (!ot.length && nt.length) { cnt.added++; items.push([1, m, game, `picked for TV, on ${nice(nt)}`]); }
    else if (ot.length && !nt.length && m.ch.includes('Not on UK TV')) { cnt.notv++; items.push([2, m, game, 'now not on UK TV']); }
    else if (nt.length) {
      const conf = nt.filter(c => o.exp.includes(c) && !m.exp.includes(c) && ot.includes(c));
      const add = nt.filter(c => !ot.includes(c)), gone = ot.filter(c => !nt.includes(c));
      if (conf.length) { cnt.confirmed++; items.push([3, m, game, `confirmed on ${nice(conf)}`]); }
      // A general label (e.g. "TNT Sports") swapped for the actual channel is "exact channel", not an extra broadcaster
      if (add.length && gone.length) { cnt.exact++; items.push([4, m, game, `exact channel: ${nice(add)}`]); }
      else if (add.length) { cnt.channels++; items.push([4, m, game, `now also on ${nice(add)}`]); }
    }
    if (o.t === 'TBC' && m.t !== 'TBC') { cnt.times++; items.push([6, m, game, `kick-off set for ${m.t}`]); }
    else if (o.d !== m.d || o.t !== m.t) { cnt.moved++; items.push([5, m, game, `moved to ${new Date(m.d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}${m.t !== 'TBC' ? ' ' + m.t : ''}`]); }
  }
  items.sort((x, y) => x[0] - y[0] || (x[1].d + x[1].t).localeCompare(y[1].d + y[1].t));
  // First 6: a mix (up to 2 of each kind, most important first). Then the rest, so "+ N more" can show them all (80 at most)
  const first = []; for (const k of [1, 2, 3, 4, 5, 6]) first.push(...items.filter(x => x[0] === k).slice(0, 2));
  const head6 = first.slice(0, 6), rest = items.filter(x => !head6.includes(x));
  const all = [...head6, ...rest], kept = all.slice(0, 80);
  return { n: cnt, l: kept.map(x => [x[2], x[3]]), more: all.length - kept.length };
}
{
  let head = null; try { head = (await import('node:child_process')).execSync('git show HEAD:index.html', { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
  const old = head && dataFrom(head);
  // Keep the summary already in the page (or, if it's been dropped, the committed one)
  let changes = UPDATED.changes || (old && old.UPDATED && old.UPDATED.last_ok === UPDATED.last_ok && old.UPDATED.changes) || null;
  if (old && UPDATED.status === 'ok' && UPDATED.last_ok && UPDATED.last_ok !== old.UPDATED.last_ok) {
    const today = UPDATED.last_ok.slice(0, 10);
    changes = { d: today, ...diffData(old.data, data, today) };
  }
  const line = src.match(/const UPDATED = (\{.*?\});\n/s);
  if (line && changes) {
    const u = new Function('return ' + line[1])(); u.changes = changes;
    const ser = '{' + Object.entries(u).map(([k, v]) => k + ':' + (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v))).join(', ') + '}';
    src = src.replace(line[0], `const UPDATED = ${ser};\n`);
    UPDATED.changes = changes;
  }
}
// Neutral or moved venues (e.g. a cup final at Hampden): show the venue instead of Home/Away on team pages
const VENUES = (() => { const m = src.match(/const VENUES = (\{[\s\S]*?\n\});/); return m ? new Function('return ' + m[1])() : {}; })();
const ext = c => chURL(c) ? '<span class="ext" aria-hidden="true">↗</span>' : '';
const bWrap = (c, inner) => { const u = chURL(c); return u ? `<a class="bl" href="${u}" target="_blank" rel="noopener" title="Open ${esc(c)} in a new tab">${inner}</a>` : inner; };
const slugify = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const LEAGUE_OF = {};
for (const lg of LEAGUES) for (const m of data) if (m.c === lg && m.a) for (const t of [m.h, m.a]) LEAGUE_OF[t] ??= lg;
for (const [lg, clubs] of Object.entries(SCOTTISH)) for (const t of clubs) LEAGUE_OF[t] = lg;
const TEAMS = Object.keys(LEAGUE_OF).sort((a, b) => a.localeCompare(b)).map(t => [t, slugify(t)]);
const SLUG_OF = Object.fromEntries(TEAMS);
const style = cut('<style>', '</style>') + '</style>';
const FREE = /BBC|ITV|STV|S4C|YouTube|England App|Channel 4|Channel 5/;
const COMPS = ['Premier League', 'Champions League', 'Europa League', 'Conference League', 'Championship', 'League One', 'League Two',
  'Scottish Premiership', 'Carabao Cup', 'LaLiga', 'Serie A', 'Bundesliga'];
const compSlug = c => slugify(c) + '-on-tv';
// Internal links: a team name links to its team page, a competition name to its competition page (when one exists)
// Team colours, the same as the home page (KIT, kit, lum and teamColour taken from index.html)
const { teamColour: tColour, lum: tLum } = new Function(cut('const KIT=', 'const SHORTN') + '; return {teamColour, lum};')();
const tStyle = t => { const c = tColour(t); return c && tLum(c) < .9 ? ` style="color:${c}"` : ''; };
const teamLink = t => SLUG_OF[t] ? `<a class="tl" href="/${SLUG_OF[t]}/"${tStyle(t)}>${esc(t)}</a>` : `<span${tStyle(t)}>${esc(t)}</span>`;
const teamPlain = t => `<span${tStyle(t)}>${esc(t)}</span>`;
const compLink = c => COMPS.includes(c) ? `<a class="tl" href="/${compSlug(c)}/">${esc(c)}</a>` : esc(c);
// Fuller names on fixture cards only (same list as CARD_COMP in index.html)
const CARD_COMP = {'Champions League':'UEFA Champions League','Europa League':'UEFA Europa League','Conference League':'UEFA Conference League','Championship':'EFL Championship','League One':'EFL League One','League Two':'EFL League Two'};
const cardCompLink = c => COMPS.includes(c) ? `<a class="tl" href="/${compSlug(c)}/">${esc(CARD_COMP[c] || c)}</a>` : esc(CARD_COMP[c] || c);
const WEEKEND = 'football-on-tv-this-weekend';
const navLinks = () => `<p class="tfoot"><b>More:</b> <a href="/${WEEKEND}/">This weekend</a> · ` + COMPS.map(c => `<a href="/${compSlug(c)}/">${esc(c)}</a>`).join(' · ') + '</p>';

// Logo as a shared file rather than base64 in every page
const logoB64 = /<img class="logo" src="data:image\/webp;base64,([^"]+)"/.exec(src)[1];
out('logo.webp', Buffer.from(logoB64, 'base64'));

// ---- Helpers ----
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ukToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
function ukOffset(d, t) { // "+00:00" or "+01:00" for a UK local date/time
  const guess = new Date(`${d}T${t}:00Z`);
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(guess);
  return ((+h - guess.getUTCHours() + 24) % 24) === 1 ? '+01:00' : '+00:00';
}
const swrap = t => esc(t).replace(/^(Sky )?Sports (?=\S)/, '$1<span class="sw">Sports </span>');
const badges = m => m.ch.map(c => (c === 'Not on UK TV' || c === 'TV pick TBC') ? `<span class="b ${c === 'Not on UK TV' ? 'notv' : 'tbc'}">${esc(c)}</span>` :
  (/^Sky (Sports|Mix)/.test(c) ? bWrap(c, `<span class="b skyb"><span class="s1">${esc(c.split(' ')[0])}</span><span class="s2">${swrap(c.split(' ').slice(1).join(' '))}${ext(c)}</span></span>`) :
  (m.exp.includes(c) ? bWrap(c, `<span class="b exp" style="${expStyle(c)}" title="${esc(c)} holds the rights but hasn't confirmed this match yet">${swrap(c)}${ext(c)}</span>`) + '<span class="exptag">Expected</span>' :
  bWrap(c, `<span class="b" style="${brandStyle(c)}">${swrap(c)}${ext(c)}</span>`)))).join('') + (m.ch.some(c => FREE.test(c)) ? '<span class="freetag">FREE</span>' : '');
const isTV = m => !m.ch.includes('Not on UK TV') && !m.ch.includes('TV pick TBC');
const chanText = (m, all) => { const c = m.ch.filter(x => x !== 'NOW' && x !== 'HBO Max'); const l = c.length ? c : m.ch; return all ? l.join(', ') : l[0]; };

function card(m, team) {
  const notv = m.ch.includes('Not on UK TV'), pending = m.ch.includes('TV pick TBC');
  const opp = m.h === team ? m.a : m.h, ha = m.h === team ? 'H' : 'A';
  const ko = m.t === 'TBC' ? '' : ` data-ko="${m.d}T${m.t}:00${ukOffset(m.d, m.t)}"`;
  return `<div class="m${pending ? ' tbcm' : ''}${notv ? ' notvm' : ''}"${ko}><div class="ko"><span class="dt">${m.d === 'TBC' ? 'TBC' : longDate(m.d).replace(/^(\S+) /, '<span>$1</span> ')}</span>${m.t}${m.t === 'TBC' ? '' : '<small>UK</small>'}</div><div>
    <div class="teams">${m.h === team ? teamPlain(m.h) : teamLink(m.h)} <span class="vaw"><span class="v">v</span>${m.a === team ? teamPlain(m.a) : teamLink(m.a)}</span></div>
    <div class="comp">${cardCompLink(m.c)}${isRound(m.n) ? ` · ${esc(m.n)}` : ''} · ${VENUES[`${m.d}|${m.h}|${m.a}`] ? esc(VENUES[`${m.d}|${m.h}|${m.a}`]) : (ha === 'H' ? 'Home' : 'Away')}${notv ? `<span class="notvtag"> · ${m.c === 'Premier League' ? '3pm, not on UK TV' : 'Not on UK TV'}</span>` : ''}</div>${notv ? '' : `<div class="ch">${badges(m)}</div>`}
    ${m.n && !notv && !isRound(m.n) ? `<div class="note">${esc(m.n)}</div>` : ''}</div></div>`;
}

// Breadcrumb markup only. Match-level Event markup was removed because Google requires a venue for every event,
// which this data doesn't hold, so it flagged every match as invalid.
function jsonLd(team, slug) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Couch Kick-Off', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: `${team} on TV`, item: `${SITE}/${slug}/` } ] }).replace(/</g, '\\u003c');
}

// Where-to-watch notes for clubs with no televised games listed (Scottish leagues only for now).
// Checked 22 Nov 2026 (SPFL 2026/27 fixtures Q&A: BBC Scotland Championship on Fridays, BBC ALBA up to 12 League 1 games; SPFL Player UK and Ireland). Re-check each summer with the SCOTTISH lists.
const SPFLP = 'Selected matches may also be available on SPFL Player on eligible dates (pay-per-view, UK and Ireland only).';
const CUP = 'Selected Scottish Cup ties are on Premier Sports or BBC Scotland.';
const WHERE = {
  'Scottish Premiership': `Sky Sports and Premier Sports show selected Scottish Premiership games live. ${CUP}`,
  'Scottish Championship': `BBC Scotland shows selected Scottish Championship games live, mostly on Friday nights. ${SPFLP} ${CUP}`,
  'Scottish League One': `BBC ALBA shows up to 12 Scottish League One games live a season. ${SPFLP} ${CUP}`,
  'Scottish League Two': `Scottish League Two games are rarely on TV. ${SPFLP} ${CUP}`,
};
function whereBox(team) {
  const lg = LEAGUE_OF[team], w = WHERE[lg];
  if (!w) return '';
  const others = (SCOTTISH[lg] || []).filter(t => t !== team && SLUG_OF[t]).map(t => `<a href="/${SLUG_OF[t]}/">${esc(t)}</a>`).join(' · ');
  return `<div class="nextbox wherebox"><b>Where to watch</b>${esc(w)}</div>` +
    (others ? `<p class="tfoot otherclubs"><b>Other ${esc(lg)} clubs:</b> ${others}</p>` : '');
}

function page(team, slug) {
  const list = data.filter(m => (m.h === team || m.a === team) && m.d !== 'TBC' && m.d >= ukToday);
  const next = list.find(isTV);
  const opp = m => m.h === team ? `${m.a} (H)` : `${m.h} (A)`;
  const upd = UPDATED.last_ok ? new Date(UPDATED.last_ok + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const title = `${team} on TV: next match, channels and kick-off times | Couch Kick-Off`;
  const desc = !list.length ? `When is ${team} on TV? UK TV channels and kick-off times for ${team}, checked daily.` : next ? `When is ${team} on TV? Next: ${opp(next)}, ${longDate(next.d)}${next.t === 'TBC' ? '' : ' ' + next.t} on ${chanText(next)}. Every upcoming ${team} game with UK channels, checked daily.`
    : `Every upcoming ${team} game with UK TV channels and kick-off times, checked daily.`;
  let months = '', cur = '';
  for (const m of list) {
    const mn = monthName(m.d);
    if (mn !== cur) { if (cur) months += '</section>'; months += `<section class="day"><div class="dayhead"><h2>${mn}</h2></div>`; cur = mn; }
    months += card(m, team);
  }
  if (cur) months += '</section>';
  const tvCount = list.filter(isTV).length;

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/${slug}/">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#f3f6f1">
<link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Couch Kick-Off">
<meta property="og:title" content="${esc(team)} on TV | Couch Kick-Off">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/${slug}/">
<meta property="og:image" content="${SITE}/og-image-v2.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd(team, slug)}</script>
${style}
<style>
.tp{max-width:720px;margin:0 auto;padding:0 14px 40px}
.tlogo{display:block;max-width:300px;margin:12px auto 4px}.tlogo img{width:100%;height:auto;display:block}
.crumb{font-size:12.5px;color:var(--muted);margin:10px 2px 6px}.crumb a{color:var(--green);font-weight:700;text-decoration:none}
.th1{font-family:Outfit,'Outfit FbR','Outfit FbA',Inter,'Inter FbR','Inter FbA',sans-serif;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.015em;margin:4px 2px 8px}
.lead{margin:0 2px 14px;color:var(--text)}.lead small{display:block;color:var(--muted);margin-top:4px}
.nextbox{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--green);border-radius:12px;padding:12px 14px;margin:0 0 6px;font-weight:600}
.nextbox b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin-bottom:3px}
.wherebox{border-left-color:var(--line);font-weight:400}.wherebox b{color:var(--muted)}.otherclubs{margin-top:14px}
.tfoot{margin:26px 2px 0;font-size:13.5px;color:var(--muted)}.tfoot a{color:var(--green);font-weight:700}
.tl{color:inherit;text-decoration:underline;text-decoration-color:rgba(20,40,30,.22);text-decoration-thickness:1px;text-underline-offset:3px}.tl:hover,.tl:focus-visible{text-decoration-color:currentColor}
.calwrap{position:relative;margin:-4px 2px 16px}.calbtn-h{display:inline-flex;align-items:center;gap:4px;border:0;background:none;padding:2px 0;font:700 14px/1.2 Inter,'Inter FbR','Inter FbA',sans-serif;color:var(--green-d,#15803d);cursor:pointer;text-align:left}.calbtn-h svg{display:block;flex:none;transform:translateY(-1.5px)}.calbtn-h:hover{text-decoration:underline;text-underline-offset:3px}.calmenu{position:absolute;left:0;top:100%;margin-top:6px;z-index:5;width:min(300px,100%);background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:10px 12px}.calmenu a{display:inline-block;margin:0 6px 6px 0;font:700 12.5px Inter,'Inter FbR','Inter FbA',sans-serif;color:var(--text);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 10px}.calmenu small{display:block;margin-top:4px;color:var(--muted);font-size:11.5px;line-height:1.4}
.cta{display:block;text-align:center;background:var(--green);color:#fff!important;text-decoration:none;border-radius:12px;padding:12px;margin:20px 0 0;font-weight:700}
</style>
</head>
<body>
<div class="tp">
<a class="tlogo" href="/" aria-label="Couch Kick-Off home"><img src="/logo.webp" width="1100" height="355" alt="Couch Kick-Off"></a>
<nav class="crumb"><a href="/">Couch Kick-Off</a> › ${esc(team)}</nav>
<h1 class="th1">${esc(team)} on TV</h1>
<p class="lead">${LEAGUE_OF[team] === 'Premier League'
  ? `Every upcoming ${esc(team)} match, with the UK TV channel and kick-off time. ${tvCount} of the ${list.length} games listed are already confirmed or expected on TV.`
  : list.length ? `Upcoming ${esc(team)} matches confirmed or expected on UK TV, with channels and kick-off times. More games are added as broadcasters announce their picks.`
  : `No ${esc(team)} games are listed for UK TV right now. We add televised games as soon as they're announced.`}<small>Checked every morning. Last updated ${esc(upd)}.</small></p>
${next ? '' : whereBox(team)}
<div class="calwrap"><button type="button" class="calbtn-h" id="calOpen" aria-expanded="false" data-sl="${slug}" data-t="${esc(team)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>Add ${esc(team)} games to your calendar</button><div class="calmenu" id="calMenu" hidden></div></div>
${months}
<a class="cta" href="/">See all football on UK TV today</a>
${navLinks()}
<p class="tfoot">A solid badge means the broadcaster has confirmed the match. An outlined badge marked Expected means it holds the rights but hasn't confirmed this game yet. Saturday 3pm games generally aren't shown live in the UK, except on a few dates each season. Spotted a mistake? Email <a href="mailto:hello@couchkickoff.co.uk">hello@couchkickoff.co.uk</a>.<br><br>Couch Kick-Off is independent and not connected to ${esc(team)}, any league or any broadcaster. <a href="/#about">About</a><br><br>© 2026 Couch Kick-Off. All rights reserved.</p>
</div>
<script>(function(){var n=Date.now();document.querySelectorAll('.m[data-ko]').forEach(function(e){if(Date.parse(e.dataset.ko)+150*60000<n)e.remove()});document.querySelectorAll('section.day').forEach(function(s){if(!s.querySelector('.m'))s.remove()})})();</script>
<script>(function(){var b=document.getElementById('calOpen'),m=document.getElementById('calMenu');if(!b)return;var u=navigator.userAgent,dev=/iPad|iPhone|iPod/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1)?'apple':/Android/i.test(u)?'google':'';if(/Android/i.test(u)){b.parentNode.hidden=true;return}var sl=b.dataset.sl,t=b.dataset.t,web='webcal://couchkickoff.co.uk/'+sl+'/calendar.ics',L={apple:web,google:'https://calendar.google.com/calendar/render?cid='+encodeURIComponent(web),outlook:'https://outlook.live.com/calendar/0/addfromweb?url='+encodeURIComponent('https://couchkickoff.co.uk/'+sl+'/calendar.ics')+'&name='+encodeURIComponent(t+' on TV')};
b.addEventListener('click',function(e){e.stopPropagation();if(dev==='apple'){location.href=L.apple;return}if(dev==='google'){window.open(L.google,'_blank','noopener');return}if(m.hidden){m.innerHTML='<a href="'+L.apple+'">Apple</a><a href="'+L.google+'" target="_blank" rel="noopener">Google</a><a href="'+L.outlook.replace(/&/g,'&amp;')+'" target="_blank" rel="noopener">Outlook</a><small>Every TV game, with a reminder an hour before. Updates itself as new games are picked. In Google Calendar, turn on notifications for it to get reminders.</small>'}m.hidden=!m.hidden;b.setAttribute('aria-expanded',String(!m.hidden))});document.addEventListener('click',function(e){if(!m.hidden&&!m.contains(e.target)){m.hidden=true;b.setAttribute('aria-expanded','false')}})})();</script>
<!-- Cloudflare Web Analytics -->
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "1c6cd6949d724fe697ffd4b014f24d91"}'></script>
<!-- End Cloudflare Web Analytics -->
<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))</script>
</body>
</html>
`;
}

const urls = [`${SITE}/`];
let rows = 0;
for (const [team, slug] of TEAMS) {
  const html = page(team, slug);
  rows += (html.match(/<div class="m[ "]/g) || []).length;
  if (!/<h1 class="th1">/.test(html) || !html.includes('1c6cd6949d724fe697ffd4b014f24d91')) problems.push(`${slug}/index.html is missing its heading or analytics snippet`);
  if (!CHECK) fs.mkdirSync(slug, { recursive: true });
  out(`${slug}/index.html`, html);
  urls.push(`${SITE}/${slug}/`);
}
// ---- Competition pages and the weekend page (e.g. /premier-league-on-tv/, /football-on-tv-this-weekend/) ----
const isWomen = m => /WSL|Women/.test(m.c) || /\(W\)/.test(m.h + ' ' + m.a);
const byTime = (x, y) => (x.d + (x.t === 'TBC' ? '99' : x.t)).localeCompare(y.d + (y.t === 'TBC' ? '99' : y.t));
const dayName = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const HORIZON = addDays(ukToday, 56);
function card2(m, showComp) {
  const ko = m.t === 'TBC' ? '' : ` data-ko="${m.d}T${m.t}:00${ukOffset(m.d, m.t)}"`;
  return `<div class="m"${ko}><div class="ko">${m.t}${m.t === 'TBC' ? '' : '<small>UK</small>'}</div><div>
    <div class="teams">${teamLink(m.h)} <span class="vaw"><span class="v">v</span>${teamLink(m.a)}</span></div>
    ${showComp ? `<div class="comp">${cardCompLink(m.c)}${isRound(m.n) ? ` · ${esc(m.n)}` : ''}</div>` : ''}<div class="ch">${badges(m)}</div>
    ${m.n && !isRound(m.n) ? `<div class="note">${esc(m.n)}</div>` : (m.n && !showComp ? `<div class="note">${esc(m.n)}</div>` : '')}</div></div>`;
}
function listPage({ slug, title, h1, desc, lead, crumb, list, showComp }) {
  const upd = UPDATED.last_ok ? new Date(UPDATED.last_ok + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  let days = '', cur = '';
  for (const m of list) {
    if (m.d !== cur) { if (cur) days += '</section>'; days += `<section class="day"><div class="dayhead"><h2>${esc(dayName(m.d))}</h2></div>`; cur = m.d; }
    days += card2(m, showComp);
  }
  if (cur) days += '</section>';
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Couch Kick-Off', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: crumb, item: `${SITE}/${slug}/` } ] }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/${slug}/">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#f3f6f1">
<link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Couch Kick-Off">
<meta property="og:title" content="${esc(h1)} | Couch Kick-Off">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/${slug}/">
<meta property="og:image" content="${SITE}/og-image-v2.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script>
${style}
<style>
.tp{max-width:720px;margin:0 auto;padding:0 14px 40px}
.tlogo{display:block;max-width:300px;margin:12px auto 4px}.tlogo img{width:100%;height:auto;display:block}
.crumb{font-size:12.5px;color:var(--muted);margin:10px 2px 6px}.crumb a{color:var(--green);font-weight:700;text-decoration:none}
.th1{font-family:Outfit,'Outfit FbR','Outfit FbA',Inter,'Inter FbR','Inter FbA',sans-serif;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.015em;margin:4px 2px 8px}
.lead{margin:0 2px 14px;color:var(--text)}.lead small{display:block;color:var(--muted);margin-top:4px}
.empty{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;margin:6px 0}
.tfoot{margin:26px 2px 0;font-size:13.5px;color:var(--muted)}.tfoot a{color:var(--green);font-weight:700}
.tl{color:inherit;text-decoration:underline;text-decoration-color:rgba(20,40,30,.22);text-decoration-thickness:1px;text-underline-offset:3px}.tl:hover,.tl:focus-visible{text-decoration-color:currentColor}
.cta{display:block;text-align:center;background:var(--green);color:#fff!important;text-decoration:none;border-radius:12px;padding:12px;margin:20px 0 0;font-weight:700}
</style>
</head>
<body>
<div class="tp">
<a class="tlogo" href="/" aria-label="Couch Kick-Off home"><img src="/logo.webp" width="1100" height="355" alt="Couch Kick-Off"></a>
<nav class="crumb"><a href="/">Couch Kick-Off</a> › ${esc(crumb)}</nav>
<h1 class="th1">${esc(h1)}</h1>
<p class="lead">${lead}<small>Checked every morning. Last updated ${esc(upd)}.</small></p>
${days || '<p class="empty">No televised games are listed right now. Broadcasters announce their picks a few weeks ahead, so check back soon.</p>'}
<a class="cta" href="/">See all football on UK TV today</a>
${navLinks()}
<p class="tfoot">A solid badge means the broadcaster has confirmed the match. An outlined badge marked Expected means it holds the rights but hasn't confirmed this game yet. Spotted a mistake? Email <a href="mailto:hello@couchkickoff.co.uk">hello@couchkickoff.co.uk</a>.<br><br>Couch Kick-Off is independent and not connected to any league, club or broadcaster. <a href="/#about">About</a><br><br>© 2026 Couch Kick-Off. All rights reserved.</p>
</div>
<script>(function(){var n=Date.now();document.querySelectorAll('.m[data-ko]').forEach(function(e){if(Date.parse(e.dataset.ko)+150*60000<n)e.remove()});document.querySelectorAll('section.day').forEach(function(s){if(!s.querySelector('.m'))s.remove()})})();</script>
<!-- Cloudflare Web Analytics -->
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "1c6cd6949d724fe697ffd4b014f24d91"}'></script>
<!-- End Cloudflare Web Analytics -->
<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))</script>
</body>
</html>
`;
}
const extraPages = [];
for (const c of COMPS) {
  const list = data.filter(m => m.c === c && m.a && m.d !== 'TBC' && m.d >= ukToday && m.d <= HORIZON && isTV(m) && !isWomen(m)).sort(byTime);
  const nx = list[0];
  extraPages.push({ slug: compSlug(c), crumb: `${c} on TV`, h1: `${c} on TV`, list, showComp: false,
    title: `${c} on TV: fixtures, UK channels and kick-off times | Couch Kick-Off`,
    desc: nx ? `Which ${c} games are on TV? Next: ${nx.h} v ${nx.a}, ${longDate(nx.d)}${nx.t === 'TBC' ? '' : ' ' + nx.t} on ${chanText(nx)}. Every televised ${c} game with UK channels, checked daily.`
      : `Which ${c} games are on UK TV? Channels and kick-off times, checked daily.`,
    lead: `Every ${esc(c)} game on UK TV over the next eight weeks, with the channel and kick-off time. ${list.length} televised ${list.length === 1 ? 'game' : 'games'} listed.` });
}
{
  const dow = new Date(ukToday + 'T12:00:00Z').getUTCDay();
  const toFri = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
  const wk = [0, 1, 2].map(i => addDays(ukToday, toFri + i)).filter(d => d >= ukToday);
  const list = data.filter(m => wk.includes(m.d) && m.a && isTV(m) && !isWomen(m)).sort(byTime);
  const fri = addDays(ukToday, toFri), sun = addDays(fri, 2);
  const dm = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const range = fri.slice(0, 7) === sun.slice(0, 7) ? `${dm(fri)} to ${longDate(sun)}` : `${longDate(fri)} to ${longDate(sun)}`;
  const partial = wk.length < 3;
  extraPages.push({ slug: WEEKEND, crumb: 'This weekend', h1: 'Football on TV this weekend', list, showComp: true,
    title: 'Football on TV this weekend: every UK channel and kick-off time | Couch Kick-Off',
    desc: `Every football match on UK TV this weekend (${range}): Premier League, EFL, Scottish, European and more, with channels and kick-off times. Checked daily.`,
    lead: partial ? `Every televised game still to come this weekend (${esc(range)}), with the UK channel and kick-off time. ${list.length} ${list.length === 1 ? 'game' : 'games'} on TV.`
      : `Every televised game from ${esc(range)}, with the UK channel and kick-off time. ${list.length} ${list.length === 1 ? 'game' : 'games'} on TV.` });
}
for (const pg of extraPages) {
  const html = listPage(pg);
  if (!html.includes('1c6cd6949d724fe697ffd4b014f24d91')) problems.push(`${pg.slug}/index.html is missing its analytics snippet`);
  if (!CHECK) fs.mkdirSync(pg.slug, { recursive: true });
  out(`${pg.slug}/index.html`, html);
  urls.push(`${SITE}/${pg.slug}/`);
}
if (TEAMS.length < 40) problems.push(`only ${TEAMS.length} team pages (expected about 55); the fixture data may be damaged`);
// Plain-text "On UK TV today" summary on the main page (between the TODAYTV markers), so search engines
// and AI answers can read today's televised games without running the page's script.
const womens = c => /WSL|Women/.test(c);
const tvList = d => data.filter(m => m.d === d && m.t !== 'TBC' && m.a && isTV(m) && !womens(m.c)).sort((x, y) => x.t.localeCompare(y.t));
const fullDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const chanNames = m => { const c = m.ch.filter(x => x !== 'NOW' && x !== 'HBO Max'); return (c.length ? c : m.ch).map(x => m.exp.includes(x) ? `${x} (expected)` : x).join(', '); };
let sumDay = ukToday, sumList = tvList(ukToday), sumHead = 'On UK TV today';
if (!sumList.length) { const nd = [...new Set(data.filter(m => m.d > ukToday && m.d !== 'TBC').map(m => m.d))].sort().find(d => tvList(d).length); if (nd) { sumDay = nd; sumList = tvList(nd); sumHead = 'Next football on UK TV'; } }
const sumHTML = `<h3 id="today">${sumHead}</h3>\n  <p>${esc(fullDate(sumDay))}${sumHead === 'On UK TV today' ? '' : ' (no televised games today)'}. ${sumList.length} televised ${sumList.length === 1 ? 'match' : 'matches'}, kick-off times UK time:</p>\n  <ul class="todaylist">\n` +
  sumList.map(m => `    <li><b>${m.t}</b> ${esc(m.h)} v ${esc(m.a)} (${esc(m.c)}): ${esc(chanNames(m))}</li>`).join('\n') + '\n  </ul>';
const TA = '<!-- TODAYTV -->', TB = '<!-- /TODAYTV -->';
const ti = src.indexOf(TA), tj = src.indexOf(TB);
if (ti < 0 || tj < 0) throw new Error('TODAYTV markers missing from index.html');
src = src.slice(0, ti + TA.length) + '\n  ' + sumHTML + '\n  ' + src.slice(tj);

// Team page links on the main page, between the TEAMPAGES markers
const links = LEAGUES.map(lg => `<p class="teamlinks"><b>${lg}:</b> ` + TEAMS.filter(([t]) => LEAGUE_OF[t] === lg).map(([t, sl]) => `<a href="/${sl}/">${esc(t)}</a>`).join(' · ') + '</p>').join('\n  ');
const A = '<!-- TEAMPAGES -->', B = '<!-- /TEAMPAGES -->';
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < 0) throw new Error('TEAMPAGES markers missing from index.html');
const compLinks = `<p class="teamlinks"><a href="/${WEEKEND}/">Football on TV this weekend</a> · ` + COMPS.map(c => `<a href="/${compSlug(c)}/">${esc(c)} on TV</a>`).join(' · ') + '</p>';
let mainHTML = src.slice(0, i + A.length) + '\n  <h3>This weekend and competitions</h3>\n  ' + compLinks + '\n  <h3>Team pages</h3>\n  ' + links + '\n  ' + src.slice(j);
// Build fingerprint: a hash of the page with the daily data stripped out. The page's swipe refresh compares it:
// same fingerprint = only the TV data changed, so it updates in place; different = the design or code changed, so it reloads.
const codeOnly = mainHTML
  .replace(/<meta name="ck-build" content="[^"]*">/, '')
  .replace(/const UPDATED = \{.*?\};\n/s, '')
  .replace(/const AUDITS = [\s\S]*?(?=const RAW = `)/, '')
  .replace(/const RAW = `[\s\S]*?`;/, '')
  .replace(/const VENUES = \{[\s\S]*?\n\};/, '')
  .replace(/const KIT=\{.*?\};/, '')
  .replace(/const GROUNDS=\{.*?\};/, '')
  .replace(/<footer>[\s\S]*?<\/footer>/, '');
const fp = createHash('sha1').update(codeOnly).digest('hex').slice(0, 12);
if (!/<meta name="ck-build" content="[^"]*">/.test(mainHTML)) throw new Error('ck-build meta missing from index.html');
mainHTML = mainHTML.replace(/<meta name="ck-build" content="[^"]*">/, `<meta name="ck-build" content="${fp}">`);
out('index.html', mainHTML);
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>${u}</loc>\n    <changefreq>daily</changefreq>\n  </url>`).join('\n')}\n</urlset>\n`);
// ---- Team calendar feeds (/<team>/calendar.ics): every upcoming televised game, with a reminder 1 hour before.
// Calendar apps re-download the file every few hours, so new picks and time changes reach subscribers on their own.
const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsFold = line => { const out = []; let cur = ''; for (const ch of line) { if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; } cur += ch; } out.push(cur); return out.join('\r\n '); };
const icsTime = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const stamp = icsTime(UPDATED.last_ok ? new Date(UPDATED.last_ok + 'Z') : new Date(ukToday + 'T00:00:00Z'));
function calendar(team, slug) {
  const games = data.filter(m => (m.h === team || m.a === team) && m.a && m.d !== 'TBC' && m.d >= ukToday && isTV(m));
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Couch Kick-Off//Team TV calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEsc(team + ' on TV')}`, `X-WR-CALDESC:${icsEsc(`${team} games on UK TV, from couchkickoff.co.uk. Updated daily.`)}`,
    'X-WR-TIMEZONE:Europe/London', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const m of games) {
    const ch = chanNames(m), first = ch.split(', ')[0], venue = VENUES[`${m.d}|${m.h}|${m.a}`];
    const desc = `${CARD_COMP[m.c] || m.c}${isRound(m.n) ? ' · ' + m.n : ''}${venue ? ' · ' + venue : ''}\nOn TV: ${ch}\n${SITE}/${slug}/`;
    L.push('BEGIN:VEVENT', `UID:${slugify(m.h + '-' + m.a + '-' + m.c)}@couchkickoff.co.uk`, `DTSTAMP:${stamp}`);
    if (m.t === 'TBC') { const nx = new Date(m.d + 'T12:00:00Z'); nx.setUTCDate(nx.getUTCDate() + 1); L.push(`DTSTART;VALUE=DATE:${m.d.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nx.toISOString().slice(0, 10).replace(/-/g, '')}`); }
    else { const s = new Date(`${m.d}T${m.t}:00${ukOffset(m.d, m.t)}`); L.push(`DTSTART:${icsTime(s)}`, `DTEND:${icsTime(new Date(s.getTime() + 2 * 3600e3))}`); }
    L.push(`SUMMARY:${icsEsc(`${m.h} v ${m.a}${m.t === 'TBC' ? ' (kick-off TBC)' : ''} · ${first}`)}`, `LOCATION:${icsEsc(ch)}`, `DESCRIPTION:${icsEsc(desc)}`, `URL:${SITE}/${slug}/`, 'TRANSP:TRANSPARENT');
    if (m.t !== 'TBC') L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`${m.h} v ${m.a} on ${first} in 1 hour`)}`, 'TRIGGER:-PT1H', 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
for (const [team, slug] of TEAMS) out(`${slug}/calendar.ics`, calendar(team, slug));

if (problems.length) {

  console.log((CHECK ? 'TEAM PAGES CHECK FAILED' : 'TEAM PAGES BUILD PROBLEM') + ' (run node tools/build_pages.mjs to rebuild):\n- ' + problems.slice(0, 15).join('\n- ') + (problems.length > 15 ? `\n- ...and ${problems.length - 15} more` : ''));
  process.exit(1);
}
console.log(`${CHECK ? 'Team pages OK' : 'Built'}: ${TEAMS.length} team pages, ${extraPages.length} competition/weekend pages, ${rows} fixture rows, sitemap has ${urls.length} URLs`);
