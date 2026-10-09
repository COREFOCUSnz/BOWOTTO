#!/usr/bin/env python3
# overlaps.py [log] -- reads phone.js / layout.js lines (stdin if no file) and reports every pair of HUD boxes that overlap
# by more than 2 px each way. Exit status 1 if any layout overlaps.
import json, sys, re, itertools
OK = {frozenset(p) for p in [('tach', 'cluster'), ('topRight', 'tmenu')]}   # these nest by design
bad_any = False
for line in (open(sys.argv[1]) if len(sys.argv) > 1 else sys.stdin):
    m = re.match(r'(\S+) (\S+) (\{.*\})', line.strip())
    if not m: continue
    size, steer, d = m.group(1), m.group(2), json.loads(m.group(3))
    boxes = {k: v for k, v in d.items() if isinstance(v, list)}
    bad = []
    for a, b in itertools.combinations(boxes, 2):
        if frozenset((a, b)) in OK: continue
        A, B = boxes[a], boxes[b]
        w = min(A[2], B[2]) - max(A[0], B[0]); h = min(A[3], B[3]) - max(A[1], B[1])
        if w > 2 and h > 2: bad.append(f'{a}x{b}:{w}x{h}')
    bad_any |= bool(bad)
    print(f'{size:8} {steer:6}', 'CLEAN' if not bad else 'OVERLAP ' + ' '.join(bad))
sys.exit(1 if bad_any else 0)
