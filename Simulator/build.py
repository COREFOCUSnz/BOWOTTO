#!/usr/bin/env python3
"""Bundle the simulator into single self-contained HTML files.

    python3 Simulator/build.py            embeds models/revuelto.glb when present
    python3 Simulator/build.py --no-model  procedural car only (small file)

writes  Simulator/dist/revuelto.html           full page (open it directly in a browser)
        Simulator/dist/revuelto.artifact.html  body fragment used for claude.ai Artifact publishing
        Simulator/dist/hosting/                index.html + revuelto.glb + poster.webm for Firebase Hosting / any static host
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
    # the COREZ clips: poster.* (the intro, banner only) and poster2.* (the main one, banner and board). Video wins over a still.
    MIMES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "webm": "video/webm", "mp4": "video/mp4"}
    def pick(stem):
        qs = sorted([q for q in glob.glob(os.path.join(HERE, "models", stem + ".*")) if q.rsplit(".", 1)[-1].lower() in MIMES], key=lambda q: 0 if q.lower().endswith((".webm", ".mp4")) else 1)
        return qs[0] if qs else None
    posters = [(pick("poster"), ""), (pick("poster2"), "2")]
    ptags = ""
    for path, suffix in posters:
        if not path:
            continue
        ext = path.rsplit(".", 1)[1].lower()
        with open(path, "rb") as f:
            pb64 = base64.b64encode(f.read()).decode("ascii")
        if ext in ("webm", "mp4"):
            ptags += '<video id="revuelto-poster-video%s" hidden muted loop playsinline preload="auto" src="data:%s;base64,%s"></video>\n' % (suffix, MIMES[ext], pb64)
        else:
            ptags += '<img id="revuelto-poster%s" hidden alt="" src="data:%s;base64,%s">\n' % (suffix, MIMES[ext], pb64)
        print("embedded poster%s %s (%d KB)" % (suffix, os.path.basename(path), len(pb64) // 1024))
    # bird's-eye previews (Tools: scratch prev.js) and the loading-car strip, small WebPs: inline here, files on the host
    prevs = sorted(glob.glob(os.path.join(HERE, "previews", "*.webp")))
    ptot = 0
    for q in prevs:
        stem = os.path.basename(q)[:-5]
        with open(q, "rb") as f:
            b = base64.b64encode(f.read()).decode("ascii")
        ptot += len(b)
        ptags += '<img id="%s" hidden alt="" src="data:image/webp;base64,%s">\n' % ("carspin" if stem == "carspin" else "carspin-tron" if stem == "carspin_tron" else "prev-" + stem, b)
    if prevs:
        print("embedded %d previews (%d KB)" % (len(prevs), ptot // 1024))
    rooms = [os.path.join(HERE, "models", r + ".glb") for r in ("studio", "showroom", "wing")]   # garage rooms and the GT wing, small GLBs
    for room in rooms:
        if os.path.exists(room):
            with open(room, "rb") as f:
                sb64 = base64.b64encode(f.read()).decode("ascii")
            stem = os.path.basename(room)[:-4]
            ptags += '<script id="%s-glb" type="application/octet-stream">' % stem + sb64 + "</script>\n"
            print("embedded models/%s.glb (%d KB base64)" % (stem, len(sb64) // 1024))
    if ptags:
        full = full.replace("<div id=\"app\">", ptags + "<div id=\"app\">", 1)
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "revuelto.html"), "w", encoding="utf-8") as f:
        f.write(full)
    # hosting build (Firebase Hosting, GitHub Pages, any static host): the page as index.html with the model and the
    # poster clip as separate cached files instead of inline text
    import shutil
    host = os.path.join(DIST, "hosting")
    os.makedirs(host, exist_ok=True)
    hpage = inline(src)
    # Firebase on the hosted page only: the reserved URLs serve the SDK and the project's own config, so nothing is pasted
    # in. The single-file page and the artifact never get these and stay local-save-only (the game says so).
    FB = ('<script src="/__/firebase/10.12.0/firebase-app-compat.js"></script>\n'
          '<script src="/__/firebase/10.12.0/firebase-auth-compat.js"></script>\n'
          '<script src="/__/firebase/10.12.0/firebase-firestore-compat.js"></script>\n'
          '<script src="/__/firebase/init.js"></script>\n')
    marker = "<script>\n/* REVUELTO SIM"
    assert hpage.count(marker) == 1, "sim.js marker not found once in the hosting page"
    hpage = hpage.replace(marker, FB + marker, 1)
    if os.path.exists(model):
        # the hosted site gets a heavier-but-faster build of the main car when one exists: 853 draw calls merged
        # down to 64 (scratchpad/studio/mergecar.html), ~4 MB bigger, which is the trade phones actually want; the
        # embedded single-file/artifact page keeps the original small one so it still fits the 16 MiB artifact cap
        hosted_car = os.path.join(HERE, "models", "revuelto_hosted.glb")
        shutil.copyfile(hosted_car if os.path.exists(hosted_car) else model, os.path.join(host, "revuelto.glb"))
    for room in rooms:
        if os.path.exists(room):
            shutil.copyfile(room, os.path.join(host, os.path.basename(room)))
    for extra in glob.glob(os.path.join(HERE, "models", "*.glb")):   # other cars: hosted only, never inlined
        stem = os.path.basename(extra)[:-4]
        if stem in ("revuelto", "studio", "showroom", "wing") or stem.endswith("_src") or stem.startswith("revuelto"):
            continue
        shutil.copyfile(extra, os.path.join(host, stem + ".glb"))
        print("hosted car %s.glb (%d KB)" % (stem, os.path.getsize(extra) // 1024))
    htags = ""
    for path, suffix in posters:
        if not path:
            continue
        ext = path.rsplit(".", 1)[1].lower()
        shutil.copyfile(path, os.path.join(host, "poster%s.%s" % (suffix, ext)))
        if ext in ("webm", "mp4"):
            htags += '<video id="revuelto-poster-video%s" hidden muted loop playsinline preload="auto" src="poster%s.%s"></video>\n' % (suffix, suffix, ext)
        else:
            htags += '<img id="revuelto-poster%s" hidden alt="" src="poster%s.%s">\n' % (suffix, suffix, ext)
    if prevs:
        os.makedirs(os.path.join(host, "previews"), exist_ok=True)
        for q in prevs:
            stem = os.path.basename(q)[:-5]
            shutil.copyfile(q, os.path.join(host, "previews", stem + ".webp"))
            htags += '<img id="%s" hidden alt="" src="previews/%s.webp">\n' % ("carspin" if stem == "carspin" else "carspin-tron" if stem == "carspin_tron" else "prev-" + stem, stem)
    if htags:
        hpage = hpage.replace("<div id=\"app\">", htags + "<div id=\"app\">", 1)
    with open(os.path.join(host, "index.html"), "w", encoding="utf-8") as f:
        f.write(hpage)
    print("wrote %s (index.html %d KB + revuelto.glb + poster)" % (host, len(hpage.encode()) // 1024))
    head = re.search(r"<head>(.*?)</head>", full, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", full, re.S).group(1)
    # the artifact has a 16 MiB cap: it drops the intro clip (poster, banner only; the game falls back to the main clip)
    body = re.sub(r'<video id="revuelto-poster-video" [^>]*></video>\n', "", body, count=1)
    body = re.sub(r'<img id="revuelto-poster" [^>]*>\n', "", body, count=1)
    keep = [line for line in head.splitlines() if not line.strip().startswith("<meta")]
    frag = "\n".join(keep).strip() + "\n" + body.strip() + "\n"
    with open(os.path.join(DIST, "revuelto.artifact.html"), "w", encoding="utf-8") as f:
        f.write(frag)
    print("wrote", DIST, "(%d KB full)" % (len(full.encode()) // 1024))


if __name__ == "__main__":
    main()
