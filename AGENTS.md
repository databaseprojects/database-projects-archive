# Agent instructions

## Run safeguards

1. Before any browser test, check whether Chrome's profile is locked by an earlier session (for example a `SingletonLock` file or a running chrome process). Kill that session or use a fresh temporary `--user-data-dir`. Never start a browser test against a locked profile.
2. Before any merge, check the PR's draft status (`gh pr view --json isDraft`). If it's a draft, mark it ready with `gh pr ready` first. Never attempt to merge a draft PR.

## Ski hill rotations (standing rule from Billy)

3. Whenever any ski hill view is rotated (plan, bird's eye, or back view), every empty corner or gap that opens up must be filled in the same job with genuine DEM elevation data: topo contours and trees, matching the existing style, line weights and tree bands. Do this without being asked. Never leave a rotated view with blank corners, and never invent or hand-draw terrain.
4. What "rotate" means in a bird's-eye (frontal or back) view: turn the terrain about the peak's vertical axis in 3D with the camera locked (same tilt, height, distance, FOV and framing). Never spin the finished image flat in 2D, because that looks like the camera orbiting. Keep every existing run, lift, contour and tree path (no new linework): re-project each point using its real DEM elevation through the turn with the same camera, then fill only the newly exposed edges and corners from genuine DEM data. Plan-view rotations are plain 2D turns.

## Camera shifts (standing rule from Billy)

5. A "camera shift" on a bird's-eye view: change that hill's facing angle in the build script, re-render the bird's-eye from the elevation data with the full four-band tree layer, keep every other element as it is, and open the PR for same-day merge.

## Ski hill build inputs

6. `ski-hills/build-frontal.py` needs two working files per hill: the runs/lifts geometry `<slug>-geom.json` (lon/lat) and the pre-cut elevation `<slug>-dem-wide.tif`. The originals were made on Loops' machine (Billy's Grok Bot box) in its temp folder `/tmp`. They are not in Cloudflare or Google Drive. Copies of all 20 hills' files are committed in `ski-hills/build-inputs/`, and that is where a cloud agent gets them. The script reads `ski-hills/build-inputs/` first and falls back to `/tmp`. Cypress uses `cypress-mountain-geom.json` and `cypress-dem-wide.tif`. Run from the repo root, e.g. `python3 ski-hills/build-frontal.py cypress-mountain`. Commit any new input file to `ski-hills/build-inputs/`.
