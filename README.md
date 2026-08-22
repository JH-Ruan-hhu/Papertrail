# 研迹 · Research Workbench

研迹 is a local-first Windows research workbench that brings daily planning,
quick capture, attendance, structured notes, and a complete manuscript tracker
into one desktop app. The manuscript connectors cover Elsevier Author Hub and
Elsevier accepted-article production pages; local workflow records remain
publisher-neutral.

## Version 0.8 workbench features

- Use a quiet, text-first desktop shell inspired by WeChat: a compact Windows
  title area, a small top-right clock, and no decorative navigation icons.
- Open Settings as a normal workspace page with horizontal categories; scrolling
  through the page automatically highlights the section currently in view.
- Clock in and out from Home, correct records manually, and review each week on
  a 24-hour Gantt chart with total time and average start/end times.
- Run a 25, 50, or 90 minute focus session from the attendance page. Yanji can
  temporarily pause application toast notifications, restore the previous
  Windows policy afterward, and summarize foreground-app time without reading
  window content.
- Keep today's priorities at the top of Home beside a compact clock and a daily
  quotation. The four-day schedule and latest notes share the next row.
- Keep Chinese IME composition stable in Quick Capture by separating the real
  textarea from the recognized-time highlight layer. Empty capture windows
  close automatically when they lose focus.
- Add `#1`, `#2`, or `#3` in Quick Capture for red, yellow, or green priority;
  schedules without a tag default to green.
- Use the app's own confirmation dialog for destructive actions instead of the
  browser or Windows legacy confirmation box.

## Version 0.7 workbench features

- Use a unified home, schedule, notes, submission-management, and settings
  workspace with a focused left navigation and a Bing daily-wallpaper home.
- Review yesterday, today, tomorrow, and the day after tomorrow from the home
  page, create a schedule quickly, and see the latest notes without changing
  pages.
- Plan a day on a horizontally scrollable 24-hour timeline with multi-hour
  events, completion state, and three Zotero-like priority choices.
- Mark an event as a deadline. High-priority deadlines use a full-screen red
  acknowledgement, medium priority uses a centered always-on-top amber alert
  plus a Windows notification, and low priority uses a Windows notification.
- Open the keyboard-first capture bar globally with `Ctrl+Shift+Space`, switch
  between schedule and note with Tab, and recognize Chinese expressions such as
  明天、后天、早上、下午 and 3点到5点.
- Create local notes with reusable text, select, and checkbox metadata fields.
  Metadata stays collapsed during normal writing. Any saved note can open as an
  always-on-top sticky note.
- Scroll through every settings section continuously while the matching
  category in the settings navigation highlights automatically.
- Keep the previous data file for 30 days after changing storage location, then
  delete only the expired migration copy. Manual early deletion remains
  available.
- Optionally check GitHub Releases at startup without automatically downloading
  or installing an update.

## Version 0.6 features

- Track multiple Elsevier manuscripts in one dashboard.
- Keep important changes as persistent unread records, mark one paper or all
  papers as read, and preserve the original timeline after reading.
- Add a manuscript using an Author Hub tracking link, or add an accepted article
  using its production reference and corresponding-author surname.
- Display manuscript, journal, status, revision, and reviewer event counts.
- Create, edit, complete, reopen, and delete local deadlines for revisions,
  proofs, copyright/licence paperwork, and suggested follow-up dates.
- Prioritize overdue and due-soon tasks in the manuscript list and send one
  Windows reminder within 48 hours of the deadline, plus one overdue reminder.
- Record R0, R1, R2 and later revision rounds with the decision type, request
  date, deadline, actual submission date, workflow state, and notes.
- Store a Manuscript ID, handling editor, current submission contact,
  rejection/transfer/acceptance note, and free-form local notes.
- Preserve individual reviewer events, including unknown event types, and show
  publisher-provided event time separately from Yanji's first local
  observation time.
- Display accepted-article production milestones, DOI, author information, and
  proof/publication events from Elsevier's official Article Tracking page.
- Reveal the complete DOI link on hover and copy it with one click.
- Keep a local change history and report stage duration conservatively as the
  time observed by Yanji, not an invented publisher-side start date.
