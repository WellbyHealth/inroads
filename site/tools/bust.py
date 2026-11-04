#!/usr/bin/env python3
"""Stamp every local CSS/JS reference in site/public/**/*.html with ?v=<content hash>.
Run after editing any .css or .js file:  python3 site/tools/bust.py"""
import hashlib, pathlib, re
pub = pathlib.Path(__file__).resolve().parent.parent / 'public'
def ver(path):
    f = pub / path.lstrip('/')
    return hashlib.sha1(f.read_bytes()).hexdigest()[:10] if f.exists() else None
pat = re.compile(r'((?:href|src)=")(/[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?(")')
changed = 0
for html in pub.rglob('*.html'):
    s = html.read_text()
    def rep(m):
        v = ver(m.group(2))
        return f'{m.group(1)}{m.group(2)}?v={v}{m.group(3)}' if v else m.group(0)
    t = pat.sub(rep, s)
    if t != s:
        html.write_text(t); changed += 1
print(f'stamped {changed} pages')
