# Nozzle angle calibration wiki

This guide describes what the generated test measures, the assumptions behind its toolpaths, and how to configure the printer profile safely. The output is a test pattern, not a slicer or kinematic model.

## What the matrix tests

Each matrix cell combines one layer height with one extrusion-flow percentage. The generator prints the lowest layer-height column first, in increasing flow order, then proceeds to the next height column. Each specimen is printed as a stack of up to 10 lines high. Choose one line for an isolated bead or three adjacent lines to inspect a small wall with seam-free parallel paths.

The matrix itself is a single solid first-layer base. Raised seven-segment labels identify the tilt angle, layer heights, and flow percentages; flow labels are right-aligned by their last digit. The flow rows have extra Y spacing to make labels and specimens easier to distinguish. A separate 50 mm purge line is printed 4 mm clear of the matrix base and samples before the base; it is a distinct yellow element in the preview. There are no per-specimen skirts.

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

Labels use seven-segment toolpaths sized from nozzle-hole diameter. Their glyph height is `max(8 × nozzle-hole diameter, 2.4 mm)`. The minimum inter-character gap is `max(1.5 × nozzle-hole diameter, 0.4 mm)`, leaving at least half an outlet diameter of nominal clearance between character strokes. Flow labels are right-aligned. Matrix row pitch is at least the label height plus the nozzle-hole diameter plus 2 mm, or the maximum specimen width plus 3 mm, whichever is greater. The UI reports the generated glyph height and gap clearance. Increasing labels or spacing changes the required plate footprint; the complete label and purge-line footprint is included in bed-fit checks.

## Printer setup and G-code

- **Tilt/rotary axis:** angle is measured from vertical. The common convention is A about X, B about Y, and C about Z. Select the rotary axis actually configured by the firmware.
- **Bed coordinates:** choose the bed shape and dimensions, origin convention, and optional explicit center. The entire model and purge line are centered as a group; generation fails if the footprint does not fit.
- **Travel moves:** use a fixed 6000 mm/min travel feedrate. It is intentionally not user-configurable in this test tool.
- **Purge:** a 50 mm line at first-layer height is printed immediately before the solid base. Confirm there is space for it and that the printer's start macro leaves the nozzle ready to extrude.
- **End G-code:** unless a non-empty custom end block is enabled, the generator emits `M104 S0` and `M140 S0` to turn off hotend and bed. A custom end block replaces those defaults, so include shutdown commands there if desired.
- **Pressure advance:** calibrate this separately before running the matrix. The default fixed value is 0.04 (a starting point for direct drive). When enabled, the generator emits Klipper `SET_PRESSURE_ADVANCE ADVANCE=...`, Marlin `M900 K...`, or RepRapFirmware `M572 D... S...`. Firmware units and useful ranges differ; the same numeric value is not interchangeable between firmwares. Uncheck the option to leave the firmware's configured value unchanged. Generic firmware receives a reminder comment rather than an assumed command.
- **Other controls:** firmware profiles emit acceleration, tool-selection, retraction, heating, homing, and custom start commands as configured. Review the file before printing, especially when a custom macro or rotary axis is involved.

## Reading the results

Compare cells across flow rows to identify under- or over-extrusion, and down each layer-height column to compare bead stability and nozzle clearance. The lowest-height specimens print before taller specimens so previously printed high walls are less likely to obstruct subsequent samples. In three-wall mode, compare wall continuity and inter-line gaps; the nominal pitch does not compensate for a printer's extrusion-flow error.

The generated G-code comments record angle, flow, height, wall count, spacing, and printer settings. Height columns run left-to-right along +X. The minimum-flow row and parameter labels are at the +Y/top edge; flow increases down the matrix toward -Y. This Y transform keeps text upright when viewed from above the build plate. The preview shows the bed-oriented positive X/Y directions, the base, labels, purge line, specimen stacks, and an illustrative nozzle tilt. Drag to orbit; use the wheel or +/- keys to zoom and arrow keys to orbit. Press `0` to reset. Preview colors and geometry are explanatory only and do not simulate rotary kinematics, firmware planning, thermal effects, or full nozzle-body collision.

## Page theme

The page opens with a purple light theme. Use the light/dark button in the page header to switch to the coordinated purple dark theme for the current page session. The theme does not affect generated G-code.
