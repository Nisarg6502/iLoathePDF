; File Explorer right-click menu: an "iLoathePDF" submenu on PDFs and images.
;
; This is the classic menu (Windows 10; "Show more options" on Windows 11).
; installer-hooks.nsh includes this file and inserts ILP_INSTALL_CONTEXT_MENU
; in NSIS_HOOK_POSTINSTALL and ILP_REMOVE_CONTEXT_MENU in
; NSIS_HOOK_PREUNINSTALL.
;
; Every item runs the app with the launch contract it understands:
;   "<install dir>\<main binary>.exe" --action <tool id> "%1"
; The ids are the ones in src/lib/tools.ts. The app is single-instance and
; gathers launches that arrive together into one batch, so Explorer starting
; one process per selected file is fine.
;
; Registry layout, per extension. Everything sits under
; SystemFileAssociations so it neither takes over nor depends on whichever
; app is the default for the type. SHCTX is HKLM here: for a perMachine
; install the template's SetContext macro runs SetShellVarContext all (and
; SetRegView 64), in .onInit and un.onInit alike, so install and uninstall
; touch the same hive and view.
;
;   Software\Classes\SystemFileAssociations\.<ext>\shell\iLoathePDF
;       MUIVerb           iLoathePDF
;       Icon              <install dir>\<main binary>.exe,0
;       SubCommands       ""    (empty: the items are the shell subkey below)
;       MultiSelectModel  Player
;     \shell\<n>-<tool id>
;         MUIVerb           <label, in the language picked in the installer>
;         MultiSelectModel  Player
;       \command
;           (default)       "<install dir>\<main binary>.exe" --action <tool id> "%1"
;
; The <n> prefix keeps the items in the order below: Explorer lists the verbs
; of a cascading menu in key-name order.
;
; MultiSelectModel (documented values for a static verb):
;   Single   - shown only when exactly one item is selected.
;   Document - one invocation (a top-level window) per item; like a verb with
;              no MultiSelectModel at all, Explorer drops it from the menu once
;              more than 15 items are selected (MultipleInvokePromptMinimum).
;   Player   - shown for any number of selected items.
; Player is the one that keeps the menu when someone selects, say, 40 photos.
; With a plain command line Explorer still runs the command once per item,
; which is what the single-instance batching expects. It is set on the
; parent as well as on each item, since the parent is what Explorer decides
; to show or hide.

!define ILP_CM_ROOT "Software\Classes\SystemFileAssociations"
!define ILP_CM_NAME "iLoathePDF"

; Labels, in the four installer languages (tauri.conf.json >
; bundle.windows.nsis.languages). Numeric language ids because this file is
; included above the template's MUI_LANGUAGE lines, where ${LANG_ENGLISH} and
; friends aren't defined yet: 1033 English, 1034 Spanish, 1036 French,
; 1081 Hindi. The words follow the app's own translations
; (packages/i18n/locales). Saved as UTF-8 without a BOM, like Hindi.nsh;
; installer-hooks.nsh includes it with /CHARSET=UTF8 so the Hindi survives
; whatever the build machine's code page is.

LangString ILP_CM_IMAGE_TO_PDF 1033 "Convert to PDF"
LangString ILP_CM_IMAGE_TO_PDF 1034 "Convertir a PDF"
LangString ILP_CM_IMAGE_TO_PDF 1036 "Convertir en PDF"
LangString ILP_CM_IMAGE_TO_PDF 1081 "PDF में बदलें"

LangString ILP_CM_CONVERT_IMAGE 1033 "Convert image format"
LangString ILP_CM_CONVERT_IMAGE 1034 "Convertir formato de imagen"
LangString ILP_CM_CONVERT_IMAGE 1036 "Convertir le format d'image"
LangString ILP_CM_CONVERT_IMAGE 1081 "इमेज फ़ॉर्मेट बदलें"

LangString ILP_CM_SCAN 1033 "Make scanned PDF"
LangString ILP_CM_SCAN 1034 "Crear PDF escaneado"
LangString ILP_CM_SCAN 1036 "Créer un PDF numérisé"
LangString ILP_CM_SCAN 1081 "स्कैन की गई PDF बनाएँ"

LangString ILP_CM_MERGE 1033 "Merge PDFs"
LangString ILP_CM_MERGE 1034 "Unir PDF"
LangString ILP_CM_MERGE 1036 "Fusionner des PDF"
LangString ILP_CM_MERGE 1081 "PDF जोड़ें"

LangString ILP_CM_COMPRESS 1033 "Compress"
LangString ILP_CM_COMPRESS 1034 "Comprimir"
LangString ILP_CM_COMPRESS 1036 "Compresser"
LangString ILP_CM_COMPRESS 1081 "कंप्रेस करें"

LangString ILP_CM_SPLIT 1033 "Split"
LangString ILP_CM_SPLIT 1034 "Dividir"
LangString ILP_CM_SPLIT 1036 "Diviser"
LangString ILP_CM_SPLIT 1081 "बाँटें"

