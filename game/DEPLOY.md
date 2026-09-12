# Putting the game online

## First: which key do you actually have?

Firebase hands out two completely different things and people call both of them
"the key". What you do with them is opposite, so it is worth thirty seconds to
check which one is in your clipboard.

**The web app config** — looks like this, and starts with `AIza`:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "team-fort-4925a.firebaseapp.com",
  projectId: "team-fort-4925a",
  ...
};
```

This is **not a secret**. It is meant to be public, it ships inside the page, and
anyone who opens the site can read it in two clicks. It identifies your project;
it does not authorise anything. Putting it in a repository secret achieves
nothing, because it ends up in the browser either way. What actually protects
your data is **Firebase Security Rules**, plus API key restrictions in the Google
Cloud console. If you want to lock it down, do it there.

**A service account JSON** — a file, several lines long, containing
`"type": "service_account"` and a `"private_key"` block. This one **is** a
secret. It is what lets a machine deploy on your behalf, and it belongs in a
repository secret and nowhere else. Never paste it into a chat, an issue, a
commit, or a file in this repo.

If you have already pasted a service account key anywhere it might be read,
delete that key in the Google Cloud console and make a new one. Rotating takes a
minute; a leaked one does not expire on its own.

---

## Deploying by hand

Simplest, and worth doing once so you know it works:

```sh
cd game
npx firebase-tools login          # opens a browser
npx firebase-tools deploy --only hosting
```

That prints the live URL — `https://team-fort-4925a.web.app`.

To try it without touching the real site:

```sh
npx firebase-tools hosting:channel:deploy preview --expires 7d
```

That gives a temporary URL that expires on its own. Good for sending to one
person before you send it to everyone.

---

## Deploying from GitHub

`.github/workflows/deploy-game.yml` does the same thing from the Actions tab. It
needs one repository secret.

**1. Make a service account key**

- Firebase console → the gear icon → **Project settings** → **Service accounts**
- **Generate new private key** → it downloads a `.json` file
- Treat that file the way you would treat a password

**2. Put it in the repository secret**

- GitHub → your repo → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**
- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: the **entire contents** of the JSON file, pasted in, braces and all
- **Add secret**

Do this yourself in the browser. Nobody else needs to see the file, and once
saved GitHub will not show it again — which is the point.

**3. Run it**

- GitHub → **Actions** → **Deploy game** → **Run workflow**
- Pick `preview` to get a temporary URL, or `live` to publish for real

The workflow checks the secret before it does anything and fails with a clear
message if what you pasted is the web `apiKey` rather than a service account, so
the most likely mix-up gets caught immediately instead of failing later with
something cryptic.

It is set to manual on purpose. If you would rather every push publish itself,
uncomment the `push:` block at the top of the workflow — just be aware that then
anything merged goes straight to the live site.

---

## If you want the game to USE Firebase

Hosting only serves files; it does not need any key in the page. If you want
features that talk to Firebase — a leaderboard, saved settings, accounts — then
you want the **web config** (the public one), and it goes in the page:

```html
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  const app = initializeApp({ apiKey: "AIza...", projectId: "team-fort-4925a", /* ... */ });
</script>
```

Being public is fine and expected. Before you ship anything that writes data,
though, set Security Rules — the default "test mode" rules let anyone on the
internet read and write your whole database, and they expire after 30 days,
which tends to be discovered at the worst possible moment.

Nothing in the game currently talks to Firebase; it is entirely client-side and
works from a file:// URL. So none of this is needed just to let your friends
play — that is only the hosting step above.
