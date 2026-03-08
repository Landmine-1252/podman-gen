# Podman + Quadlet Builder

Live page: https://landmine-1252.github.io/podman-gen/

This repository contains a small static web app for building:

- `podman run` commands
- Quadlet `.container` files
- simple install hints for rootless and rootful systemd setups

The main goal is to make common container setup tasks easier without forcing people to hand-write Quadlet files from scratch.

The app is intentionally simple:

- enter an image and a name
- add ports, mounts, environment variables, and labels
- choose a few startup and dependency options for the Quadlet unit
- copy the generated output

Project files:

- `index.html` for the page structure
- `styles.css` for the styles
- `app.js` for the generator logic

Local use:

1. Open `index.html` in a browser.
2. Or publish the static files to GitHub Pages or GitLab Pages.

The README is for the repository. The actual live tool is the page linked above.
