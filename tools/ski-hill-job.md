# Ski hill job runner

`tools/ski-hill-job.py` runs one bird's-eye hill job from a fresh tip to live:
sparse worktree, cache-first setup, render, skyline-clipped tree wash, checks,
token update, PR, rebase + squash merge, Pages publish, R2 upload and Worker
verify, Drive staging, live check, summary. Run it with the castle-gdal Python:

```
/workspace/castle-gdal/bin/python tools/ski-hill-job.py <slug> --token <token> --title "<PR title>" [edits]
```

Run it from any checkout of this repo; it makes its own worktree at
`/workspace/dpa-job-<token>` (removed at the end unless `--keep-worktree`).

## Edits

| Flag | Change |
| --- | --- |
| `--ridge-clip` | FLOATING_HORIZON 1.0, HORIZON_MIN_RUN 4, CONTOUR_NO_CROSS, CONTOUR_NO_CROSS_BASE 0, HORIZON_RELEASE_NO_CROSS |
| `--be-ccw D` / `--be-cw D` | Bird's-eye turn. Counter-clockwise ADDS to facing. Needs a locked facing (else pass `--facing`). |
| `--facing D` | Absolute facing. |
| `--frame-scale X` / `--frame-scale-mult M` | Zoom. `--frame-scale-mult 0.88` pulls back about 12%. |
| `--dem-pad X` | DEM_PAD for the slug, when corners go bare after a zoom or turn. |
| `--plan-cw D` / `--plan-ccw D` | PLAN_TURN_DEG. Clockwise INCREASES the plan angle. The plan refit and contour rebuild are bespoke, so pass them with `--edit` and `--plan-trees`. |
| `--edit "<cmd>"` | Any extra edit, run in the worktree after the built-in ones (repeatable). |

Hills with front/back `views` need `--edit` for camera changes. Banner text and
print stylesheets are never edited; the job fails if `css/` or a prints file
changes.

## Guards

* Trees: after the render the sheet must keep `data-sh-wash="lazy"` or its
  inline `sh-frontal-trees` group, and after `build-tree-overlays.py
  --frontal-only` the `.wash.svg` must still have tree bands (the PR #528 bug).
  A band-count change is printed.
* `check-tree-stairs.py` and `check-tree-opacity.py` run at the same time as
  the 30 m crossing count. The sparse worktree holds only this slug's sheets,
  so they only scan this job's files.
* Tokens: only `FRONTAL_V[slug]`, the slug's line in the `washFileV` list and
  `ski-hills/index.html ?v=` change. Every other entry is kept.
* Rebase: right before the squash merge the branch is rebased on the fresh
  `origin/main`. On a conflict (two jobs touching the same lines), the job
  resets to the tip, restores its own rendered files, and re-applies its
  built-in edits and token entry. Bespoke `--edit` changes that conflict stop
  the job for a person to resolve. CI is not waited on; its state is in the
  summary.
* Pages: publishes take `flock /workspace/.pages-publish.lock`, start from the
  current remote tip of `cursor/archive-portfolio-b69f`, copy only the merged
  non-asset files, refuse a tree with `ski-hills/frontal` or
  `ski-hills/contours`, never force-push, and re-fetch and retry when a push
  is rejected.
* R2 and Drive run in parallel with Pages. R2 objects are verified by SHA-256
  through `https://ski-hills.databaseprojects.workers.dev/`. Drive copies are
  staged as `/workspace/drive-staging/<token>/<token>-<file>`; the calling
  agent uploads them to the masters folder with UploadFile (the script cannot
  reach Drive itself).
* `CLOUDFLARE_API_TOKEN` is read from the environment for the R2 PUT only. It
  is removed from the build steps' environment and never printed or written.
* The job refuses to start below 4 GB free (`SKI_JOB_MIN_FREE_GB`).

## Phases and dry runs

`--stop-after setup|build|checks|pr` stops early; `--resume` reuses the
worktree. `--dry-run` renders an already-live hill with no edits, PR, publish
or upload, then byte-compares its sheets with `origin/main` and the Worker.

## Crossing-location report (light-touch jobs)

`RIDGE_CROSSING_REPORT=1 python3 ski-hills/build-frontal.py <slug>` writes
`$RIDGE_CROSSING_REPORT_DIR/<sheet>.json` (default `/tmp/ridge-crossings`) and
prints a `ridgecross_report` line. Each farther contour segment that crosses a
nearer one by 30 m or more is placed in a named screen band (thirds of the
sheet): `top-left`, `top-ridge`, `top-right`, `left-edge`, `centre`,
`right-edge`, `bottom-left`, `bottom-centre`, `bottom-right`. Each band lists
its count, the midpoints, and an `HORIZON_REGION`-style box. The render is
byte-for-byte the same with the flag on or off; the job runner always turns it
on, and for `--ridge-clip` jobs it also records the "before" counts.

For a light touch (Aspen Snowmass), run the report first, then hide only where
the crossings sit: add the slug to `HORIZON_REGION` in `build-frontal.py` with
the band boxes from the report (merge adjacent boxes, e.g. top-left plus
top-ridge becomes `"x": ((-400.0, 2000.0 / 3.0),), "y": ((-400.0, 1000.0 / 3.0),)`),
together with the ridge-clip entries (`--ridge-clip` plus an `--edit` that adds
the `HORIZON_REGION` entry). Samples outside the boxes stay on the ordinary
skyline test, so slopes elsewhere are not cropped. Re-run and compare the band
counts before and after.

Re-rendering only the clipped area is not supported: the floating horizon
sweeps each screen column front to back across the whole sheet, so a partial
re-render would have to stitch whole columns back in, and the render is only
2 to 46 seconds.
