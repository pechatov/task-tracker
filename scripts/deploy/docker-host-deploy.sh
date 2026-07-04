#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_SSH_TARGET:?Set DEPLOY_SSH_TARGET, for example deploy@example.internal}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"
: "${TASK_TRACKER_IMAGE:?Set TASK_TRACKER_IMAGE}"
: "${TASK_TRACKER_TAG:=main}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
COMPOSE=(docker compose --env-file .env -f compose.prod.yaml)

quote() {
  printf "%q" "$1"
}

remote_path="$(quote "$DEPLOY_PATH")"
remote_image="$(quote "$TASK_TRACKER_IMAGE")"
remote_tag="$(quote "$TASK_TRACKER_TAG")"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "mkdir -p $remote_path"
scp "${SSH_OPTS[@]}" compose.prod.yaml "$DEPLOY_SSH_TARGET:$DEPLOY_PATH/compose.prod.yaml"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "cd $remote_path && test -f .env"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "
  docker ps >/dev/null 2>&1 || {
    echo 'Deploy user cannot access the Docker daemon on the deployment host.' >&2
    echo 'Grant Docker socket access or use a root SSH target, then retry.' >&2
    exit 1
  }
"

ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_TARGET" "
  set -e
  cd $remote_path
  TASK_TRACKER_IMAGE=$remote_image TASK_TRACKER_TAG=$remote_tag ${COMPOSE[*]} pull
  TASK_TRACKER_IMAGE=$remote_image TASK_TRACKER_TAG=$remote_tag ${COMPOSE[*]} run --rm app npm run db:migrate
  TASK_TRACKER_IMAGE=$remote_image TASK_TRACKER_TAG=$remote_tag ${COMPOSE[*]} up -d --remove-orphans
  TASK_TRACKER_IMAGE=$remote_image TASK_TRACKER_TAG=$remote_tag ${COMPOSE[*]} ps
"
