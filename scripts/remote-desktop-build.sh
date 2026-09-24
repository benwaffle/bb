#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/remote-desktop-build.sh [ref]

Builds the bb-app runtime (turbo run build --filter=bb-app) on a Linux build
host, copies packages/bb-app/{dist,app,server,host-daemon} back, and runs the
mac-arm64 electron-builder packaging step locally. ref defaults to HEAD and
must be the commit checked out locally, with no tracked changes.

environment:
  BB_REMOTE_BUILD_HOST         ssh host (default graphenebuilder)
  BB_REMOTE_BUILD_DIR          checkout on the host, relative to its home
                               (default dev/bb-desktop-build)
  BB_REMOTE_BUILD_SSH          ssh command (default ssh.sh)
  BB_REMOTE_BUILD_CONCURRENCY  turbo concurrency on the host (default: host cores - 1)
EOF
  exit 2
}

log() {
  printf '[remote-desktop-build %4ss] %s\n' "$SECONDS" "$*" >&2
}

fail() {
  printf 'remote-desktop-build: %s\n' "$*" >&2
  exit 1
}

[ "$#" -le 1 ] || usage
case "${1:-}" in -h | --help) usage ;; esac

ref=${1:-HEAD}
host=${BB_REMOTE_BUILD_HOST:-graphenebuilder}
remote_dir=${BB_REMOTE_BUILD_DIR:-dev/bb-desktop-build}
ssh_command=${BB_REMOTE_BUILD_SSH:-ssh.sh}
runtime_dirs=(dist app server host-daemon)

repo_root=$(git rev-parse --show-toplevel)
commit=$(git -C "$repo_root" rev-parse --verify "$ref^{commit}")
[ "$commit" = "$(git -C "$repo_root" rev-parse HEAD)" ] ||
  fail "$ref is $commit but the checkout is at $(git -C "$repo_root" rev-parse HEAD); packaging runs from the local checkout"
git -C "$repo_root" diff --quiet HEAD -- ||
  fail "tracked files differ from $commit; commit or discard them first"
[ -x "$repo_root/node_modules/.bin/turbo" ] ||
  fail "run pnpm install in $repo_root first"

package_script=$(node -p "require('$repo_root/apps/desktop/package.json').scripts.package")
runtime_prefix='pnpm run prepare-runtime && '
case "$package_script" in
  "$runtime_prefix"*) local_package_script=${package_script#"$runtime_prefix"} ;;
  *) fail "apps/desktop package script no longer starts with '$runtime_prefix': $package_script" ;;
esac

remote() {
  "$ssh_command" "$host" "$@"
}

log "building $commit on $host:$remote_dir"
origin_url=$(git -C "$repo_root" remote get-url origin)
remote "test -d $remote_dir/.git || git clone -q --no-checkout $origin_url $remote_dir"

log "sending $commit"
GIT_SSH_COMMAND=$ssh_command git -C "$repo_root" push -q --force \
  "$host:$remote_dir" "$commit:refs/heads/remote-desktop-build"

log "building runtime on $host"
remote "set -e
cd $remote_dir
git checkout -q --detach -f $commit
git clean -q -fdx -e node_modules -e .turbo
export CI=1 PATH=\$PWD/node_modules/.bin:\$PATH
concurrency=${BB_REMOTE_BUILD_CONCURRENCY:-\$(( \$(nproc) - 1 ))}
nice -n 10 pnpm install --no-frozen-lockfile --reporter=append-only
git checkout -q -- pnpm-lock.yaml
nice -n 10 turbo run build --filter=bb-app --concurrency=\$concurrency --output-logs=new-only"

log "copying runtime artifacts back"
for dir in "${runtime_dirs[@]}"; do
  rsync -a --delete -e "$ssh_command" \
    "$host:$remote_dir/packages/bb-app/$dir/" \
    "$repo_root/packages/bb-app/$dir/"
done

log "packaging locally: $local_package_script"
cd "$repo_root/apps/desktop"
PATH="$repo_root/node_modules/.bin:$PATH" nice -n 10 bash -c "$local_package_script"

log "done: $repo_root/apps/desktop/release/mac-arm64/bb.app"
