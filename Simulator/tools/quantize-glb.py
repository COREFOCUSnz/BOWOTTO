#!/usr/bin/env python3
"""quantize-glb.py -- shrink a GLB for embedding: positions to int16, normals to int8 (KHR_mesh_quantization),
images inlined as data URIs (no blob: URLs at load time).

    python3 Simulator/tools/quantize-glb.py in.glb out.glb

Each mesh is normalised to [-1, 1] and the compensating uniform scale goes on the nodes that use it
(their direct children are adjusted so the scene is unchanged). Tangents are dropped. Texture coordinates
and indices are left as they are. Standard library only.
"""
import json
import struct
import sys

CT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, 'not a GLB'
    off = 12
    j = bin_ = None
    while off < length:
        clen, ctype = struct.unpack('<II', b[off:off + 8])
        data = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            j = json.loads(data)
        elif ctype == 0x004E4942:
            bin_ = data
        off += 8 + clen
    return j, bin_


def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ += b'\0' * ((4 - len(bin_) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(out)


def read_accessor(j, bin_, ai):
    a = j['accessors'][ai]
    bv = j['bufferViews'][a['bufferView']]
    fmt, size = CT[a['componentType']]
    n = NC[a['type']]
    stride = bv.get('byteStride', size * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for i in range(a['count']):
        o = base + i * stride
        out.append(struct.unpack_from('<' + fmt * n, bin_, o))
    return out


class Builder:
    def __init__(self, j, bin_):
        self.j = j
        self.chunks = [bin_]
        self.off = len(bin_)

    def add(self, data, stride, target=34962):
        pad = (4 - self.off % 4) % 4
        self.chunks.append(b'\0' * pad)
        self.off += pad
        bv = {'buffer': 0, 'byteOffset': self.off, 'byteLength': len(data), 'byteStride': stride, 'target': target}
        self.j['bufferViews'].append(bv)
        self.chunks.append(data)
        self.off += len(data)
        return len(self.j['bufferViews']) - 1

    def finish(self):
        b = b''.join(self.chunks)
        self.j['buffers'][0]['byteLength'] = len(b)
        return b


def main():
    src, dst = sys.argv[1], sys.argv[2]
    j, bin_ = read_glb(src)
    B = Builder(j, bin_)
    mesh_scale = {}
    done = {}
    # positions + normals per mesh
    for mi, mesh in enumerate(j['meshes']):
        prims = mesh['primitives']
        m = 0.0
        for p in prims:
            a = j['accessors'][p['attributes']['POSITION']]
            m = max(m, *[abs(v) for v in a['min'] + a['max']])
        if m == 0:
            m = 1.0
        mesh_scale[mi] = m
        for p in prims:
            p['attributes'].pop('TANGENT', None)
            pa = p['attributes']['POSITION']
            if pa not in done:
                pts = read_accessor(j, bin_, pa)
                data = bytearray()
                for x, y, z in pts:
                    data += struct.pack('<hhhh', *[max(-32767, min(32767, round(v / m * 32767))) for v in (x, y, z)], 0)
                bv = B.add(bytes(data), 8)
                acc = j['accessors'][pa]
                done[pa] = True
                acc.update({'bufferView': bv, 'byteOffset': 0, 'componentType': 5122, 'normalized': True,
                            'min': [max(-1.0, min(1.0, v / m)) for v in acc['min']], 'max': [max(-1.0, min(1.0, v / m)) for v in acc['max']]})
            else:
                assert abs(done_scale[pa] - m) < 1e-9, 'shared position accessor across meshes with different scale'
            done_scale = globals().setdefault('done_scale', {})
            done_scale[pa] = m
            na = p['attributes'].get('NORMAL')
            if na is not None and na not in done:
                ns = read_accessor(j, bin_, na)
                data = bytearray()
                for x, y, z in ns:
                    data += struct.pack('<bbbb', *[max(-127, min(127, round(v * 127))) for v in (x, y, z)], 0)
                bv = B.add(bytes(data), 4)
                acc = j['accessors'][na]
                done[na] = True
                acc.update({'bufferView': bv, 'byteOffset': 0, 'componentType': 5120, 'normalized': True})
                acc.pop('min', None); acc.pop('max', None)
    # compensate on nodes: node.scale *= m, direct children translation / m and scale / m
    for node in j['nodes']:
        if 'mesh' not in node:
            continue
        m = mesh_scale[node['mesh']]
        if 'matrix' in node:
            mat = node.pop('matrix')
            # decompose is overkill: matrix columns 0-2 scaled by m keep rotation/scale, translation unchanged
            for c in range(3):
                for r in range(3):
                    mat[c * 4 + r] *= m
            node['matrix'] = mat
        else:
            s = node.get('scale', [1, 1, 1])
            node['scale'] = [v * m for v in s]
        for ci in node.get('children', []):
            ch = j['nodes'][ci]
            if 'matrix' in ch:
                mat = ch['matrix']
                for k in range(12):
                    mat[k] /= m
                mat[12] /= m; mat[13] /= m; mat[14] /= m
            else:
                ch['translation'] = [v / m for v in ch.get('translation', [0, 0, 0])]
                ch['scale'] = [v / m for v in ch.get('scale', [1, 1, 1])]
    j.setdefault('extensionsUsed', [])
    j.setdefault('extensionsRequired', [])
    for k in ('extensionsUsed', 'extensionsRequired'):
        if 'KHR_mesh_quantization' not in j[k]:
            j[k].append('KHR_mesh_quantization')
    # images become data URIs so loaders never need blob: URLs (sandboxed pages often block them)
    import base64
    for im in j.get('images', []):
        if 'bufferView' in im:
            bv = j['bufferViews'][im['bufferView']]
            data = bin_[bv['byteOffset']: bv['byteOffset'] + bv['byteLength']] if bv['byteOffset'] + bv['byteLength'] <= len(bin_) else b''
            im['uri'] = 'data:%s;base64,%s' % (im.get('mimeType', 'image/png'), base64.b64encode(data).decode('ascii'))
            im.pop('bufferView', None); im.pop('mimeType', None)
    # drop now-unreferenced buffer views by rebuilding the binary compactly
    used = set()
    for a in j['accessors']:
        if 'bufferView' in a:
            used.add(a['bufferView'])
    for im in j.get('images', []):
        if 'bufferView' in im:
            used.add(im['bufferView'])
    full = B.finish()
    newviews, remap, out = [], {}, bytearray()
    for i, bv in enumerate(j['bufferViews']):
        if i not in used:
            continue
        pad = (4 - len(out) % 4) % 4
        out += b'\0' * pad
        data = full[bv['byteOffset']: bv['byteOffset'] + bv['byteLength']]
        nbv = dict(bv); nbv['byteOffset'] = len(out)
        remap[i] = len(newviews); newviews.append(nbv); out += data
    for a in j['accessors']:
        if 'bufferView' in a:
            a['bufferView'] = remap[a['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = remap[im['bufferView']]
    j['bufferViews'] = newviews
    j['buffers'] = [{'byteLength': len(out)}]
    write_glb(dst, j, bytes(out))
    print('quantized %s -> %s: %.1f MB -> %.1f MB' % (src, dst, len(open(src, 'rb').read()) / 1e6, len(open(dst, 'rb').read()) / 1e6))


if __name__ == '__main__':
    main()
