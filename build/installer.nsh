!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

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

!macro customHeader
  BrandingText "研迹 · 本地优先科研工作台"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  StrCpy $YanjiDesktopWanted "1"
  InitPluginsDir
  File /oname=$PLUGINSDIR\yanji-installer.ico "${BUILD_RESOURCES_DIR}\icon.ico"
!macroend

!macro customPageAfterChangeDir
  Page custom YanjiInstallPageCreate YanjiInstallPageLeave
!macroend

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
    ${NSD_SetText} $YanjiPathField "$1"
  ${EndIf}
FunctionEnd

Function YanjiBeginInstall
  ${NSD_GetText} $YanjiPathField $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择安装位置。"
    Return
  ${EndIf}
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd

Function YanjiInstallPageLeave
  ${NSD_GetText} $YanjiPathField $0
  GetFullPathName $INSTDIR "$0"
  ${NSD_GetState} $YanjiDesktopCheckbox $YanjiDesktopWanted
  ${NSD_FreeIcon} $YanjiIconHandle
FunctionEnd

!macro customInstall
  ${If} $YanjiDesktopWanted != ${BST_CHECKED}
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
!endif
