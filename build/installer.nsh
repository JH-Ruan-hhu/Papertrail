!include "LogicLib.nsh"
!include "FileFunc.nsh"

# Keep upgrade-path safety in an otherwise stock electron-builder NSIS wizard.
# This file intentionally defines no custom page, colors, branding, controls,
# or shortcut UI; electron-builder owns the complete installer presentation.

!ifndef BUILD_UNINSTALLER
Var YanjiLegacyInstallRoot

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  StrCpy $YanjiLegacyInstallRoot ""

  # v1.3.0 could register a shared software directory as application-owned.
  # Remove only the unsafe app registration; never execute that uninstaller.
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $2 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $0 != ""
  ${AndIf} $2 != ""
    ${GetFileName} "$0" $3
    ${If} $3 != "研迹"
    ${AndIf} $3 != "Yanji"
    ${AndIf} $3 != "PaperTrail"
    ${AndIf} $3 != "papertrail-desktop"
      StrCpy $YanjiLegacyInstallRoot "$0"
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $2 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $0 != ""
  ${AndIf} $2 != ""
    ${GetFileName} "$0" $3
    ${If} $3 != "研迹"
    ${AndIf} $3 != "Yanji"
    ${AndIf} $3 != "PaperTrail"
    ${AndIf} $3 != "papertrail-desktop"
      ${If} $YanjiLegacyInstallRoot == ""
        StrCpy $YanjiLegacyInstallRoot "$0"
      ${EndIf}
      DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  # Yanji remains a per-user application and never owns a shared parent.
  !insertmacro setInstallModePerUser
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"

  !insertmacro GetDParameter $R0
  ${If} $YanjiLegacyInstallRoot != ""
  ${AndIf} $R0 == ""
    StrCpy $INSTDIR "$YanjiLegacyInstallRoot\papertrail-desktop"
  ${EndIf}
!macroend
!endif
