!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"

!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "F5FAFC"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "19384B"
!endif

!ifndef BUILD_UNINSTALLER
Var YanjiInstallPage
Var YanjiIcon
Var YanjiTitle
Var YanjiSubtitle
Var YanjiPathField
Var YanjiBrowseButton
Var YanjiDesktopCheckbox
Var YanjiInstallButton
Var YanjiDesktopWanted
Var YanjiIconHandle
Var YanjiLegacyInstallRoot

Function YanjiEnsureDedicatedInstallFolder
  ${GetFileName} "$0" $1
  ${If} $1 != "研迹"
  ${AndIf} $1 != "Yanji"
  ${AndIf} $1 != "PaperTrail"
    StrCpy $0 "$0\研迹"
  ${EndIf}
FunctionEnd

!macro customHeader
  BrandingText "研迹 · 本地优先科研工作台"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  StrCpy $YanjiDesktopWanted "1"
  StrCpy $YanjiLegacyInstallRoot ""

  # v1.3.0 previously allowed users to select a shared software directory
  # directly. Its generated uninstaller then treated that whole directory as
  # application-owned. Ignore only those unsafe legacy registrations and move
  # the replacement installation into a dedicated child folder.
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $2 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $0 != ""
  ${AndIf} $2 != ""
    ${GetFileName} "$0" $3
    ${If} $3 != "研迹"
    ${AndIf} $3 != "Yanji"
    ${AndIf} $3 != "PaperTrail"
      StrCpy $YanjiLegacyInstallRoot "$0"
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  # A v1.3.0 elevated/silent installation may have written the same unsafe
  # location under HKLM. Remove only the app's registry records; never invoke
  # the legacy uninstaller because it may own the shared parent directory.
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $2 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $0 != ""
  ${AndIf} $2 != ""
    ${GetFileName} "$0" $3
    ${If} $3 != "研迹"
    ${AndIf} $3 != "Yanji"
    ${AndIf} $3 != "PaperTrail"
      ${If} $YanjiLegacyInstallRoot == ""
        StrCpy $YanjiLegacyInstallRoot "$0"
      ${EndIf}
      DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  # Yanji is deliberately a per-user application. Enforce that decision for
  # silent installs too, where the install-mode page is skipped and /allusers
  # or a stale HKLM record could otherwise select a dangerous shared root.
  !insertmacro setInstallModePerUser
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"

  !insertmacro GetDParameter $R0
  ${If} $YanjiLegacyInstallRoot != ""
  ${AndIf} $R0 == ""
    StrCpy $INSTDIR "$YanjiLegacyInstallRoot\研迹"
  ${EndIf}

  # Normalize the default or migrated path before the install page is shown.
  StrCpy $0 "$INSTDIR"
  Call YanjiEnsureDedicatedInstallFolder
  StrCpy $INSTDIR "$0"

  InitPluginsDir
  File /oname=$PLUGINSDIR\yanji-installer.ico "${BUILD_RESOURCES_DIR}\icon.ico"
!macroend

!macro customPageAfterChangeDir
  Page custom YanjiInstallPageCreate YanjiInstallPageLeave
  # NSIS applies a silent /D override after .onInit. Normalize again in the
  # InstFiles pre callback so /S /D=D:\app can never install into the shared
  # parent itself.
  !define MUI_PAGE_CUSTOMFUNCTION_PRE YanjiBeforeInstall
!macroend

Function YanjiBeforeInstall
  StrCpy $0 "$INSTDIR"
  Call YanjiEnsureDedicatedInstallFolder
  StrCpy $INSTDIR "$0"
FunctionEnd

Function YanjiInstallPageCreate
  nsDialogs::Create 1018
  Pop $YanjiInstallPage
  ${If} $YanjiInstallPage == error
    Abort
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:安装研迹"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:安静、可靠地管理你的科研工作"
  SetCtlColors $YanjiInstallPage "19384B" "F5FAFC"

  ${NSD_CreateIcon} 0u 2u 40u 40u ""
  Pop $YanjiIcon
  ${NSD_SetIcon} $YanjiIcon "$PLUGINSDIR\yanji-installer.ico" $YanjiIconHandle

  ${NSD_CreateLabel} 50u 4u 238u 18u "研迹"
  Pop $YanjiTitle
  CreateFont $0 "Microsoft YaHei UI" 16 700
  SendMessage $YanjiTitle ${WM_SETFONT} $0 1
  SetCtlColors $YanjiTitle "17384C" "F5FAFC"

  ${NSD_CreateLabel} 50u 25u 238u 20u "把日程、笔记、投稿与求职进度留在本地。"
  Pop $YanjiSubtitle
  SetCtlColors $YanjiSubtitle "6B8494" "F5FAFC"

  ${NSD_CreateLabel} 0u 58u 290u 12u "安装位置"
  Pop $0
  SetCtlColors $0 "456477" "F5FAFC"

  ${NSD_CreateText} 0u 73u 252u 22u "$INSTDIR"
  Pop $YanjiPathField
  SetCtlColors $YanjiPathField "24485D" "FFFFFF"

  ${NSD_CreateBrowseButton} 258u 73u 32u 22u "浏览"
  Pop $YanjiBrowseButton
  ${NSD_OnClick} $YanjiBrowseButton YanjiBrowseForFolder

  ${NSD_CreateCheckbox} 0u 106u 150u 16u "创建桌面快捷方式"
  Pop $YanjiDesktopCheckbox
  ${NSD_Check} $YanjiDesktopCheckbox
  SetCtlColors $YanjiDesktopCheckbox "456477" "F5FAFC"

  ${NSD_CreateLabel} 0u 127u 172u 16u "安装不会移动或清除你的科研数据。"
  Pop $0
  SetCtlColors $0 "8297A4" "F5FAFC"

  ${NSD_CreateButton} 181u 108u 109u 30u "立即安装"
  Pop $YanjiInstallButton
  CreateFont $1 "Microsoft YaHei UI" 11 700
  SendMessage $YanjiInstallButton ${WM_SETFONT} $1 1
  ${NSD_OnClick} $YanjiInstallButton YanjiBeginInstall

  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${WM_SETTEXT} 0 "STR:退出"

  nsDialogs::Show
FunctionEnd

Function YanjiBrowseForFolder
  ${NSD_GetText} $YanjiPathField $0
  nsDialogs::SelectFolderDialog "选择研迹的安装位置" "$0"
  Pop $1
  ${If} $1 != error
    StrCpy $0 "$1"
    Call YanjiEnsureDedicatedInstallFolder
    ${NSD_SetText} $YanjiPathField "$0"
  ${EndIf}
FunctionEnd

Function YanjiBeginInstall
  ${NSD_GetText} $YanjiPathField $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择安装位置。"
    Return
  ${EndIf}
  GetFullPathName $0 "$0"
  Call YanjiEnsureDedicatedInstallFolder
  ${NSD_SetText} $YanjiPathField "$0"
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd

Function YanjiInstallPageLeave
  ${NSD_GetText} $YanjiPathField $0
  GetFullPathName $0 "$0"
  Call YanjiEnsureDedicatedInstallFolder
  StrCpy $INSTDIR "$0"
  ${NSD_GetState} $YanjiDesktopCheckbox $YanjiDesktopWanted
  ${NSD_FreeIcon} $YanjiIconHandle
FunctionEnd

!macro customInstall
  # Never retain shortcut targets from an unsafe legacy shared-root install.
  Delete "$newStartMenuLink"
  CreateShortCut "$newStartMenuLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${If} $YanjiDesktopWanted == ${BST_CHECKED}
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${Else}
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
!endif
