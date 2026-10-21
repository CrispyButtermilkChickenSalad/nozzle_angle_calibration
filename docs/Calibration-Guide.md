# Nozzle angle calibration wiki

This guide describes what the generated test measures, the assumptions behind its toolpaths, and how to configure the printer profile safely. The output is a test pattern, not a slicer or kinematic model.

## What the matrix tests

Each matrix cell combines one layer height with one extrusion-flow percentage. The generator prints the lowest layer-height column first, in increasing flow order, then proceeds to the next height column. Each specimen is printed as a stack of up to 10 lines high. Choose one line for an isolated bead or three adjacent lines to inspect a small wall with seam-free parallel paths.

## Nozzle orientation and matrix alignment

The orientation setting describes which way the nozzle body leans relative to the bead being deposited. In the sketches below, the bead is already laid to the left of the nozzle tip, and the arrow shows the upcoming bead path. The nozzle body extends from the tip in the direction of its lean.

```text
                           upcoming bead path →

  deposited bead       nozzle lean
  ███████████●             ╲  trailing edge: body leans away from deposited bead
  ███████████●             ╱  leading edge: body leans back toward deposited bead
  ███████████●             ↑  adjacent: body leans 90° to bead direction
                            ↗  trailing/adjacent hybrid: halfway between ╲ and ↑
                            ↖  leading/adjacent hybrid: halfway between ╱ and ↑
```

| Orientation | Relationship to the bead | Why choose it |
| --- | --- | --- |
| **Trailing edge** (default) | The nozzle body leans away from the deposited extrusion. | A conservative starting orientation: less chance of the nozzle body colliding with the bead behind the tip and simpler printing. |
| **Leading edge** | The nozzle body leans toward the deposited extrusion. | Can provide access for complex geometry and acute angles of attack. The nozzle presses/approaches from the deposited-bead side, so print quality and mechanical performance may be affected; use when geometry requires it and inspect the result. |
| **Adjacent** | The nozzle leans 90° to the bead direction. | Offers clearance beside printed features when leaning either with or against the bead path is obstructed. |
| **Hybrid: trailing / adjacent** | Exactly halfway between trailing edge and adjacent. | Compromise when trailing orientation is obstructed but a full 90° adjacent lean is unnecessary. |
| **Hybrid: leading / adjacent** | Exactly halfway between leading edge and adjacent. | Compromise between the leading-edge access direction and side clearance. |

“Hybrid” means the midpoint of the **matrix heading** between the two named orientations. It does not halve the configured nozzle tilt angle: the tilt magnitude remains the same in every orientation. These five choices are available in the orientation cards as well as the selector; each card uses the same bead direction and shows the nozzle tip and leaning body, so the body’s direction can be compared directly.

Most multi-axis printers have only one additional rotary axis. The generator therefore uses the selected firmware rotary axis to determine the bead heading and rotates the **entire matrix**—specimens, base, labels, and purge passes—around the configured bed center. It does not require independent rotation axes for each sample. The configured positive nozzle tilt is retained; selecting an orientation turns the complete pattern so that the tilt is toward, away from, or beside the deposited bead as described above. Bed-fit checks use the rotated pattern footprint.

For A about X and B about Y, the generator assumes the conventional right-handed direction: positive A tilts toward -Y and positive B toward +X. Firmware configuration can reverse an axis, so verify axis direction and the first generated motion against your machine before printing. C rotates about Z and cannot physically tilt a nozzle; selecting C can rotate the matrix layout, but the generated C-axis command is not a real nozzle tilt. Use A or B when the printer’s tilt mechanism is configured on one of those axes.

At **0° nozzle tilt**, the nozzle is vertical and has no lean relative to the bead. Trailing, leading, adjacent, and both hybrid choices are therefore physically equivalent. The generator treats orientation as a no-op at exactly 0°: it leaves the complete matrix in its standard direction instead of rotating it, and the specimen rotary-axis command remains at 0°. The selected option remains visible for clarity, but does not change the generated motion or bed footprint. The UI help and G-code comments identify this neutral case.

The orientation changes the collision geometry, but does not change the existing clearance calculation into a full collision model. That calculation approximates the circular nozzle rim only; it cannot account for the nozzle body, carriage, pivot offsets, adjacent printed features, or firmware kinematics. In particular, leading-edge and adjacent setups may need more clearance than the calculated minimum. Start cautiously, check the bed and nozzle paths, and increase the layer-height minimum if the hardware requires it.

