#!/usr/bin/env python3
"""Strip the document wrapper from index.html for hosts that supply their own
(<title> + <style> + body content + scripts). Usage: build-artifact.py OUT.html"""
import re, sys, pathlib
src = (pathlib.Path(__file__).resolve().parent.parent / 'index.html').read_text()
title = re.search(r'<title>(.*?)</title>', src, re.S).group(1)
style = re.search(r'<style>.*?</style>', src, re.S).group(0)
body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
out = f"<title>{title}</title>\n{style}\n{body}\n"
pathlib.Path(sys.argv[1]).write_text(out)
print(f"wrote {sys.argv[1]} ({len(out)} bytes)")
