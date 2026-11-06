"""Shared ski-hill layout constants.

Print white margin (Billy 2026-10-31, confirmed 2026-11-05): **4 mm** on every
side of the 8 × 8 in print. Replaces the older 0.125 in print border. The
website chrome border is a separate concern; when site and print share one
map frame (``.sh-print``), use this print margin.

Artwork (contours, runs, lifts, tree wash) is authored in the full
0 … FRAME viewBox. The print margin is applied as CSS padding on ``.sh-print``
(``PRINT_MARGIN_PCT`` of the sheet) so the whole sheet — map, caption, credit —
shrinks uniformly into the content box and nothing draws in the white rim.
Redraws (trees after a rotate, wash rebuilds, plan fits) must import these
constants instead of hard-coding a margin, and must **not** inset artwork by
the print margin in coordinates (that would double-inset with the CSS).

Plan-art pad (``PLAN_ART_PAD``) is different: when a plan view is rotated and
re-fitted, runs are placed in a ``PLAN_ART_PAD`` … FRAME−PLAN_ART_PAD box so
the drawing clears the card edge before ``fitArt`` / the print padding run.
Tree wash still samples out to the full frame (standing full-frame rule); the
CSS print margin keeps the white rim on every view.
"""

from __future__ import annotations

# --- Print white margin (shared by every hill view) ---------------------------
PRINT_MARGIN_MM = 4.0
PRINT_SIDE_IN = 8.0
MM_PER_IN = 25.4

PRINT_MARGIN_FRAC = PRINT_MARGIN_MM / (PRINT_SIDE_IN * MM_PER_IN)
PRINT_MARGIN_PCT = PRINT_MARGIN_FRAC * 100.0  # CSS --sh-print-border
PRINT_MARGIN_SVG = PRINT_MARGIN_FRAC * 1000.0  # same fraction on a 1000-unit frame

# Older website-only border (do not use for print / shared .sh-print frame).
WEBSITE_BORDER_IN = 0.125

# --- Plan view frame ---------------------------------------------------------
FRAME = 1000.0
# Pad used when rotating/re-fitting plan runs into the square (apply.py / overlays).
PLAN_ART_PAD = 48.0
PLAN_ART_SIZE = FRAME - 2.0 * PLAN_ART_PAD  # 904
# JS fitArt() pad around the hill bounds inside the card / lightbox.
FIT_ART_PAD = 40.0

# Bird's-eye DEM fit gutter inside build-frontal / tree projection (not print).
FRONTAL_FIT_GUTTER = 4.0


def css_print_border() -> str:
    """CSS percentage string for ``--sh-print-border`` (enough digits to be exact)."""
    return f"{PRINT_MARGIN_PCT:.10f}".rstrip("0").rstrip(".") + "%"


def assert_print_margin_contract() -> None:
    """Sanity checks so a bad edit fails loudly in rebuilds."""
    assert PRINT_MARGIN_MM == 4.0
    assert abs(PRINT_MARGIN_PCT - (4.0 / (8.0 * 25.4) * 100.0)) < 1e-9
    assert abs(PLAN_ART_SIZE - 904.0) < 1e-9
