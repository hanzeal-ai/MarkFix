#!/usr/bin/env bash
set -Eeuo pipefail
: "${GITHUB_SHA:?Set source commit}"
: "${GITHUB_OUTPUT:?Set workflow output file}"
: "${IMAGE_ARCHIVE_DIR:?Set image archive directory}"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid source commit' >&2; exit 1; }
registry=crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix
for component in api dashboard; do
  docker load --input "$IMAGE_ARCHIVE_DIR/markfix-$component.tar"
  repository="$registry/markfix-$component"
  tag="$repository:$GITHUB_SHA"
  docker image inspect "$tag" > /dev/null
  docker push "$tag"
  digest=$(docker image inspect "$tag" --format '{{index .RepoDigests 0}}')
  [[ "$digest" =~ ^crpi-c94ukgtq3wrezdx5\.cn-hangzhou\.personal\.cr\.aliyuncs\.com/markfix/markfix-$component@sha256:[a-f0-9]{64}$ ]] || {
    echo "Invalid published digest for $component" >&2
    exit 1
  }
  printf '%s_image=%s\n' "$component" "$digest" >> "$GITHUB_OUTPUT"
done
