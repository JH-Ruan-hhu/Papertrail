# 1.5.0-beta.2 validation — 2026-09-06

Unified the blue-and-white desktop surfaces and translucent sidebar, including Quick Capture. Applications now share one search/filter/view panel; cards expand in place; table rows retain the dated workflow timeline, one job-type selector, editable time and tag chips. Pinning uses a company-right star and a left-to-white blue gradient. The overview calendar fills available vertical space with readable date cells.

Quick Capture now opens at 760 × 420. Its editor and syntax highlight layer fill the remaining compose area in both modes, with the hidden note-mode category row removed from layout. Long text scrolls inside the editor.

## Checks

- `npm test`: 194 passed, 0 failed.
- `scripts/smoke-jobs-redesign.js`: card/table behavior, pinning, search, job type persistence, column alignment, workflow and editable time passed at two window sizes.
- `scripts/smoke-v15.js`: overview/calendar checks passed at 1366, 1920 and 2560 window widths.
- `scripts/smoke-theme.js`: eight main pages and both capture modes passed; capture verifies writing area height, footer gap, highlight-layer alignment and long-text scrolling. Final screenshot: `work/theme-capture.png`.
- `npm run verify:package`: beta.2 version, archive and runtime dependencies passed.
- `node scripts/packaged-smoke.js outputs-beta`: packaged launch, updater fallback and storage-recovery safeguards passed.

## Delivery

`release-assets/1.5.0-beta.2/Yanji-Beta-Setup-1.5.0-beta.2-x64.exe`

Size: 102769683 bytes.

SHA256: `7C1DEEB9213D3CD60FCA0293EB676AB8B5D1139A1CC8D4E35B1F075B66D535B7`

The independent beta app identity, fixed Yanji-Beta installation directory and beta data directory remain unchanged. This run exported the installer; it did not install beta.2 over the running application or repeat the stable/beta installation matrix. Beta.1 installation evidence remains recorded separately. No public release was published.
