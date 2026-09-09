#!/usr/bin/env python3
"""Bundle the simulator into single self-contained HTML files.

    python3 Simulator/build.py            embeds models/revuelto.glb when present
    python3 Simulator/build.py --no-model  procedural car only (small file)

writes  Simulator/dist/revuelto.html           full page (open it directly in a browser)
        Simulator/dist/revuelto.artifact.html  body fragment used for claude.ai Artifact publishing
"""
import base64
import os
import re
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")


def read(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as f:
        return f.read()


def inline(html):
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + read(m.group(1)) + "\n</style>", html)
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + read(m.group(1)) + "\n</script>", html)
    return html


def main():
    src = read("index.html")
    full = inline(src)
    model = os.path.join(HERE, "models", "revuelto.glb")
    if "--no-model" not in sys.argv and os.path.exists(model):
        with open(model, "rb") as f:
            raw = f.read()
        b64 = base64.b64encode(zlib.compress(raw, 9)).decode("ascii")
        tag = '<script id="revuelto-glb" type="application/octet-stream">' + b64 + "</script>\n"
        full = full.replace('<script src="vendor/three.min.js">', tag + '<script src="vendor/three.min.js">', 1) if 'vendor/three.min.js' in full else full.replace("<script>", tag + "<script>", 1)
        print("embedded models/revuelto.glb (%d KB raw -> %d KB base64 deflate)" % (len(raw) // 1024, len(b64) // 1024))
    import glob
    # the COREZ board: a video loop (poster.webm / poster.mp4) wins over a still (poster.png / jpg / webp)
    MIMES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "webm": "video/webm", "mp4": "video/mp4"}
    posters = sorted([q for q in glob.glob(os.path.join(HERE, "models", "poster.*")) if q.rsplit(".", 1)[-1].lower() in MIMES], key=lambda q: 0 if q.lower().endswith((".webm", ".mp4")) else 1)
    if posters:
        ext = posters[0].rsplit(".", 1)[1].lower()
        with open(posters[0], "rb") as f:
            pb64 = base64.b64encode(f.read()).decode("ascii")
        if ext in ("webm", "mp4"):
            ptag = '<video id="revuelto-poster-video" hidden muted loop playsinline preload="auto" src="data:%s;base64,%s"></video>\n' % (MIMES[ext], pb64)
        else:
            ptag = '<img id="revuelto-poster" hidden alt="" src="data:%s;base64,%s">\n' % (MIMES[ext], pb64)
        full = full.replace("<div id=\"app\">", ptag + "<div id=\"app\">", 1)
        print("embedded poster %s (%d KB)" % (os.path.basename(posters[0]), len(pb64) // 1024))
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "revuelto.html"), "w", encoding="utf-8") as f:
        f.write(full)
    head = re.search(r"<head>(.*?)</head>", full, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", full, re.S).group(1)
    keep = [line for line in head.splitlines() if not line.strip().startswith("<meta")]
    frag = "\n".join(keep).strip() + "\n" + body.strip() + "\n"
    with open(os.path.join(DIST, "revuelto.artifact.html"), "w", encoding="utf-8") as f:
        f.write(frag)
    print("wrote", DIST, "(%d KB full)" % (len(full.encode()) // 1024))


if __name__ == "__main__":
    main()
