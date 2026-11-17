#!/usr/bin/env python3
"""Tell Bing (via IndexNow) which public pages changed. Used by .github/workflows/indexnow.yml.

  python3 tools/indexnow.py changed BEFORE_SHA AFTER_SHA   # pages changed by a push
  python3 tools/indexnow.py all                           # every page in sitemap.xml (first run)
  add --dry-run to print what would be sent without sending it

Read-only: it never changes any file. Before sending, it waits until the live site serves the
new version of a changed page, so Bing isn't told about a page GitHub Pages hasn't published yet.
"""
import glob, hashlib, json, os, re, subprocess, sys, time, urllib.request, urllib.error

SITE = 'https://couchkickoff.co.uk'
HOST = 'couchkickoff.co.uk'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def key():
    files = [f for f in glob.glob(os.path.join(ROOT, '*.txt')) if re.fullmatch(r'[0-9a-f]{32}\.txt', os.path.basename(f))]
    if len(files) != 1: sys.exit('Expected exactly one IndexNow key file in the site root')
    k = open(files[0]).read().strip()
    if os.path.basename(files[0]) != k + '.txt': sys.exit('Key file name and contents do not match')
    return k

def sitemap_urls():
    return re.findall(r'<loc>(.*?)</loc>', open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read())

def path_to_url(path):
    """index.html -> /, liverpool/index.html -> /liverpool/. Anything else is not a public page."""
    if path == 'index.html': return SITE + '/'
    m = re.fullmatch(r'([a-z0-9-]+)/index\.html', path)
    return f'{SITE}/{m.group(1)}/' if m else None

def content(sha, path):
    """What a page actually says: its title, description, visible text and the fixture data.
    Styling, page code, icons and the build stamp are ignored, so design-only changes don't count."""
    try: html = subprocess.run(['git', '-C', ROOT, 'show', f'{sha}:{path}'], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError: return None
    keep = re.findall(r'<title>.*?</title>|<meta name="description"[^>]*>|const RAW = `.*?`;|const UPDATED = .*?;\n', html, flags=re.S)
    body = html.split('<body', 1)[-1]
    body = re.sub(r'<(style|script)\b.*?</\1>', '', body, flags=re.S)
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'Last updated \d{1,2} \w{3} \d{4}', '', body)  # the daily "checked" stamp alone isn't new content
    return re.sub(r'\s+', ' ', '\n'.join(keep) + body).strip()

def changed(before, after):
    if not before or set(before) == {'0'}:  # first push of a branch: nothing to compare with
        return [], []
    out = subprocess.run(['git', '-C', ROOT, 'diff', '--name-status', '--no-renames', before, after],
                         capture_output=True, text=True, check=True).stdout
    urls, pages = [], []
    for line in out.splitlines():
        status, path = line.split('\t', 1)
        u = path_to_url(path)
        if u and status == 'M' and content(before, path) == content(after, path):
            continue  # only styling or page code changed, not what the page says
        if u:
            urls.append(u)
            if status != 'D': pages.append((u, path))
    return sorted(set(urls)), pages

def get(url):
    req = urllib.request.Request(url + ('&' if '?' in url else '?') + 'cb=' + str(time.time()),
                                 headers={'User-Agent': 'couchkickoff-indexnow', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def wait_until_live(pages, minutes=15):
    """Wait until the live copy of one changed page matches this commit."""
    if not pages: return True
    url, path = pages[0]
    want = hashlib.sha256(open(os.path.join(ROOT, path), 'rb').read()).hexdigest()
    deadline = time.time() + minutes * 60
    while time.time() < deadline:
        try:
            if hashlib.sha256(get(url)).hexdigest() == want:
                print(f'Live site has the new version ({url}).'); return True
        except Exception as e:
            print(f'Checking live site: {e}')
        time.sleep(30)
    return False

def submit(urls, k):
    body = json.dumps({'host': HOST, 'key': k, 'keyLocation': f'{SITE}/{k}.txt', 'urlList': urls}).encode()
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request('https://api.indexnow.org/indexnow', data=body, method='POST',
                                         headers={'Content-Type': 'application/json; charset=utf-8'})
            with urllib.request.urlopen(req, timeout=30) as r:
                print(f'IndexNow accepted {len(urls)} URL(s): HTTP {r.status}'); return True
        except urllib.error.HTTPError as e:
            print(f'Attempt {attempt}: HTTP {e.code} {e.reason}')
            if e.code in (400, 403, 422): return False  # our mistake; retrying won't help
        except Exception as e:
            print(f'Attempt {attempt}: {e}')
        time.sleep(20 * attempt)
    return False

def main():
    args = [a for a in sys.argv[1:] if a != '--dry-run']; dry = '--dry-run' in sys.argv
    k = key()
    if args and args[0] == 'all':
        urls, pages = sitemap_urls(), [(SITE + '/', 'index.html')]
    elif len(args) == 3 and args[0] == 'changed':
        urls, pages = changed(args[1], args[2])
    else:
        sys.exit(__doc__)
    if not urls:
        print('No public pages changed, so nothing to send.'); return
    print(f'{len(urls)} URL(s) to send:'); [print('  ' + u) for u in urls]
    if dry: print('Dry run: nothing sent.'); return
    try:
        ok = get(f'{SITE}/{k}.txt').decode().strip() == k
    except Exception as e:
        ok = False; print(f'Key file check: {e}')
    if not ok:
        sys.exit(f'The key file {SITE}/{k}.txt is not live yet (or does not match), so nothing was sent.')
    print('Key file is live and matches.')
    if not wait_until_live(pages):
        sys.exit('The live site did not show the new version within 15 minutes, so nothing was sent.')
    if not submit(urls[:10000], k):
        sys.exit('IndexNow submission failed. The website itself is unaffected.')

if __name__ == '__main__':
    main()
