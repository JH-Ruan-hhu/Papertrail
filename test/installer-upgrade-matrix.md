# Yanji installer and upgrade matrix

Run the executable checks against the final x64 NSIS artifact, not against
`src/main.js`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-smoke.ps1 `
  -SetupPath outputs/Yanji-Setup-1.3.1-x64.exe
```

The script verifies each installed executable with `scripts/packaged-smoke.js`,
checks the desktop and Start Menu shortcut targets, runs only the dedicated
application uninstaller, and confirms a sentinel in the shared parent survives.

| Scenario | Expected result |
| --- | --- |
| Fresh default install | Stable legacy `%LOCALAPPDATA%\Programs\papertrail-desktop` remains app-owned; launch succeeds |
| User selects `D:\app` | Actual location is `D:\app\研迹`; shared siblings survive |
| User selects `D:\app\研迹` | The name is not appended twice |
| Chinese path `D:\科研软件` | Actual location is `D:\科研软件\研迹`; launch succeeds |
| Space path `D:\Research Tools` | Actual location is `D:\Research Tools\研迹`; launch succeeds |
| v1.2.x current-user upgrade | Dedicated install is replaced; userData remains independent |
| Unsafe v1.3.0 `D:\app` registration | Old uninstaller is not invoked; new install uses `D:\app\研迹` |
| C-drive old install to D drive | New shortcut and uninstall registration point only to D drive |
| `/allusers` or stale HKLM record | New install is forced to current-user mode and a dedicated child |

Release sign-off also requires an interactive pass for the default install,
overwrite upgrade, installer UI path picker, automatic run-after-install, and
Apps & Features removal. Never invoke an unsafe legacy uninstaller registered
directly in a shared parent directory.
