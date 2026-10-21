#!/usr/bin/env bash
# Deletes the generated Next.js build folders of the two cab e2e suites, and nothing else.
# The paths are fixed below; the script takes no arguments and refuses any.
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "clean-e2e.sh takes no arguments." >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
for name in .next-e2e-login .next-e2e-cabs; do
  target="$root/$name"
  # Must be exactly <repo>/<name>, a real directory (not a symlink), and inside the repo.
  if [ -L "$target" ]; then echo "refusing: $name is a symlink" >&2; exit 1; fi
  if [ -d "$target" ]; then
    case "$target" in
      "$root/.next-e2e-login"|"$root/.next-e2e-cabs") rm -rf -- "$target"; echo "removed $name" ;;
      *) echo "refusing: unexpected path" >&2; exit 1 ;;
    esac
  fi
done
