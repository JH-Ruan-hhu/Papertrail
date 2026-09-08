# Beta 9 validation

- Empty stage deadlines stay blank; bare durations such as 72小时 resolve from the editing anchor.
- Current stage uses a native rounded dropdown, including rejection and restoration. All select controls receive rounded picker styling with keyboard behavior retained.
- Cards are collapsed by default; expansion reveals details. Cards and table provide direct edit controls. Table deadlines use 14px text.
- Website icons take priority over brand images; social preview images are excluded. Unquoted icon attributes are supported; HTML cannot pass image validation. Logo refresh saves the entered website and displays the resolved icon URL.
- npm test: 212/212. Real Electron/main/preload/IPC/disk regression passed, including stage deadlines, outcomes, captured all-day schedules, company cache, collapse/expand, and rounded-picker support.
- Package verification, packaged smoke (including updater fallback/storage recovery), and edited-source ASAR comparison passed for 1.5.0-beta.9.
- Screenshots: work/application-v12 at 1366x768 and 1920x1080.

## Follow-up revision

Removed job checkboxes, bulk selection, and duplicate-job action. Added direct Logo controls, distinct progress colors with hover/focus stage names, and red deadline warnings within 72 hours (separate overdue label). Logo Save closes on successful settings persistence; failures keep the form open. Website inputs accept bare domains and direct image URLs. Added source-page website inference and actionable fetch errors, with validated binary MIME support and IPv4 preference.

Validation: 212 unit tests, real IPC Logo-save-and-close and stage-color checks, source/package match and packaged smoke passed. A live Sangfor official-site icon was downloaded, decoded by Electron and cached successfully in an isolated test directory. User data was not modified.

## Deadline calendar synchronization

Reached stages retain distinct colors; future stages use small gray dots. Cards and table mark deadlines within seven days red, and distinguish overdue dates. Table summary shortcut is replaced with direct rejection. Stage deadlines create stable linked calendar events; job changes, calendar-time edits, clearing and deletion stay synchronized. Existing deadlines are backfilled after a backup on load. Date-only deadlines do not spill into the next day. Unit tests cover stable identity, persistence, reverse edits and unrelated-schedule preservation.