LangString ILP_CM_PDF_TO_IMAGE 1033 "Convert to images"
LangString ILP_CM_PDF_TO_IMAGE 1034 "Convertir a imágenes"
LangString ILP_CM_PDF_TO_IMAGE 1036 "Convertir en images"
LangString ILP_CM_PDF_TO_IMAGE 1081 "इमेज में बदलें"

LangString ILP_CM_PROTECT 1033 "Protect with password"
LangString ILP_CM_PROTECT 1034 "Proteger con contraseña"
LangString ILP_CM_PROTECT 1036 "Protéger par mot de passe"
LangString ILP_CM_PROTECT 1081 "पासवर्ड से सुरक्षित करें"

; The extensions, and which menu each gets. PDF_MACRO and IMAGE_MACRO are
; inserted with the extension as their only argument. The image list is
; IMAGE_EXTS in src/lib/tools.ts; keep the two in step.
!macro _ILP_CM_EACH_EXT PDF_MACRO IMAGE_MACRO
  !insertmacro ${PDF_MACRO} pdf
  !insertmacro ${IMAGE_MACRO} jpg
  !insertmacro ${IMAGE_MACRO} jpeg
  !insertmacro ${IMAGE_MACRO} png
  !insertmacro ${IMAGE_MACRO} webp
  !insertmacro ${IMAGE_MACRO} heic
  !insertmacro ${IMAGE_MACRO} heif
  !insertmacro ${IMAGE_MACRO} bmp
  !insertmacro ${IMAGE_MACRO} tif
  !insertmacro ${IMAGE_MACRO} tiff
  !insertmacro ${IMAGE_MACRO} gif
!macroend

; The submenu itself. It is deleted first so that an update which renames or
; drops an item doesn't leave the old one behind; only our own key goes.
!macro _ILP_CM_PARENT EXT
  DeleteRegKey SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}" "MUIVerb" "${ILP_CM_NAME}"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}" "SubCommands" ""
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}" "MultiSelectModel" "Player"
!macroend

; One item: ORDER is its position, TOOL the tool id, LABEL a LangString name.
!macro _ILP_CM_ITEM EXT ORDER TOOL LABEL
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${TOOL}" "MUIVerb" "$(${LABEL})"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${TOOL}" "MultiSelectModel" "Player"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${TOOL}\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --action ${TOOL} "%1"'
!macroend

; PDFs, most used first. Merge is meant for several selected files, but it
; is offered for one too, as the app's Merge tool also takes a single file.
!macro _ILP_CM_PDF_MENU EXT
  !insertmacro _ILP_CM_PARENT ${EXT}
  !insertmacro _ILP_CM_ITEM ${EXT} 1 merge ILP_CM_MERGE
  !insertmacro _ILP_CM_ITEM ${EXT} 2 compress ILP_CM_COMPRESS
  !insertmacro _ILP_CM_ITEM ${EXT} 3 split ILP_CM_SPLIT
  !insertmacro _ILP_CM_ITEM ${EXT} 4 pdf-to-image ILP_CM_PDF_TO_IMAGE
  !insertmacro _ILP_CM_ITEM ${EXT} 5 protect ILP_CM_PROTECT
!macroend

; Images. image-to-pdf always makes one PDF, one image per page, from
; everything selected; it has no one-PDF-per-image option, so there is a
; single "Convert to PDF" item rather than a separate "Merge into one PDF".
; scan does the same but first cleans up photos of paper (shadows, dull
; colour), which is a different job, so it gets its own item.
!macro _ILP_CM_IMAGE_MENU EXT
  !insertmacro _ILP_CM_PARENT ${EXT}
  !insertmacro _ILP_CM_ITEM ${EXT} 1 image-to-pdf ILP_CM_IMAGE_TO_PDF
  !insertmacro _ILP_CM_ITEM ${EXT} 2 convert-image ILP_CM_CONVERT_IMAGE
  !insertmacro _ILP_CM_ITEM ${EXT} 3 scan ILP_CM_SCAN
!macroend

; Removes our submenu and nothing else: never the .<ext> key or its shell
; key, which other apps and Windows itself use. Those are left even when we
; were the ones who created them and they end up empty, as an empty key is
; harmless and deleting a shared one is not.
!macro _ILP_CM_DELETE EXT
  DeleteRegKey SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}"
!macroend

; Explorer caches menus; SHCNE_ASSOCCHANGED (0x08000000) makes it reload
; them. SHCNF_IDLIST (0) with both items NULL, as the docs require for this
; event, plus SHCNF_FLUSH (0x1000) so it is handled before we go on.
!macro _ILP_CM_NOTIFY
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend

!macro ILP_INSTALL_CONTEXT_MENU
  !insertmacro _ILP_CM_EACH_EXT _ILP_CM_PDF_MENU _ILP_CM_IMAGE_MENU
  !insertmacro _ILP_CM_NOTIFY
!macroend

!macro ILP_REMOVE_CONTEXT_MENU
  !insertmacro _ILP_CM_EACH_EXT _ILP_CM_DELETE _ILP_CM_DELETE
  !insertmacro _ILP_CM_NOTIFY
!macroend
