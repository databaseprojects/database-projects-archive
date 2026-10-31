#!/usr/bin/env python3
"""Front-facing trail maps.

Orthographic view. Each hill sets elevation, degrees above the horizon.
Pitch, the tilt up from a flat plan, is 90 minus elevation, so 0 elevation
is a side view and 90 is top-down. Cypress is elevation 15 (pitch 75).
Grass Mountain stays at elevation 73, which is the old pitch of 17.
Heights are stretched 1.5x. Ground depth toward the camera is stretched
by DEPTH_SCALE before projection, so a fixed 20 m interval opens on
gentle slopes and stays tight on steep ones. Cypress uses 2; Grass stays 1.
20 m contours are projected at their true elevation in metres, the same
unit as the ground, stretched 1.5x. Nearer ground hides lines behind it.
Shading is off unless SHADE_MODE is soft or contrast. Either look is a
grey hillshade under the contours, from one sun and the surface normals.
The paper stays white around it. There is no silhouette and no dark box.
A far contour loses to terrain a short depth in front of it, and stops
just under that ridge. Visibility has to hold for a few pixels, so a
contour stays one solid stroke. Runs sit a few metres above the surface.
Lifts sit higher and are the only dashed strokes. Run names are drawn
only when a hill asks for them, and the page hides that layer until it
is switched on.

Facing is the compass bearing the camera looks, in degrees clockwise from
north. 0 looks due north: the viewer stands south of the hill, west is on the
left, east is on the right. It is not a math angle from east, and it is not
the downhill aspect. 335 looked up Cypress's fall line, 25° west of north.
Default camera facing, for a hill with no hand-set facing: point toward the
flattest side, the side that shows the most runs, same as the plan map.
fall_line weights the downhill direction by run length, then orient() turns
the summit away from the viewer. Hand-set facings are passed in radians and
are not flipped: Cypress 0, Grass Mountain 0. Grouse Mountain and Mt Seymour
use that default, with Cypress's elevation and depth. Grass is not re-rendered.
Contours use a wider DEM and fade softly at the frame edge.

    python3 ski-hills/build-frontal.py
"""
import base64
import bisect
import io
import json
import math
import struct
import sys
from pathlib import Path

from osgeo import gdal
from PIL import Image, ImageDraw, ImageFilter, ImageFont

gdal.SetConfigOption("GDAL_HTTP_TIMEOUT", "60")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "1")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from lean_paths import compact_points

GEOM = Path("/tmp/cypress-geom.json")
# Wider than the old tight crop so the contour field reaches the frame.
DEM = Path("/tmp/cypress-dem-wide.tif")
Z_SCALE = 1.5
# Ground depth (yr, toward the camera) is multiplied by this before
# projection. 1 is true scale. Cypress sets 2 so contour spacing tracks
# slope instead of the vertical stretch. Grass stays at 1.
DEPTH_SCALE = 2.0
# Metres. The occlusion test looks at terrain this far in front of a
# contour, so the near slope wins a near tie. Coordinates are not moved.
DEPTH_BIAS = 40.0
# Pixels under the near skyline. Screen y grows downward. Clipping only:
# nothing is stroked along the skyline.
RIDGE_MARGIN = 2.6
# Standing rule for every new bird's-eye build. A run that passes behind
# a ridge stays on the sheet at 10% opacity, so the line still reads
# around the ridge instead of being clipped out. A hill sets ridge_fade
# to None when those segments should be clipped instead.
RIDGE_FADE = 0.10
# Standing rule for the tree overlay. The wash is 10 m ESA WorldCover
# tree cover, drawn as a 10% #315b38 green. A 2.0 px corridor around each
# run and lift is left clear, so the tree edge sits against the trail
# and a narrow run stays distinct.
TREE_CLEAR = 2.0
# The skyline test misses a slope behind a mid-slope spur, so both
# contour families draw and cross. Screen cells keep the nearest terrain.
# A contour point `tol` metres behind the nearest sample within `reach`
# pixels is hidden. Runs and lifts do not use it. `y`, when set, limits
# the hide to that screen band. Samples outside the band still fill the grid.
DEPTH_GRIDS = {
    "tignes-val-d-isere": {
        "cell": 4.0,
        "reach": 10.0,
        "tol": 15.0,
    },
    # Castle, bottom third. The column horizon left the near ridge stacked.
    # The middle ski area and the top third are not tested.
    "castle-mountain-resort": {
        "cell": 5.0,
        "reach": 12.0,
        "tol": 20.0,
        "y": (2000.0 / 3.0, 1400.0),
    },
}
# Each hill has its own tolerance, in pixels. The skyline test leaves
# both faces of the jagged peaks, so those contours cross. Screen y grows
# downward. A farther sample more than this far below the highest nearer
# sample in its column is hidden. Runs and lifts skip it, and every other
# hill skips it, including the Tignes depth grid.
FLOATING_HORIZON = {
    "aletsch-arena": 3.0,  # Aletsch Arena, 3.0 px, PR #210
    "jasna-low-tatras": 5.0,  # Jasná Low Tatras, 5.0 px, PR #211; short dips stay drawn
    "bansko": 3.0,  # Bansko, 3.0 px, PR #211
    "borovets": 3.0,  # Borovets, 3.0 px, PR #211
    "skigebiet-garmisch-classic": 3.0,  # Garmisch-Classic, 3.0 px, PR #211
    "estacio-d-esqui-baqueira-beret": 3.0,  # Baqueira Beret, 3.0 px, PR #217
    "fernie-alpine-resort": 3.0,  # Fernie Alpine Resort, 3.0 px
    "kicking-horse-resort": 3.0,  # Kicking Horse, 3.0 px
    "panorama-mountain-resort": 3.0,  # Panorama, 3.0 px
    "cypress-mountain": 3.0,  # Cypress, 3.0 px
    "grouse-mountain": 3.0,  # Grouse, 3.0 px
    # Gentle. A 4.5 px dip is the small bleed at the top of the ski line
    # and the top-left corner. Shorter grazes stay drawn.
    "marmot-basin": 4.5,
    # Norquay. Crowded back ridges hide more readily behind nearer ones.
    "mt-norquay": 3.0,
    # Front and back sheets share this. Only the right third may hide.
    "mount-washington-alpine-resort": 3.0,
    # Top third and bottom third only. The middle ski area stays drawn.
    "castle-mountain-resort": 3.0,
    # Bottom third only. The upper two thirds stay drawn.
    "apex-mountain-resort": 3.0,
    # Top of the sheet and the top-right corner. The ski slopes below stay drawn.
    "red-mountain-resort": 3.0,
    # Sunshine, whole sheet, 1 px. Facing 146.9 put packed near faces at the
    # bottom and the far ridges at the top; at 3.5 px, and only on the left
    # half, back contours drew through those ridges (3,700 crossings).
    # Gaps are rejoined by CONTOUR_CLEAR_JOIN only where nothing is crossed.
    "banff-sunshine-village": 1.0,
    # Whole sheet. Short grazes are given back by HORIZON_MIN_RUN.
    "mt-bachelor": 3.5,
    # Whitewater at facing 43.5, bottom-left only (HORIZON_REGION). Back
    # slopes behind the near foreground ridge were stacking on its face.
    "whitewater-ski-resort": 3.5,
    # Whistler. The 3 px pass from PR #306, kept. On its own it cut the
    # far ridges into dashes; HORIZON_MIN_RUN and CONTOUR_HOLD join them.
    "whistler-blackcomb": 3.0,
    # Mt Baker, top-left and bottom-left corners only (HORIZON_REGION).
    # Back slopes were drawing across the nearer ridge there. Baker had no
    # floating horizon at all. 3.0 px still left most crossings; 1.0 px
    # hides them while the corner contours stay full.
    "mt-baker": 1.0,
}
# Consecutive contour samples. A floating-horizon dip shorter than this
# stays drawn, so a gentle slope does not break into dashes. A longer run
# stays hidden, which is the steep face. Other hills hide each sample
# on its own.
HORIZON_MIN_RUN = {
    "jasna-low-tatras": 80,
    # Fernie, below the top band. Short crest grazes stay one stroke.
    # The top third uses CONTOUR_TIGHT instead: 70 samples here was
    # letting the bowls draw through the upper ridges.
    "fernie-alpine-resort": 70,
    # Marmot. Only a real back-ridge run is hidden. Facing contours stay solid.
    "marmot-basin": 40,
    # Kicking Horse. Was 65, which let back-face contours graze along the
    # summit ridge and cross the front ones. 20 hides them; the short
    # grazes on the open slopes still stay one stroke.
    "kicking-horse-resort": 20,
    # Bachelor. Medium grazes stay drawn so the elevation lines join.
    "mt-bachelor": 80,
    # Whitewater bottom-left. Only a 30+ sample stretch behind the ridge hides.
    "whitewater-ski-resort": 30,
    # Mt Baker corners. A 4+ sample stretch behind the ridge hides.
    "mt-baker": 4,
}
# Screen bands where the floating horizon may hide a sample. y grows
# downward, x grows to the right. A sample outside the band stays drawn
# and can still raise the crest. Hills not listed hide across the sheet.
# Front and back sheets use the hill name, without the -front / -back suffix.
HORIZON_REGION = {
    "castle-mountain-resort": {
        "y": ((-400.0, 1000.0 / 3.0), (2000.0 / 3.0, 1400.0)),
    },
    "apex-mountain-resort": {
        "y": ((2000.0 / 3.0, 1400.0),),
    },
    "mount-washington-alpine-resort": {
        "x": ((1000.0 * 2.0 / 3.0, 1400.0),),
    },
    # Top third, which includes the thin line on the top edge and the
    # top-right corner. The slopes under that band are not tested.
    "red-mountain-resort": {
        "y": ((-400.0, 1000.0 / 3.0),),
    },
    # Whitewater at facing 43.5. Bottom-left corner only.
    "whitewater-ski-resort": {
        "x": ((-400.0, 300.0),),
        "y": ((780.0, 1400.0),),
    },
    # Mt Baker at facing 221.3. Left side, top and bottom corners only.
    # The middle of the sheet stays on the skyline test.
    "mt-baker": {
        "x": ((-400.0, 420.0),),
        "y": ((-400.0, 350.0), (650.0, 1400.0)),
    },
}


def horizon_key(slug):
    """Hill name for a frontal sheet. Front and back share the hill's pass."""
    for suffix in ("-front", "-back"):
        if slug.endswith(suffix):
            base = slug[: -len(suffix)]
            if base in FLOATING_HORIZON or base in HORIZON_MIN_RUN or base in HORIZON_REGION:
                return base
    return slug


def horizon_hides(slug, px, py):
    """True when this screen point is inside the hill's floating-horizon band."""
    region = HORIZON_REGION.get(horizon_key(slug))
    if not region:
        return True
    xs = region.get("x")
    ys = region.get("y")
    if xs and not any(lo <= px <= hi for lo, hi in xs):
        return False
    if ys and not any(lo <= py <= hi for lo, hi in ys):
        return False
    return True
# Path length, in px. Samples sit about 5 px apart, so a 3 px hold never
# contains a whole skyline flicker. 12 px is the short gap or speck we
# refuse to toggle; a longer hidden run still ends in one place.
MIN_RUN = 12.0
# Pixels. Mt. Bachelor's peak and the left-middle ridge graze the skyline
# for short stretches and break. A longer hold joins those dips into one
# stroke. A real occluded run is longer and still ends where it goes
# behind the slope. Runs and lifts keep MIN_RUN. Other hills do too.
CONTOUR_HOLD = {
    # Bachelor. 40 px still left medium gaps. 100 px joins those grazes.
    "mt-bachelor": 100.0,
    # Revelstoke. Keeps the top-left ridge line one stroke between real hides.
    "revelstoke-mountain-resort": 60.0,
    # Fernie. 60 px pulls the upper ridge back into one stroke. The tight
    # pass on that ridge stays loose enough that the crest does not gap.
    "fernie-alpine-resort": 60.0,
    # Heavenly. The skyline was nicking the contours on every ridge.
    # 869 hidden runs, median 5 px, and the 12 px hold left 746 strokes.
    # 60 px joins those grazes into one line. A longer hide is a real
    # ridge and still ends the stroke. Runs and lifts stay on MIN_RUN.
    "heavenly-mountain-resort": 60.0,
    # Whistler bird's-eye. The top-right ridges and the centre-left ridge
    # were broken by short skyline grazes, not by missing elevation: with
    # occlusion off every line there runs unbroken. 100 px alone (#314)
    # joined them but drew back faces across the ridges, so CONTOUR_NO_CROSS
    # refuses any join that would cross a drawn contour, and Whistler's
    # HORIZON_MIN_RUN 80 release was dropped for the same reason.
    "whistler-blackcomb": 100.0,
}
# Shortest stroke to draw, when that should not be the hold above.
# Bachelor still joins skyline grazes at 100 px. That same number was also
# the shortest stroke kept, so the summit ring — a closed 20 m loop about
# 76 px around the tip — never reached the sheet. The join stays 100.
# A real ring is drawn at the same 12 px floor as every other hill.
CONTOUR_DRAW = {
    # Sunshine. Drops specks under 25 px left by the 1 px horizon.
    "banff-sunshine-village": 25.0,
    "mt-bachelor": MIN_RUN,
    # Whistler keeps the 12 px floor so small rings still draw.
    "whistler-blackcomb": MIN_RUN,
}
# Bird's-eye only. Shortest visible contour piece the hold may hide, px.
# Bachelor's 100 px hold joins skyline grazes, but the same hold also
# hid every visible piece shorter than 100 px. Near the summit the top
# five contours alternate short drawn and short hidden pieces, so the
# hold wiped out about half of what was actually in view and left blank
# gaps under the peak. With this set, the hold still fills gaps under
# 100 px, and a drawn piece of 12 px or more stays drawn.
# Bird's-eye only. Px. After the floating horizon, a hidden gap up to
# this long is drawn again only when it would cross no drawn contour.
# See join_clear_gaps.
CONTOUR_CLEAR_JOIN = {
    # Sunshine replaces its old 100 px blind hold, which redrew hidden
    # stretches straight through the bottom and top ridges.
    "banff-sunshine-village": 400.0,
}
# Bird's-eye runs. Px under the crest of the drawn contours nearer than a
# run sample. Past that the sample counts as behind a ridge and draws at
# the hill's ridge_fade opacity; nothing is deleted. The 40 m skyline test
# misses a low ridge close in front of a run.
RUN_CONTOUR_HORIZON = {
    # Sunshine. The green run at the bottom left passes behind a low ridge.
    "banff-sunshine-village": 1.0,
}
LAST_CONTOUR_CHUNKS = []


