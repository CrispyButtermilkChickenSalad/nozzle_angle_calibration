# Nozzle angle calibration test

A browser-based tool that generates a downloadable G-code calibration matrix for angled extrusion. The static site runs without cloning the repository or installing packages:

**Live tool:** https://crispybuttermilkchickensalad.github.io/nozzle_angle_calibration/

Set a nozzle tilt, layer-height and flow ranges, then choose a trailing-edge, leading-edge, adjacent, or hybrid nozzle orientation and single- or three-wall specimens. The generator rotates the complete matrix for the configured rotary axis, prints a connected base, legible parameter labels, a nearby purge line, and the test matrix. It checks nozzle-tip collision clearance and rotated bed fit before enabling download.

**[Calibration wiki and formulas](docs/Calibration-Guide.md)** covers the geometry, extrusion and wall-spacing math, test order, printer-specific commands, and how to read results.

The 3D preview is an approximation, not a printer simulator. Verify the selected rotary axis, firmware commands, bed coordinates, and nozzle clearance before printing. Pressure advance should be calibrated separately; the optional default override is 0.04, or it can be left to the firmware's configured value.

## Development

The app uses plain HTML, CSS, and JavaScript modules. Focused generator tests use Node's built-in test runner:

```sh
node --test tests/gcode.test.mjs
```

GitHub Pages deploys from `main` via the repository's Actions workflow.
