#!/usr/bin/env bash
# Boot RollPOS on the organization "pos" custom sandbox.
# Vite serves the production frontend on :3000. Data stays in browser IndexedDB.
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.bun/bin:${PATH}"
mkdir -p "${HOME}/.local/bin" "${HOME}/repos"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  ln -sfn "${HOME}/.bun/bin/bun" "${HOME}/.local/bin/bun"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to clone rollpos" >&2
  exit 1
fi

REPO="${HOME}/repos/rollpos"
if [ ! -d "${REPO}/.git" ]; then
  git clone --depth 1 https://github.com/rizrmd/rollpos.git "${REPO}"
else
  git -C "${REPO}" fetch --prune origin
  git -C "${REPO}" checkout main
  git -C "${REPO}" fetch origin main
  git -C "${REPO}" merge --ff-only FETCH_HEAD
fi

cd "${REPO}/frontend"
bun install --frozen-lockfile
bun run build
exec bun run preview -- --host 0.0.0.0 --port 3000
