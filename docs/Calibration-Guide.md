# Nozzle angle calibration wiki

This guide describes what the generated test measures, the assumptions behind its toolpaths, and how to configure the printer profile safely. The output is a test pattern, not a slicer or kinematic model.

## What the matrix tests

Each matrix cell combines one layer height with one extrusion-flow percentage. The generator prints the lowest layer-height column first, in increasing flow order, then proceeds to the next height column. Each specimen is printed as a stack of up to 10 lines high. Choose one line for an isolated bead or three adjacent lines to inspect a small wall with seam-free parallel paths.

The matrix itself is a single solid first-layer base whose fill uses a continuous snake path: each row alternates direction and an extruded connector joins it to the next row at the edge. This avoids a retract, Z-hop, and non-extruding traverse for every base line. Raised seven-segment labels identify the tilt angle, layer heights, and flow percentages; flow labels are right-aligned by their last digit. Each number's strokes are extruded as a continuous sequence: the nozzle travels between strokes without extrusion, retraction, or Z-hop, then retracts/lifts only when moving to the next complete label. This can leave fine strings within a number, but avoids repeatedly interrupting extrusion on every short stroke. The flow rows have extra Y spacing to make labels and specimens easier to distinguish. A separate double-pass purge path is printed 4 mm clear of the matrix base and samples before the base; each pass matches the longest matrix dimension and the return pass runs alongside the first, with centerlines 2× nozzle-hole diameter apart. Both passes use 200% extrusion flow to increase overlap. The purge is a distinct yellow element in the preview. There are no per-specimen skirts.

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
- **Purge:** two adjacent passes at first-layer height are printed immediately before the solid base. Each pass is as long as the matrix's longest dimension. Confirm there is space for it and that the printer's start macro leaves the nozzle ready to extrude.
- **End G-code:** unless a non-empty custom end block is enabled, the generator emits `M104 S0` and `M140 S0` to turn off hotend and bed. A custom end block replaces those defaults, so include shutdown commands there if desired.
- **Pressure advance:** calibrate this separately before running the matrix. The default fixed value is 0.04 (a starting point for direct drive). When enabled, the generator emits Klipper `SET_PRESSURE_ADVANCE ADVANCE=...`, Marlin `M900 K...`, or RepRapFirmware `M572 D... S...`. Firmware units and useful ranges differ; the same numeric value is not interchangeable between firmwares. Uncheck the option to leave the firmware's configured value unchanged. Generic firmware receives a reminder comment rather than an assumed command.
- **Other controls:** firmware profiles emit acceleration, tool-selection, retraction, heating, homing, and custom start commands as configured. Review the file before printing, especially when a custom macro or rotary axis is involved.

## Reading the results

Compare cells across flow rows to identify under- or over-extrusion, and down each layer-height column to compare bead stability and nozzle clearance. The lowest-height specimens print before taller specimens so previously printed high walls are less likely to obstruct subsequent samples. In three-wall mode, compare wall continuity and inter-line gaps; the nominal pitch does not compensate for a printer's extrusion-flow error.

Thin-height specimens have less vertical relief by design. For example, with the default 0.80 mm physical tip at 45° tilt, the geometric minimum is about 0.283 mm; a 0.15 mm specimen is correctly rejected unless the tilt or modeled tip diameter is reduced. Multiple stacked specimen layers increase the visible height without changing the tested per-layer height. The calculated constraint models only the nozzle rim, so real nozzle-body or machine geometry may require a higher minimum.

The first rows can look weaker than later rows if extrusion is not fully primed or flow is not yet stable. The double-pass purge helps establish flow, but also inspect the start G-code, nozzle cleanliness, filament path, temperature, and extrusion calibration. Retraction and restart can contribute to delayed extrusion after travel; reduce or disable the configured retract distance when testing if the printer's restart behavior is suspect, while watching for travel stringing. Moisture is another possible confounder, not a conclusion from the photos: wet filament can cause popping, bubbles, stringing, rough surfaces, and inconsistent fine features. Dry and store the filament according to its manufacturer's material-specific guidance, then keep filament condition and printer settings consistent when comparing test runs.

The generated G-code comments record angle, flow, height, wall count, spacing, and printer settings. Height columns run left-to-right along +X. The minimum-flow row and parameter labels are at the +Y/top edge; flow increases down the matrix toward -Y. This Y transform keeps text upright when viewed from above the build plate. The preview shows the bed-oriented positive X/Y directions, the base, labels, purge line, specimen stacks, and an illustrative nozzle tilt. Drag to orbit; use the wheel or +/- keys to zoom and arrow keys to orbit. Press `0` to reset. Preview colors and geometry are explanatory only and do not simulate rotary kinematics, firmware planning, thermal effects, or full nozzle-body collision.

## Page theme

The page opens with a purple light theme. Use the light/dark button in the page header to switch to the coordinated purple dark theme for the current page session. The theme does not affect generated G-code.
