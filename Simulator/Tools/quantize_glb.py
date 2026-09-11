#!/usr/bin/env python3
"""quantize_glb.py -- shrink a GLB for the web without Draco or any dependency beyond Python.

    python3 Tools/quantize_glb.py in.glb out.glb [--keep-tangents] [--keep-uv N ...]
                                  [--extract-images DIR] [--images DIR] [--data-uri-images]

What it does to every mesh primitive (KHR_mesh_quantization, which three.js r128 loads natively):
  POSITION   float32 -> int16, one uniform scale per mesh (maxabs / 32767) folded into the scale of every node that
             uses the mesh. The node's origin does not move, so pivots (wheels) still spin where they should.
  NORMAL     float32 -> int8 normalized, padded to a 4-byte stride like gltfpack does.
  TEXCOORD_n float32 -> uint16 normalized when every value is inside [0, 1] (tiling UVs stay float).
             Sets no material references are dropped (a material's texCoord defaults to 0).
  COLOR_n    float32 -> uint8 normalized.
  TANGENT    dropped (three.js derives tangents when a normal map needs them); --keep-tangents keeps them.
  indices    uint32 -> uint16 when the primitive has fewer than 65535 vertices.
Everything else in the file (nodes, materials, textures, animations, skins) is kept as it is.

Textures are not touched by default. --extract-images DIR writes every image out as img<N>.<png|jpg> plus
images.json; re-encode them however you like (Tools/reencode_textures.js does it in a browser canvas), then
--images DIR swaps in any out<N>.<png|jpg> it finds there when rebuilding."""
import sys, json, struct, math, os, argparse, base64
from array import array

CT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
CT_FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
CT_RANGE = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
GLB_JSON, GLB_BIN = 0x4E4F534A, 0x004E4942


def read_glb(path):
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<4sII', f.read(12))
        assert magic == b'glTF', 'not a GLB'
        chunks = []
        while f.tell() < length:
            clen, ctype = struct.unpack('<II', f.read(8)); chunks.append((ctype, f.read(clen)))
    g = json.loads(next(c for t, c in chunks if t == GLB_JSON))
    b = next((c for t, c in chunks if t == GLB_BIN), b'')
    return g, b


def write_glb(path, g, b):
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4); b = b + b'\0' * (-len(b) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(b)))
        f.write(struct.pack('<II', len(js), GLB_JSON)); f.write(js)
        f.write(struct.pack('<II', len(b), GLB_BIN)); f.write(b)


def read_accessor(g, b, ai):
    """-> (flat list of numbers, ncomp, accessor). Normalized ints come back as floats in [-1, 1] / [0, 1]."""
    a = g['accessors'][ai]
    if 'sparse' in a: raise SystemExit('sparse accessors are not handled (accessor %d)' % ai)
    n, nc, ct = a['count'], NCOMP[a['type']], a['componentType']
    fmt, sz = CT_FMT[ct], CT_SIZE[ct]
    if 'bufferView' not in a: vals = [0] * (n * nc)
    else:
        bv = g['bufferViews'][a['bufferView']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0) or nc * sz
        if stride == nc * sz:
            arr = array(fmt); arr.frombytes(b[start:start + n * nc * sz]); vals = arr.tolist()
        else:
            vals = []; up = struct.Struct('<' + fmt * nc).unpack_from
            for i in range(n): vals.extend(up(b, start + i * stride))
    if a.get('normalized') and ct in CT_RANGE:
        r = CT_RANGE[ct]; vals = [v / r for v in vals]
        if ct in (5120, 5122): vals = [max(-1.0, v) for v in vals]
    return vals, nc, a


class Builder:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accessors = []

    def view(self, data, target=None, stride=None):
        self.bin += b'\0' * (-len(self.bin) % 4)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        self.views.append(v); self.bin += data; return len(self.views) - 1

    def accessor(self, vi, ct, count, atype, normalized=False, mn=None, mx=None):
        a = {'bufferView': vi, 'componentType': ct, 'count': count, 'type': atype}
        if normalized: a['normalized'] = True
        if mn is not None: a['min'] = mn; a['max'] = mx
        self.accessors.append(a); return len(self.accessors) - 1


def pack(fmt, vals): a = array(fmt, vals); return a.tobytes()


def padded(vals, nc, fmt, pad_to):
    """pack nc components per vertex, then pad every vertex out to pad_to bytes (int8/uint8 vec3 -> stride 4)."""
    sz = struct.calcsize(fmt); out = bytearray(); pad = b'\0' * (pad_to - nc * sz); st = struct.Struct('<' + fmt * nc)
    for i in range(0, len(vals), nc): out += st.pack(*vals[i:i + nc]); out += pad
    return bytes(out)


