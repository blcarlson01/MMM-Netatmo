# Changelog

This file starts tracking changes from this point forward — it doesn't attempt to
reconstruct the project's earlier, multi-fork history (see the README's "About this
Fork" section for that).

## Unreleased

### Security

- Moved the Netatmo OAuth token exchange, the `getstationsdata` request, and the
  aqicn.org air-quality lookup into a new `node_helper.js`, running server-side.
  The live access token and refresh flow no longer transit the renderer process.
- Fixed two spots (`module_name`, the AQI category label) where untrusted/third-party
  string content was inserted via jQuery's HTML-parsing `.append()` instead of
  text-only `.text()`.
- Replaced `aqiFeed.js`'s third-party `<script>`-tag injection (an unbounded DOM/memory
  leak — a new tag was added, never removed, every air-quality refresh) with a plain
  JSON fetch to aqicn.org's official API.

### Added

- A gauge for outdoor air quality, replacing the old color-coded leaf icon, matching
  [Netatmo's current app design](https://helpcenter.netatmo.com/hc/en-us/articles/17069028550930-Outdoor-air-quality-index):
  a semicircular arc that fills left-to-right through a green-to-red gradient as the
  AQI rises, with the value, category, and dominant pollutant centered in the gauge.
- The same fill-gauge treatment for indoor CO2 (previously a glowing color-coded dot
  next to the ppm reading), using the existing good/average/bad thresholds. The gauge
  rendering itself (`buildGauge`/`buildGaugeBlock` in `MMM-Netatmo.js`) is now shared
  between the AQI and CO2 displays rather than AQI-specific.
- `aqicnToken` config option (required for the air-quality gauge; see the README for
  how to get one) and `debug` config option (verbose per-tick scheduling logs, off by
  default).
- A Jest test suite (`tests/`): unit tests for the pure formatting/conversion logic in
  `formatter.js`, unit tests for `node_helper.js` against mocked HTTP responses, and
  snapshot/structural tests for the rendered DOM tree.
- GitHub Actions CI (`.github/workflows/ci.yml`), replacing the long-dead Travis config,
  testing against the Node versions MagicMirror v2.37.0 itself requires.

### Fixed

- `moduleOrder` had no default value, but `render()` unconditionally read
  `moduleOrder.length` whenever `NAValue` was set (which it always is by default) —
  meaning the module crashed on every render for anyone who didn't set `moduleOrder`,
  despite the README describing it as optional. Now defaults to `[]`.
- `formatter.value()`/`formatter.status()` treated a real `0` reading the same as "no
  data" (a falsy-value check, not an explicit undefined/null check) — so a Health
  Index of 0 ("Healthy") or a 0% battery never displayed correctly.
- `HEALTH_IDX` formatting used assignment (`=`) instead of comparison (`===`), so it
  always fell into the "Fine" branch.
- `Gruntfile.js`'s CSS lint task pointed at `netatmo.css`, which doesn't exist (the
  real file is `MMM-netatmo.css`) — CSS linting had been silently checking zero files.
  Fixing the path surfaced a real CSS syntax error and led to discovering that the old
  `grunt-contrib-csslint` (built on the abandoned CSSLint project) can't parse the
  `repeat()` function CSS Grid relies on at all; replaced it with `stylelint`.
- `.small`, `.medium`, `.large`, `.xsmall`, and `.xlarge` were used throughout the
  module's markup but were never defined in `MMM-netatmo.css` — most of the module's
  intended text-size hierarchy had no visual effect. Added them.
- A duplicate `cs` key in `getTranslations()`.
- `DATA.md`'s sample payload had a stray empty object key and a missing comma,
  making it invalid JSON.

### Changed

- Dropped the jQuery and Q.js dependencies (jQuery loaded from a CDN, unpinned Q.js
  vendored in-repo) in favor of plain DOM APIs; `MMM-Netatmo.js` no longer loads
  either. `formatter.js` was extracted from the module file as a standalone,
  dependency-free module (loads both as a browser global and a CommonJS module) so
  it can be unit tested.
- Removed `Releases/CFenner-Fork/` (a full duplicate copy of an old fork, kept only
  for historical reference — still available via git history/tags) and the stale
  `netatmo.less`/`netatmo.bubbles.less` source files, which hadn't matched the
  shipped `MMM-netatmo.css`'s layout in a long time and weren't compiled by anything.
  `MMM-netatmo.css` is the single source of truth for styling going forward.
- Pinned all dev dependencies to exact versions instead of `latest`; moved build
  tooling (`grunt`, `grunt-contrib-csslint`, `gruntify-eslint`) from `dependencies`
  to `devDependencies` so end users' `npm install` doesn't pull dev tooling.
- Removed unused dev dependencies (`grunt-markdownlint`, the old `grunt-stylelint`)
  that were never wired into the build.
- Regenerated every README screenshot against the current UI (AQI gauge, corrected
  typography sizing) using representative mock data rendered in a real browser.