class ContourCrest:
    """Screen crest of drawn contour samples, snapshotted every 6 m of depth."""

    def __init__(self, chunks, col_of, step=6.0):
        self.col_of = col_of
        cols = col_of(1e9) + 1
        pts = []
        for chunk in chunks:
            for k, (px, py, yr, hide) in enumerate(chunk):
                if hide:
                    continue
                prev = chunk[k - 1] if k and not chunk[k - 1][3] else None
                pts.append((yr, px, py, prev))
        pts.sort(key=lambda t: t[0])
        horizon = [1e9] * cols
        self.keys = []
        self.snaps = []
        self.step = step
        cur = None

        def paint(px, py):
            c = col_of(px)
            if py < horizon[c]:
                horizon[c] = py

        for yr, ax, ay, prev in pts:
            key = int(yr // step)
            if key != cur:
                self.keys.append(key * step)
                self.snaps.append(horizon[:])
                cur = key
            paint(ax, ay)
            if prev is not None and math.hypot(prev[0] - ax, prev[1] - ay) <= 26.0:
                n = max(1, abs(col_of(prev[0]) - col_of(ax)))
                for k in range(1, n):
                    t = k / n
                    paint(ax + (prev[0] - ax) * t, ay + (prev[1] - ay) * t)

    def hides(self, px, py, yr, tol):
        # Contours at least one depth step nearer than this point.
        idx = bisect.bisect_right(self.keys, yr - self.step) - 1
        if idx < 0:
            return False
        crest = self.snaps[idx]
        c = self.col_of(px)
        for j in (c - 1, c, c + 1):
            if 0 <= j < len(crest) and crest[j] < 1e8 and py > crest[j] + tol:
                return True
        return False
CONTOUR_KEEP = {
    "mt-bachelor": MIN_RUN,
    # Whistler has the same 100 px hold, so the same keep: a drawn
    # piece of 12 px or more stays drawn.
    "whistler-blackcomb": MIN_RUN,
}
# Bird's-eye only. A gap the CONTOUR_HOLD would fill stays hidden when
# the bridged piece would cross a contour the 12 px pass draws, which is
# a back face showing through a ridge. Whistler's 100 px hold joined
# the top-right and centre-left ridges but drew back faces across them.
CONTOUR_NO_CROSS = {"whistler-blackcomb"}
# A stricter floating horizon inside one screen band, applied before the
# sheet-wide pass. y grows downward. Fernie's top third and Revelstoke's
# top-left ridge were drawing the far slope through the crest. The later
# pass does not put these marks back.
CONTOUR_TIGHT = {
    # Fernie upper ridge. 1.2 px / 12 samples left gaps along the crest.
    # 2.2 px / 28 samples pulls those contours back in without stacking
    # the back bowl.
    "fernie-alpine-resort": {
        "tol": 2.2,
        "min_run": 28,
        "y": (-400.0, 420.0),
    },
    "revelstoke-mountain-resort": {
        "tol": 1.2,
        "min_run": 12,
        "x": (-400.0, 550.0),
        "y": (-400.0, 420.0),
    },
    # Marmot. Summit crest, full width, and the top-left corner under it.
    # The rest of the sheet stays at 4.5 px.
    "marmot-basin": {
        "tol": 2.2,
        "min_run": 16,
        "regions": (
            {"y": (-400.0, 200.0)},
            {"x": (-400.0, 500.0), "y": (-400.0, 380.0)},
        ),
    },
    # Castle. Bottom third only, tighter than the 3.0 px pass. The top
    # third stays at 3.0 and the middle ski area stays drawn.
    "castle-mountain-resort": {
        "tol": 1.5,
        "min_run": 12,
        "y": (2000.0 / 3.0, 1400.0),
    },
}
# Runs only, and only where a hill asks. Tol is pixels below a nearer
# skyline. A marked stretch shorter than min_run samples stays solid.
# 1.2 px and 12 samples is the strict pair: a run behind the ridge fades
# at 10% instead of cutting through solid. The usual skyline test still
# runs everywhere else.
RUN_HORIZON = {
    "fernie-alpine-resort": {
        "tol": 1.2,
        "min_run": 12,
        "y": (-400.0, 420.0),
    },
    # Whole sheet. A run behind a ridge fades at 10% everywhere, not only
    # the top-left corner.
    "revelstoke-mountain-resort": {
        "tol": 1.2,
        "min_run": 10,
    },
}
LIFT_CLEAR = 12.0
# Runs clear the contour ink, and stay under the lifts.
RUN_CLEAR = 7.0
CONTOUR_M = 20
# Bird's-eye contour interval per hill. Sun Peaks (lines packed about twice
# a typical hill's density) draws at 100 m; Mt Seymour draws at 40 m. They drew far
# more lines than a typical sheet, so their ridges read as thick, merged ink.
CONTOUR_M_HILL = {}  # Sun Peaks and Mt Seymour back on the default spacing (reverted)
# Was 0.85. About 22% thinner, every contour including the 100 m steps.
# Runs stay 2.2 and lifts stay 1.7, unless the contour field is spread out.
CONTOUR_W = 0.66
LIFT_W = 1.7
# A hill whose bird's eye has more contour polylines than this is spread
# out. Its runs and lifts draw at 62% of the defaults: run 1.36 (of 2.2),
# lift 1.05 (of 1.7). Colour, dash, and the line-only drawing stay put.
CONTOUR_THIN_CUTOFF = 1800
RUN_W_THIN = 1.36
LIFT_W_THIN = 1.05
COLS = 110
ROWS = 72
# facing: look azimuth, degrees clockwise from north. 0 is due north.
# elevation: camera degrees above the horizon. pitch = 90 - elevation
# is the tilt up from a flat plan (0 top-down, 90 a pure side view).
# Grass Mountain's elevation 73 is the previous pitch of 17, unchanged.
# Not passed through orient(), which would flip a hand-set facing 180°.
# Sun azimuth is clockwise from north, the direction the light comes from.
# Left unset, it sits 135° counter-clockwise of the camera facing: the
# viewer's upper left. Elevation is degrees above the horizon. Intensity
# scales the directional term. Ambient is the floor, so a shaded face
# stays grey. Grass has no bird's-eye sun; it is not re-rendered.
# SHADE_MODE "off" draws lines only and is the default for every hill.
# "soft" is the pre-q look: ambient is divided back out, grey 156-250.
# "contrast" is the q mapping: ambient 0.20, intensity 0.80, gamma 0.50,
# grey 136-252, ambient left in the tone. A hill's sun.shade overrides this.
SHADE_MODE = "off"
SUN_OFFSET_CCW = 135.0
SUN_ELEVATION = 40.0
SUN_INTENSITY = 0.50
SUN_AMBIENT = 0.35
CONTRAST_AMBIENT = 0.20
CONTRAST_INTENSITY = 0.80
CONTRAST_GAMMA = 0.50
CONTRAST_GREY_LO = 136
CONTRAST_GREY_HI = 252
SOFT_GREY_LO = 156
SOFT_GREY_HI = 250
CAMERAS = {
    # Cypress only. 0 looks due north. 45.0 is 45° further, which turns
    # the drawing 45° counter-clockwise on screen. 45.0 is 20° more than
    # 25.0, another 20° counter-clockwise. 355.0 is 50° less than 45.0,
    # which turns the drawing 50° clockwise; the plan view is turned to match.
    "cypress-mountain": {
        # 315: another 40 degrees clockwise from 355 (was 45, then 355). Plan turned to match.
        "facing": 315.0,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Grouse only. 0.95 pulls the sheet back 5% around the centre.
    # The automatic camera stays.
    "grouse-mountain": {
        "frame_scale": 0.95,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    "mt-seymour": {
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    "grass-mountain": {"facing": 0.0, "elevation": 73.0, "depth_scale": 1.0},
    # Banff only. Automatic facing was 311.9. 41.9 is 90° further clockwise,
    # which turns the bird's-eye drawing 90° counter-clockwise. 1.9 is 40°
    # less than 41.9, which turns the drawing 40° clockwise on screen.
    # 131.9 is half a turn from the automatic 311.9: the camera stands at the
    # Bourgeau base (north-west, lowest) and looks uphill to the summits
    # (lifts climb toward ~130). 146.9 is 15° further clockwise, which
    # turns that drawing 15° counter-clockwise on screen. Edit this number.
    "banff-sunshine-village": {
        "facing": 146.9,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
        # Run and lift strokes are 22% under the defaults (2.2 and 1.7).
        "run_width": 1.716,
        "lift_width": 1.33,
    },
    # Mt Norquay only. Automatic facing was 68.6. 248.6 was 180° further,
    # which turns the bird's-eye drawing upside down. 238.6 is 10° less
    # than that, which turns the drawing 10° clockwise on screen.
    # Runs behind a ridge fade at 10%, as on Revelstoke. The crowded back
    # ridges are thinned by the 3.0 px skyline pass in HORIZON_TOL.
    "mt-norquay": {
        # 268.6: 30 degrees counter-clockwise from 238.6. Plan turned to match.
        "facing": 268.6,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        "ridge_fade": 0.10,
    },
    # Mount Washington only. Automatic facing 217.2 is kept by orient() and
    # shows the north side. Black runs cluster north of centre (bearing
    # 10.6°). Green and blue runs cluster south (bearing 186.7°). Front
    # looks from that south side back toward the hill. Back looks from the
    # north side. Front 26.7 is 20° more than 6.7, which turns the front
    # drawing 20° counter-clockwise; the plan view is turned to match.
    # Edit these numbers. A second entry is enough for the page
    # to offer Front / Back.
    "mount-washington-alpine-resort": {
        "views": {"front": 26.7, "back": 190.6},
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        # Draws both views smaller inside the frame. Same line weight.
        "frame_scale": 0.92,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Lake Louise only. Front faces the main run mass (west of centre) from
    # the WSW. Back faces the Larch / Paradise / Ptarmigan / Saddleback bowls
    # (east of centre) from the ENE. Same Front / Back toggle as Washington.
    # The pair was 82.9 / 262.9. 47.9 and 227.9 are 35° less, which turns
    # each drawing 35° clockwise. Back 247.9 is 20° more, which turns
    # the back drawing 20° counter-clockwise; front stays 47.9. They stay 180° apart. Edit these numbers.
    "lake-louise-ski-area": {
        "views": {"front": 47.9, "back": 247.9},
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Fortress Mountain only. The automatic render faced 257.1 and orient()
    # kept it. 232.1 was 25° less. 207.1 is another 25° less, which turns
    # the bird's-eye drawing a further 25° clockwise. Edit this number.
    "fortress-mountain-resort": {
        "facing": 207.1,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Caledonia Nordic only. The automatic render faced 7.6 (the 187.6
    # guess, flipped by orient()). 187.6 is 180° further and turns that
    # bird's-eye drawing upside down. Edit this number.
    "caledonia-nordic-ski-center": {
        "facing": 187.6,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Camrose Nordic only. The automatic render faced 291.2 (the 111.2
    # guess, flipped by orient()). Locking 111.2 turns that drawing
    # upside down. Edit this number.
    "camrose-nordic-centre": {
        "facing": 111.2,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Big Sky Resort only. The automatic render faced 60.5 (the 240.5
    # guess, flipped by orient()). 240.5 is 180° further and turns that
    # bird's-eye drawing upside down. Edit this number.
    "big-sky-resort": {
        "facing": 240.5,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Kirkwood only. The automatic render faced 30.8 (the 210.8
    # guess, flipped by orient()). 210.8 is 180° further and turns that
    # bird's-eye drawing upside down. The summit sits outside the run
    # window on the camera side; the sheet still frames the runs, same
    # as the other US hills. Edit this number.
    "kirkwood-mountain-resort": {
        "facing": 210.8,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Mt. Hood Skibowl only. The automatic render faced 26.5 (the 206.5
    # guess, flipped by orient()). 106.5 is 80° further and turns that
    # bird's-eye drawing. The sheet still frames the runs. Edit this number.
    "mt-hood-skibowl": {
        "facing": 106.5,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Mt. Bachelor only. The automatic render faced 7.9 (the 187.9
    # guess, flipped by orient()). 187.9 is 180° further and turns that
    # bird's-eye drawing upside down. Edit this number.
    "mt-bachelor": {
        "facing": 187.9,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Sasquatch only. The automatic render faced 138.1. 318.1 is 180°
    # further and turns the bird's-eye drawing upside down; the plan view
    # is turned to match. Edit this number.
    "sasquatch-mountain-resort": {
        "facing": 318.1,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Mount Rose Ski Tahoe only. The automatic render faced 18.8 (the 198.8
    # guess, flipped by orient()). 198.8 is 180° further and turns that
    # bird's-eye drawing upside down. Edit this number.
    "mount-rose-ski-tahoe": {
        "facing": 198.8,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Shames Mountain only. The automatic render faced 334.2 and orient()
    # kept it. 4.2 is 30° further, which turns the bird's-eye drawing
    # 30° counter-clockwise. Edit this number.
    "shames-mountain": {
        "facing": 4.2,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Crystal Mountain, Washington only. Not Crystal Mountain, Michigan.
    # The automatic render faced 77.0 (the 257.0 guess, flipped by
    # orient()). 257.0 is 180° further and turns that bird's-eye drawing
    # upside down. The sheet still frames the runs. Edit this number.
    "crystal-mountain-washington": {
        "facing": 257.0,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Three Summits only. The automatic render faced 69.3 (the 249.3
    # guess, flipped by orient()). 249.3 is 180° further and turns that
    # bird's-eye drawing upside down. The sheet still frames the runs.
    # Edit this number.
    "three-summits": {
        "facing": 249.3,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # 49° North only. The automatic render faced 25.3 (the 205.3 guess,
    # flipped by orient()). 205.3 is 180° further and turns that bird's-eye
    # drawing upside down. The sheet still frames the runs. Edit this number.
    # Mt Baker. Locked at the 221.3 the automatic render chose, so the
    # wider DEM crop (DEM_PAD) cannot nudge the facing.
    "mt-baker": {
        "facing": 221.3,
    },
    "49-north-mountain-resort": {
        "facing": 205.3,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Mount Spokane only. The automatic render faced 95.0 (the 275.0
    # guess, flipped by orient()). Front was 95.0. Back was 277.6, the
    # bearing of the west-side runs (Yeti Crossing, Broken Thumb, Pinball,
    # Big Timber and the trails with them), 2.6° off a straight opposite.
    # 55.0 and 237.6 are 40° less, which turns each drawing 40° clockwise.
    # The pair stays 2.6° off opposite. Same Front / Back toggle as Mount
    # Washington. Edit these numbers.
    "mt-spokane": {
        "views": {"front": 55.0, "back": 237.6},
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # White Pass only. The automatic guess was 172.4 and orient() flipped
    # it, so the drawing faced 352.4. 62.4 was 70° further. 107.4 is
    # another 45° further, which turns the bird's-eye drawing a further
    # 45° counter-clockwise. Edit this number.
    # Stevens Pass only. The automatic render faced 46.9 (the 226.9 guess,
    # flipped by orient()). 116.9 is 70° further clockwise, which turns the
    # bird's-eye drawing 70° counter-clockwise. The plan is turned to match.
    "stevens-pass": {
        "facing": 116.9,
    },
    # Pomerelle only. The automatic render faced 32.5; turned 180°.
    "pomerelle-mountain-resort": {
        "facing": 212.5,
    },
    # Powder Mountain (Utah) only, not Lost Trail. Automatic 6.5; turned 180°.
    "powder-mountain-ski-resort": {
        "facing": 186.5,
    },
    "white-pass-ski-area": {
        "facing": 107.4,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Mount Shark only. Automatic facing was 172.4. 162.4 is 10° less,
    # which turns the drawing 10° clockwise on screen. full_ground fits
    # the whole DEM crop. The run window left the peak and the near slope
    # outside the mesh, so both were projected off the sheet and clipped.
    "mt-shark": {
        "facing": 162.4,
        "full_ground": True,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Grandvalira only. The automatic render faced 5.4 (the 185.4
    # guess, flipped by orient()). 185.4 is 180° further and turns that
    # bird's-eye drawing upside down. Edit this number.
    "grandvalira": {
        "facing": 185.4,
        "elevation": 15.0,
        "depth_scale": DEPTH_SCALE,
        "sun": {"elevation": SUN_ELEVATION, "intensity": SUN_INTENSITY, "ambient": SUN_AMBIENT},
    },
    # Uniform shrink around the sheet centre, after the usual fit.
    # Plan views of Marmot and Nakiska are scaled in the catalog instead.
    # Marmot's automatic facing was 255.5 and orient() kept it. 240.5 was
    # 15° less. 220.5 is another 20° less, which turns the bird's-eye
    # drawing a further 20° clockwise.
    "marmot-basin": {
        "facing": 220.5,
        "frame_scale": 0.91,
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    "nakiska": {"frame_scale": 0.95},
    # Colorado half turns. Each automatic facing (in brackets) plus 180°,
    # which turns the bird's-eye drawing 180°. The plan is turned to match.
    "crested-butte-mountain-resort": {"facing": 154.3},  # (334.3)
    "wolf-creek-ski-area": {"facing": 218.3},  # (38.3)
    "monarch-mountain": {"facing": 234.3},  # (54.3)
    "arapahoe-basin": {"facing": 148.3},  # (328.3)
    # Winter Park and Sunlight only. 0.95 pulls the sheet back 5% around
    # the centre. The automatic camera stays.
    "winter-park-resort": {"frame_scale": 0.95},
    "sunlight-mountain-resort": {"frame_scale": 0.95},
    # New England batch (US sheets, --edge-margin 70). post_scale 0.95 pulls
    # the sheet back 5% after the margin fit. Killington also moves up 60
    # units (6% of the frame). Gunstock is locked to the plan's north-up
    # facing (the automatic camera faced 208.4).
    "gunstock-recreation-area": {"facing": 0.0, "post_scale": 0.95},
    "stratton-mountain-resort": {"facing": 230.9, "post_scale": 0.95},
    "killington-resort": {"facing": 250.5, "post_scale": 0.95, "pan_y": -60.0},
    "jay-peak-resort": {"facing": 242.0, "post_scale": 0.95},
    "mad-river-glen": {"facing": 254.2, "post_scale": 0.95},
    "blue-mountain-ski-resort": {"facing": 228.1, "post_scale": 0.95},
    # Kicking Horse only. 0.86 pulls the sheet back 14% around the centre,
    # the same pull-back as Revelstoke.
    "kicking-horse-resort": {"frame_scale": 0.86},
    # Whistler only. Run and lift strokes are 22% under the defaults
    # (2.2 and 1.7). Automatic facing was 155.4. 143.4 is 12° less, which
    # turns the drawing 12° clockwise on screen. 143.4 is 15° more than
    # 128.4, another 15° counter-clockwise.
    "whistler-blackcomb": {
        "facing": 143.4,
        "run_width": 1.716,
        "lift_width": 1.33,
    },
    # Big White only. Run and lift strokes are 38% under the defaults
    # (2.2 and 1.7). No facing here, so the automatic camera stays.
    "big-white-ski-resort": {"run_width": 1.36, "lift_width": 1.05},
    # Sun Peaks only. Run and lift strokes are 11% under the defaults
    # (2.2 and 1.7), halfway to Whistler's 22%. Runs that pass behind a
    # ridge stay on the line at 10% opacity. The automatic camera stays.
    "sun-peaks-resort": {
        "run_width": 1.96,
        "lift_width": 1.51,
        "ridge_fade": 0.10,
    },
    # Revelstoke only. Automatic facing was 103.8. 76.8 is 27° less,
    # which turns the drawing 27° clockwise on screen. 0.86 pulls the
    # sheet back 14% around the centre. Edit the facing.
    # 106.8 is 30° more than 76.8, which turns the drawing 30°
    # counter-clockwise; the plan view is turned to match.
    "revelstoke-mountain-resort": {
        "facing": 106.8,
        "frame_scale": 0.86,
        # Runs that pass behind a ridge stay on the line at 10% opacity
        # across the whole mountain, the same treatment as Sunshine
        # through Castle.
        "ridge_fade": 0.10,
    },
    # SilverStar only. Run and lift strokes are 22% under the defaults.
    # Automatic facing was 274.3. 279.3 is 5° further, which turns the
    # drawing 5° counter-clockwise on screen. Elevation 26 looks down
    # more steeply than the usual 15. Edit the facing.
    "silver-star-mountain-resort": {
        "facing": 279.3,
        "elevation": 26.0,
        "depth_scale": DEPTH_SCALE,
        "run_width": 1.716,
        "lift_width": 1.33,
    },
    # RED Mountain only. Run and lift strokes sit between Sun Peaks and
    # Sunshine Village, about 16.5% under the defaults (2.2 and 1.7).
    # Automatic facing was 289.3 and orient() kept it. 269.3 is 20° less,
    # which turns the drawing 20° clockwise on screen. Edit the facing.
    "red-mountain-resort": {
        "facing": 269.3,
        "run_width": 1.84,
        "lift_width": 1.42,
        # Runs that pass behind a ridge stay on the line at 10% opacity.
        "ridge_fade": 0.10,
    },
    # Panorama only. The sheet sits 10% smaller. Strokes match RED
    # Mountain, about 16.4% under the defaults. Elevation 18 looks down
    # a little more steeply than the usual 15. The automatic camera stays.
    "panorama-mountain-resort": {
        "frame_scale": 0.9,
        "run_width": 1.84,
        "lift_width": 1.42,
        "elevation": 18.0,
        "depth_scale": DEPTH_SCALE,
    },
    # Whitewater only. Automatic facing was 88.5 and orient() kept it.
    # 58.5 is 30° less, which turns the drawing 30° clockwise on screen.
    # 43.5 is 15° less than 58.5, which turns the drawing 15° clockwise
    # on screen. Its old screen-space horizon bands (top-left and
    # bottom-left corners) no longer matched the turned sheet and cut the
    # top-left ridges, so they were removed. A bottom-left-only pass (below)
    # hides back slopes stacked behind the near foreground ridge.
    "whitewater-ski-resort": {
        "facing": 43.5,
    },
    # Castle only. Elevation 18 looks down a little more steeply than the
    # usual 15, the same bump as Panorama, so the ski lines clear the
    # ridges in front. Runs behind a ridge stay at 10% opacity. The
    # automatic facing stays.
    "castle-mountain-resort": {
        "elevation": 18.0,
        "depth_scale": DEPTH_SCALE,
        "ridge_fade": 0.10,
    },
}


def _xy_m(lon, lat, cos):
    return lon * 111320.0 * cos, lat * 110540.0


def ring_centreline(points, to_xy, close_m=3.0):
    """Open centreline of a closed piste ring, from one end to the other.

    The two vertices farthest apart are the ends of the glade. Samples
    halfway between the two side chains are the line that gets drawn.
    """
    ring = [tuple(p) for p in points]
    if len(ring) < 2:
        return None
    a = to_xy(ring[0])
    b = to_xy(ring[-1])
    if math.hypot(b[0] - a[0], b[1] - a[1]) > close_m:
        return None
    ring = ring[:-1]
    if len(ring) < 4:
        return None
    xy = [to_xy(p) for p in ring]
    far = -1.0
    i0 = i1 = 0
    count = len(ring)
    for i in range(count):
        xi, yi = xy[i]
        for j in range(i + 1, count):
            dist = math.hypot(xy[j][0] - xi, xy[j][1] - yi)
            if dist > far:
                far = dist
                i0, i1 = i, j

    def walk(start, end, step):
        chain = []
        i = start
        while True:
            chain.append(ring[i])
            if i == end:
                break
            i = (i + step) % count
        return chain

    chain_a = walk(i0, i1, 1)
    chain_b = walk(i0, i1, -1)

    def at(chain, t):
        plane = [to_xy(p) for p in chain]
        spans = [
            math.hypot(plane[i + 1][0] - plane[i][0], plane[i + 1][1] - plane[i][1])
            for i in range(len(chain) - 1)
        ]
        total = sum(spans)
        if total < 1e-9:
            return chain[0]
        target = max(0.0, min(1.0, t)) * total
        acc = 0.0
        for i, span in enumerate(spans):
            if acc + span >= target - 1e-9:
                u = 0.0 if span < 1e-9 else (target - acc) / span
                u = max(0.0, min(1.0, u))
                p0, p1 = chain[i], chain[i + 1]
                return (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)
            acc += span
        return chain[-1]

    steps = max(8, min(24, max(len(chain_a), len(chain_b)) * 2))
    line = []
    for i in range(steps):
        t = i / (steps - 1)
        pa, pb = at(chain_a, t), at(chain_b, t)
        line.append((0.5 * (pa[0] + pb[0]), 0.5 * (pa[1] + pb[1])))
    return line


def open_closed_run(run):
    """Replace each closed downhill ring with one centreline."""
    lines = []
    changed = False
    for line in run.get("lines") or []:
        if len(line) < 4:
            lines.append(line)
            continue
        lat = line[len(line) // 2][1]
        cos = math.cos(lat * math.pi / 180.0)

        def to_xy(p, _cos=cos):
            return _xy_m(p[0], p[1], _cos)

        opened = ring_centreline(line, to_xy, 3.0)
        if opened:
            lines.append(opened)
            changed = True
        else:
            lines.append(line)
    if not changed:
        return run
    out = dict(run)
    out["lines"] = lines
    return out


def load_geom():
    data = json.loads(GEOM.read_text())
    runs, lifts = data["runs"], data["lifts"]
    # RED Mountain only. Eight glades are stored as closed rings and stroke
    # as hollow boxes. A centreline replaces each ring.
    if GEOM.name.startswith("red-mountain-resort"):
        runs = [open_closed_run(run) for run in runs]
    return runs, lifts


# Extra DEM on every side of the runs, in multiples of the run span.
# 1.0 is one span each side. A rotated sheet still leaves a corner of the
# frame outside that crop, because the crop is a lat/lon rectangle and the
# bird's-eye is not. Fernie's top-right, Marmot's top-left, and White Pass's
# top edge need 1.8 to reach the frame, up to the edge fade.
DEM_PAD = {
    # New England batch and Blue Mountain: zoomed-out sheets reach past the default crop.
    "gunstock-recreation-area": 1.8,
    "stratton-mountain-resort": 1.8,
    "killington-resort": 1.8,
    "jay-peak-resort": 1.8,
    "mad-river-glen": 1.8,
    "blue-mountain-ski-resort": 1.8,
    "fernie-alpine-resort": 1.8,
    "marmot-basin": 1.8,
    "white-pass-ski-area": 1.8,
    # Norquay's bottom-right corner was bare.
    "mt-norquay": 1.8,
    # Mount Washington front. The top-right corner was past the DEM crop.
    "mount-washington-alpine-resort": 1.8,
    # Whitewater (facing 43.5). The bottom-left corner
    # was past the DEM crop, so its contours stopped short.
    "whitewater-ski-resort": 1.8,
    # 49 Degrees North (facing 205.3). The run box is wide and shallow, so
    # the 1.0 crop was only 171 DEM rows tall. The bird's-eye top-left and
    # bottom-right corners (top and bottom thirds) were past it: no
    # contours, and no trees, since the wash uses the same crop. 1.8 still
    # left the top-left corner bare. 2.6 reaches every corner.
    "49-north-mountain-resort": 2.6,
    # Mt Baker (facing 221.3). The top-left corner was past the DEM crop.
    "mt-baker": 1.8,
    # Colorado half turns: the turned sheet reaches past the default crop.
    "crested-butte-mountain-resort": 1.8,
    "wolf-creek-ski-area": 1.8,
    "monarch-mountain": 1.8,
    "arapahoe-basin": 1.8,
    "winter-park-resort": 1.8,
    "sunlight-mountain-resort": 1.8,
    # Lost Trail (facing 262.2). A small strip along the bottom-left and a
    # thin strip along the top were past the DEM crop, so contours and the
    # tree wash stopped short there.
    "lost-trail": 1.8,
    # Pajarito (facing 214.2). The top-left corner and the bottom-right
    # corner were past the DEM crop, so contours and trees stopped short.
    "pajarito-mountain": 1.8,
}


def wide_box(runs, lifts):
    """DEM crop about 3x the run extent, so topo continues past the frame."""
    pts = [p for item in runs + lifts for line in item["lines"] for p in line]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    span_lon = max(lons) - min(lons)
    span_lat = max(lats) - min(lats)
    pad = 1.0
    if GEOM is not None:
        for slug, extra in DEM_PAD.items():
            if GEOM.name.startswith(slug):
                pad = extra
                break
    pad_lon = span_lon * pad
    pad_lat = span_lat * pad
    return min(lons) - pad_lon, min(lats) - pad_lat, max(lons) + pad_lon, max(lats) + pad_lat


def raster_has_relief(path):
    """True when the clip is a real surface, not a nodata field with a few edge values."""
    if not path.exists() or path.stat().st_size < 1000:
        return False
    ds = gdal.Open(str(path))
    if ds is None:
        return False
    band = ds.GetRasterBand(1)
    nodata = band.GetNoDataValue()
    w, h = band.XSize, band.YSize
    raw = band.ReadRaster(0, 0, w, h, w, h, gdal.GDT_Float32) if w and h else None
    ds = None
    if not raw:
        return False
    vals = struct.unpack(f"<{w * h}f", raw)
    valid = 0
    low = None
    high = None
    for z in vals:
        if z != z or z < -100:
            continue
        if nodata is not None and z == nodata:
            continue
        valid += 1
        if low is None or z < low:
            low = z
        if high is None or z > high:
            high = z
    # A Canada clip is full of relief. A miss outside that raster can still
    # report a range from a handful of pixels, and that is not drawable.
    if valid < 200 or valid < (w * h) * 0.5 or low is None:
        return False
    return (high - low) >= 2


def copernicus_sources(box):
    """One-degree Copernicus GLO-30 tiles that cover a lon/lat box."""
    minlon, minlat, maxlon, maxlat = box
    urls = []
    lat = math.floor(minlat)
    while lat <= math.floor(maxlat):
        lon = math.floor(minlon)
        while lon <= math.floor(maxlon):
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            name = "Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM" % (ns, abs(lat), ew, abs(lon))
            url = "/vsicurl/https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/%s/%s.tif" % (name, name)
            probe = gdal.Open(url)
            if probe is not None:
                urls.append(url)
                probe = None
            lon += 1
        lat += 1
    return urls


def ensure_dem(box):
    if raster_has_relief(DEM):
        return
    minlon, minlat, maxlon, maxlat = box
    # Europe sits east of 35°W. Canada and the United States still try MRDEM first.
    if minlon <= -35:
        src = "/vsicurl/https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif"
        try:
            gdal.Warp(
                str(DEM),
                src,
                format="GTiff",
                outputBounds=[minlon, minlat, maxlon, maxlat],
                outputBoundsSRS="EPSG:4326",
                dstSRS="EPSG:4326",
                xRes=0.00035,
                yRes=0.00035,
                resampleAlg="bilinear",
            )
            if raster_has_relief(DEM):
                return
        except Exception as err:
            print("mrdem failed", err)
        if DEM.exists():
            DEM.unlink()
    urls = copernicus_sources(box)
    if not urls:
        raise SystemExit("no dem tiles")
    gdal.Warp(
        str(DEM),
        urls,
        format="GTiff",
        outputBounds=[minlon, minlat, maxlon, maxlat],
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:4326",
        xRes=0.00035,
        yRes=0.00035,
        resampleAlg="bilinear",
    )


def read_grid():
    ds = gdal.Open(str(DEM))
    band = ds.GetRasterBand(1)
    w, h = band.XSize, band.YSize
    nodata = band.GetNoDataValue()
    gt = ds.GetGeoTransform()
    raw = band.ReadRaster(0, 0, w, h, w, h, gdal.GDT_Float32)
    vals = struct.unpack(f"<{w * h}f", raw)
    arr = []
    for r in range(h):
        row = []
        for c in range(w):
            z = vals[r * w + c]
            if (nodata is not None and z == nodata) or z < -100 or z != z:
                z = float("nan")
            row.append(z)
        arr.append(row)
    for _ in range(6):
        nxt = [row[:] for row in arr]
        missing = False
        for r in range(h):
            for c in range(w):
                if arr[r][c] == arr[r][c]:
                    continue
                missing = True
                acc = cnt = 0.0
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < h and 0 <= cc < w and arr[rr][cc] == arr[rr][cc]:
                        acc += arr[rr][cc]
                        cnt += 1
                if cnt:
                    nxt[r][c] = acc / cnt
        arr = nxt
        if not missing:
            break
    # One light blur so ridge lines don't chatter on 30 m noise.
    blurred = [row[:] for row in arr]
    for r in range(1, h - 1):
        for c in range(1, w - 1):
            acc = 0.0
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    acc += arr[r + dr][c + dc]
            blurred[r][c] = acc / 9.0
    return blurred, gt


def sample(arr, gt, lon, lat):
    col = (lon - gt[0]) / gt[1]
    row = (lat - gt[3]) / gt[5]
    h, w = len(arr), len(arr[0])
    if col < 0 or row < 0 or col >= w - 1 or row >= h - 1:
        return None
    c0, r0 = int(col), int(row)
    fx, fy = col - c0, row - r0
    vals = [
        arr[r0][c0],
        arr[r0][c0 + 1],
        arr[r0 + 1][c0],
        arr[r0 + 1][c0 + 1],
    ]
    if any(v != v for v in vals):
        return None
    return (
        vals[0] * (1 - fx) * (1 - fy)
        + vals[1] * fx * (1 - fy)
        + vals[2] * (1 - fx) * fy
        + vals[3] * fx * fy
    )


def default_facing(arr, gt, runs):
    """Facing in radians for a hill that has no hand-set camera.

    Points toward the flattest side, the side that shows the most runs, using
    the same weighting as the plan map. build() still runs orient() on this
    result so the summit sits away from the viewer. Cypress and Grass
    Mountain are hand-set to 0 (look north) and do not use this path.
    """
    return fall_line(arr, gt, runs)


def fall_line(arr, gt, runs):
    h = len(arr)
    midlat = gt[3] + (h * gt[5]) / 2
    cos = math.cos(midlat * math.pi / 180)
    vx = vy = wt = 0.0
    for run in runs:
        for line in run["lines"]:
            prev = None
            for lon, lat in line:
                z = sample(arr, gt, lon, lat)
                cur = (lon, lat, z)
                if prev and prev[2] is not None and z is not None and abs(prev[2] - z) > 1:
                    if prev[2] > z:
                        a, b = prev, cur
                    else:
                        a, b = cur, prev
                    dx = (b[0] - a[0]) * 111320 * cos
                    dy = (b[1] - a[1]) * 110540
                    length = math.hypot(dx, dy)
                    if length > 1:
                        vx += dx
                        vy += dy
                        wt += length
                prev = cur
    if wt < 1:
        return 0.0
    return math.atan2(-vx / wt, -vy / wt)


def marching_contours(arr, gt, interval):
    h, w = len(arr), len(arr[0])
    flat = [arr[r][c] for r in range(h) for c in range(w) if arr[r][c] == arr[r][c]]
    if len(flat) < 10:
        return []
    z0 = interval * math.ceil((min(flat) + 0.01) / interval)
    z1 = interval * math.floor((max(flat) - 0.01) / interval)
    levels = []
    level = z0
    while level <= z1 + 0.01:
        levels.append(level)
        level += interval
    buckets = {lv: [] for lv in levels}

    def edge_point(va, vb, c0, r0, c1, r1, elev):
        if va == vb or (va < elev) == (vb < elev):
            return None
        t = (elev - va) / (vb - va)
        lon0 = gt[0] + c0 * gt[1]
        lat0 = gt[3] + r0 * gt[5]
        lon1 = gt[0] + c1 * gt[1]
        lat1 = gt[3] + r1 * gt[5]
        return (lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t)

    for r in range(h - 1):
        for c in range(w - 1):
            cell = (arr[r][c], arr[r][c + 1], arr[r + 1][c + 1], arr[r + 1][c])
            if any(v != v for v in cell):
                continue
            lo, hi = min(cell), max(cell)
            for elev in levels:
                if elev < lo or elev > hi:
                    continue
                hits = []
                corners = (
                    (0, 1, c, r, c + 1, r),
                    (1, 2, c + 1, r, c + 1, r + 1),
                    (2, 3, c + 1, r + 1, c, r + 1),
                    (3, 0, c, r + 1, c, r),
                )
                for a, b, c0, r0, c1, r1 in corners:
                    pt = edge_point(cell[a], cell[b], c0, r0, c1, r1, elev)
                    if pt:
                        hits.append(pt)
                if len(hits) == 2:
                    buckets[elev].append(hits)
                elif len(hits) == 4:
                    mid = sum(cell) / 4
                    if (cell[0] >= elev) == (mid >= elev):
                        buckets[elev].append([hits[0], hits[1]])
                        buckets[elev].append([hits[2], hits[3]])
                    else:
                        buckets[elev].append([hits[0], hits[3]])
                        buckets[elev].append([hits[1], hits[2]])
    lines = []
    for elev, segs in buckets.items():
        lines.extend((elev, line) for line in stitch(segs) if len(line) >= 2)
    return lines


def stitch(segments):
    def key(p):
        return (round(p[0], 5), round(p[1], 5))

    links = {}
    for a, b in segments:
        ka, kb = key(a), key(b)
        if ka == kb:
            continue
        links.setdefault(ka, []).append(kb)
        links.setdefault(kb, []).append(ka)
    used = set()

    def edge(a, b):
        return (a, b) if a <= b else (b, a)

    lines = []
    for start in list(links):
        for nxt in links[start]:
            if edge(start, nxt) in used:
                continue
            path = [start]
            prev, cur = start, nxt
            used.add(edge(prev, cur))
            path.append(cur)
            while True:
                choices = [n for n in links.get(cur, []) if edge(cur, n) not in used]
                if not choices:
                    break
                nxt = choices[0]
                used.add(edge(cur, nxt))
                prev, cur = cur, nxt
                path.append(cur)
                if cur == start:
                    break
            if len(path) >= 2:
                lines.append([(p[0], p[1]) for p in path])
    return lines


def _path_dist(pts):
    dist = [0.0] * len(pts)
    for i in range(1, len(pts)):
        dist[i] = dist[i - 1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return dist


def solid_flags(flags, pts, min_run=None, keep_visible=None):
    """Hold visibility so a contour is not chopped into dashes.

    A one-sample spike is skyline noise. A hidden gap or a visible piece
    shorter than the hold is not a real change either: short gaps stay
    drawn, short pieces stay hidden, and a long occluded run ends where
    it actually goes behind the nearer slope. The hold is MIN_RUN unless
    a hill asks for a longer contour join.

    keep_visible, when set, is the shortest visible piece the hold may
    hide. A longer join then only fills hidden gaps; it does not also
    erase the drawn pieces between them.
    """
    hold = MIN_RUN if min_run is None else min_run
    n = len(flags)
    if n < 2:
        return flags
    flags = list(flags)
    if n >= 3:
        cleaned = flags[:]
        for i in range(1, n - 1):
            if flags[i - 1] == flags[i + 1] and flags[i] != flags[i - 1]:
                cleaned[i] = flags[i - 1]
        flags = cleaned
    dist = _path_dist(pts)
    for _ in range(8):
        runs = []
        start = 0
        for i in range(1, n + 1):
            if i == n or flags[i] != flags[start]:
                left = dist[start - 1] if start > 0 else dist[0]
                right = dist[i] if i < n else dist[n - 1]
                runs.append((start, i, flags[start], right - left))
                start = i
        changed = False
        new = flags[:]
        for ri, (s, e, flag, length) in enumerate(runs):
            limit = keep_visible if (keep_visible is not None and not flag) else hold
            if length >= limit:
                continue
            left = runs[ri - 1] if ri else None
            right = runs[ri + 1] if ri + 1 < len(runs) else None
            if left and right and left[2] == right[2]:
                adopt = left[2]
            elif left and right:
                adopt = left[2] if left[3] >= right[3] else right[2]
            elif left and left[3] >= hold:
                adopt = left[2]
            elif right and right[3] >= hold:
                adopt = right[2]
            else:
                continue
            if adopt != flag:
                for i in range(s, e):
                    new[i] = adopt
                changed = True
        flags = new
        if not changed:
            break
    return flags


class DepthGrid:
    """Nearest terrain depth in screen cells. One hill opts in."""

    def __init__(self, cell, tol, reach):
        self.cell = float(cell)
        self.tol = float(tol)
        self.reach = float(reach)
        self.origin = -260.0
        self.n = int((1000.0 + 520.0) / self.cell) + 3
        self.near = [1e9] * (self.n * self.n)
        self.filled = 0
        self.rad = int(self.reach / self.cell)

    def _idx(self, ix, iy):
        if ix < 0 or iy < 0 or ix >= self.n or iy >= self.n:
            return None
        return iy * self.n + ix

    def add(self, px, py, yr):
        ix = int((px - self.origin) / self.cell)
        iy = int((py - self.origin) / self.cell)
        i = self._idx(ix, iy)
        if i is None:
            return
        if yr < self.near[i]:
            if self.near[i] >= 1e9:
                self.filled += 1
            self.near[i] = yr

    def nearest(self, px, py):
        ix = int((px - self.origin) / self.cell)
        iy = int((py - self.origin) / self.cell)
        best = 1e9
        reach2 = self.reach * self.reach
        for dy in range(-self.rad, self.rad + 1):
            for dx in range(-self.rad, self.rad + 1):
                cx = self.origin + (ix + dx + 0.5) * self.cell
                cy = self.origin + (iy + dy + 0.5) * self.cell
                if (cx - px) * (cx - px) + (cy - py) * (cy - py) > reach2:
                    continue
                i = self._idx(ix + dx, iy + dy)
                if i is None:
                    continue
                if self.near[i] < best:
                    best = self.near[i]
        return best


def _horizon_runs(marked):
    """Consecutive samples this pass hid, one run per contour."""
    by_chunk = {}
    for ci, pi in marked:
        by_chunk.setdefault(ci, []).append(pi)
    runs = []
    for ci, pis in by_chunk.items():
        pis.sort()
        start = pis[0]
        prev = pis[0]
        for pi in pis[1:]:
            if pi == prev + 1:
                prev = pi
                continue
            runs.append((ci, start, prev))
            start = prev = pi
        runs.append((ci, start, prev))
    return runs


def _release_short_horizon_runs(chunks, marked, min_run):
    """Put a dip back if it stayed below the crest for fewer than min_run samples."""
    for ci, start, end in _horizon_runs(marked):
        if end - start + 1 >= min_run:
            continue
        chunk = chunks[ci]
        for pi in range(start, end + 1):
            px, py, yr, _hide = chunk[pi]
            chunk[pi] = (px, py, yr, False)


def apply_floating_horizon(chunks, col_of, tol, min_run=None, hide_at=None):
    """Hide the far face where a nearer contour already crests that column.

    Samples walk from the camera outward. Each column keeps the highest
    drawn sample. A later sample more than tol pixels below it is hidden.
    A drawn segment fills the columns between its vertices.

    min_run, when set, keeps that hide only for a run of at least that
    many consecutive samples. A shorter dip stays drawn. The crest is
    unchanged: a sample below it never raises the horizon. Skyline hides
    are left as they are.

    hide_at(px, py), when set, limits the hide to that screen band. A
    sample outside the band stays drawn and can still raise the crest.
    """
    columns = col_of(1e9) + 1
    horizon = [1e9] * columns
    order = []
    for ci, chunk in enumerate(chunks):
        for pi, (_px, _py, yr, hide) in enumerate(chunk):
            if not hide:
                order.append((yr, ci, pi))
    order.sort()
    drawn_at = set()
    use_run = min_run is not None and min_run > 1
    marked = [] if use_run else None
    for _yr, ci, pi in order:
        px, py, yr, hide = chunks[ci][pi]
        if hide:
            continue
        col = col_of(px)
        top = horizon[col]
        if top < 1e8 and py > top + tol and (hide_at is None or hide_at(px, py)):
            chunks[ci][pi] = (px, py, yr, True)
            if use_run:
                marked.append((ci, pi))
            continue
        drawn_at.add((ci, pi))
        if py < horizon[col]:
            horizon[col] = py
        chunk = chunks[ci]
        for ni in (pi - 1, pi + 1):
            if (ci, ni) not in drawn_at:
                continue
            ax, ay = chunk[ni][0], chunk[ni][1]
            if math.hypot(px - ax, py - ay) > 26.0:
                continue
            span = col_of(ax) - col
            if abs(span) < 2:
                continue
            step = 1 if span > 0 else -1
            for k in range(1, abs(span)):
                cy = py + (ay - py) * (k / abs(span))
                c = col + step * k
                if cy < horizon[c]:
                    horizon[c] = cy
    if use_run:
        _release_short_horizon_runs(chunks, marked, min_run)


def _join_blocked(chunks, hold, keep_visible):
    """Per-chunk flags where a long hold may not bridge across a contour.

    The base pass uses MIN_RUN. A gap the longer hold fills is only kept
    filled when the bridged piece crosses no contour drawn by the base
    pass. A gap that would cross one is a back face showing through a
    ridge, so it stays hidden.
    """
    from shapely.geometry import LineString
    from shapely.strtree import STRtree

    base_flags = []
    segs = []
    owner = []
    for ci, chunk in enumerate(chunks):
        raw = [hide for (_px, _py, _yr, hide) in chunk]
        base = solid_flags(raw, chunk, MIN_RUN)
        base_flags.append(base)
        run = []
        for (px, py, _yr, _h), flag in zip(chunk, base):
            if flag:
                if len(run) >= 2:
                    segs.append(LineString(run))
                    owner.append(ci)
                run = []
            else:
                run.append((px, py))
        if len(run) >= 2:
            segs.append(LineString(run))
            owner.append(ci)
    tree = STRtree(segs) if segs else None
    out = []
    cands = []
    for ci, chunk in enumerate(chunks):
        raw = [hide for (_px, _py, _yr, hide) in chunk]
        joined = solid_flags(raw, chunk, hold, keep_visible)
        base = base_flags[ci]
        n = len(chunk)
        i = 0
        while i < n:
            if base[i] and not joined[i]:
                j = i
                while j < n and base[j] and not joined[j]:
                    j += 1
                lo, hi = max(i - 1, 0), min(j, n - 1)
                pts = [(chunk[k][0], chunk[k][1]) for k in range(lo, hi + 1)]
                if len(pts) >= 2:
                    cands.append((LineString(pts), ci, i, j))
                i = j
            else:
                i += 1
        out.append(joined)
    # Shortest bridges first. An accepted bridge also blocks a later one,
    # so two filled gaps cannot cross each other either.
    cands.sort(key=lambda c: c[0].length)
    cell = 40.0
    grid = {}
    blocked = 0
    for bridge, ci, i, j in cands:
        bad = False
        if tree is not None:
            for k in tree.query(bridge):
                if owner[k] != ci and bridge.crosses(segs[k]):
                    bad = True
                    break
        x0, y0, x1, y1 = bridge.bounds
        keys = [(gx, gy) for gx in range(int(x0 // cell), int(x1 // cell) + 1) for gy in range(int(y0 // cell), int(y1 // cell) + 1)]
        if not bad:
            seen_ids = set()
            for key in keys:
                for other, oc in grid.get(key, ()):
                    if id(other) in seen_ids or oc == ci:
                        continue
                    seen_ids.add(id(other))
                    if bridge.crosses(other):
                        bad = True
                        break
                if bad:
                    break
        if bad:
            for m in range(i, j):
                out[ci][m] = True
            blocked += 1
        else:
            for key in keys:
                grid.setdefault(key, []).append((bridge, ci))
    print("join_blocked", blocked)
    return out


def contour_lines(chunks, min_run=None, min_draw=None, keep_visible=None, no_cross=False):
    """Visible runs after the short-gap hold. One entry per drawn stroke."""
    hold = MIN_RUN if min_run is None else min_run
    draw_at = hold if min_draw is None else min_draw
    drawn = []
    seen = set()
    kept = 0
    pre = _join_blocked(chunks, hold, keep_visible) if no_cross else None
    for ci, chunk in enumerate(chunks):
        if pre is not None:
            flags = pre[ci]
        else:
            flags = solid_flags([hide for (_px, _py, _yr, hide) in chunk], chunk, hold, keep_visible)
        part = []
        depth = None

        def flush_part():
            nonlocal part, depth, kept
            if len(part) >= 2:
                length = 0.0
                for a, b in zip(part, part[1:]):
                    length += math.hypot(b[0] - a[0], b[1] - a[1])
                # A piece shorter than the draw length is the same flicker,
                # drawn as a dot. The draw length is the hold, unless a hill
                # keeps a longer join and still draws a real short ring.
                if length < draw_at:
                    part = []
                    depth = None
                    return
                sig = tuple((round(p[0], 1), round(p[1], 1)) for p in part)
                rev = tuple(reversed(sig))
                if sig not in seen and rev not in seen:
                    seen.add(sig)
                    drawn.append((depth, part))
                    kept += len(part)
            part = []
            depth = None

        for (px, py, yr, _hide), flag in zip(chunk, flags):
            if flag:
                flush_part()
                continue
            if depth is None:
                depth = yr
            part.append((px, py))
        flush_part()
    return drawn, kept


def _seg_cross(a, b, c, d):
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def join_clear_gaps(chunks, hold, max_gap, keep_visible=None):
    """Draw a hidden gap again when drawing it would cross no visible contour.

    Two contours of different heights can never both be seen at one screen
    point, so a gap that would cross a drawn contour is a real hide behind
    a nearer ridge and stays hidden. A gap that crosses nothing is a graze
    and is drawn, so the line stays one stroke without clipping a ridge.
    Only interior gaps up to max_gap px, between two drawn pieces of the
    same contour, are tested.
    """
    cell = 20.0
    grid = {}
    flags_all = []
    for ci, chunk in enumerate(chunks):
        flags = solid_flags([h for (_x, _y, _z, h) in chunk], chunk, hold, keep_visible)
        flags_all.append(flags)
        for pi in range(len(chunk) - 1):
            if flags[pi] or flags[pi + 1]:
                continue
            a = chunk[pi][:2]
            b = chunk[pi + 1][:2]
            for gx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
                for gy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                    grid.setdefault((gx, gy), []).append((ci, pi, a, b))

    def crosses(ci, base, pts):
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            for gx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
                for gy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                    for oc, opi, c, d in grid.get((gx, gy), ()):
                        if oc == ci and abs(opi - (base + k)) <= 1:
                            continue
                        if _seg_cross(a, b, c, d):
                            return True
        return False

    joined = 0
    for ci, chunk in enumerate(chunks):
        flags = flags_all[ci]
        n = len(flags)
        i = 0
        while i < n:
            if not flags[i]:
                i += 1
                continue
            s = i
            while i < n and flags[i]:
                i += 1
            e = i
            if s == 0 or e >= n:
                continue
            pts = [p[:2] for p in chunk[s - 1:e + 1]]
            length = sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(pts, pts[1:]))
            if length > max_gap or crosses(ci, s - 1, pts):
                continue
            for pi in range(s, e):
                px, py, yr, _h = chunk[pi]
                chunk[pi] = (px, py, yr, False)
            joined += 1
    return joined


def project_contours(arr, gt, paper, project_xy, metres, rot, horizon_at, col_of, depth_grid=None, float_tol=None, float_min_run=None, float_hide=None, contour_hold=None, tight=None, depth_hide=None, contour_draw=None, contour_keep=None, clear_join=None):
    """Contours across the whole DEM. Nearer ground hides the back.

    A point is hidden only when terrain DEPTH_BIAS metres in front of it
    stands above it. The line stops RIDGE_MARGIN pixels under that
    skyline. Coordinates are not moved, and nothing is drawn along the
    skyline. Visibility is then held for MIN_RUN pixels so a facing
    contour stays one solid stroke.

    depth_grid, when set, also hides a point that sits tol metres behind
    the nearest terrain in its screen cell. Hills without an entry leave
    the grid unset, so this test does not run.

    float_tol, when set, runs the floating horizon after the skyline.
    The stroke-weight line count stays the pre-horizon count, so this
    pass does not change run or lift width. float_min_run, when set,
    draws a horizon dip that is shorter than that many samples.
    float_hide(px, py), when set, keeps the hide inside that screen band.
    """
    _hill = GEOM.name[: -len("-geom.json")] if GEOM.name.endswith("-geom.json") else ""
    raw = marching_contours(arr, gt, CONTOUR_M_HILL.get(_hill, CONTOUR_M))
    hidden = 0
    chunks = []
    for elev, line in raw:
        if len(line) < 2:
            continue
        chunk = []

        def flush():
            nonlocal chunk
            if len(chunk) >= 2:
                chunks.append(chunk)
            chunk = []

        for lon, lat in line:
            xr, yr = rot(*metres(lon, lat))
            px, py = paper(*project_xy(xr, yr, elev))
            if px < -220 or px > 1220 or py < -220 or py > 1220:
                flush()
                continue
            crest, cdepth = horizon_at(yr)
            i = col_of(px)
            # A ridge that covers this column, or the column beside it, hides
            # the point. One-column holes in the silhouette used to let the
            # far slope show through. Only terrain DEPTH_BIAS metres in front
            # counts, and the line stops RIDGE_MARGIN px under that skyline.
            hide = False
            nbin = len(crest)
            for j in (i - 1, i, i + 1):
                if j < 0 or j >= nbin:
                    continue
                top = crest[j]
                if (
                    top < 1e8
                    and yr - cdepth[j] >= DEPTH_BIAS
                    and py >= top - RIDGE_MARGIN
                ):
                    hide = True
                    break
            # Screen-cell test, this hill only. A spur that is not the
            # skyline still owns the pixels it covers. The short-gap hold
            # still applies, so a one-sample miss on the near face returns.
            if (
                depth_grid is not None
                and not hide
                and (depth_hide is None or depth_hide(px, py))
            ):
                near = depth_grid.nearest(px, py)
                if near < 1e8 and yr - near >= depth_grid.tol:
                    hide = True
            if hide:
                hidden += 1
            chunk.append((px, py, yr, hide))
        flush()

    before, before_kept = contour_lines(chunks, contour_hold, contour_draw, contour_keep, _hill in CONTOUR_NO_CROSS)
    print("occlusion", "kept", before_kept, "hidden", hidden, "lines", len(before))

    def tight_hide(px, py, spec=tight):
        if not spec:
            return False

        def inside(region):
            xb = region.get("x")
            yb = region.get("y")
            if xb and not (xb[0] <= px <= xb[1]):
                return False
            if yb and not (yb[0] <= py <= yb[1]):
                return False
            return True

        regions = spec.get("regions")
        if regions:
            return any(inside(region) for region in regions)
        return inside(spec)

    if tight:
        apply_floating_horizon(
            chunks, col_of, tight["tol"], tight.get("min_run"), tight_hide
        )
    if float_tol is None and not tight:
        return before, len(before)
    if float_tol is not None:
        apply_floating_horizon(chunks, col_of, float_tol, float_min_run, float_hide)
    if clear_join is not None:
        print("clearjoin", "max_gap", clear_join, "joined",
              join_clear_gaps(chunks, contour_hold or MIN_RUN, clear_join, contour_keep))
    drawn, kept = contour_lines(chunks, contour_hold, contour_draw, contour_keep, _hill in CONTOUR_NO_CROSS)
    before_bag = {}
    for _yr, line in before:
        for px, py in line:
            key = (px, py)
            before_bag[key] = before_bag.get(key, 0) + 1
    after_bag = {}
    for _yr, line in drawn:
        for px, py in line:
            key = (px, py)
            after_bag[key] = after_bag.get(key, 0) + 1
    # Lower third of the sheet. The jagged peaks sit here; the ski
    # runs sit above it.
    band = 1000.0 * 2.0 / 3.0
    hid_low = hid_high = 0
    for (px, py), n in before_bag.items():
        gone = n - after_bag.get((px, py), 0)
        if gone <= 0:
            continue
        if py >= band:
            hid_low += gone
        else:
            hid_high += gone
    print(
        "floathorizon",
        "tol", float_tol if float_tol is not None else tight["tol"],
        "before", before_kept,
        "after", kept,
        "hidden_low", hid_low,
        "hidden_high", hid_high,
        "band_y", round(band, 1),
        *(("min_run", float_min_run) if float_min_run else ()),
    )
    LAST_CONTOUR_CHUNKS[:] = [[(p[0], p[1], p[2], f) for p, f in zip(c, solid_flags([q[3] for q in c], c, contour_hold or MIN_RUN, contour_keep))] for c in chunks]
    return drawn, len(before)


def resolve_sun(facing_deg, settings):
    """One sun. Azimuth follows the hill unless a setting overrides it."""
    settings = settings or {}
    azimuth = settings.get("azimuth")
    if azimuth is None:
        azimuth = (facing_deg - SUN_OFFSET_CCW) % 360.0
    return {
        "azimuth": float(azimuth) % 360.0,
        "elevation": float(settings.get("elevation", SUN_ELEVATION)),
        "intensity": float(settings.get("intensity", SUN_INTENSITY)),
        "ambient": float(settings.get("ambient", SUN_AMBIENT)),
        "shade": settings.get("shade") or SHADE_MODE,
    }


def sun_vector(facing_rad, sun):
    """Unit vector toward the sun, in the view frame (right, away, up)."""
    az = math.radians(sun["azimuth"])
    el = math.radians(sun["elevation"])
    east = math.cos(el) * math.sin(az)
    north = math.cos(el) * math.cos(az)
    up = math.sin(el)
    ca, sa = math.cos(facing_rad), math.sin(facing_rad)
    xr = east * ca - north * sa
    yr = east * sa + north * ca
    length = math.hypot(xr, math.hypot(yr, up)) or 1.0
    return xr / length, yr / length, up / length


def shade_grey(ndotl, sun):
    """Lambertian reflectance. Never black.

    soft divides ambient back out and maps the light onto 156-250.
    contrast leaves ambient in the tone: 0.20 plus 0.80 of the square
    root of the light, mapped from 136 at no light to 252 in full sun.
    """
    n = max(0.0, min(1.0, ndotl))
    if sun.get("shade") == "contrast":
        lit = CONTRAST_AMBIENT + CONTRAST_INTENSITY * (n ** CONTRAST_GAMMA)
        return int(round(CONTRAST_GREY_LO + lit * (CONTRAST_GREY_HI - CONTRAST_GREY_LO)))
    lit = sun["ambient"] + sun["intensity"] * n
    peak = sun["ambient"] + sun["intensity"]
    t = (lit - sun["ambient"]) / max(peak - sun["ambient"], 1e-6)
    return int(round(SOFT_GREY_LO + t * (SOFT_GREY_HI - SOFT_GREY_LO)))


def hillshade_png(grid, paper, sun_dir, sun):
    """Projected terrain mesh. Far quads first, so the near slope wins."""
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    image = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    greys = []

    def neighbor(ci, ri, dc, dr):
        cc, rr = ci + dc, ri + dr
        if 0 <= cc < cols and 0 <= rr < rows:
            return grid[rr][cc]
        return None

    def normal_grey(ci, ri):
        cell = grid[ri][ci]
        if cell is None:
            return None
        left, right = neighbor(ci, ri, -1, 0), neighbor(ci, ri, 1, 0)
        down, up = neighbor(ci, ri, 0, -1), neighbor(ci, ri, 0, 1)
        if left and right:
            dx = right[3] - left[3]
            dzdx = (right[2] - left[2]) / dx if abs(dx) >= 1 else 0.0
        elif right:
            dx = right[3] - cell[3]
            dzdx = (right[2] - cell[2]) / dx if abs(dx) >= 1 else 0.0
        elif left:
            dx = cell[3] - left[3]
            dzdx = (cell[2] - left[2]) / dx if abs(dx) >= 1 else 0.0
        else:
            return None
        if down and up:
            dy = up[4] - down[4]
            dzdy = (up[2] - down[2]) / dy if abs(dy) >= 1 else 0.0
        elif up:
            dy = up[4] - cell[4]
            dzdy = (up[2] - cell[2]) / dy if abs(dy) >= 1 else 0.0
        elif down:
            dy = cell[4] - down[4]
            dzdy = (cell[2] - down[2]) / dy if abs(dy) >= 1 else 0.0
        else:
            return None
        # The drawing stretches height, so the shade uses the same slopes
        # with a modest z-factor. Otherwise a facing slope stays one grey.
        nx, ny, nz = -dzdx * 2.0, -dzdy * 2.0, 1.0
        length = math.hypot(nx, math.hypot(ny, nz)) or 1.0
        ndotl = (nx * sun_dir[0] + ny * sun_dir[1] + nz * sun_dir[2]) / length
        return shade_grey(ndotl, sun)

    # ri grows away from the camera, so the high rows are the far slope.
    for ri in range(rows - 2, -1, -1):
        for ci in range(cols - 1):
            quad = (
                grid[ri][ci],
                grid[ri][ci + 1],
                grid[ri + 1][ci + 1],
                grid[ri + 1][ci],
            )
            if any(cell is None for cell in quad):
                continue
            grey = normal_grey(ci, ri)
            if grey is None:
                continue
            greys.append(grey)
            pts = [paper(cell[0], cell[1]) for cell in quad]
            if max(p[0] for p in pts) < -20 or min(p[0] for p in pts) > 1020:
                continue
            if max(p[1] for p in pts) < -20 or min(p[1] for p in pts) > 1020:
                continue
            draw.polygon(pts, fill=(grey, grey, grey, 255))
    if not greys:
        return None, None, None
    # Blur against white so clear pixels do not pull the tone toward black.
    flat = Image.new("RGB", image.size, (255, 255, 255))
    flat.paste(image, mask=image.split()[-1])
    flat = flat.filter(ImageFilter.GaussianBlur(radius=1.8))
    alpha = image.split()[-1].filter(ImageFilter.GaussianBlur(radius=1.6))
    image = flat.convert("RGBA")
    image.putalpha(alpha)
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii"), min(greys), max(greys)


def edge_fit(pts, margin, right=1000.0, bottom=880.0):
    """Centre the drawing, then zoom out until every side clears `margin`.

    The caption covers the bottom of the square, so the lower frame edge
    is `bottom` (880), not 1000. Returns (scale, cx, cy, tcx, tcy).
    Scale stays 1 and the centre is unchanged when the drawing is already
    clear of the margin. Scale is below 1 only as far as the margin needs.
    """
    minx = min(p[0] for p in pts)
    maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts)
    maxy = max(p[1] for p in pts)
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0
    if min(minx, right - maxx, miny, bottom - maxy) >= margin - 0.05:
        return 1.0, cx, cy, cx, cy
    tcx = right / 2.0
    tcy = bottom / 2.0
    half_w = max((maxx - minx) / 2.0, 1.0)
    half_h = max((maxy - miny) / 2.0, 1.0)
    avail_w = max((right - 2.0 * margin) / 2.0, 1.0)
    avail_h = max((bottom - 2.0 * margin) / 2.0, 1.0)
    scale = min(1.0, avail_w / half_w, avail_h / half_h)
    return scale, cx, cy, tcx, tcy


# Run-name labels. Tried largest first. Ink includes the white halo.
# A label is kept only when that ink clears every run and lift stroke
# and every name already placed. Contours stay out of the test: they
# are the ground, not trail geometry.
LABEL_FONT_SIZES = (6.0, 5.2, 4.5, 4.0, 3.5)
LABEL_TRACK = 0.02
LABEL_CAP = 0.72
LABEL_DESC = 0.25
# Pixels between the host stroke's edge and the label ink.
LABEL_CLEAR = 0.85
# Pixels between label ink and any other stroke edge, and between labels.
LABEL_GAP = 0.40
LABEL_LABEL_GAP = 0.65
LABEL_CELL = 48.0


def label_halo(size):
    return max(0.34, size * 0.08)


_LABEL_FONT = None


def label_measure_font():
    """Arial-bold metrics. font-weight 600 falls back to bold, and
    Liberation Sans matches Arial, which is wider than Helvetica."""
    global _LABEL_FONT
    if _LABEL_FONT is False:
        return None
    if _LABEL_FONT is not None:
        return _LABEL_FONT
    path = Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf")
    if not path.exists():
        _LABEL_FONT = False
        return None
    _LABEL_FONT = ImageFont.truetype(str(path), 100)
    return _LABEL_FONT


def label_width(name, size):
    n = len(name)
    if n <= 0:
        return 0.0
    tracking = (n - 1) * size * LABEL_TRACK
    font = label_measure_font()
    if font is None:
        return n * size * 0.72 + tracking
    # A few percent over the measured advance covers Helvetica Neue
    # versus Arial and the halo at the last letter.
    return font.getlength(name) * (size / 100.0) * 1.04 + tracking


def cumulative(pts):
    acc = [0.0]
    for a, b in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return acc


def point_along(pts, acc, dist):
    if dist <= 0.0:
        return pts[0]
    if dist >= acc[-1]:
        return pts[-1]
    i = bisect.bisect_right(acc, dist) - 1
    span = acc[i + 1] - acc[i]
    t = (dist - acc[i]) / span if span else 0.0
    ax, ay = pts[i]
    bx, by = pts[i + 1]
    return (ax + (bx - ax) * t, ay + (by - ay) * t)


def slice_along(pts, acc, s0, s1):
    out = [point_along(pts, acc, s0)]
    for i in range(1, len(acc) - 1):
        if s0 < acc[i] < s1:
            out.append(pts[i])
    end = point_along(pts, acc, s1)
    if math.hypot(end[0] - out[-1][0], end[1] - out[-1][1]) > 0.05:
        out.append(end)
    elif len(out) < 2:
        out.append(end)
    return out


def label_ribbon(pts, size, host_half, halo, side=1.0):
    """OBBs of the glyph ink, offset beside `pts`.

    side > 0 is the left normal of the path (uy, -ux): negative SVG dy,
    above a left-to-right baseline. side < 0 is the other side. The
    ribbon is the ink, halo included.
    """
    acc = cumulative(pts)
    length = acc[-1]
    if length < 0.5:
        return [], 0.0
    desc = size * LABEL_DESC
    cap = size * LABEL_CAP
    halo_out = halo / 2.0
    baseline = host_half + LABEL_CLEAR + desc + halo_out
    near = baseline - desc - halo_out
    far = baseline + cap + halo_out
    mid_off = (near + far) * 0.5
    half_h = (far - near) * 0.5
    step = max(2.8, size * 0.55)
    boxes = []
    s = 0.0
    while s < length - 0.05:
        e = min(length, s + step)
        if e - s < 0.35:
            break
        p0 = point_along(pts, acc, s)
        p1 = point_along(pts, acc, e)
        dx = p1[0] - p0[0]
        dy = p1[1] - p0[1]
        hyp = math.hypot(dx, dy)
        if hyp < 0.05:
            s = e
            continue
        ux, uy = dx / hyp, dy / hyp
        nx, ny = uy * side, -ux * side
        cx = (p0[0] + p1[0]) * 0.5 + nx * mid_off
        cy = (p0[1] + p1[1]) * 0.5 + ny * mid_off
        boxes.append((cx, cy, ux, uy, nx, ny, hyp * 0.5 + 0.12, half_h))
        if e >= length - 0.05:
            break
        s = e
    return boxes, baseline


def _cs_code(x, y, hw, hh):
    code = 0
    if x < -hw:
        code |= 1
    elif x > hw:
        code |= 2
    if y < -hh:
        code |= 4
    elif y > hh:
        code |= 8
    return code


def segment_hits_obb(ax, ay, bx, by, cx, cy, ux, uy, nx, ny, hw, hh):
    """True when segment AB meets the oriented box, edge included."""
    def loc(x, y):
        dx = x - cx
        dy = y - cy
        return dx * ux + dy * uy, dx * nx + dy * ny

    x0, y0 = loc(ax, ay)
    x1, y1 = loc(bx, by)
    c0 = _cs_code(x0, y0, hw, hh)
    c1 = _cs_code(x1, y1, hw, hh)
    for _ in range(12):
        if c0 == 0 or c1 == 0:
            return True
        if c0 & c1:
            return False
        code = c0 or c1
        dx = x1 - x0
        dy = y1 - y0
        if code & 1:
            if dx == 0.0:
                return False
            t = (-hw - x0) / dx
            x, y = -hw, y0 + t * dy
        elif code & 2:
            if dx == 0.0:
                return False
            t = (hw - x0) / dx
            x, y = hw, y0 + t * dy
        elif code & 4:
            if dy == 0.0:
                return False
            t = (-hh - y0) / dy
            x, y = x0 + t * dx, -hh
        else:
            if dy == 0.0:
                return False
            t = (hh - y0) / dy
            x, y = x0 + t * dx, hh
        if code == c0:
            x0, y0 = x, y
            c0 = _cs_code(x0, y0, hw, hh)
        else:
            x1, y1 = x, y
            c1 = _cs_code(x1, y1, hw, hh)
    return False


def _obb_corners(box, extra):
    cx, cy, ux, uy, nx, ny, hw, hh = box
    hw += extra
    hh += extra
    return [
        (cx + ux * sx + nx * sy, cy + uy * sx + ny * sy)
        for sx in (-hw, hw)
        for sy in (-hh, hh)
    ]


def obbs_overlap(a, b, gap):
    axes = ((a[2], a[3]), (a[4], a[5]), (b[2], b[3]), (b[4], b[5]))
    ca = _obb_corners(a, gap)
    cb = _obb_corners(b, 0.0)
    for ax, ay in axes:
        pa = [p[0] * ax + p[1] * ay for p in ca]
        pb = [p[0] * ax + p[1] * ay for p in cb]
        if max(pa) < min(pb) or max(pb) < min(pa):
            return False
    return True


# Optional back-bowl layer: runs (by centroid box) and lifts (by name) drawn
# with an extra "sh-bowl" class, hidden until the viewer's toggle adds
# "sh-bowl-on". The catalog marks the same runs ("b": 1) and "bowlLifts".
BACK_BOWL = {
    "stevens-pass": {
        "name": "Mill Valley",
        "lat_max": 47.735,
        "lon_min": -121.086,
        "lifts": ("Jupiter Express", "Southern Cross"),
    },
    # Arapahoe Basin's back side: Montezuma Bowl (south of the Lenawee
    # ridge, Zuma Lift) and the Beavers / Steep Gullies (west, Beavers lift).
    # Each box is lon_min, lon_max, lat_min, lat_max on the run centroid.
    "arapahoe-basin": {
        "name": "Back Side",
        "boxes": (
            (-106.0, -105.0, 39.0, 39.6235),
            (-106.0, -105.8815, 39.6235, 39.6350),
        ),
        "lifts": ("Zuma Lift", "Beavers"),
    },
}


def in_back_bowl(slug, feat, is_lift=False):
    cfg = BACK_BOWL.get(slug)
    if not cfg:
        return False
    if is_lift:
        return feat.get("name") in cfg["lifts"]
    pts = [p for ln in feat["lines"] for p in ln]
    if not pts:
        return False
    lon = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    if "boxes" in cfg:
        return any(a <= lon <= b and c <= lat <= d for a, b, c, d in cfg["boxes"])
    return lat < cfg["lat_max"] and lon > cfg["lon_min"]


def build(arr, gt, runs, lifts, facing, lock_facing=False, out_path=None, slug="hill", elevation=73.0, z_scale=None, depth_scale=1.0, sun=None, run_width=2.2, full_ground=False, frame_scale=1.0, edge_margin=0.0, frame_runs=None, ridge_fade=None, lift_width=None, run_labels=False, post_scale=1.0, pan_y=0.0):
    h, w = len(arr), len(arr[0])
    midlat = gt[3] + (h * gt[5]) / 2
    cos = math.cos(midlat * math.pi / 180)
    minlon, maxlat = gt[0], gt[3]
    maxlon = minlon + w * gt[1]
    minlat = maxlat + h * gt[5]
    origin_lon = (minlon + maxlon) / 2
    origin_lat = (minlat + maxlat) / 2
    m_lon = 111320 * cos
    m_lat = 110540

    def metres(lon, lat):
        return (lon - origin_lon) * m_lon, (lat - origin_lat) * m_lat

    def unmetres(x, y):
        return origin_lon + x / m_lon, origin_lat + y / m_lat

    ang = facing
    ca, sa = math.cos(ang), math.sin(ang)

    def rot(x, y):
        return x * ca - y * sa, x * sa + y * ca

    def unrot(xr, yr):
        return xr * ca + yr * sa, -xr * sa + yr * ca

    def orient(ang_now):
        nonlocal ca, sa
        ca, sa = math.cos(ang_now), math.sin(ang_now)
        pts = []
        step_r = max(1, h // 40)
        step_c = max(1, w // 40)
        for row in range(0, h, step_r):
            for col in range(0, w, step_c):
                z = arr[row][col]
                if z != z:
                    continue
                lon = minlon + (col + 0.5) * gt[1]
                lat = maxlat + (row + 0.5) * gt[5]
                xr, yr = rot(*metres(lon, lat))
                pts.append((yr, z))
        zs = sorted(p[1] for p in pts)
        high = zs[int(len(zs) * 0.9)]
        low = zs[int(len(zs) * 0.1)]
        hy = sum(p[0] for p in pts if p[1] >= high)
        ly = sum(p[0] for p in pts if p[1] <= low)
        return hy >= ly

    # Hand-set facings stay as given. A default facing is flipped when the
    # summit would otherwise sit on the near side.
    if lock_facing:
        ca, sa = math.cos(ang), math.sin(ang)
    elif not orient(ang):
        ang += math.pi
        orient(ang)

    # Ground window from the runs, so the resort fills the square.
    # frame_runs keeps the sheet where it was when some runs are not drawn.
    window_runs = frame_runs if frame_runs is not None else runs
    run_xy = []
    for run in window_runs:
        for line in run["lines"]:
            for lon, lat in line:
                run_xy.append(rot(*metres(lon, lat)))
    rxs = [p[0] for p in run_xy]
    rys = [p[1] for p in run_xy]
    pad_x = (max(rxs) - min(rxs)) * 0.06
    pad_y = (max(rys) - min(rys)) * 0.08
    gx0, gx1 = min(rxs) - pad_x, max(rxs) + pad_x
    gy0, gy1 = min(rys) - pad_y, max(rys) + pad_y
    if full_ground:
        # The run window can leave the summit and the near slope outside
        # the mesh. Those parts then project off the sheet and get clipped.
        corners = [
            rot(*metres(lon, lat))
            for lon, lat in (
                (minlon, maxlat),
                (maxlon, maxlat),
                (minlon, minlat),
                (maxlon, minlat),
            )
        ]
        gx0 = min(p[0] for p in corners)
        gx1 = max(p[0] for p in corners)
        gy0 = min(p[1] for p in corners)
        gy1 = max(p[1] for p in corners)

    # elevation is degrees above the horizon. pitch tilts up from a flat plan.
    pitch_rad = math.radians(90.0 - elevation)
    scale = Z_SCALE if z_scale is None else z_scale
    depth = depth_scale

    def project_xy(xr, yr, z):
        # xr, yr and z are metres. z is the real elevation, not a 0–1 fraction.
        # depth stretches yr only, so gentle slopes (large ground run per
        # contour) open up and steep slopes stay packed.
        return xr, yr * depth * math.cos(pitch_rad) + z * scale * math.sin(pitch_rad)

    grid = []
    for ri in range(ROWS):
        yr = gy0 + (gy1 - gy0) * ri / (ROWS - 1)
        line = []
        for ci in range(COLS):
            xr = gx0 + (gx1 - gx0) * ci / (COLS - 1)
            lon, lat = unmetres(*unrot(xr, yr))
            z = sample(arr, gt, lon, lat)
            if z is None:
                line.append(None)
                continue
            sx, sy = project_xy(xr, yr, z)
            line.append((sx, sy, z, xr, yr))
        grid.append(line)

    cells = [cell for line in grid for cell in line if cell]
    if len(cells) < 20:
        raise SystemExit("dem empty")
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    # Fit the whole projection to the sheet. Depth scale 2 makes that
    # projection nearly square, so the topo reaches the card edges
    # instead of sitting in a white gutter. The page caption is painted
    # over the bottom band. Uniform scale: x and y stay true.
    margin = 4
    view = 1000 - 2 * margin
    data_w = max(maxx - minx, 1)
    data_h = max(maxy - miny, 1)
    fit = min(view / data_w, view / data_h)
    pad_x = (1000 - data_w * fit) / 2
    pad_y = (1000 - data_h * fit) / 2

    def paper(sx, sy):
        px = pad_x + (sx - minx) * fit
        py = pad_y + (maxy - sy) * fit
        return px, py

    # The caption covers the bottom 120px. Runs have to sit inside the
    # square above that band, with a small margin. Shift the whole sheet
    # when a translation is enough. Scale only when the run box is taller
    # or wider than that opening, and only while the scale stays close to 1.
    # Below 0.82 the drawing would shrink badly, so the sheet is left as-is.
    safe_l, safe_t, safe_r, safe_b = 18.0, 18.0, 982.0, 862.0

    def run_paper_points():
        pts = []
        for run in window_runs:
            for line in run["lines"]:
                for lon, lat in line:
                    z = sample(arr, gt, lon, lat)
                    if z is None:
                        continue
                    xr, yr = rot(*metres(lon, lat))
                    pts.append(paper(*project_xy(xr, yr, z + RUN_CLEAR)))
        return pts

    run_pts = run_paper_points()
    fit_label = "inside"
    # A full-ground sheet is already fitted to the DEM. Shifting it to
    # centre the runs would push the restored peak or foreground back off.
    if full_ground:
        fit_label = "full-ground"
    elif len(run_pts) >= 2:
        rx0 = min(p[0] for p in run_pts)
        rx1 = max(p[0] for p in run_pts)
        ry0 = min(p[1] for p in run_pts)
        ry1 = max(p[1] for p in run_pts)
        outside = rx0 < safe_l or rx1 > safe_r or ry0 < safe_t or ry1 > safe_b
        box_w = rx1 - rx0
        box_h = ry1 - ry0
        safe_w = safe_r - safe_l
        safe_h = safe_b - safe_t
        if not outside:
            fit_label = "inside"
        elif box_w <= safe_w and box_h <= safe_h:
            dx = safe_l - rx0 if rx0 < safe_l else (safe_r - rx1 if rx1 > safe_r else 0.0)
            dy = safe_t - ry0 if ry0 < safe_t else (safe_b - ry1 if ry1 > safe_b else 0.0)
            base_paper = paper

            def paper(sx, sy, _base=base_paper, _dx=dx, _dy=dy):
                px, py = _base(sx, sy)
                return px + _dx, py + _dy

            fit_label = "shift %.1f %.1f" % (dx, dy)
        else:
            scale_fit = min(safe_w / max(box_w, 1.0), safe_h / max(box_h, 1.0))
            if scale_fit < 0.82:
                fit_label = "clip %.3f" % scale_fit
            else:
                cx = (rx0 + rx1) / 2.0
                cy = (ry0 + ry1) / 2.0
                scx = (safe_l + safe_r) / 2.0
                scy = (safe_t + safe_b) / 2.0
                base_paper = paper

                def paper(sx, sy, _base=base_paper, _cx=cx, _cy=cy, _scx=scx, _scy=scy, _s=scale_fit):
                    px, py = _base(sx, sy)
                    return _scx + (px - _cx) * _s, _scy + (py - _cy) * _s

                fit_label = "scale %.3f" % scale_fit

    # The overflow fit only pushes a drawing back inside the box, so a low
    # hill ends sitting on the caption. Centre the runs between the top
    # margin and the caption band. Terrain and lifts move with the sheet.
    # The shift is clamped so the runs stay inside that box.
    centered = [] if full_ground else (run_paper_points() if len(run_pts) >= 2 else [])
    if len(centered) >= 2:
        y0 = min(p[1] for p in centered)
        y1 = max(p[1] for p in centered)
        want = (safe_t + safe_b) / 2.0 - (y0 + y1) / 2.0
        dy_min = safe_t - y0
        dy_max = safe_b - y1
        vdy = min(max(want, dy_min), dy_max) if dy_min <= dy_max else 0.0
        if abs(vdy) >= 0.5:
            base_paper = paper

            def paper(sx, sy, _base=base_paper, _dy=vdy):
                px, py = _base(sx, sy)
                return px, py + _dy

            fit_label += " vcenter %.1f" % vdy
        else:
            fit_label += " vcenter 0"

    if frame_scale != 1:
        base_paper = paper

        def paper(sx, sy, _base=base_paper, _s=frame_scale):
            px, py = _base(sx, sy)
            return 500.0 + (px - 500.0) * _s, 500.0 + (py - 500.0) * _s

        fit_label += " frame %.3f" % frame_scale

    # US sheets pass a margin. Zoom the whole drawing out, about its own
    # centre, until the runs and lifts clear that margin. Stroke widths
    # are applied later in user units, so the line weight does not change.
    # Canada leaves edge_margin at 0 and skips this.
    if edge_margin > 0:
        # Stray lift terminals can sit thousands of units off the hill.
        # They must not decide the frame. Keep lifts that sit on the runs.
        run_box = []
        lift_box = []
        for group, z_add, bucket in (
            (window_runs, RUN_CLEAR, run_box),
            (lifts, LIFT_CLEAR, lift_box),
        ):
            for item in group:
                for line in item["lines"]:
                    for lon, lat in line:
                        z = sample(arr, gt, lon, lat)
                        if z is None:
                            continue
                        xr, yr = rot(*metres(lon, lat))
                        bucket.append(paper(*project_xy(xr, yr, z + z_add)))
        drawn_pts = run_box
        if len(run_box) >= 2:
            rx0 = min(p[0] for p in run_box)
            rx1 = max(p[0] for p in run_box)
            ry0 = min(p[1] for p in run_box)
            ry1 = max(p[1] for p in run_box)
            pad = 80.0
            lift_box = [
                p for p in lift_box
                if rx0 - pad <= p[0] <= rx1 + pad and ry0 - pad <= p[1] <= ry1 + pad
            ]
            drawn_pts = run_box + lift_box
        if len(drawn_pts) >= 2:
            margin_s, mcx, mcy, tcx, tcy = edge_fit(drawn_pts, edge_margin)
            if margin_s < 0.999 or abs(tcx - mcx) > 0.5 or abs(tcy - mcy) > 0.5:
                base_paper = paper

                def paper(sx, sy, _base=base_paper, _s=margin_s, _cx=mcx, _cy=mcy, _tx=tcx, _ty=tcy):
                    px, py = _base(sx, sy)
                    return _tx + (px - _cx) * _s, _ty + (py - _cy) * _s

                fit_label += " margin %.3f" % margin_s

    # Zoom-out and pan applied after the US edge-margin fit, so the margin
    # fit cannot undo them. post_scale < 1 pulls the sheet back around the
    # frame centre (500, 440, the area above the caption); pan_y < 0 moves
    # the drawing up. Set per hill in CAMERAS.
    if post_scale != 1 or pan_y:
        base_paper = paper

        def paper(sx, sy, _base=base_paper, _s=post_scale, _dy=pan_y):
            px, py = _base(sx, sy)
            return 500.0 + (px - 500.0) * _s, 440.0 + (py - 440.0) * _s + _dy

        fit_label += " post %.3f pan %.1f" % (post_scale, pan_y)

    facing_deg = math.degrees(ang) % 360.0
    sun = resolve_sun(facing_deg, sun)
    sun_dir = sun_vector(ang, sun)
    shade_b64, shade_lo, shade_hi = None, None, None
    if sun.get("shade") in ("soft", "contrast"):
        shade_cols, shade_rows = 220, 150
        shade_grid = []
        for ri in range(shade_rows):
            yr = gy0 + (gy1 - gy0) * ri / (shade_rows - 1)
            line = []
            for ci in range(shade_cols):
                xr = gx0 + (gx1 - gx0) * ci / (shade_cols - 1)
                lon, lat = unmetres(*unrot(xr, yr))
                z = sample(arr, gt, lon, lat)
                if z is None:
                    line.append(None)
                    continue
                sx, sy = project_xy(xr, yr, z)
                line.append((sx, sy, z, xr, yr))
            shade_grid.append(line)
        shade_b64, shade_lo, shade_hi = hillshade_png(shade_grid, paper, sun_dir, sun)

    bins = 2000
    empty_py = [1e9] * bins
    empty_depth = [0.0] * bins

    def col_of(px):
        i = int(px / 1000 * (bins - 1))
        return max(0, min(bins - 1, i))

    # Every DEM sample in the resort window. Contours are interpolated
    # between these samples, so they cannot sit above this skyline.
    samples = []
    for r in range(h):
        lat = maxlat + (r + 0.5) * gt[5]
        for c in range(w):
            z = arr[r][c]
            if z != z:
                continue
            lon = minlon + (c + 0.5) * gt[1]
            xr, yr = rot(*metres(lon, lat))
            if xr < gx0 or xr > gx1 or yr < gy0 or yr > gy1:
                continue
            samples.append((yr, paper(*project_xy(xr, yr, z))))
    samples.sort()
    step = 6.0
    horizon_py = empty_py[:]
    horizon_depth = empty_depth[:]
    snap_yr = []
    snap_py = []
    snap_depth = []
    buckets = {}
    for yr, (px, py) in samples:
        buckets.setdefault(int(yr // step), []).append((px, py, yr))

    def paint(px, py, yr):
        i = col_of(px)
        if py < horizon_py[i]:
            horizon_py[i] = py
            horizon_depth[i] = yr

    for key in sorted(buckets):
        snap_yr.append(key * step)
        snap_py.append(horizon_py[:])
        snap_depth.append(horizon_depth[:])
        row = sorted(buckets[key])
        for (ax, ay, ayr), (bx, by, byr) in zip(row, row[1:]):
            paint(ax, ay, ayr)
            gap = bx - ax
            # Bridge one DEM cell. A wider gap is a real break in the ridge.
            if gap <= 0 or gap > 26:
                continue
            steps = max(1, int(gap))
            for k in range(1, steps):
                t = k / steps
                paint(ax + (bx - ax) * t, ay + (by - ay) * t, ayr + (byr - ayr) * t)
        if row:
            paint(*row[-1])

    def horizon_at(yr):
        # Skyline of samples strictly nearer than this depth. Comparison only.
        idx = bisect.bisect_right(snap_yr, yr) - 1
        if idx < 0:
            return empty_py, empty_depth
        return snap_py[idx], snap_depth[idx]

    depth_grid = None
    depth_hide = None
    spec = DEPTH_GRIDS.get(slug)
    if spec:
        depth_grid = DepthGrid(spec["cell"], spec["tol"], spec["reach"])
        for yr, (px, py) in samples:
            depth_grid.add(px, py, yr)
        band = spec.get("y")
        if band:
            depth_hide = lambda px, py, lohi=band: lohi[0] <= py <= lohi[1]
        print(
            "depthgrid",
            "cells", depth_grid.filled,
            "cell", depth_grid.cell,
            "reach", depth_grid.reach,
            "tol", depth_grid.tol,
        )

    _hkey = horizon_key(slug)
    contours, stroke_lines = project_contours(
        arr, gt, paper, project_xy, metres, rot, horizon_at, col_of, depth_grid,
        float_tol=FLOATING_HORIZON.get(_hkey),
        float_min_run=HORIZON_MIN_RUN.get(_hkey),
        float_hide=(lambda px, py, key=_hkey: horizon_hides(key, px, py))
        if _hkey in HORIZON_REGION
        else None,
        contour_hold=CONTOUR_HOLD.get(_hkey),
        contour_draw=CONTOUR_DRAW.get(_hkey),
        contour_keep=CONTOUR_KEEP.get(_hkey),
        clear_join=CONTOUR_CLEAR_JOIN.get(_hkey),
        tight=CONTOUR_TIGHT.get(_hkey),
        depth_hide=depth_hide,
    )

    def covered(px, py, yr):
        crest, cdepth = horizon_at(yr)
        i = col_of(px)
        nbin = len(crest)
        for j in (i - 1, i, i + 1):
            if j < 0 or j >= nbin:
                continue
            top = crest[j]
            if top < 1e8 and yr - cdepth[j] >= DEPTH_BIAS and py >= top - RIDGE_MARGIN:
                return True
        return False

    run_probe = None
    if RUN_CONTOUR_HORIZON.get(horizon_key(slug)) is not None:
        run_probe = ContourCrest(LAST_CONTOUR_CHUNKS, col_of)
    run_tol = RUN_CONTOUR_HORIZON.get(horizon_key(slug))

    def covered_run(px, py, yr):
        # Also behind when the drawn contours nearer than this point
        # already crest above it on screen. A low near ridge that the
        # 40 m skyline test misses still hides the run there.
        if covered(px, py, yr):
            return True
        return run_probe is not None and run_probe.hides(px, py, yr, run_tol)

    def stroke(lines, colour, width, z_add=0.0, dash=None, css_class=None, occlude=False, fade_opacity=None, chunks_out=None):
        parts = []
        # Dash lives on the element that asks for it. Everything else is
        # explicitly solid so a lift dash cannot inherit onto contours.
        dash_value = dash if dash else "none"
        klass = f' class="{css_class}"' if css_class else ""

        def emit(chunk, opacity=None):
            if len(chunk) < 2:
                return
            if chunks_out is not None:
                chunks_out.append([(p[0], p[1]) for p in chunk])
            pts = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in chunk)
            op_attr = f' stroke-opacity="{opacity:.2f}"' if opacity is not None else ""
            op_style = f"stroke-opacity:{opacity:.2f};" if opacity is not None else ""
            parts.append(
                f'<polyline{klass} points="{pts}" fill="none" stroke="{colour}"{op_attr} '
                f'style="fill:none;stroke:{colour};{op_style}stroke-width:{width};'
                f"stroke-dasharray:{dash_value};"
                f'stroke-linejoin:round;stroke-linecap:round;vector-effect:none"/>'
            )

        for line in lines:
            sampled = []

            run_spec = RUN_HORIZON.get(horizon_key(slug)) if fade_opacity is not None else None

            def tighten_run(samples):
                """Hide a run that sits behind a nearer ridge in this hill's band."""
                if not run_spec:
                    return
                tol = run_spec["tol"]
                min_run = run_spec.get("min_run") or 12
                xb = run_spec.get("x")
                yb = run_spec.get("y")
                marked = []
                for i, (px, py, yr, hide) in enumerate(samples):
                    if hide:
                        continue
                    if xb and not (xb[0] <= px <= xb[1]):
                        continue
                    if yb and not (yb[0] <= py <= yb[1]):
                        continue
                    crest, _depth = horizon_at(yr)
                    best = 1e9
                    col = col_of(px)
                    nbin = len(crest)
                    for j in (col - 1, col, col + 1):
                        if 0 <= j < nbin and crest[j] < best:
                            best = crest[j]
                    if best < 1e8 and py > best + tol:
                        samples[i] = (px, py, yr, True)
                        marked.append(i)
                if min_run <= 1 or len(marked) < 2:
                    if min_run > 1 and len(marked) == 1:
                        px, py, yr, _hide = samples[marked[0]]
                        samples[marked[0]] = (px, py, yr, False)
                    return
                groups = []
                start = prev = marked[0]
                for idx in marked[1:]:
                    if idx == prev + 1:
                        prev = idx
                        continue
                    groups.append((start, prev))
                    start = prev = idx
                groups.append((start, prev))
                for a, b in groups:
                    if b - a + 1 >= min_run:
                        continue
                    for i in range(a, b + 1):
                        px, py, yr, _hide = samples[i]
                        samples[i] = (px, py, yr, False)

            def flush_sampled():
                nonlocal sampled
                if len(sampled) < 2:
                    sampled = []
                    return
                if not occlude:
                    emit([(p[0], p[1]) for p in sampled])
                    sampled = []
                    return
                tighten_run(sampled)
                flags = solid_flags(
                    [p[3] for p in sampled],
                    [(p[0], p[1]) for p in sampled],
                )
                if fade_opacity is None:
                    part = []
                    for (px, py, _yr, _hide), hidden in zip(sampled, flags):
                        if hidden:
                            emit(part)
                            part = []
                        else:
                            part.append((px, py))
                    emit(part)
                    sampled = []
                    return
                # Keep the run continuous. The shared sample is the point
                # where the line crosses the ridge, drawn in both pieces.
                part = []
                part_hidden = None
                for (px, py, _yr, _hide), hidden in zip(sampled, flags):
                    if part and hidden != part_hidden:
                        part.append((px, py))
                        emit(part, fade_opacity if part_hidden else None)
                        part = [(px, py)]
                    else:
                        part.append((px, py))
                    part_hidden = hidden
                emit(part, fade_opacity if part_hidden else None)
                sampled = []

            for lon, lat in line:
                z = sample(arr, gt, lon, lat)
                if z is None:
                    flush_sampled()
                    continue
                xr, yr = rot(*metres(lon, lat))
                px, py = paper(*project_xy(xr, yr, z + z_add))
                hide = (covered_run if fade_opacity is not None else covered)(px, py, yr) if occlude else False
                sampled.append((px, py, yr, hide))
            flush_sampled()
        return parts

    colours = {
        "novice": "#1b7a32",
        "easy": "#1b7a32",
        "intermediate": "#1a4f9c",
        "advanced": "#111",
        "expert": "#111",
        "freeride": "#111",
        "extreme": "#111",
    }
    run_stroke = run_width
    lift_stroke = LIFT_W if lift_width is None else lift_width
    # A spread-out sheet steps down from the site-wide defaults. A hill
    # that sets its own run or lift width keeps that width.
    if stroke_lines > CONTOUR_THIN_CUTOFF:
        if run_width == 2.2:
            run_stroke = RUN_W_THIN
        if lift_width is None or lift_width == LIFT_W:
            lift_stroke = LIFT_W_THIN
    print(
        "strokes",
        "contours", stroke_lines,
        "cutoff", CONTOUR_THIN_CUTOFF,
        "run", run_stroke,
        "lift", lift_stroke,
    )
    run_parts = []
    # Visible trail ink, copied while the strokes are emitted so a label
    # test uses the same pieces the drawing does. Names stay with the run
    # they were emitted from; unnamed glades still block labels.
    obstacle_runs = []
    named_runs = []
    for run in runs:
        colour = colours.get(run.get("difficulty") or "", "#8a8a8a")
        pieces = [] if run_labels else None
        run_parts.extend(
            stroke(
                run["lines"],
                colour,
                run_stroke,
                z_add=RUN_CLEAR,
                css_class="sh-frontal-run" + (" sh-bowl" if in_back_bowl(slug, run) else ""),
                occlude=True,
                fade_opacity=ridge_fade,
                chunks_out=pieces,
            )
        )
        if pieces:
            obstacle_runs.extend(pieces)
            raw_name = run.get("name")
            if isinstance(raw_name, str) and raw_name.strip():
                named_runs.append((raw_name.strip(), pieces))
    lift_parts = []
    lift_pieces = []
    for lift in lifts:
        lift_parts.extend(
            stroke(
                lift["lines"],
                "#111",
                lift_stroke,
                z_add=LIFT_CLEAR,
                dash="6 4",
                css_class="sh-frontal-lift" + (" sh-bowl" if in_back_bowl(slug, lift, True) else ""),
                occlude=True,
                chunks_out=lift_pieces if run_labels else None,
            )
        )

    label_xml = ""
    if run_labels:
        # One name per run, on a visible piece long enough to hold it,
        # reading left to right. The largest size that clears the trail
        # ink wins. A later name yields when it would touch a line or a
        # name already placed.
        segments = []
        for pts in obstacle_runs:
            half = run_stroke / 2.0 + LABEL_GAP
            for a, b in zip(pts, pts[1:]):
                if a[0] == b[0] and a[1] == b[1]:
                    continue
                segments.append((a[0], a[1], b[0], b[1], half))
        for pts in lift_pieces:
            half = lift_stroke / 2.0 + LABEL_GAP
            for a, b in zip(pts, pts[1:]):
                if a[0] == b[0] and a[1] == b[1]:
                    continue
                segments.append((a[0], a[1], b[0], b[1], half))
        grid = {}
        for index, seg in enumerate(segments):
            pad = seg[4]
            minx = min(seg[0], seg[2]) - pad
            maxx = max(seg[0], seg[2]) + pad
            miny = min(seg[1], seg[3]) - pad
            maxy = max(seg[1], seg[3]) + pad
            ix0 = int(math.floor(minx / LABEL_CELL))
            ix1 = int(math.floor(maxx / LABEL_CELL))
            iy0 = int(math.floor(miny / LABEL_CELL))
            iy1 = int(math.floor(maxy / LABEL_CELL))
            for ix in range(ix0, ix1 + 1):
                for iy in range(iy0, iy1 + 1):
                    grid.setdefault((ix, iy), []).append(index)
        stamp = [0] * len(segments)
        token = 1

        def hits_geometry(boxes):
            nonlocal token
            for box in boxes:
                cx, cy, ux, uy, nx, ny, hw, hh = box
                xs = []
                ys = []
                for sx in (-hw, hw):
                    for sy in (-hh, hh):
                        xs.append(cx + ux * sx + nx * sy)
                        ys.append(cy + uy * sx + ny * sy)
                ix0 = int(math.floor(min(xs) / LABEL_CELL))
                ix1 = int(math.floor(max(xs) / LABEL_CELL))
                iy0 = int(math.floor(min(ys) / LABEL_CELL))
                iy1 = int(math.floor(max(ys) / LABEL_CELL))
                token += 1
                if token == 2_000_000_000:
                    stamp[:] = [0] * len(segments)
                    token = 1
                for ix in range(ix0, ix1 + 1):
                    for iy in range(iy0, iy1 + 1):
                        for index in grid.get((ix, iy), ()):
                            if stamp[index] == token:
                                continue
                            stamp[index] = token
                            seg = segments[index]
                            pad = seg[4]
                            if segment_hits_obb(
                                seg[0], seg[1], seg[2], seg[3],
                                cx, cy, ux, uy, nx, ny,
                                hw + pad, hh + pad,
                            ):
                                return True
            return False

        def hits_labels(boxes, placed):
            for box in boxes:
                for other in placed:
                    if obbs_overlap(box, other, LABEL_LABEL_GAP):
                        return True
            return False

        by_name = {}
        for name, pieces in named_runs:
            bucket = by_name.setdefault(name, [])
            for pts in pieces:
                if len(pts) < 2:
                    continue
                ordered_pts = list(reversed(pts)) if pts[-1][0] < pts[0][0] else pts
                acc = cumulative(ordered_pts)
                if acc[-1] >= 4.0:
                    bucket.append((acc[-1], ordered_pts, acc))
        prepared = []
        for name, chunks in by_name.items():
            if not chunks:
                continue
            chunks.sort(key=lambda item: -item[0])
            prepared.append((chunks[0][0], name, chunks))
        prepared.sort(key=lambda item: -item[0])
        host_half = run_stroke / 2.0
        placed = []
        bits = []
        size_counts = {}

        def stations(length, span):
            if length < span + 1.2:
                return []
            mid = length * 0.5
            half = span * 0.5
            lo = half
            hi = length - half
            found = [mid]
            step = max(6.0, span * 0.4)
            k = 1
            while len(found) < 14:
                hit = False
                for dist in (mid - k * step, mid + k * step):
                    if lo <= dist <= hi:
                        found.append(dist)
                        hit = True
                if not hit:
                    break
                k += 1
            return found

        for name, _longest, chunks in ((item[1], item[0], item[2]) for item in prepared):
            chosen = None
            chosen_boxes = None
            chosen_size = None
            chosen_dy = None
            for size in LABEL_FONT_SIZES:
                width = label_width(name, size)
                halo = label_halo(size)
                found = False
                # Above the left-to-right line first. The other side is
                # used only when that size does not clear above.
                for side in (1.0, -1.0):
                    for length, pts, acc in chunks:
                        for dist in stations(length, width):
                            window = slice_along(pts, acc, dist - width * 0.5, dist + width * 0.5)
                            rounded = [(round(p[0], 1), round(p[1], 1)) for p in window]
                            clean = [rounded[0]]
                            for pt in rounded[1:]:
                                if pt != clean[-1]:
                                    clean.append(pt)
                            if len(clean) < 2:
                                continue
                            mid = clean[len(clean) // 2]
                            if mid[0] < 2.0 or mid[0] > 998.0 or mid[1] < 2.0 or mid[1] > 998.0:
                                continue
                            boxes, baseline = label_ribbon(clean, size, host_half, halo, side)
                            if not boxes:
                                continue
                            if hits_geometry(boxes) or hits_labels(boxes, placed):
                                continue
                            chosen = clean
                            chosen_boxes = boxes
                            chosen_size = size
                            chosen_dy = -baseline * side
                            found = True
                            break
                        if found:
                            break
                    if found:
                        break
                if found:
                    break
            if not chosen:
                continue
            placed.extend(chosen_boxes)
            size_counts[chosen_size] = size_counts.get(chosen_size, 0) + 1
            safe = name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            path_id = "sh-run-label-%s-%d" % (slug, len(bits))
            path_d = "M " + " L ".join("%.1f,%.1f" % (px, py) for px, py in chosen)
            halo = label_halo(chosen_size)
            bits.append(
                f'<path id="{path_id}" d="{path_d}" fill="none" stroke="none"/>\n'
                f'<text font-size="{chosen_size:.1f}" dy="{chosen_dy:.2f}" stroke-width="{halo:.2f}">'
                f'<textPath href="#{path_id}" startOffset="50%" text-anchor="middle">{safe}</textPath></text>'
            )
        if bits:
            label_xml = (
                '<g class="sh-frontal-run-labels" fill="#111" fill-opacity="0.92" '
                'font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600" '
                'stroke="#ffffff" stroke-linejoin="round" stroke-linecap="round" '
                'paint-order="stroke fill" letter-spacing="0.02em">\n'
                + "\n".join(bits)
                + "\n</g>\n"
            )
        print(
            "run_labels", len(bits),
            "sizes", dict(sorted(size_counts.items(), reverse=True)),
            "obstacles", len(segments),
        )

    if not contours:
        raise SystemExit("no contours")
    front = min(item[0] for item in contours)
    back = max(item[0] for item in contours)
    span_d = max(back - front, 1)
    fade_id = "sh-fade-" + slug
    mask_id = "sh-contour-fade-" + slug
    contour_xml = []
    for yr, line in sorted(contours, key=lambda item: -item[0]):
        # Farther up the hill is paler. The near face is a little darker.
        t = (yr - front) / span_d
        opacity = 0.50 - t * 0.26
        d = compact_points(line, close=False)
        if not d:
            continue
        # Join, cap, and dash come from .sh-frontal-contour. Opacity and
        # width stay on the element because each line fades on its own.
        contour_xml.append(
            f'<path class="sh-frontal-contour" d="{d}" transform="scale(.1)" '
            f'fill="none" stroke="#1a1a1a" stroke-opacity="{opacity:.3f}" '
            f'stroke-width="{CONTOUR_W}"/>'
        )
    # Soft rectangular fade. The blur eats the hard edge of the wider field.
    defs = (
        "<defs>\n"
        f'<filter id="{fade_id}" x="-25%" y="-25%" width="150%" height="150%">\n'
        '<feGaussianBlur stdDeviation="42"/>\n'
        "</filter>\n"
        f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">\n'
        '<rect x="0" y="0" width="1000" height="1000" fill="#000"/>\n'
        f'<rect x="8" y="8" width="984" height="984" fill="#fff" filter="url(#{fade_id})"/>\n'
        "</mask>\n"
        "</defs>\n"
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n'
        '<g class="sh-frontal-art">\n'
        f"{defs}\n"
        f'<g mask="url(#{mask_id})">\n'
        + (
            f'<image class="sh-frontal-shade" x="0" y="0" width="1000" height="1000" '
            f'href="data:image/png;base64,{shade_b64}"/>\n'
            if shade_b64
            else ""
        )
        + "\n".join(contour_xml)
        + "\n</g>\n"
        + "\n".join(run_parts)
        + "\n"
        + "\n".join(lift_parts)
        + "\n"
        + label_xml
        + "</g>\n</svg>\n"
    )
    dest = Path(out_path) if out_path else (ROOT / "frontal" / f"{slug}.svg")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(svg)
    az = round(math.degrees(ang) % 360, 1)
    print(
        "wrote",
        dest,
        "bytes",
        dest.stat().st_size,
        "facing_deg",
        az,
        "sun_azimuth",
        round(sun["azimuth"], 1),
        "sun_elevation",
        round(sun["elevation"], 1),
        "sun_intensity",
        round(sun["intensity"], 2),
        "sun_ambient",
        round(sun["ambient"], 2),
        "shade",
        sun.get("shade"),
        "shade_grey",
        shade_lo,
        shade_hi,
        "elevation_deg",
        elevation,
        "pitch_deg",
        round(math.degrees(pitch_rad), 1),
        "z_scale",
        scale,
        "depth_scale",
        depth,
        "aspect",
        round((maxy - miny) / max(maxx - minx, 1), 2),
        "lift_20m",
        round(20 * scale * math.sin(pitch_rad), 2),
        "depth_20m",
        round(20 * depth * math.cos(pitch_rad), 2),
        "contour_w",
        CONTOUR_W,
        "fit",
        fit_label,
        "contours",
        len(contours),
        "runs",
        len(run_parts),
        "lifts",
        len(lift_parts),
        "z",
        round(min(c[2] for c in cells)),
        round(max(c[2] for c in cells)),
    )
    return az


def render_default(slug, edge_margin=0.0, frame_runs=None):
    """Cypress elevation and depth. A hand-set facing is locked; otherwise auto.

    frame_runs is the run set the sheet was fitted to. Pass it when `runs`
    in the geom file is a subset, so the crop, facing, and frame stay put.
    """
    global GEOM, DEM
    GEOM = Path(f"/tmp/{slug}-geom.json")
    DEM = Path(f"/tmp/{slug}-dem-wide.tif")
    cam = CAMERAS.get(slug) or {}
    runs, lifts = load_geom()
    sheet = frame_runs if frame_runs is not None else runs
    box = wide_box(sheet, lifts)
    print(slug, "bbox", tuple(round(v, 4) for v in box))
    ensure_dem(box)
    arr, gt = read_grid()
    print(slug, "dem", len(arr[0]), len(arr))
    if "facing" in cam:
        guess = math.radians(cam["facing"])
        lock = True
        print(slug, "hand_facing_deg", cam["facing"])
    else:
        guess = default_facing(arr, gt, sheet)
        lock = False
        print(slug, "default_facing_deg", round(math.degrees(guess) % 360, 1))
    build(
        arr,
        gt,
        runs,
        lifts,
        guess,
        lock_facing=lock,
        out_path=ROOT / "frontal" / f"{slug}.svg",
        slug=slug,
        elevation=cam.get("elevation", 15.0),
        depth_scale=cam.get("depth_scale", DEPTH_SCALE),
        sun=cam.get("sun"),
        run_width=cam.get("run_width", 2.2),
        full_ground=cam.get("full_ground", False),
        frame_scale=cam.get("frame_scale", 1.0),
        edge_margin=edge_margin,
        post_scale=cam.get("post_scale", 1.0),
        pan_y=cam.get("pan_y", 0.0),
        frame_runs=frame_runs,
        ridge_fade=cam.get("ridge_fade", RIDGE_FADE),
        lift_width=cam.get("lift_width", LIFT_W),
        run_labels=bool(cam.get("run_labels")),
    )


def render_cypress(frame_runs=None):
    """Hand-set Cypress facing. Same sheet as before, plus the default sun."""
    global GEOM, DEM
    slug = "cypress-mountain"
    GEOM = Path("/tmp/cypress-geom.json")
    DEM = Path("/tmp/cypress-dem-wide.tif")
    cam = CAMERAS[slug]
    runs, lifts = load_geom()
    sheet = frame_runs if frame_runs is not None else runs
    box = wide_box(sheet, lifts)
    print(slug, "bbox", tuple(round(v, 4) for v in box))
    ensure_dem(box)
    arr, gt = read_grid()
    build(
        arr,
        gt,
        runs,
        lifts,
        math.radians(cam["facing"]),
        lock_facing=True,
        out_path=ROOT / "frontal" / f"{slug}.svg",
        slug=slug,
        elevation=cam["elevation"],
        depth_scale=cam["depth_scale"],
        sun=cam.get("sun"),
        run_width=cam.get("run_width", 2.2),
        frame_runs=frame_runs,
        ridge_fade=cam.get("ridge_fade", RIDGE_FADE),
        lift_width=cam.get("lift_width", LIFT_W),
    )


def render_views(slug, edge_margin=0.0, frame_runs=None):
    """Write one locked frontal SVG per hand-set view, named {slug}-{view}.svg."""
    global GEOM, DEM
    GEOM = Path(f"/tmp/{slug}-geom.json")
    DEM = Path(f"/tmp/{slug}-dem-wide.tif")
    cam = CAMERAS.get(slug) or {}
    views = cam.get("views") or {}
    if not views:
        raise SystemExit(slug + " has no views")
    runs, lifts = load_geom()
    sheet = frame_runs if frame_runs is not None else runs
    box = wide_box(sheet, lifts)
    print(slug, "bbox", tuple(round(v, 4) for v in box))
    ensure_dem(box)
    arr, gt = read_grid()
    print(slug, "dem", len(arr[0]), len(arr))
    for name, facing in views.items():
        print(slug, name, "hand_facing_deg", facing)
        build(
            arr,
            gt,
            runs,
            lifts,
            math.radians(facing),
            lock_facing=True,
            out_path=ROOT / "frontal" / f"{slug}-{name}.svg",
            slug=f"{slug}-{name}",
            elevation=cam.get("elevation", 15.0),
            depth_scale=cam.get("depth_scale", DEPTH_SCALE),
            sun=cam.get("sun"),
            run_width=cam.get("run_width", 2.2),
            full_ground=cam.get("full_ground", False),
            frame_scale=cam.get("frame_scale", 1.0),
            edge_margin=edge_margin,
            frame_runs=frame_runs,
            ridge_fade=cam.get("ridge_fade", RIDGE_FADE),
            lift_width=cam.get("lift_width", LIFT_W),
        )


def main():
    # Grass stays at elevation 73 and is not re-rendered.
    for slug, draw in (
        ("cypress-mountain", render_cypress),
        ("grouse-mountain", lambda: render_default("grouse-mountain")),
        ("mt-seymour", lambda: render_default("mt-seymour")),
    ):
        try:
            draw()
        except Exception as err:
            print("fail", slug, err)
            dem = Path("/tmp/cypress-dem-wide.tif" if slug == "cypress-mountain" else f"/tmp/{slug}-dem-wide.tif")
            if dem.exists():
                dem.unlink()
            try:
                draw()
            except Exception as err2:
                print("skip", slug, err2)


if __name__ == "__main__":
    argv = sys.argv[1:]
    edge_margin = 0.0
    if argv and argv[0] == "--edge-margin":
        edge_margin = float(argv[1])
        argv = argv[2:]
    if argv:
        for slug in argv:
            cam = CAMERAS.get(slug) or {}
            if cam.get("views"):
                render_views(slug, edge_margin=edge_margin)
            elif slug == "cypress-mountain":
                render_cypress()
            else:
                render_default(slug, edge_margin=edge_margin)
    else:
        main()