The matrix itself is a single solid first-layer base whose fill uses a continuous snake path: each row alternates direction and an extruded connector joins it to the next row at the edge. This avoids a retract, Z-hop, and non-extruding traverse for every base line. The base extends beyond the complete stroke footprint of the final flow label so that the highest-flow marker is supported rather than printed beyond the base edge. Raised seven-segment labels identify the tilt angle, layer heights, and flow percentages; flow labels are right-aligned by their last digit. Each number's strokes are extruded as a continuous sequence: the nozzle travels between strokes without extrusion, retraction, or Z-hop, then retracts/lifts only when moving to the next complete label. This can leave fine strings within a number, but avoids repeatedly interrupting extrusion on every short stroke. The flow rows have extra Y spacing to make labels and specimens easier to distinguish. A separate double-pass purge path is printed 4 mm clear of the matrix base and samples before the base; each pass matches the longest matrix dimension and the return pass runs alongside the first, with centerlines 2× nozzle-hole diameter apart. Both passes use 200% extrusion flow to increase overlap. The purge is a distinct yellow element in the preview. There are no per-specimen skirts.

The target test width is fixed to the **nozzle-hole diameter**, the filament outlet dimension. The **nozzle-tip diameter** is separate: it describes the outside width of the physical nozzle end and is used only for the nozzle-rim clearance calculation.

## Geometry and extrusion formulas

### Nozzle-rim collision clearance

The tip is approximated as a circular rim of radius `r = nozzle-tip diameter / 2`, rotating about its centroid. At a tilt `theta` from vertical, the layer height must provide the vertical clearance for the rim's horizontal projection:

```text
h_min = sqrt(r^2 - (r cos(theta))^2) = r sin(theta)
```

This formula constrains all matrix layer heights. It does not model the nozzle body, carriage, gantry, deposited adjacent specimens, or printer-specific pivot offsets. Real hardware can require a larger clearance. Test cautiously and inspect the generated G-code for the selected machine.

The maximum layer height is `1.5 × nozzle-hole diameter`. This is a configurable-range ceiling based on the requested extrusion limit; it is not a guarantee that every printer/material combination can produce a stable bead at that height.

### Bead area and filament extrusion

For a deposited bead of width `w` and layer height `h`, the generator uses the capsule approximation:

```text
A = (w - h)h + pi(h/2)^2
```

Here `w` is fixed to the nozzle-hole diameter. For filament diameter `d_f`, a path length `L`, and flow percentage `p`, relative extrusion is:

```text
E = (A × L × (p / 100)) / (pi(d_f / 2)^2)
```

The matrix's flow percentages deliberately change material delivery around nominal 100% so the resulting wall/bead quality can be compared. Flow adjustments can create gaps or overfill away from 100%; that is what the calibration is meant to expose.

### Three adjacent wall lines

When three-wall specimens are enabled, each line retains the same fixed target extrusion width `w = nozzle-hole diameter`. The center-to-center path pitch varies with each tested layer height using Slic3r's recommended overlap relationship:

```text
spacing = extrusion_width - layer_height × (1 - pi/4)
```

The three centerlines are placed at `-spacing`, `0`, and `+spacing` relative to the specimen center. This intentional nominal overlap fills the triangular voids that would remain between tangent rounded beads; it is not a user-adjustable width or spacing. Actual overlap depends on material, temperature, speed, flow, and machine calibration. The paths model deposited lines, not a slicer's complete wall-ordering or seam strategy.

References:

