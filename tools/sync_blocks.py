#!/usr/bin/env python3
"""Copy the data blocks from the Couch Kick-Off artifact page into the website's index.html.

Usage: python3 tools/sync_blocks.py SOURCE_HTML [TARGET_HTML]
SOURCE_HTML is the MAIN artifact's index.html saved to disk; TARGET_HTML defaults to index.html.
Only the four data blocks are copied (RAW, UPDATED, KIT and the "Confirmed TV picks so far" list),
so the website's own layout (About section, Report links) is left untouched.
Exits non-zero, changing nothing, if any block is missing or appears more than once.
"""
import re, sys

PATTERNS = {
    'RAW': r'const RAW = `.*?`;',
    'UPDATED': r'const UPDATED = .*?\};',
    'KIT': r'const KIT=\{.*?\};',
    'TV picks list': r'<h4>Confirmed TV picks so far</h4>.*?</ul>',
}

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src_path = sys.argv[1]
    dst_path = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
    src = open(src_path, encoding='utf-8').read()
    dst = open(dst_path, encoding='utf-8').read()
    changed = []
    for name, pat in PATTERNS.items():
        s = re.findall(pat, src, re.S)
        d = re.findall(pat, dst, re.S)
        if len(s) != 1 or len(d) != 1:
            sys.exit(f'ERROR: block {name} found {len(s)} times in source and {len(d)} times in target; nothing changed')
        if s[0] != d[0]:
            changed.append(name)
            dst = dst.replace(d[0], s[0], 1)
    # Safety checks before anything is written
    raw = re.search(PATTERNS['RAW'], dst, re.S).group(0)
    lines = [l for l in raw[len('const RAW = `'):-2].strip().split('\n') if l.strip()]
    bad = [l for l in lines if l.count('|') < 4]
    if bad:
        sys.exit(f'ERROR: {len(bad)} fixture lines have fewer than 5 fields, e.g. {bad[0][:80]!r}; nothing changed')
    old_raw = re.search(PATTERNS['RAW'], open(dst_path, encoding='utf-8').read(), re.S).group(0)
    old_n = len([l for l in old_raw.split('\n') if '|' in l])
    if old_n and len(lines) < old_n * 0.9:
        sys.exit(f'ERROR: fixture count would drop from {old_n} to {len(lines)} (more than 10%); nothing changed')
    if 'id="about"' not in dst:
        sys.exit('ERROR: the website About section is missing; nothing changed')
    open(dst_path, 'w', encoding='utf-8').write(dst)
    print('Changed blocks: ' + (', '.join(changed) if changed else 'none'))

if __name__ == '__main__':
    main()
