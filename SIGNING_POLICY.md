# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

## Scope

This policy covers the Windows x64 NSIS installer published for Yanji (研迹).
Portable builds are not produced or signed. Releases published before the
SignPath Foundation onboarding is complete are unsigned and are not represented
as SignPath-signed artifacts.

## Build and release process

- Release artifacts are built from the public
  [`JH-Ruan-hhu/Papertrail`](https://github.com/JH-Ruan-hhu/Papertrail)
  repository by GitHub Actions.
- Dependencies are installed from the committed `package-lock.json` with
  `npm ci`; tests and packaged verification run before an artifact can be sent
  for signing.
- The unsigned installer is submitted to the SignPath signing policy from the
  GitHub Actions artifact produced by the same workflow.
- Every production signing request requires manual approval.
- After signing, the updater blockmap and `latest.yml` are regenerated from the
  signed installer so their size and SHA-512 values describe the exact published
  file.
- Only the signed installer and its generated updater metadata are eligible for
  publication in the corresponding GitHub Release.

## Team roles

- Committer and reviewer: [JH-Ruan-hhu](https://github.com/JH-Ruan-hhu)
- Signing approver: [JH-Ruan-hhu](https://github.com/JH-Ruan-hhu)

Repository and SignPath accounts used for these roles must have multi-factor
authentication enabled. Changes from other contributors require review by the
maintainer before they can enter a release build.

## Privacy and security

The application privacy policy is documented in [PRIVACY.md](PRIVACY.md).
Security reports should be submitted privately through
[GitHub Security Advisories](https://github.com/JH-Ruan-hhu/Papertrail/security/advisories/new).
