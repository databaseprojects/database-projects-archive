# Agent instructions

## Run safeguards

1. Before any browser test, check whether Chrome's profile is locked by an earlier session (for example a `SingletonLock` file or a running chrome process). Kill that session or use a fresh temporary `--user-data-dir`. Never start a browser test against a locked profile.
2. Before any merge, check the PR's draft status (`gh pr view --json isDraft`). If it's a draft, mark it ready with `gh pr ready` first. Never attempt to merge a draft PR.

## Ski hill rotations (standing rule from Billy)

3. Whenever any ski hill view is rotated (plan, bird's eye, or back view), every empty corner or gap that opens up must be filled in the same job with genuine DEM elevation data: topo contours and trees, matching the existing style, line weights and tree bands. Do this without being asked. Never leave a rotated view with blank corners, and never invent or hand-draw terrain.
4. What "rotate" means in a bird's-eye (frontal or back) view: turn the terrain about the peak's vertical axis in 3D with the camera locked (same tilt, height, distance, FOV and framing). Never spin the finished image flat in 2D, because that looks like the camera orbiting. Keep every existing run, lift, contour and tree path (no new linework): re-project each point using its real DEM elevation through the turn with the same camera, then fill only the newly exposed edges and corners from genuine DEM data. Plan-view rotations are plain 2D turns.

## Camera shifts (standing rule from Billy)

5. A "camera shift" on a bird's-eye view means: change that hill's facing angle in the build script and re-render the bird's-eye from the elevation data, with the full four-band tree layer (the same bands and opacities as before; never fewer). Do not redraw or change anything else (runs, lifts, banner text, style, other hills). Open the PR for a same-day merge. Never slide, translate, crop or shift the existing drawing instead (PR #449 did this and left empty edges). PR #448 used the right method but its trees came out with two bands instead of four, so check the band count before opening the PR.