def used_texcoords(g):
    used = {0}
    def walk(o):
        if isinstance(o, dict):
            if 'index' in o and isinstance(o.get('index'), int): used.add(o.get('texCoord', 0))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(g.get('materials', [])); return used


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--keep-tangents', action='store_true'); ap.add_argument('--keep-uv', type=int, nargs='*', default=[])
    ap.add_argument('--extract-images'); ap.add_argument('--images')
    ap.add_argument('--data-uri-images', action='store_true', help='store images as data: URIs in the JSON (for the sandboxed single-file page) instead of bufferViews')
    o = ap.parse_args()
    g, b = read_glb(o.src); B = Builder(); src_size = os.path.getsize(o.src)
    keep_uv = used_texcoords(g) | set(o.keep_uv)
    remap = {}   # old accessor index -> new, for anything we pass through untouched (animations, skins, targets)

    def copy_accessor(ai):
        if ai in remap: return remap[ai]
        vals, nc, a = read_accessor(g, b, ai); ct = a['componentType']
        raw = read_accessor.__wrapped__(g, b, ai) if False else None
        # re-read raw (un-normalized) to copy bit-exact
        fmt = CT_FMT[ct]
        a2 = dict(a); a2.pop('normalized', None)
        rv, _, _ = read_accessor({'accessors': [a2], 'bufferViews': g['bufferViews']}, b, 0)
        stride = None
        if nc * CT_SIZE[ct] % 4: stride = (nc * CT_SIZE[ct] + 3) // 4 * 4
        data = padded(rv, nc, fmt, stride) if stride else pack(fmt, rv)
        vi = B.view(data, 34962 if a['type'] != 'SCALAR' or ct not in (5121, 5123, 5125) else None, stride)
        na = B.accessor(vi, ct, a['count'], a['type'], bool(a.get('normalized')), a.get('min'), a.get('max'))
        remap[ai] = na; return na

    # ---- meshes
    mesh_scale = {}
    stats = {'tangents': 0, 'uv_dropped': 0, 'uv_u16': 0, 'uv_f32': 0, 'idx16': 0, 'idx32': 0}
    for mi, m in enumerate(g['meshes']):
        prims = m['primitives']
        for p in prims:
            if 'extensions' in p and 'KHR_draco_mesh_compression' in p['extensions']: raise SystemExit('already Draco-compressed')
        # one scale per mesh so every primitive shares the node's transform
        maxabs = 0.0; pos_cache = {}
        for pi, p in enumerate(prims):
            if 'POSITION' not in p['attributes']: continue
            vals, nc, a = read_accessor(g, b, p['attributes']['POSITION']); pos_cache[pi] = vals
            for v in vals:
                av = abs(v)
                if av > maxabs: maxabs = av
        S = (maxabs / 32767.0) if maxabs > 0 else 1.0; mesh_scale[mi] = S
        for pi, p in enumerate(prims):
            new_attr = {}
            for name, ai in p['attributes'].items():
                base = name.split('_')[0]
                if base == 'TANGENT' and not o.keep_tangents: stats['tangents'] += 1; continue
                if base == 'TEXCOORD' and int(name.split('_')[1]) not in keep_uv: stats['uv_dropped'] += 1; continue
                if base == 'POSITION':
                    vals = pos_cache[pi]; q = [max(-32767, min(32767, int(round(v / S)))) for v in vals]
                    mn = [min(q[i::3]) for i in range(3)]; mx = [max(q[i::3]) for i in range(3)]
                    data = padded(q, 3, 'h', 8)   # int16 vec3 is 6 bytes: pad the stride to 8
                    vi = B.view(data, 34962, 8); new_attr[name] = B.accessor(vi, 5122, len(q) // 3, 'VEC3', False, mn, mx)
                elif base == 'NORMAL':
                    vals, nc, a = read_accessor(g, b, ai); q = []
                    for i in range(0, len(vals), 3):
                        x, y, z = vals[i], vals[i + 1], vals[i + 2]; l = math.sqrt(x * x + y * y + z * z) or 1.0
                        q += [max(-127, min(127, int(round(x / l * 127)))), max(-127, min(127, int(round(y / l * 127)))), max(-127, min(127, int(round(z / l * 127))))]
                    vi = B.view(padded(q, 3, 'b', 4), 34962, 4); new_attr[name] = B.accessor(vi, 5120, len(q) // 3, 'VEC3', True)
                elif base == 'TEXCOORD':
                    vals, nc, a = read_accessor(g, b, ai)
                    if all(0.0 <= v <= 1.0 for v in vals):
                        q = [int(round(v * 65535)) for v in vals]; vi = B.view(pack('H', q), 34962)
                        new_attr[name] = B.accessor(vi, 5123, len(q) // 2, 'VEC2', True); stats['uv_u16'] += 1
                    else:
                        vi = B.view(pack('f', vals), 34962); new_attr[name] = B.accessor(vi, 5126, len(vals) // 2, 'VEC2'); stats['uv_f32'] += 1
                elif base == 'COLOR':
                    vals, nc, a = read_accessor(g, b, ai); q = [max(0, min(255, int(round(v * 255)))) for v in vals]
                    stride = 4 if nc == 3 else None
                    vi = B.view(padded(q, nc, 'B', 4) if nc == 3 else pack('B', q), 34962, stride)
                    new_attr[name] = B.accessor(vi, 5121, len(q) // nc, a['type'], True)
                else:
                    new_attr[name] = copy_accessor(ai)
            p['attributes'] = new_attr
            if 'indices' in p:
                vals, nc, a = read_accessor(g, b, p['indices']); top = max(vals) if vals else 0
                if top < 65535: vi = B.view(pack('H', vals), 34963); p['indices'] = B.accessor(vi, 5123, len(vals), 'SCALAR'); stats['idx16'] += 1
                else: vi = B.view(pack('I', vals), 34963); p['indices'] = B.accessor(vi, 5125, len(vals), 'SCALAR'); stats['idx32'] += 1
            if 'targets' in p:
                p['targets'] = [{k: copy_accessor(v) for k, v in t.items()} for t in p['targets']]
    # ---- fold the position scale into every node that draws the mesh
    for n in g.get('nodes', []):
        if 'mesh' not in n: continue
        S = mesh_scale[n['mesh']]
        if 'matrix' in n:
            M = n['matrix']; n['matrix'] = [M[i] * S if i < 12 else M[i] for i in range(16)]
        else:
            sc = n.get('scale', [1, 1, 1]); n['scale'] = [sc[0] * S, sc[1] * S, sc[2] * S]
    # ---- everything else that owns accessors
    for an in g.get('animations', []):
        for s in an['samplers']: s['input'] = copy_accessor(s['input']); s['output'] = copy_accessor(s['output'])
    for sk in g.get('skins', []):
        if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = copy_accessor(sk['inverseBindMatrices'])
    # ---- images
    swaps = {}
    if o.images and os.path.isdir(o.images):
        for fn in os.listdir(o.images):
            if fn.startswith('out') and fn.rsplit('.', 1)[-1] in ('jpg', 'jpeg', 'png'):
                idx = int(fn[3:].split('.')[0]); swaps[idx] = (os.path.join(o.images, fn), 'image/png' if fn.endswith('png') else 'image/jpeg')
    ex = []
    if o.extract_images: os.makedirs(o.extract_images, exist_ok=True)
    alpha_imgs = set()
    for mt in g.get('materials', []):
        if mt.get('alphaMode', 'OPAQUE') != 'OPAQUE':
            t = mt.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if t is not None: alpha_imgs.add(g['textures'][t['index']].get('source'))
    for ii, im in enumerate(g.get('images', [])):
        if 'bufferView' in im:
            bv = g['bufferViews'][im['bufferView']]; data = b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]; mime = im.get('mimeType', 'image/png')
        elif im.get('uri', '').startswith('data:'):
            head, payload = im['uri'].split(',', 1); mime = head[5:].split(';')[0]; data = base64.b64decode(payload)
        else:
            continue   # an external file reference: leave it alone
        if o.extract_images:
            ext = 'png' if 'png' in mime else 'jpg'
            with open(os.path.join(o.extract_images, 'img%d.%s' % (ii, ext)), 'wb') as f: f.write(data)
            ex.append({'index': ii, 'mime': mime, 'alpha': ii in alpha_imgs, 'name': im.get('name', '')})
        if ii in swaps:
            with open(swaps[ii][0], 'rb') as f: data = f.read()
            mime = swaps[ii][1]
        if o.data_uri_images:   # sandboxed pages (the artifact) refuse the blob: URLs GLTFLoader makes for bufferView images
            im.pop('bufferView', None); im.pop('mimeType', None); im['uri'] = 'data:%s;base64,%s' % (mime, base64.b64encode(data).decode('ascii'))
        else:
            im.pop('uri', None); im['mimeType'] = mime; im['bufferView'] = B.view(data)
    if o.extract_images:
        with open(os.path.join(o.extract_images, 'images.json'), 'w') as f: json.dump(ex, f, indent=1)
    # ---- assemble
    g['accessors'] = B.accessors; g['bufferViews'] = B.views; g['buffers'] = [{'byteLength': len(B.bin)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        lst = g.setdefault(key, [])
        if 'KHR_mesh_quantization' not in lst: lst.append('KHR_mesh_quantization')
    write_glb(o.dst, g, bytes(B.bin))
    print('%s: %.2f MB -> %.2f MB  (%s; %d images%s)' % (os.path.basename(o.src), src_size / 1e6, os.path.getsize(o.dst) / 1e6,
          ', '.join('%s %d' % kv for kv in stats.items()), len(g.get('images', [])), ', %d swapped' % len(swaps) if swaps else ''))


if __name__ == '__main__':
    main()
