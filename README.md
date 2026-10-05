# databaseprojects

A quiet, photo-first archive. Static HTML, CSS, and JavaScript. No build step, no CMS, no backend.

## Standing rule

For now, open pull requests should be merged to main without a preview. The live site being imperfect or broken is acceptable. Billy is not sharing it with many people.

The index is a small Courier filing line: uppercase, tracked out, with a black rule. Two records are open on this slice.

- [Home](./) — title, a short note, and the index
- [Vacant](vacant-storefronts/) — storefront photographs, tag filter, column slider, hover, lightbox with a location map
- [Found Photographs](found-photographs/) — print-like grid, row and table layouts, floating antigravity, hover, front/back flip, lightbox

The other names in the index are placeholders.

## Open the site

From this directory:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

The same files are also published at https://databaseprojects.github.io/database-projects-archive/ Links are relative, so the archive works at the domain root and under that project path.

Photographs are loaded from the public image URLs already used on the archive. They need a network connection.
