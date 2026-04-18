#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

cookie_file="${1:-}"
if [[ -z "${cookie_file}" ]]; then
  echo "Usage: pnpm run test:browser:xvfb:login:file -- /path/to/cookies.txt" >&2
  exit 1
fi

if [[ ! -f "${cookie_file}" ]]; then
  echo "Cookie file not found: ${cookie_file}" >&2
  exit 1
fi

export LOGIN_COOKIES_TEXT
LOGIN_COOKIES_TEXT="$(cat "${cookie_file}")"

pnpm run test:browser:xvfb:login
