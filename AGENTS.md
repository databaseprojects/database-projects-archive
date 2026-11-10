# Agent instructions

## Run safeguards

1. Before any browser test, check whether Chrome's profile is locked by an earlier session (for example a `SingletonLock` file or a running chrome process). Kill that session or use a fresh temporary `--user-data-dir`. Never start a browser test against a locked profile.
2. Before any merge, check the PR's draft status (`gh pr view --json isDraft`). If it's a draft, mark it ready with `gh pr ready` first. Never attempt to merge a draft PR.

## Ski hill rotations (standing rule from Billy)

3. Whenever any ski hill view is rotated (plan, bird's eye, or back view), every empty corner or gap that opens up must be filled in the same job with genuine DEM elevation data: topo contours and trees, matching the existing style, line weights and tree bands. Do this without being asked. Never leave a rotated view with blank corners, and never invent or hand-draw terrain.
