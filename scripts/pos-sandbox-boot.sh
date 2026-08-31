#!/usr/bin/env bash
# Boot the RollPOS frontend on the organization "pos" custom sandbox.
# Serves the production Vite preview on :3000 (pos-rollnbrew.fural.space).
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
  git -C "${REPO}" pull --ff-only origin main
fi

cd "${REPO}/frontend"
bun install --frozen-lockfile
bun run build
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL wajib tersedia untuk inventory API" >&2
  exit 1
fi
bun run db:migrate
bun run db:seed
export NODE_ENV=production PORT=3000
exec bun run start
