#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <full-git-sha>" >&2
  exit 2
fi

release_sha="$1"
deploy_root="${DEPLOY_ROOT:-/opt/lanyard}"
env_file="$deploy_root/shared/production.env"
state_file="$deploy_root/current-release"
previous_state_file="$deploy_root/previous-release"

if [ "$release_sha" = "--rollback" ]; then
  if [ ! -f "$previous_state_file" ]; then
    echo "No previous release is recorded." >&2
    exit 1
  fi

  rollback_sha="$(cat "$previous_state_file")"
  rollback_compose="$deploy_root/releases/$rollback_sha/infra/docker/docker-compose.prod.yml"
  IMAGE_TAG="$rollback_sha" docker compose \
    --env-file "$env_file" \
    -f "$rollback_compose" \
    up -d --remove-orphans --wait --wait-timeout 180
  printf '%s\n' "$rollback_sha" > "$state_file"
  echo "Rolled back to $rollback_sha"
  exit 0
fi

release_dir="$deploy_root/releases/$release_sha"
compose_file="$release_dir/infra/docker/docker-compose.prod.yml"
previous_sha=""

if [ -f "$state_file" ]; then
  previous_sha="$(cat "$state_file")"
fi

if [ ! -f "$env_file" ]; then
  echo "Missing production environment file: $env_file" >&2
  exit 1
fi

rollback() {
  if [ -z "$previous_sha" ] || [ ! -d "$deploy_root/releases/$previous_sha" ]; then
    echo "Deployment failed and no previous release is available." >&2
    return
  fi

  echo "Rolling back to $previous_sha"
  IMAGE_TAG="$previous_sha" docker compose \
    --env-file "$env_file" \
    -f "$deploy_root/releases/$previous_sha/infra/docker/docker-compose.prod.yml" \
    up -d --remove-orphans --wait --wait-timeout 180
  printf '%s\n' "$previous_sha" > "$state_file"
}

trap rollback INT TERM HUP

if [ ! -f "$compose_file" ]; then
  echo "Missing release compose file: $compose_file" >&2
  exit 1
fi

IMAGE_TAG="$release_sha" docker compose --env-file "$env_file" -f "$compose_file" config --quiet
IMAGE_TAG="$release_sha" docker compose --env-file "$env_file" -f "$compose_file" pull

if ! IMAGE_TAG="$release_sha" docker compose \
  --env-file "$env_file" \
  -f "$compose_file" \
  up -d --remove-orphans --wait --wait-timeout 180; then
  rollback
  exit 1
fi

if ! IMAGE_TAG="$release_sha" docker compose \
  --env-file "$env_file" \
  -f "$compose_file" \
  exec -T api node -e \
  "fetch('http://localhost:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  rollback
  exit 1
fi

if [ -n "$previous_sha" ] && [ "$previous_sha" != "$release_sha" ]; then
  printf '%s\n' "$previous_sha" > "$previous_state_file"
fi
printf '%s\n' "$release_sha" > "$state_file"
echo "Deployed $release_sha"
