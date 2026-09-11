#!/usr/bin/env python3
"""Cut a GLB down to a triangle budget by vertex clustering.

Grid-clusters the vertices, keeps one representative per cell, drops the triangles
that collapse, then rebuilds smooth normals from the surviving faces. Good enough
for chunky parts (a wing, a splitter) where an edge-collapse simplifier would be
overkill; it does not carry UVs, so use it on untextured or single-colour parts.

    python3 Tools/decimate_glb.py in.glb out.glb 8000
"""
import json, struct, sys, math
from collections import defaultdict

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    f = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<III', f[:12])
    assert magic == 0x46546C67, 'not a glb'
    off, js, bin_ = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack('<II', f[off:off + 8]); off += 8
        chunk = f[off:off + clen]; off += clen
        if ctype == 0x4E4F534A: js = json.loads(chunk)
        elif ctype == 0x004E4942: bin_ = chunk
    return js, bin_


def accessor(js, bin_, i):
    a = js['accessors'][i]
    fmt, size = COMP[a['componentType']]; n = NUM[a['type']]
    bv = js['bufferViews'][a['bufferView']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or size * n
    out = []
    for k in range(a['count']):
        o = base + k * stride
        out.append(struct.unpack_from('<' + fmt * n, bin_, o))
    return out


def main(src, dst, budget):
    js, bin_ = read_glb(src)
    # every triangle of every primitive, in one soup, with the node transforms baked in
    node_of = {}
    for ni, n in enumerate(js['nodes']):
        if 'mesh' in n: node_of.setdefault(n['mesh'], ni)

    def world_matrix(ni):
        parent = {}
        for i, n in enumerate(js['nodes']):
            for c in n.get('children', []): parent[c] = i
        M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        chain = []; j = ni
        while True:
            chain.append(j)
            if j in parent: j = parent[j]
            else: break
        for j in reversed(chain):
            n = js['nodes'][j]
            if 'matrix' in n: L = n['matrix']
            else:
                t = n.get('translation', [0, 0, 0]); s = n.get('scale', [1, 1, 1]); r = n.get('rotation', [0, 0, 0, 1])
                x, y, z, w = r
                L = [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
                     (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
                     (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
                     t[0], t[1], t[2], 1]
            M = mul(M, L)
        return M

    def mul(a, b):   # column-major, a then b applied after
        out = [0] * 16
        for c in range(4):
            for r in range(4):
                out[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
        return out

    def xf(M, p):
        x, y, z = p
        return (M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14])

    verts, tris = [], []
    for mi, m in enumerate(js['meshes']):
        M = world_matrix(node_of.get(mi, 0))
        for pr in m['primitives']:
            pos = accessor(js, bin_, pr['attributes']['POSITION'])
            idx = [i[0] for i in accessor(js, bin_, pr['indices'])] if 'indices' in pr else list(range(len(pos)))
            base = len(verts)
            verts.extend(xf(M, p) for p in pos)
            tris.extend((base + idx[i], base + idx[i + 1], base + idx[i + 2]) for i in range(0, len(idx) - 2, 3))
    lo = [min(v[k] for v in verts) for k in range(3)]
    hi = [max(v[k] for v in verts) for k in range(3)]
    diag = math.dist(lo, hi)
    print('in: %d verts %d tris, bbox %s' % (len(verts), len(tris), [round(hi[k] - lo[k], 3) for k in range(3)]))

    def cluster(cell):
        cells = defaultdict(list)
        key = [0] * len(verts)
        for i, v in enumerate(verts):
            k = (int((v[0] - lo[0]) / cell), int((v[1] - lo[1]) / cell), int((v[2] - lo[2]) / cell))
            key[i] = k; cells[k].append(i)
        rep, order = {}, []
        for k, members in cells.items():
            rep[k] = len(order)
            order.append(tuple(sum(verts[i][c] for i in members) / len(members) for c in range(3)))
        seen, out = set(), []
        for a, b, c in tris:
            ka, kb, kc = key[a], key[b], key[c]
            if ka == kb or kb == kc or ka == kc: continue
            t = (rep[ka], rep[kb], rep[kc])
            s = tuple(sorted(t))
            if s in seen: continue
            seen.add(s); out.append(t)
        return order, out

    # find the coarsest grid that still clears the budget
    best = None
    lo_c, hi_c = diag / 4000, diag / 8
    for _ in range(22):
        cell = math.sqrt(lo_c * hi_c)
        pts, out = cluster(cell)
        if len(out) > budget: lo_c = cell
        else: hi_c = cell; best = (cell, pts, out)
        if best and abs(len(best[2]) - budget) < budget * 0.06: break
    cell, pts, out = best
    # smooth normals from the surviving faces
    nrm = [[0.0, 0.0, 0.0] for _ in pts]
    for a, b, c in out:
        pa, pb, pc = pts[a], pts[b], pts[c]
        u = [pb[k] - pa[k] for k in range(3)]; v = [pc[k] - pa[k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        for i in (a, b, c):
            for k in range(3): nrm[i][k] += n[k]
    for n in nrm:
        L = math.sqrt(sum(k * k for k in n)) or 1
        for k in range(3): n[k] /= L
    print('out: %d verts %d tris (cell %.4g)' % (len(pts), len(out), cell))

    # one mesh, one material, positions + normals + indices
    pos_b = b''.join(struct.pack('<fff', *p) for p in pts)
    nrm_b = b''.join(struct.pack('<fff', *n) for n in nrm)
    idx_fmt = '<I' if len(pts) > 65535 else '<H'
    idx_b = b''.join(struct.pack(idx_fmt, i) for t in out for i in t)
    while len(idx_b) % 4: idx_b += b'\0'
    buf = pos_b + nrm_b + idx_b
    mat = js['materials'][0] if js.get('materials') else {'pbrMetallicRoughness': {'baseColorFactor': [0.1, 0.1, 0.1, 1], 'metallicFactor': 0.4, 'roughnessFactor': 0.4}}
    mat.pop('pbrMetallicRoughness', None) if False else None
    out_js = {
        'asset': {'version': '2.0', 'generator': 'decimate_glb.py', 'extras': js.get('asset', {}).get('extras', {})},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'wing'}],
        'meshes': [{'name': 'wing', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
        'materials': [mat],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(pts), 'type': 'VEC3', 'min': [min(p[k] for p in pts) for k in range(3)], 'max': [max(p[k] for p in pts) for k in range(3)]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(pts), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5125 if idx_fmt == '<I' else 5123, 'count': len(out) * 3, 'type': 'SCALAR'},
        ],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos_b), 'target': 34962},
            {'buffer': 0, 'byteOffset': len(pos_b), 'byteLength': len(nrm_b), 'target': 34962},
            {'buffer': 0, 'byteOffset': len(pos_b) + len(nrm_b), 'byteLength': len(idx_b), 'target': 34963},
        ],
        'buffers': [{'byteLength': len(buf)}],
    }
    jb = json.dumps(out_js, separators=(',', ':')).encode()
    while len(jb) % 4: jb += b' '
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(buf)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(buf), 0x004E4942) + buf
    open(dst, 'wb').write(glb)
    print('wrote %s (%d KB)' % (dst, len(glb) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8000)
