# Ski hill working files

Before building a hill, run the setup script with the hill's name:

```
python3 ski-hills/setup-build-inputs.py <slug>
```

The script gathers the runs and lifts, elevation, forest map and canopy files and lands them in `ski-hills/build-inputs/` (gitignored). It checks in this order:

1. `ski-hills/build-inputs/` in this checkout
2. `/workspace/ski-cache/<slug>/` (override the root with `SKI_CACHE_DIR`)
3. the public Worker, `https://ski-hills.databaseprojects.workers.dev/build-inputs/<slug>/<file>`
4. the original sources: OpenSkiMap for runs and lifts, MRDEM (Canada) or Copernicus for the DEM, ESA WorldCover for the forest map, and Sentinel-2 for canopy

Use the cached files as they are. A file that comes from the Worker or an original source is also written back to `/workspace/ski-cache/<slug>/`, so the next job for that hill copies it locally (`SKI_CACHE_WRITEBACK=0` turns this off; it is skipped when the disk would drop below `SKI_CACHE_MIN_FREE_GB`, default 3). `SKI_CACHE_ONLY=1` fails instead of fetching from the original sources. When the script fetches a new hill from the original sources, list the new files in the pull request so Loops can add them to the cache.

When a hill's area grows or a new hill is added, save the new files once to `/workspace/ski-cache/<slug>/` and to the R2 bucket `ski-hills` under `build-inputs/<slug>/`. Cypress uses `cypress-mountain-geom.json` and `cypress-dem-wide.tif`. A cloud agent can fetch a cached file with plain curl, for example:

```
curl -o cypress-dem-wide.tif https://ski-hills.databaseprojects.workers.dev/build-inputs/cypress-mountain/cypress-dem-wide.tif
```

The Worker already serves any object key in that bucket, including the `build-inputs/` prefix. Its source lives at `/workspace/r2-migration/worker/src/index.js` and did not need a change for this cache.
