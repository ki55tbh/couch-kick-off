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
const ext = c => chURL(c) ? '<span class="ext" aria-hidden="true">↗</span>' : '';
const bWrap = (c, inner) => { const u = chURL(c); return u ? `<a class="bl" href="${u}" target="_blank" rel="noopener" title="Open ${esc(c)} in a new tab">${inner}</a>` : inner; };
const slugify = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const LEAGUE_OF = {};
for (const lg of LEAGUES) for (const m of data) if (m.c === lg && m.a) for (const t of [m.h, m.a]) LEAGUE_OF[t] ??= lg;
for (const [lg, clubs] of Object.entries(SCOTTISH)) for (const t of clubs) LEAGUE_OF[t] = lg;
const TEAMS = Object.keys(LEAGUE_OF).sort((a, b) => a.localeCompare(b)).map(t => [t, slugify(t)]);
const style = cut('<style>', '</style>') + '</style>';
const FREE = /BBC|ITV|STV|S4C|YouTube|England App|Channel 4|Channel 5/;
const COMPS = ['Premier League', 'Champions League', 'Europa League', 'Conference League', 'Championship', 'League One', 'League Two',
  'Scottish Premiership', 'Carabao Cup', 'LaLiga', 'Serie A', 'Bundesliga'];
const compSlug = c => slugify(c) + '-on-tv';
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
  (/^Sky (Sports(?! (Football|Premier League))|Mix)/.test(c) ? bWrap(c, `<span class="b skyb"><span class="s1">${esc(c.split(' ')[0])}</span><span class="s2">${swrap(c.split(' ').slice(1).join(' '))}${ext(c)}</span></span>`) :
  (m.exp.includes(c) ? bWrap(c, `<span class="b exp" style="${expStyle(c)}" title="${esc(c)} holds the rights but hasn't confirmed this match yet">${swrap(c)}${ext(c)}</span>`) + '<span class="exptag">Expected</span>' :
  bWrap(c, `<span class="b" style="${brandStyle(c)}">${swrap(c)}${ext(c)}</span>`)))).join('') + (m.ch.some(c => FREE.test(c)) ? '<span class="freetag">FREE</span>' : '');
const isTV = m => !m.ch.includes('Not on UK TV') && !m.ch.includes('TV pick TBC');
const chanText = (m, all) => { const c = m.ch.filter(x => x !== 'NOW' && x !== 'HBO Max'); const l = c.length ? c : m.ch; return all ? l.join(', ') : l[0]; };

function card(m, team) {
  const notv = m.ch.includes('Not on UK TV'), pending = m.ch.includes('TV pick TBC');
  const opp = m.h === team ? m.a : m.h, ha = m.h === team ? 'H' : 'A';
  const ko = m.t === 'TBC' ? '' : ` data-ko="${m.d}T${m.t}:00${ukOffset(m.d, m.t)}"`;
  return `<div class="m${pending ? ' tbcm' : ''}${notv ? ' notvm' : ''}"${ko}><div class="ko"><span class="dt">${longDate(m.d)}</span>${m.t}${m.t === 'TBC' ? '' : '<small>UK</small>'}</div><div>
    <div class="teams">${esc(m.h)} <span class="vaw"><span class="v">v</span>${esc(m.a)}</span></div>
    <div class="comp">${esc(m.c)} · ${ha === 'H' ? 'Home' : 'Away'}${notv ? `<span class="notvtag"> · ${m.c === 'Premier League' ? '3pm, not on UK TV' : 'Not on UK TV'}</span>` : ''}</div>${notv ? '' : `<div class="ch">${badges(m)}</div>`}
    ${m.n && !notv ? `<div class="note">${esc(m.n)}</div>` : ''}</div></div>`;
}

// Breadcrumb markup only. Match-level Event markup was removed because Google requires a venue for every event,
// which this data doesn't hold, so it flagged every match as invalid.
function jsonLd(team, slug) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Couch Kick-Off', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: `${team} on TV`, item: `${SITE}/${slug}/` } ] }).replace(/</g, '\\u003c');
}

function page(team, slug) {
  const list = data.filter(m => (m.h === team || m.a === team) && m.d !== 'TBC' && m.d >= ukToday);
  const next = list.find(isTV);
  const opp = m => m.h === team ? `${m.a} (H)` : `${m.h} (A)`;
  const nextText = next ? `${next.h} v ${next.a}, ${next.c}, ${longDate(next.d)}${next.t === 'TBC' ? '' : ' at ' + next.t} on ${chanText(next)}` : '';
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
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd(team, slug)}</script>
${style}
<style>
.tp{max-width:720px;margin:0 auto;padding:0 14px 40px}
.tlogo{display:block;max-width:300px;margin:12px auto 4px}.tlogo img{width:100%;height:auto;display:block}
.crumb{font-size:12.5px;color:var(--muted);margin:10px 2px 6px}.crumb a{color:var(--green);font-weight:700;text-decoration:none}
.th1{font-family:Outfit,Inter,sans-serif;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.015em;margin:4px 2px 8px}
.lead{margin:0 2px 14px;color:var(--text)}.lead small{display:block;color:var(--muted);margin-top:4px}
.nextbox{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--green);border-radius:12px;padding:12px 14px;margin:0 0 6px;font-weight:600}
.nextbox b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin-bottom:3px}
.tfoot{margin:26px 2px 0;font-size:13.5px;color:var(--muted)}.tfoot a{color:var(--green);font-weight:700}
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
  : `No ${esc(team)} games are confirmed for UK TV right now. Broadcasters announce their picks a few weeks ahead, so check back soon.`}<small>Checked every morning. Last updated ${esc(upd)}. Times are UK time.</small></p>
