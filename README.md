# PaperTrail

PaperTrail is a local-first Windows desktop progress and action center for
Elsevier peer-review submissions and accepted articles in production.

## MVP features

- Track multiple Elsevier manuscripts in one dashboard.
- Keep important changes as persistent unread records, mark one paper or all
  papers as read, and preserve the original timeline after reading.
- Add a manuscript using an Author Hub tracking link, or add an accepted article
  using its production reference and corresponding-author surname.
- Display manuscript, journal, status, revision, and reviewer event counts.
- Display accepted-article production milestones, DOI, author information, and
  proof/publication events from Elsevier's official Article Tracking page.
- Reveal the complete DOI link on hover and copy it with one click.
- Keep a local change history and report stage duration conservatively as the
  time observed by PaperTrail, not an invented publisher-side start date.
- Show a scrollable manuscript timeline from the initial submission date through
  review records, acceptance, proofing, and publication when those dates are
  available from Elsevier.
- Refresh one paper or all papers manually, with conservative scheduled checks.
- Separate refresh attempts from successful syncs. Failed automatic syncs retry
  after 15 minutes, then one hour, then return to the configured interval;
  manual refresh is never blocked by this schedule.
- Prioritize unread or actionable papers, search by title, journal, or production
  reference, and archive completed or paused papers without deleting data.
- Link local records for the same manuscript across multiple journal
  submissions and show the chronological cross-journal submission journey.
- Export a single paper's safe timeline as Markdown or CSV without tracking
  URLs, UUIDs, encrypted secrets, or author-query credentials.
- Show native Windows notifications for status changes, completed reviews, and
  production milestones; clicking a notification opens the official page.
- Store tracking links with Windows DPAPI through Electron `safeStorage`.
- Run in the system tray and optionally start at sign-in.
- Optionally refresh all tracked manuscripts once after a cold start.
- Check the public GitHub Release feed from Settings, download a newer
  release on demand, show download progress, and restart into the installer.
  PaperTrail never checks silently in the background.
- Move the local data file to a user-selected folder while retaining the old
  file as a removable backup.

## Version 0.5.0 data model

PaperTrail stores `lastAttemptAt`, `lastSuccessfulAt`, `failureStreak`, and
`nextRetryAt` separately. Important updates contain their own occurrence time,
content, and read state. Archived papers keep their encrypted credential,
history, DOI, and production events but are excluded from automatic refresh.

Data files from the 0.4.x series are migrated locally to schema version 2 on
first successful load. A failed legacy check is not treated as a successful
sync. Invalid JSON, unsupported future schema versions, and structurally
damaged paper records are rejected without overwriting the original file.

## Privacy and security

Tracking URLs contain a UUID that should be treated like a private access link.
PaperTrail never exposes that UUID to the renderer. The full link is encrypted
in Electron's user-data directory and only decrypted in the main process when a
refresh is requested. No analytics or cloud sync is included.

The renderer remains sandboxed with `contextIsolation` enabled and a restrictive
Content Security Policy. Exports are generated in the main process from an
explicit allow-list of paper metadata and are redacted again before writing.

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

The build produces an NSIS installer and a portable executable.
For application updates, publish the NSIS installer, its blockmap, and the
generated `latest.yml` together in the same public GitHub Release. Portable
builds open the release page instead of attempting an in-place installation.

## Limitations

- Author-information lookup is only for articles that have been accepted and
  have entered production. It requires the reference from Elsevier's
  "Production has begun" email and the corresponding author's surname.
- Searching by an author name alone cannot reveal private or unpublished
  submissions. Elsevier's Author Search API searches Scopus author profiles and
  public indexed records, so PaperTrail does not present it as manuscript-status
  tracking.
- The tracking endpoint or response fields may change without notice.
- The app does not bypass login, CAPTCHA, access controls, or publisher policy.
- A tracking UUID is required; PaperTrail cannot discover submissions from an
  Editorial Manager account automatically.
- `authors.elsevier.com/c/...` article Share Links provide reading access after
  publication and cannot be used to query manuscript-review status.
