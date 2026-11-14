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
    open(dst_path, 'w', encoding='utf-8').write(dst)
    print('Changed blocks: ' + (', '.join(changed) if changed else 'none'))

if __name__ == '__main__':
    main()
