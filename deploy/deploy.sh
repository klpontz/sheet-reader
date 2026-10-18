#!/usr/bin/env bash
# Upload the built page and the Apache config to Bluehost.
# Reads BLUEHOST_USER, BLUEHOST_HOST, and BLUEHOST_DOCROOT from deploy/deploy.env.
set -euo pipefail

cd "$(dirname "$0")/.."
source deploy/deploy.env

KEY="$HOME/.ssh/bluehost_kevinrocci"
TARGET="$BLUEHOST_USER@$BLUEHOST_HOST"

npm run build --silent
npx vitest run --reporter=dot

if ! git diff --quiet -- index.html sheeet-reader.html; then
  echo "The build changed index.html. Commit it before you deploy." >&2
  exit 1
fi

scp -i "$KEY" index.html deploy/.htaccess "$TARGET:$BLUEHOST_DOCROOT/"
ssh -i "$KEY" "$TARGET" "chmod 644 '$BLUEHOST_DOCROOT/index.html' '$BLUEHOST_DOCROOT/.htaccess'"

echo "Deployed $(git rev-parse --short HEAD) to $BLUEHOST_DOCROOT."
