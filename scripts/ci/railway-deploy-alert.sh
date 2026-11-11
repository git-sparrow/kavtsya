#!/usr/bin/env bash
set -euo pipefail

# Turns one Railway commit status into issue state (#421): one open issue per
# failing service, commented on repeat failures, closed on recovery.
# Env: CONTEXT STATE SHA MESSAGE TARGET_URL GH_TOKEN; optional REPO, GITHUB_RUN_ID.

case "$CONTEXT" in
  "kavtsya - "*) ;;
  *) exit 0 ;;
esac

title="Railway deploy failing: ${CONTEXT#kavtsya - }"
repo_args=()
[ -n "${REPO:-}" ] && repo_args=(--repo "$REPO")

number=$(gh issue list "${repo_args[@]}" --label railway-deploy --state open --limit 200 \
  --json number,title | jq -r --arg t "$title" '[.[] | select(.title == $t)][0].number // empty')

body=$(mktemp)
trap 'rm -f "$body"' EXIT

case "$STATE" in
  failure | error)
    {
      echo "Commit \`${SHA:0:7}\`: ${MESSAGE%%$'\n'*}"
      echo
      echo "[Railway deployment]($TARGET_URL)"
      echo
      echo "Railway keeps build logs for only 7 days on the current plan, so read them now."
      if [ -n "${GITHUB_RUN_ID:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
        echo
        echo "_Posted by [railway-deploy-alert](https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)._"
      fi
    } >"$body"
    if [ -n "$number" ]; then
      gh issue comment "$number" "${repo_args[@]}" --body-file "$body"
    else
      gh issue create "${repo_args[@]}" --title "$title" --label railway-deploy --body-file "$body"
    fi
    ;;
  success)
    if [ -n "$number" ]; then
      echo "Recovered at \`${SHA:0:7}\`." >"$body"
      gh issue comment "$number" "${repo_args[@]}" --body-file "$body"
      gh issue close "$number" "${repo_args[@]}"
    fi
    ;;
esac
