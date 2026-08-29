# Privacy policy

Yanji (研迹) is a local-first Windows desktop application. Its schedules,
notes, tasks, attendance records, job applications, manuscript metadata, and
settings are stored on the user's computer. Yanji does not provide analytics,
telemetry, advertising, account synchronization, or developer-operated cloud
storage.

## Network connections

Yanji connects to a network only for a feature selected or enabled by the user:

- Manuscript tracking sends the tracking URL supplied by the user to the
  corresponding Elsevier tracking service. An optional cold-start refresh can
  repeat this request when the user has enabled that setting.
- Checking or downloading an application update connects to the public
  `JH-Ruan-hhu/Papertrail` GitHub Releases feed. Update checks are initiated
  from Settings and downloads require user confirmation.
- Opening a DOI, article page, tracking page, or other external link passes the
  selected URL to the default web browser.

Yanji does not send notes, schedules, contacts, deadlines, attendance records,
application-use totals, job applications, or exported files with these
requests. Standard connection metadata such as the user's IP address can still
be received by Elsevier, GitHub, or the destination website under that
provider's own privacy policy.

## Local data and credentials

Tracking links can contain private UUID values. Yanji encrypts those links with
Windows DPAPI through Electron `safeStorage`, does not expose the full value to
the renderer process, and redacts it from exports. Application-use tracking, if
enabled by the user, records application names and approximate durations only;
it does not read window titles or document contents.

Users can choose the local data directory, remove local backup files from
Settings, delete individual records through the application, and uninstall the
application through Windows. Uninstalling does not silently delete the user's
research data.

## Contact

Questions or security reports can be submitted through the repository's
[GitHub Security Advisories](https://github.com/JH-Ruan-hhu/Papertrail/security/advisories/new).
