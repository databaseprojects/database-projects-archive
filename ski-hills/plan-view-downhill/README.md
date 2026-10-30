# Plan view, downhill at bottom (test render)

Castle Mountain Resort only. Not wired into the site; live code and data untouched.

- castle-mountain-resort-rotated-241.png: the site's own plan view (js/ski-hills.js, contours, tree wash, dotted lifts, caption band, frame), rendered in headless Chrome from a local copy of the site. In the page, the map layers (contours + tree wash, runs, lifts) were wrapped in one group and turned so the 241.1° uphill bearing points up (SVG rotate 119°), scaled 1.03 and nudged to keep every run and lift in frame, then clipped to the map area. Caption band and frame stay upright.
- Angle 241.1° was computed from the lifts' bottom-to-top direction (10 of 12 agree). Castle's bird's-eye view uses an automatic facing that is not stored.
- A small, faint north arrow was added bottom right of the map (the site shows none).
- Known gap: the stored contour and tree-wash data only cover the original north-up square, so the turned view has blank corners (top left, right side, bottom right). Filling them needs contours and tree wash rebuilt over a wider window.
