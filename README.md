# Nozzle Angle Calibration

A browser-based tool for generating downloadable G-code to test angled extrusion. The static app runs in a browser without installing packages or cloning the repository:

**Live tool:** https://crispybuttermilkchickensalad.github.io/nozzle_angle_calibration/

## Configure a test

Choose one nozzle tilt from the surface normal (0° is vertical) and one target layer height. Line width is fixed to the nozzle tip diameter. Set the number of layers to stack for each specimen, then choose a range of extrusion multipliers. Each specimen is physically labeled with its ID and multiplier; a `T` marker identifies the test tilt, and G-code comments include the complete settings.

The rotary-axis choices follow the common printer convention: A rotates about X, B about Y, and C about Z. The selected axis must be enabled and interpreted as degrees by your machine firmware. The target height is repeated for each layer in a specimen. Stacking gives a taller sample when a first layer is hard to assess; it does not apply separate first-layer height compensation.

## Geometry and safety

- Nozzle tilt clearance models the circular outlet rim rotating around its centroid. For rim radius `r` and tilt `θ`, the downward projection is `h_min = √(r² − (r cos θ)²) = r sin θ`. Generation rejects a target layer height below this clearance.
- The bead cross-section approximation is `A = (w − h)h + π(h/2)²`, with line width `w` equal to nozzle tip diameter and layer height `h`. Filament extrusion is calculated from bead area, path length, multiplier, and filament cross-section.
- This is an exit-rim clearance estimate, not collision detection for the full nozzle, machine, or previously deposited geometry. G-code intentionally does not include homing, heating, machine-specific start/end code, or rotary-axis limits. Inspect it and check your machine configuration before printing.

## GitHub Pages

The `Deploy GitHub Pages` workflow publishes the static app on pushes to `main` and on manual dispatch. In repository **Settings → Pages**, select **GitHub Actions** as the build and deployment source. After the workflow succeeds, open the live tool linked above.

## Tests

The generator tests use Node's built-in test runner; no packages are required:

```sh
node --test tests/gcode.test.mjs
```
