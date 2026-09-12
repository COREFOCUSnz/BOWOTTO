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

## If the console says 404

`console.firebase.google.com/project/<id>/overview` returning 404 means the
Google account you are signed into cannot see a project with that id. Almost
always one of three things:

- **Signed into the wrong account.** Browsers default to whichever Google
  account signed in first. Check the avatar top right, or open the bare console
  at <https://console.firebase.google.com/> and see which projects are listed.
- **The project was deleted.** Deleted projects sit in a 30-day recovery window:
  <https://console.cloud.google.com/cloud-resource-manager> → *Resources pending
  deletion* → Restore.
- **The id is not what you think.** Firebase appends a random suffix when the
  name you picked is taken, so the id is often not the name you typed.

The quickest way to settle it is from a terminal rather than the console UI —
this lists every project the signed-in account can see:

```sh
npx firebase-tools login
npx firebase-tools projects:list
```

Whatever id comes back has to match `game/.firebaserc`. That file is the single
source of truth: the CLI reads it, and the GitHub workflow reads it from there
too, so changing it in one place is enough.

```json
{ "projects": { "default": "your-project-id" } }
```

If the project is genuinely gone, making a new one is fine — nothing in the game
depends on the old one. Create it, put its id in `.firebaserc`, and deploy.

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
- Name: `FIREBASE_SERVICE_ACCOUNT_2FORT`
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

## Online play (letting friends join the same match)

Hosting alone gives everyone who opens the link their own separate game
against bots. To let a group of friends share one match — same map, same
flags, one scoreboard — the game also optionally uses **Firebase Realtime
Database** (`js/net.js`), with anonymous sign-in so players can be told apart
without an account system. This is the "web config" case from the top of this
file: the `apiKey` and friends that end up in `firebase-config.js` are public
by design, not a secret, and Security Rules (`database.rules.json`) are what
actually protects the data — see the first section of this file if that
distinction is still unclear.

**`./publish.sh` tries to set this up for you, automatically, every time it
deploys.** It looks for a web app on the project (creating one if needed),
reads its SDK config, and if that config has a `databaseURL` it writes
`firebase-config.js` and deploys `database.rules.json`. All of this is
best-effort and never blocks the actual hosting deploy — if any of it fails,
online play simply stays off (the menu says so) and everything else about the
game is unaffected.

Two things it cannot do for you, because they are one-time interactive
choices Firebase asks for in the console the first time a project uses them:

1. **Enable Realtime Database** — pick any region, it does not matter for
   this game:
   `https://console.firebase.google.com/project/<id>/database`
2. **Enable Anonymous authentication** — Authentication → Sign-in method →
   Anonymous → Enable:
   `https://console.firebase.google.com/project/<id>/authentication/providers`

Do both once, then run `./publish.sh` again so it can pick up the database URL
and deploy the rules. After that, every future deploy keeps it working
automatically.

**What online play actually does:** each client fully simulates its own
player locally (same code as against bots) and publishes its position,
aim, health, weapon and animation state a few times a second; everyone else's
players are pose-driven from those snapshots and smoothly interpolated, never
locally simulated. Whoever currently has the lowest player id in the room is
the "host" for shared state (score, round timer) — this is recomputed from
who's present, never stored, so there is nothing to hand off when someone
leaves. Damage always stays authoritative on the target's own client: hitting
someone sends them a damage event rather than changing their health directly,
the same way a real multiplayer game has to avoid one player's game state
overriding another's.

**v1 limitations, honestly:**

- **Bots and sentries are disabled in an online room.** Bot AI and sentry
  targeting were never designed to run once per room rather than once per
  player; that's future work, not a fundamental blocker.
- **Only rockets, pipes, pipebombs and incendiary shots get a "ghost"
  explosion** — a cosmetic-only replica so you can see and hear other
  players' attacks land. Hand-thrown grenades don't yet.
- **Smoothing is simple exponential interpolation toward the latest snapshot,
  not full snapshot-buffered interpolation with a delay buffer.** It looks
  fine on a normal home connection between a few friends; it is not going to
  feel like a AAA shooter's netcode, and a spike in latency will show as a
  visible little stutter or skip on remote players rather than a perfectly
  smoothed delay.
- **This sandbox cannot reach Firebase or Google at all**, so the online
  feature has only ever been tested against fakes and stubs (`test/net.test.js`,
  `test/multiplayer.test.js`) — never two real browsers talking through a real
  Firebase project. The first real deploy with this set up is the first real
  test of that specific path. If something looks wrong the first time a
  friend joins, that is expected territory to debug, not a sign the whole
  approach is broken.
- The Realtime Database rules (`database.rules.json`) are written for a
  private match among friends, not a public leaderboard: any signed-in
  (anonymous) user can write `hits`, `shots` and `state` for a room they know
  the code to. That's an intentional trade-off for "no backend code at all",
  not an oversight — don't reuse this project for anything where a
  participant misbehaving would actually matter.
