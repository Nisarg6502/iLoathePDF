; Hooks into the installer Tauri generates (tauri.conf.json >
; bundle.windows.nsis.installerHooks). They run inside its Install and
; Uninstall sections, where LogicLib and ${MANUPRODUCTKEY} are available.

; Explorer right-click submenu (context-menu.nsh, next to this file).
!include /CHARSET=UTF8 "${__FILEDIR__}\context-menu.nsh"

!macro NSIS_HOOK_POSTINSTALL
  Push $0

  ; Hand the language picked on the installer's first screen to the app.
  ; $LANGUAGE is a Windows language id (1033 English, 1081 Hindi, ...). The
  ; app reads this file once at startup (src-tauri/src/locale.rs) and uses it
  ; until the user picks a language in Settings. Keep the file name in step
  ; with INSTALLER_LANGUAGE_FILE there.
  ClearErrors
  FileOpen $0 "$INSTDIR\installer-language" w
  ${IfNot} ${Errors}
    FileWrite $0 "$LANGUAGE"
    FileClose $0
  ${EndIf}

  ; Remember the choice where the language screen looks for it. Tauri's
  ; template reads this value but never writes it, so without this the
  ; language screen would come back on every update, including the
  ; background ones the app starts itself.
  WriteRegStr HKCU "${MANUPRODUCTKEY}" "Installer Language" "$LANGUAGE"

  Pop $0

  !insertmacro ILP_INSTALL_CONTEXT_MENU
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Not one of the bundled files, so the uninstaller wouldn't know to remove
  ; it, and the install folder would be left behind.
  Delete "$INSTDIR\installer-language"

  !insertmacro ILP_REMOVE_CONTEXT_MENU
!macroend
