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

6. Before building a hill, run the setup script with the hill's name (`python3 ski-hills/setup-build-inputs.py <slug>`). It gathers the runs and lifts, elevation, forest map and canopy files from the cache. Use those cached files as they are. When the script fetches a new hill from the original sources, list the new files in the pull request so Loops can add them to the cache.

When a hill's area grows or a new hill is added, save the new files once to `/workspace/ski-cache/<slug>/` and to the R2 bucket under `build-inputs/<slug>/`. See `ski-hills/build-inputs.md`.

## Filling missing trees (standing rule from Billy)

7. "Fill in missing trees" (or "fill in the missing trees") on a ski hill view, bird's-eye or plan: find every part of that view where the tree layer stops short or is incomplete, widen that hill's elevation, forest map and canopy coverage (the DEM_PAD entry in `ski-hills/build-frontal.py`, then re-run the setup script and the tree overlay build) so genuine data reaches those areas, and re-render with the full four-band tree layer in the existing style. This works the same way as filling corners after a rotation (rule 3). Keep every other element as it is.
