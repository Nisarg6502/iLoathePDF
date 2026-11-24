; Hooks into the installer Tauri generates (tauri.conf.json >
; bundle.windows.nsis.installerHooks). They run inside its Install and
; Uninstall sections, where LogicLib and ${MANUPRODUCTKEY} are available.

; ---------------------------------------------------------------------------
; "Send to > iLoathePDF" in Explorer's right-click menu.
;
; The shortcut starts the app with the selected files and no --action (the
; launch contract in src-tauri/src/launch.rs), so the app picks the tool.
;
; Limitation: SendTo is a per-user folder; Windows has no all-users SendTo.
; The install is perMachine and runs elevated, so the shortcut goes into the
; SendTo folder of the account the installer runs as. That is normally the
; person installing, but when a standard user installs with an administrator's
; password it lands in the administrator's profile, and other people on the
; computer never get it. Uninstalling removes it for the account running the
; uninstaller only.
;
; Updates, including the passive ones the app starts itself, write it again:
; that is how people on an earlier version get it (and why a deleted one comes
; back). It never shows a prompt, so a passive install stays unattended.
; ---------------------------------------------------------------------------

!macro ILP_INSTALL_SENDTO
  ; The template's SetContext points $APPDATA at the all-users folder for a
  ; perMachine install; SendTo lives in the user's own.
  SetShellVarContext current
  CreateDirectory "$APPDATA\Microsoft\Windows\SendTo"
  CreateShortCut "$APPDATA\Microsoft\Windows\SendTo\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  !if "${INSTALLMODE}" == "perMachine"
    SetShellVarContext all
  !endif
!macroend

!macro ILP_REMOVE_SENDTO
  ; Kept during an update, like the template's own shortcuts.
  ${If} $UpdateMode <> 1
    Push $0
    SetShellVarContext current
    ; Only remove our own shortcut, never someone's file of the same name.
    !insertmacro IsShortcutTarget "$APPDATA\Microsoft\Windows\SendTo\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      Delete "$APPDATA\Microsoft\Windows\SendTo\${PRODUCTNAME}.lnk"
    ${EndIf}
    !if "${INSTALLMODE}" == "perMachine"
      SetShellVarContext all
    !endif
    Pop $0
  ${EndIf}
!macroend

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
  !insertmacro ILP_INSTALL_SENDTO
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Not one of the bundled files, so the uninstaller wouldn't know to remove
  ; it, and the install folder would be left behind.
  Delete "$INSTDIR\installer-language"
  !insertmacro ILP_REMOVE_SENDTO
!macroend
