!include "LogicLib.nsh"
!include "FileFunc.nsh"

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# This installer uses its own application registry keys and never probes or
# invokes the stable Yanji uninstaller. The beta always installs into its own
# per-user folder, including silent runs; a /D override cannot select stable.
!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Yanji-Beta"
!macroend

!macro customInstall
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "Channel" "beta"
!macroend