- Show a scrollable manuscript timeline from the initial submission date through
  review records, acceptance, proofing, and publication when those dates are
  available from Elsevier.
- Refresh one paper or all papers manually, with conservative scheduled checks.
- Separate refresh attempts from successful syncs. Failed automatic syncs retry
  after 15 minutes, then one hour, then return to the configured interval;
  manual refresh is never blocked by this schedule.
- Prioritize deadlines before unread or actionable papers; search by title,
  journal, production reference, Manuscript ID, editor, or contact; and archive
  completed or paused papers without deleting data.
- Link local records for the same manuscript across multiple journal
  submissions and show the chronological cross-journal submission journey.
- Export a single paper's safe timeline as Markdown or CSV, including local
  deadlines, revision rounds, supplemental information, notes, and detailed
  events, without tracking URLs, UUIDs, encrypted secrets, or author-query
  credentials.
- Show native Windows notifications for status changes, completed reviews, and
  production milestones; clicking a notification opens the official page.
- Store tracking links with Windows DPAPI through Electron `safeStorage`.
- Run in the system tray and optionally start at sign-in.
- Optionally refresh all tracked manuscripts once after a cold start.
- Check the public GitHub Release feed from Settings, download a newer
  release on demand, show download progress, and restart into the installer.
  Yanji never checks silently in the background.
- Move the local data file to a user-selected folder while retaining the old
  file as a removable backup.

## Version 0.8 data model

Yanji stores `lastAttemptAt`, `lastSuccessfulAt`, `failureStreak`, and
`nextRetryAt` separately. Important updates contain their own occurrence time,
content, and read state. Archived papers keep their encrypted credential,
history, DOI, and production events but are excluded from automatic refresh.

Schema version 6 includes `schedules`, `notes`, reusable `metadataFields`,
`attendance`, and `focusSessions` while retaining manuscript details, tasks,
revision rounds, and observed review events. Older data files are migrated
locally on first successful load.
Existing encrypted credentials, history, unread updates, archives, and
submission journeys are retained. Invalid JSON, unsupported future schema
versions, and structurally damaged records are rejected without overwriting the
original file.

## Privacy and security

Tracking URLs contain a UUID that should be treated like a private access link.
Yanji never exposes that UUID to the renderer. The full link is encrypted
in Electron's user-data directory and only decrypted in the main process when a
refresh is requested. No analytics or cloud sync is included.

The renderer remains sandboxed with `contextIsolation` enabled and a restrictive
Content Security Policy. Exports are generated in the main process from an
explicit allow-list of paper metadata and are redacted again before writing.
Deadlines, revision-round details, contacts, schedules, and notes are never
included in publisher requests. The only optional home-page request is Bing's
daily-wallpaper metadata and image. There is no account system, cloud sync,
collaboration service, analytics, or telemetry.

## Development

```powershell
npm install
npm test
npm start
```

Build Windows artifacts:

```powershell
npm run dist
```

The build produces the x64 NSIS installer only. Portable builds are no longer
generated.
For application updates, publish the NSIS installer, its blockmap, and the
generated `latest.yml` together in the same public GitHub Release.

## Limitations

- Author-information lookup is only for articles that have been accepted and
  have entered production. It requires the reference from Elsevier's
  "Production has begun" email and the corresponding author's surname.
- Searching by an author name alone cannot reveal private or unpublished
  submissions. Elsevier's Author Search API searches Scopus author profiles and
  public indexed records, so Yanji does not present it as manuscript-status
  tracking.
- The tracking endpoint or response fields may change without notice.
- Automatic online tracking currently supports Elsevier only. Other publishers
  can be represented through local workflow metadata and submission journeys,
  but do not yet have automatic status connectors.
- Deadline reminders require Yanji to be running (the window may remain in
  the system tray) and Windows notifications to be enabled.
- The app does not bypass login, CAPTCHA, access controls, or publisher policy.
- A tracking UUID is required; Yanji cannot discover submissions from an
  Editorial Manager account automatically.
- `authors.elsevier.com/c/...` article Share Links provide reading access after
  publication and cannot be used to query manuscript-review status.
