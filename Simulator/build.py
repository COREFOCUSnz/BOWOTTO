#!/usr/bin/env python3
"""Bundle the simulator into single self-contained HTML files.

    python3 Simulator/build.py

writes  Simulator/dist/revuelto.html           full page (open it directly in a browser)
        Simulator/dist/revuelto.artifact.html  body fragment used for claude.ai Artifact publishing
"""
import os
import re

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