${next ? `<div class="nextbox"><b>Next on TV</b>${esc(nextText)}</div>` : ''}
${months}
<a class="cta" href="/">See all football on UK TV today</a>
${navLinks()}
<p class="tfoot">A solid badge means the broadcaster has confirmed the match. An outlined badge marked Expected means it holds the rights but hasn't confirmed this game yet. Saturday 3pm games aren't shown live in the UK. Spotted a mistake? Email <a href="mailto:hello@couchkickoff.co.uk">hello@couchkickoff.co.uk</a>.<br><br>Couch Kick-Off is independent and not connected to ${esc(team)}, any league or any broadcaster. <a href="/#about">About</a><br><br>© 2026 Couch Kick-Off. All rights reserved.</p>
</div>
<script>(function(){var n=Date.now();document.querySelectorAll('.m[data-ko]').forEach(function(e){if(Date.parse(e.dataset.ko)+150*60000<n)e.remove()});document.querySelectorAll('section.day').forEach(function(s){if(!s.querySelector('.m'))s.remove()})})();</script>
<!-- Cloudflare Web Analytics -->
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "1c6cd6949d724fe697ffd4b014f24d91"}'></script>
<!-- End Cloudflare Web Analytics -->
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
    <div class="teams">${esc(m.h)} <span class="vaw"><span class="v">v</span>${esc(m.a)}</span></div>
    ${showComp ? `<div class="comp">${esc(m.c)}</div>` : ''}<div class="ch">${badges(m)}</div>
    ${m.n ? `<div class="note">${esc(m.n)}</div>` : ''}</div></div>`;
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
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script>
${style}
<style>
.tp{max-width:720px;margin:0 auto;padding:0 14px 40px}
.tlogo{display:block;max-width:300px;margin:12px auto 4px}.tlogo img{width:100%;height:auto;display:block}
.crumb{font-size:12.5px;color:var(--muted);margin:10px 2px 6px}.crumb a{color:var(--green);font-weight:700;text-decoration:none}
.th1{font-family:Outfit,Inter,sans-serif;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.015em;margin:4px 2px 8px}
.lead{margin:0 2px 14px;color:var(--text)}.lead small{display:block;color:var(--muted);margin-top:4px}
.empty{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;margin:6px 0}
.tfoot{margin:26px 2px 0;font-size:13.5px;color:var(--muted)}.tfoot a{color:var(--green);font-weight:700}
.cta{display:block;text-align:center;background:var(--green);color:#fff!important;text-decoration:none;border-radius:12px;padding:12px;margin:20px 0 0;font-weight:700}
</style>
</head>
<body>
<div class="tp">
<a class="tlogo" href="/" aria-label="Couch Kick-Off home"><img src="/logo.webp" width="1100" height="355" alt="Couch Kick-Off"></a>
<nav class="crumb"><a href="/">Couch Kick-Off</a> › ${esc(crumb)}</nav>
<h1 class="th1">${esc(h1)}</h1>
<p class="lead">${lead}<small>Checked every morning. Last updated ${esc(upd)}. Times are UK time.</small></p>
${days || '<p class="empty">No televised games are listed right now. Broadcasters announce their picks a few weeks ahead, so check back soon.</p>'}
<a class="cta" href="/">See all football on UK TV today</a>
${navLinks()}
<p class="tfoot">A solid badge means the broadcaster has confirmed the match. An outlined badge marked Expected means it holds the rights but hasn't confirmed this game yet. Spotted a mistake? Email <a href="mailto:hello@couchkickoff.co.uk">hello@couchkickoff.co.uk</a>.<br><br>Couch Kick-Off is independent and not connected to any league, club or broadcaster. <a href="/#about">About</a><br><br>© 2026 Couch Kick-Off. All rights reserved.</p>
</div>
<script>(function(){var n=Date.now();document.querySelectorAll('.m[data-ko]').forEach(function(e){if(Date.parse(e.dataset.ko)+150*60000<n)e.remove()});document.querySelectorAll('section.day').forEach(function(s){if(!s.querySelector('.m'))s.remove()})})();</script>
<!-- Cloudflare Web Analytics -->
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "1c6cd6949d724fe697ffd4b014f24d91"}'></script>
<!-- End Cloudflare Web Analytics -->
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
  const range = `${longDate(wk[0])} to ${longDate(wk[wk.length - 1])}`;
  extraPages.push({ slug: WEEKEND, crumb: 'This weekend', h1: 'Football on TV this weekend', list, showComp: true,
    title: 'Football on TV this weekend: every UK channel and kick-off time | Couch Kick-Off',
    desc: `Every football match on UK TV this weekend (${range}): Premier League, EFL, Scottish, European and more, with channels and kick-off times. Checked daily.`,
    lead: `Every televised game from ${esc(range)}, with the UK channel and kick-off time. ${list.length} ${list.length === 1 ? 'game' : 'games'} on TV.` });
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
if (problems.length) {
  console.log((CHECK ? 'TEAM PAGES CHECK FAILED' : 'TEAM PAGES BUILD PROBLEM') + ' (run node tools/build_pages.mjs to rebuild):\n- ' + problems.slice(0, 15).join('\n- ') + (problems.length > 15 ? `\n- ...and ${problems.length - 15} more` : ''));
  process.exit(1);
}
console.log(`${CHECK ? 'Team pages OK' : 'Built'}: ${TEAMS.length} team pages, ${extraPages.length} competition/weekend pages, ${rows} fixture rows, sitemap has ${urls.length} URLs`);
