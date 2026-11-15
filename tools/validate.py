#!/usr/bin/env python3
"""Check index.html before it is committed. Exit code 0 = safe to publish.

Usage: python3 tools/validate.py            (compares with the last committed version)
Checks: every fixture line has at least 5 fields; no duplicate fixture lines; the fixture
count has not dropped by more than 10%; the UPDATED, KIT and AUDITS blocks and the About
section and the Cloudflare Web Analytics snippet are present; the page script parses (node --check).
"""
import re, subprocess, sys, tempfile

def fixtures(html):
    m = re.search(r'const RAW = `(.*?)`;', html, re.S)
    if not m:
        return None
    return [l for l in m.group(1).split('\n') if l.strip()]

def main():
    html = open('index.html', encoding='utf-8').read()
    errors = []
    lines = fixtures(html)
    if lines is None:
        errors.append('RAW block missing')
        lines = []
    bad = [l for l in lines if l.count('|') < 4]
    if bad:
        errors.append(f'{len(bad)} fixture lines have fewer than 5 fields, e.g. {bad[0][:80]!r}')
    dupes = sorted({l for l in lines if lines.count(l) > 1})
    if dupes:
        errors.append(f'{len(dupes)} duplicate fixture lines, e.g. {dupes[0][:80]!r}')
    try:
        prev = subprocess.run(['git', 'show', 'HEAD:index.html'], capture_output=True, text=True, check=True).stdout
        old = fixtures(prev) or []
        if old and len(lines) < len(old) * 0.9:
            errors.append(f'fixture count dropped from {len(old)} to {len(lines)} (more than 10%)')
    except Exception:
        pass
    for name, pat in [('UPDATED', r'const UPDATED = \{.*?\};'), ('KIT', r'const KIT=\{.*?\};'), ('VENUES', r'const VENUES = \{.*?\};'),
                      ('AUDITS', r'const AUDITS = \[.*?\];'), ('About section', r'id="about"')]:
        if len(re.findall(pat, html, re.S)) != 1:
            errors.append(f'{name} missing or duplicated')
    if html.count('static.cloudflareinsights.com/beacon.min.js') != 1 or '1c6cd6949d724fe697ffd4b014f24d91' not in html:
        errors.append('Cloudflare Web Analytics snippet missing or duplicated (it must stay just before </body>)')
    if html.count('<!-- TODAYTV -->') != 1 or html.count('<!-- /TODAYTV -->') != 1:
        errors.append('TODAYTV markers missing or duplicated')
    if html.count('<!-- TEAMPAGES -->') != 1 or html.count('<!-- /TEAMPAGES -->') != 1:
        errors.append('TEAMPAGES markers missing or duplicated (team page links are written between them)')
    js = '\n'.join(re.findall(r'<script>(.*?)</script>', html, re.S))
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write(js)
    r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
    if r.returncode != 0:
        errors.append('page script does not parse: ' + r.stderr.strip()[:300])
    team_ok = ''
    r = subprocess.run(['node', 'tools/build_pages.mjs', '--check'], capture_output=True, text=True)
    if r.returncode != 0:
        errors.append((r.stdout + r.stderr).strip()[:1500])
    else:
        team_ok = r.stdout.strip()
    if errors:
        print('VALIDATION FAILED:\n- ' + '\n- '.join(errors))
        sys.exit(1)
    print(f'OK: {len(lines)} fixtures, script parses' + '. ' + team_ok)

if __name__ == '__main__':
    main()
