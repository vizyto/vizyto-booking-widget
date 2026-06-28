#!/usr/bin/env bash
# Tag a release of the widget. Pushing the v* tag triggers the GitHub Actions
# deploy (Cloudflare). Usage: scripts/release.sh [X.Y.Z]  (omit to bump patch).
set -euo pipefail

V="${1:-}"

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || { echo "✗ Wydawaj z gałęzi 'main' (jesteś na: $branch)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "✗ Niezacommitowane zmiany — najpierw commit/clean."; exit 1; }

git fetch --tags --quiet

if [ -z "$V" ]; then
  last=$(git tag --list 'v*' --sort=-v:refname | head -1 || true)
  if [ -z "$last" ]; then
    V="1.0.0"
  else
    IFS=. read -r MA MI PA <<< "${last#v}"
    V="$MA.$MI.$((PA + 1))"
  fi
fi
V="${V#v}"
tag="v$V"

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "✗ Tag $tag już istnieje."; exit 1
fi

# Keep package.json version in sync with the tag (commit only if it changed).
node -e "const f='package.json',p=require('./'+f);p.version='$V';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
if ! git diff --quiet -- package.json; then
  git add package.json
  git commit -m "release: $tag" >/dev/null
  git push origin main --quiet
fi

git tag -a "$tag" -m "$tag"
git push origin "$tag" --quiet

echo "✓ $tag wypchnięty. CI buduje i publikuje → https://widget.vizyto.com/v1/widget.js"
echo "  Podgląd: gh run watch -R vizyto/vizyto-booking-widget"
