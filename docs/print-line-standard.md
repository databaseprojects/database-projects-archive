# Print line standard

This standard applies to every hill’s bird’s-eye print — both the plain bird’s-eye and the bird’s-eye with trees — at every size (10×10, 12×12 and 16×16), for Shopify and Gelato files.

## The rules

1. Lift line width equals that hill’s bird’s-eye run width, one to one, and scales with the map the same way the runs do.
2. Dash length is 2.2 times the line width.
3. The gap is three-quarters of the dash (the 4-on, 3-off pattern), which is 1.65 times the line width.
4. Runs stay solid. There is no dash offset. Line caps are round.

Dash and gap are always set relative to the line width, so they scale at every print size. Do not use a fixed 10×10 dash, or the site’s 4 px / 3 px values, directly.

## Reference

Measured values from the Big White 10×10 bird’s-eye: width 0.2711 mm, dash 0.6082 mm, gap 0.4561 mm. Those measured dashes are about 2.24 times the width, a little longer than the 2.2 rule. The rule itself is the standard. Values computed from the rule:

- Big White, width 0.2711 mm → dash 0.5964 mm, gap 0.4473 mm
- Fernie, width 0.4386 mm → dash 0.9649 mm, gap 0.7237 mm

A render whose proportions differ from this rule is a failure and should be fixed before upload.
