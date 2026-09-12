#!/usr/bin/env bash
# Put the game online. One command, start to finish.
#
#   ./publish.sh            deploy to the real site
#   ./publish.sh preview    deploy to a temporary URL that expires in 7 days
#
# Handles the bits that usually go wrong: not logged in, the project in
# .firebaserc not existing or belonging to a different Google account, and the
# firebase CLI not being installed. Nothing is installed globally — npx fetches
# the CLI on demand.
set -euo pipefail

cd "$(dirname "$0")"

CHANNEL="${1:-live}"
FB="npx -y firebase-tools@13"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is not installed. Get it from https://nodejs.org and run this again."

# ---- 1. signed in? --------------------------------------------------------
say "Checking your Firebase login..."
if ! $FB login:list 2>/dev/null | grep -qi "logged in"; then
  say "Opening a browser so you can sign in to Google."
  echo "Pick the account that owns your Firebase project."
  $FB login || die "Login did not complete. Run ./publish.sh again."
fi
WHO=$($FB login:list 2>/dev/null | grep -io "logged in as .*" | head -1 | cut -d" " -f4-)
[ -n "$WHO" ] && echo "Signed in as $WHO"

# ---- 2. does the project exist, and can this account see it? --------------
WANT=$(node -p "JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default" 2>/dev/null || echo "")
[ -n "$WANT" ] || die "No default project in .firebaserc"

say "Looking for project '$WANT'..."
LIST=$($FB projects:list 2>/dev/null || true)

if printf '%s' "$LIST" | grep -q "\\b${WANT}\\b"; then
  echo "Found it."
else
  printf '\n\033[33mThis account cannot see a project called "%s".\033[0m\n' "$WANT"
  echo "That usually means one of: you are signed in as the wrong Google account,"
  echo "the project was deleted, or its id was never quite what you thought."
  echo
  echo "Projects this account CAN see:"
  printf '%s\n' "$LIST" \
    | sed -n 's/^│ *\([^│]*[^│ ]\) *│ *\([a-z0-9][a-z0-9-]*\) *│.*/  \2   (\1)/p' | sort -u || true
  echo
  read -r -p "Type a project id from that list to use it, or press Enter to create a new one: " PICK

  if [ -n "$PICK" ]; then
    WANT="$PICK"
  else
    SUGGEST="two-fort-$(node -p "Math.random().toString(36).slice(2,7)")"
    read -r -p "New project id [$SUGGEST]: " NEWID
    WANT="${NEWID:-$SUGGEST}"
    say "Creating project '$WANT'..."
    $FB projects:create "$WANT" --display-name "2Fort" \
      || die "Could not create '$WANT'. Project ids are globally unique, so try a different one."
  fi

  node -e "
    const fs = require('fs');
    fs.writeFileSync('.firebaserc', JSON.stringify({ projects: { default: '$WANT' } }, null, 2) + '\n');
  "
  echo "Wrote .firebaserc -> $WANT"
fi

# ---- 3. make sure Hosting is switched on for it ---------------------------
say "Making sure Hosting is set up..."
$FB hosting:sites:list --project "$WANT" >/dev/null 2>&1 \
  || $FB apps:create WEB "2Fort" --project "$WANT" >/dev/null 2>&1 \
  || true

# ---- 4. deploy ------------------------------------------------------------
if [ "$CHANNEL" = "preview" ]; then
  say "Deploying to a temporary preview URL..."
  $FB hosting:channel:deploy preview --expires 7d --project "$WANT"
else
  say "Deploying to the live site..."
  $FB deploy --only hosting --project "$WANT"
  printf '\n\033[32mDone. Send your friends:\033[0m  https://%s.web.app\n\n' "$WANT"
fi
