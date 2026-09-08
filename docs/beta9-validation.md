# Beta 9 validation

- Empty stage deadlines stay blank; bare durations such as 72小时 resolve from the editing anchor.
- Current stage uses a native rounded dropdown, including rejection and restoration. All select controls receive rounded picker styling with keyboard behavior retained.
- Cards are collapsed by default; expansion reveals details. Cards and table provide direct edit controls. Table deadlines use 14px text.
- Website icons take priority over brand images; social preview images are excluded. Unquoted icon attributes are supported; HTML cannot pass image validation. Logo refresh saves the entered website and displays the resolved icon URL.
- npm test: 212/212. Real Electron/main/preload/IPC/disk regression passed, including stage deadlines, outcomes, captured all-day schedules, company cache, collapse/expand, and rounded-picker support.
- Package verification, packaged smoke (including updater fallback/storage recovery), and edited-source ASAR comparison passed for 1.5.0-beta.9.
- Screenshots: work/application-v12 at 1366x768 and 1920x1080.
