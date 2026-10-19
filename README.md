# Nozzle angle calibration test

A browser-based calibration tool that generates and downloads printer-specific G-code. The static app is published with GitHub Pages and works in a browser without cloning the repository or installing packages:

**Live tool:** https://crispybuttermilkchickensalad.github.io/nozzle_angle_calibration/

## Test setup

Choose one nozzle angle from the surface normal (0° is vertical), a flow percentage range, a layer-height range, and the number of stacked layers per matrix cell. Flow percentages make the matrix rows; layer heights in millimeters make its columns. The nozzle tip diameter sets the width of each test line. The collision-safe minimum calculated from nozzle diameter and tilt is enforced for every layer-height column. The first layer is a solid matrix base; each cell's test-line stack is printed above it.

Range increments start at the entered minimum and include the entered maximum; if the increment does not divide the range evenly, the final gap is shorter.

The bed selector supports rectangular and circular build plates, bed dimensions, optional center coordinates, and machines whose coordinate origin is at the bed center. The matrix, labels, solid base, and test lines are centered as a group; generation fails if the complete print will not fit. Circular bed size X is its diameter.

The 3D preview approximates the generated toolpaths, solid first-layer base, labels, bead widths, and stacked cell heights. It also shows a nozzle indicator at the selected tilt and rotary axis. Drag to orbit, scroll to zoom, or focus the preview and use the arrow and +/- keys; press 0 to reset the view. It is a geometry preview rather than a machine simulator and does not account for nozzle-body collisions, kinematics, or firmware motion.

The finished matrix includes compact seven-segment toolpath labels: tilt with a degree mark in the upper-left corner, layer heights across the top, and flow percentages down the left. Cell lines have no individual skirts; one solid first-layer base connects the entire matrix so it can be lifted from the print surface as one piece.

Rotary-axis selection follows the common convention: A rotates about X, B about Y, and C about Z. Select the axis your machine actually configures as the nozzle's tilt axis.

## Printer-specific G-code

- Firmware profiles: Klipper, Marlin, RepRapFirmware, and generic/compatible. Acceleration commands are profile-specific (`SET_VELOCITY_LIMIT` for Klipper, `M204 P/T` for RepRapFirmware, and `M204 S` for Marlin/generic). A Klipper extruder name emits `ACTIVATE_EXTRUDER`; a non-default Marlin/RRF tool index emits `Tn`.
- Retraction supports direct relative-E retract/unretract moves or firmware `G10`/`G11`. Klipper firmware retraction also emits `SET_RETRACTION`; for other firmware, configure the retraction amounts in the firmware first.
- First-layer options include base height, print speed, fan speed, and configurable solid-base line width as a nozzle-diameter percentage.
- Print parameters include speed, fan, acceleration, hotend temperature, and bed temperature. Startup checkboxes independently control `G28`, bed heating/wait commands, and hotend heating/wait commands.
- Optional custom start and end blocks are emitted only when their respective checkbox is enabled. The following placeholders are substituted: `[BED_TEMP]`, `[HOTEND_TEMP]`, `[TOOL_INDEX]`, and `[EXTRUDER_NAME]`. Review the generated G-code preview before printing, especially when using printer macros.

The circular nozzle outlet is modeled as a rim rotating about its centroid. Its minimum safe matrix layer height at angle θ is `h_min = √(r² − (r cos θ)²) = r sin θ`. Every tested layer-height column must meet that clearance; the flat solid base and its labels are printed with zero tilt. This does not detect collisions with the full nozzle body, frame, or previously deposited geometry. Check real machine limits and firmware behavior before printing.

## GitHub Pages

The repository's `Deploy GitHub Pages` Actions workflow publishes the static site after pushes to `main` and on manual dispatch. Pages is configured to use the GitHub Actions deployment source.

## Tests

The focused generator tests use Node's built-in test runner:

```sh
node --test tests/gcode.test.mjs
```