- [Slic3r flow math](https://manual.slic3r.org/advanced/flow-math) for capsule bead area and adjacent-path spacing.
- [OrcaSlicer precision settings](https://github.com/OrcaSlicer/OrcaSlicer/wiki/quality_settings_precision) for related precision controls and their practical effects.

### Printed label visibility

Labels use seven-segment toolpaths sized from nozzle-hole diameter. Their glyph height is `max(10 × nozzle-hole diameter, 3.2 mm)`. The minimum inter-character gap is `max(1.75 × nozzle-hole diameter, 0.5 mm)`, leaving at least half an outlet diameter of nominal clearance between character strokes. Flow labels are right-aligned. Matrix row pitch is at least the label height plus the nozzle-hole diameter plus 2 mm, or the maximum specimen width plus 3 mm, whichever is greater. The UI reports the generated glyph height and gap clearance. Layer-height fields accept hundredths of a millimeter (for example, 0.15 mm); the nozzle-collision minimum still applies. Increasing labels or spacing changes the required plate footprint; the complete label and purge footprint is included in bed-fit checks.

## Printer setup and G-code

- **Tilt/rotary axis:** angle is measured from vertical. The common convention is A about X, B about Y, and C about Z. Select the rotary axis actually configured by the firmware.
- **Bed coordinates:** choose the bed shape and dimensions, origin convention, and optional explicit center. The entire model and purge line are centered as a group; generation fails if the footprint does not fit.
- **Travel moves:** use a fixed 6000 mm/min travel feedrate. It is intentionally not user-configurable in this test tool.
- **Z-hop:** the configured height is added above the higher of the current and destination print Z before travel, then the nozzle returns to the destination Z. The hop uses absolute Z coordinates so it does not change the firmware's extrusion coordinate mode.
- **Purge:** two adjacent passes at first-layer height are printed immediately before the solid base. Each pass is as long as the matrix's longest dimension. Confirm there is space for it and that the printer's start macro leaves the nozzle ready to extrude.
- **End G-code:** unless a non-empty custom end block is enabled, the generator emits `M104 S0` and `M140 S0` to turn off hotend and bed. A custom end block replaces those defaults, so include shutdown commands there if desired.
- **Pressure advance:** calibrate this separately before running the matrix. The default fixed value is 0.04 (a starting point for direct drive). When enabled, the generator emits Klipper `SET_PRESSURE_ADVANCE ADVANCE=...`, Marlin `M900 K...`, or RepRapFirmware `M572 D... S...`. Firmware units and useful ranges differ; the same numeric value is not interchangeable between firmwares. Uncheck the option to leave the firmware's configured value unchanged. Generic firmware receives a reminder comment rather than an assumed command.
- **Other controls:** firmware profiles emit acceleration, tool-selection, retraction, heating, homing, and custom start commands as configured. Review the file before printing, especially when a custom macro or rotary axis is involved.

## Reading the results

Compare cells across flow rows to identify under- or over-extrusion, and down each layer-height column to compare bead stability and nozzle clearance. The lowest-height specimens print before taller specimens so previously printed high walls are less likely to obstruct subsequent samples. In three-wall mode, compare wall continuity and inter-line gaps; the nominal pitch does not compensate for a printer's extrusion-flow error.

Thin-height specimens have less vertical relief by design. For example, with the default 0.80 mm physical tip at 45° tilt, the geometric minimum is about 0.283 mm; a 0.15 mm specimen is correctly rejected unless the tilt or modeled tip diameter is reduced. Multiple stacked specimen layers increase the visible height without changing the tested per-layer height. The calculated constraint models only the nozzle rim, so real nozzle-body or machine geometry may require a higher minimum.

The first rows can look weaker than later rows if extrusion is not fully primed or flow is not yet stable. The double-pass purge helps establish flow, but also inspect the start G-code, nozzle cleanliness, filament path, temperature, and extrusion calibration. Retraction and restart can contribute to delayed extrusion after travel; reduce or disable the configured retract distance when testing if the printer's restart behavior is suspect, while watching for travel stringing. Moisture is another possible confounder, not a conclusion from the photos: wet filament can cause popping, bubbles, stringing, rough surfaces, and inconsistent fine features. Dry and store the filament according to its manufacturer's material-specific guidance, then keep filament condition and printer settings consistent when comparing test runs.

The generated G-code comments record angle, orientation, matrix rotation, flow, height, wall count, spacing, and printer settings. Matrix columns and rows retain their local layout, then the complete layout is rotated to match the selected nozzle orientation and rotary axis; the generated comments report that rotation. The preview shows the bed-oriented positive X/Y directions, the rotated base, labels, purge line, specimen stacks, and an illustrative nozzle tilt. Drag to orbit; use the wheel or +/- keys to zoom and arrow keys to orbit. Press `0` to reset. Preview colors and geometry are explanatory only and do not simulate rotary kinematics, firmware planning, thermal effects, or full nozzle-body collision.

## Page theme

The page opens with a purple light theme. Use the light/dark button in the page header to switch to the coordinated purple dark theme for the current page session. The theme does not affect generated G-code.
