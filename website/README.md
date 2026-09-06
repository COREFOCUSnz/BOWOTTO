# Resonance Atlas

A self-contained web app about sound and cymatics — no build step, no framework,
no server required. Plain HTML/CSS/JS.

## The pages

| File           | What it is                                                              |
|----------------|-------------------------------------------------------------------------|
| `index.html`   | Home: live Chladni hero, the physics of sound, cymatics history, the interactive **Chladni Lab** (with real audio tones), glossary. |
| `lessons.html` | The 10-lesson video course, with YouTube embeds.                        |
| `build.html`   | Build-your-own cymatics device: 4 builds with parts lists, steps, troubleshooting, starting frequencies, filming tips, safety. |
| `assets/`      | Shared stylesheet + the Chladni particle engine.                        |

## View it locally

Just open `index.html` in a browser — double-click it, done. Everything works
from a plain file except the YouTube embeds, which some browsers block on
`file://`. For the full experience run a tiny local server from this folder:

```sh
cd website
python3 -m http.server 8000      # then open http://localhost:8000
# or: npx serve
```

## Add your lesson videos

Open `lessons.html` and find the `LESSONS` array (it's clearly marked). For each
lesson, paste the video's YouTube ID into `yt:""` — the ID is the part after
`v=` in the video URL:

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
                               ^^^^^^^^^^^ ← this part
yt:"dQw4w9WgXcQ"
```

Cards with an empty `yt` show a "coming soon" placeholder. Titles and blurbs
live in the same array if you want to match them to your videos.

## Deploy to Firebase Hosting

Everything is pre-configured for the Firebase project
**cymatics---by-corefocus** (`firebase.json` + `.firebaserc`), so there is no
`firebase init` step. One-time setup on your computer:

```sh
npm install -g firebase-tools   # once
firebase login                  # once — opens a browser to sign in
```

Then, from this folder, every deploy is one command:

```sh
cd website
firebase deploy
```

The site goes live at https://cymatics---by-corefocus.web.app (a
`*.firebaseapp.com` twin URL works too). A custom domain can be attached later
in the Firebase console under Hosting → Add custom domain.
