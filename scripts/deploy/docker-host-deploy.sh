#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_SSH_TARGET:?Set DEPLOY_SSH_TARGET, for example deploy@example.internal}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"
: "${TASK_TRACKER_IMAGE:?Set TASK_TRACKER_IMAGE}"
: "${TASK_TRACKER_TAG:=main}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)

quote() {
  printf "%q" "$1"
}

remote_path="$(quote "$DEPLOY_PATH")"
remote_image="$(quote "$TASK_TRACKER_IMAGE")"
remote_tag="$(quote "$TASK_TRACKER_TAG")"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "mkdir -p $remote_path"
scp "${SSH_OPTS[@]}" compose.prod.yaml "$DEPLOY_SSH_TARGET:$DEPLOY_PATH/compose.prod.yaml"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "cd $remote_path && test -f .env"
# Prefer direct socket access. If the deploy user is not in the docker group
# (TrueNAS regenerates /etc/group on boot and drops manual memberships), fall
# back to passwordless sudo.
docker_prefix="$(
  ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "
    if docker ps >/dev/null 2>&1; then
      echo direct
    elif sudo -n docker ps >/dev/null 2>&1; then
      echo sudo
    else
      echo none
    fi
  "
)"

case "$docker_prefix" in
  direct) remote_sudo="" ;;
  sudo)
    echo "Docker socket is not accessible directly; using sudo -n." >&2
    remote_sudo="sudo -n"
    ;;
  *)
    echo "Deploy user cannot access the Docker daemon on the deployment host." >&2
    echo "Grant Docker socket access, passwordless sudo, or use a root SSH target, then retry." >&2
    exit 1
    ;;
esac

# `env` passes the image variables through sudo, which resets the environment.
compose="$remote_sudo env TASK_TRACKER_IMAGE=$remote_image TASK_TRACKER_TAG=$remote_tag docker compose --env-file .env -f compose.prod.yaml"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "
  set -e
  cd $remote_path
  $compose pull
  $compose run --rm app npm run db:migrate
  $compose up -d --remove-orphans
  $compose ps
"
