# 研迹 1.5.1

Local Windows x64 NSIS release. GitHub publishing canceled at user request.

- Includes beta.9 application management corrections and linked deadline schedules.
- Restores inline job-type selection including 销售岗 with immediate persistence.
- Unifies update-center palette, rounded panels, buttons and error states.
- Corrects future update feed and release-page links to Yan_ji. No online 1.5.1 release created.

Validation: 214 tests passed; real Electron job-type persistence and update-center states checked. Package verification, packaged smoke, storage recovery and source/ASAR comparison passed. Stable data compatibility checked on a temporary copy: Schema 11 retained; 29 jobs, 30 todos, 2 notes and 1 paper preserved; schedules 16 to 19 due to deadline backfill. Original data unmodified.

## September 9 local revision

Adds AI 面 before assessment, wider job actions, per-stage deadline editing and preservation of hidden legacy contact/notes. Refreshes icon discovery after source-link changes, with source-page favicon fallback and ICO PNG/32-bit frame decoding. All-day lanes expand up to four rows then scroll. Linked deadline events default to 30 minutes, capped at local midnight. Validation: 215 unit tests, real IPC AI selection/deadline save and 30-minute calendar duration, three all-day rows visible, package checks and source/ASAR match passed.

## Home consistency and tag colors

Excludes closed applications from assessment/interview/offer counts and their drill-down filters while keeping submitted totals cumulative. Today todos include unfinished overdue tasks; completed tasks no longer show an overdue label on Home. Application tags use eight consistent pastel colors across card and table views.

Validation: 217 tests passed, real Electron UI checks passed, package verification and packaged startup/storage recovery passed, and changed renderer files match the packaged ASAR. Adding a job with a source URL automatically discovers and stores its favicon; the form-to-IPC-to-image-decoding flow was verified with a controlled HTTP fixture, not a guarantee of retrieval from every live website. Local 1.5.1 only; no GitHub upload.

Moves the table Logo action into the More menu as 公司 Logo. Verified menu access, saving and dialog closure in Electron; rebuilt local 1.5.1 passed package/startup checks and ASAR source comparison.

Publication target confirmed as JH-Ruan-hhu/Papertrail. Updated packaged update feed and release-page URL to this repository and rebuilt the stable installer for publication.
