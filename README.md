# Nozzle Angle Calibration

A dependency-free browser tool for generating a labeled G-code matrix to study angled single-layer extrusion. Open `index.html` in a modern browser, set the angle and process-variable sweeps, then choose **Generate pattern** and **Download G-code**.

## Pattern and assumptions

- Tilt is measured from the build-surface normal: 0° is a vertical nozzle. Each bead is a straight segment printed at one fixed rotary-axis angle.
- Layer height, line width, and extrusion multiplier are swept independently. Each combination gets a test ID; the pattern prints the ID, `H` (height), `W` (width), `M` (multiplier), and `A` (angle) as physical, upright stroke markers. G-code comments repeat the exact values. Each range includes its end value even when the increment does not land on it.
- The nozzle outlet is modeled as a circular rim of the entered diameter rotating about its centroid. Its downward rim projection at tilt θ is `h_min = √(r² − (r cos θ)²) = r sin θ`, where `r` is the tip radius. Generation is rejected if a tested layer height is below this clearance at any swept angle. This models exit-rim clearance only, not the full nozzle body, machine frame, deposited-bead interaction, or real motion limits.
- Bead area is approximated as `A = (w − h)h + π(h/2)²`. Filament E is calculated from bead area, path length, extrusion multiplier, and the entered filament cross-section.
- G-code uses millimeters, absolute XYZ, relative extrusion, and the selected rotary axis letter (default `A`). The target firmware and machine must already support/configure that axis and interpret its units as degrees. No homing, heating, machine-specific start/end code, or collision checking beyond the stated rim model is included. Inspect the file and verify machine limits before printing.

The tool keeps pattern generation deterministic, preserves sweep values to six decimal places, and rejects invalid ranges, widths smaller than heights, unsupported axis letters, unsafe clearance, and patterns larger than 500 rows.

## Tests

The generator tests use Node's built-in test runner; no packages are required:

```sh
node --test tests/gcode.test.mjs
```
