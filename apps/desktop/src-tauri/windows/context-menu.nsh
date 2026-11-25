; File Explorer right-click menu: an "iLoathePDF" submenu on PDFs, images and
; ZIP files.
;
; This is the classic menu (Windows 10; "Show more options" on Windows 11).
; installer-hooks.nsh includes this file and inserts ILP_INSTALL_CONTEXT_MENU
; in NSIS_HOOK_POSTINSTALL and ILP_REMOVE_CONTEXT_MENU in
; NSIS_HOOK_PREUNINSTALL.
;
; Every item runs the app with the launch contract it understands:
;   "<install dir>\<main binary>.exe" --run <quick action id> "%1"
;   "<install dir>\<main binary>.exe" --action <tool id> "%1"
; --run items (0.11 and later) do the job in place: the result lands next to
; the file and only a small progress card appears. Their ids are the ones in
; src/lib/quickActions.ts. --action items open the main window on a tool, with
; the files loaded; their ids are the ones in src/lib/tools.ts, and their
; labels end in an ellipsis, the Windows convention for "asks for more
; first". The app is single-instance and gathers launches that arrive
; together into one batch, so Explorer starting one process per selected file
; is fine.
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
;     \shell\<n>-<id>
;         MUIVerb           <label, in the language picked in the installer>
;         MultiSelectModel  Player
;         CommandFlags      0x20 (DWORD), on the first --action item only
;       \command
;           (default)       "<install dir>\<main binary>.exe" --<run|action> <id> "%1"
;
; CommandFlags 0x20 is ECF_SEPARATORBEFORE: a line between the in-place items
; and the open-in-the-app ones.
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

; In place (--run).
LangString ILP_CM_Q_COMPRESS 1033 "Compress"
LangString ILP_CM_Q_COMPRESS 1034 "Comprimir"
LangString ILP_CM_Q_COMPRESS 1036 "Compresser"
LangString ILP_CM_Q_COMPRESS 1081 "कंप्रेस करें"

LangString ILP_CM_Q_MERGE 1033 "Merge into one PDF"
LangString ILP_CM_Q_MERGE 1034 "Unir en un solo PDF"
LangString ILP_CM_Q_MERGE 1036 "Fusionner en un seul PDF"
LangString ILP_CM_Q_MERGE 1081 "एक PDF में जोड़ें"

LangString ILP_CM_Q_IMAGE_TO_PDF 1033 "Convert to PDF"
LangString ILP_CM_Q_IMAGE_TO_PDF 1034 "Convertir a PDF"
LangString ILP_CM_Q_IMAGE_TO_PDF 1036 "Convertir en PDF"
LangString ILP_CM_Q_IMAGE_TO_PDF 1081 "PDF में बदलें"

LangString ILP_CM_Q_ONE_PDF 1033 "Combine into one PDF"
LangString ILP_CM_Q_ONE_PDF 1034 "Combinar en un solo PDF"
LangString ILP_CM_Q_ONE_PDF 1036 "Combiner en un seul PDF"
LangString ILP_CM_Q_ONE_PDF 1081 "एक PDF में मिलाएँ"

LangString ILP_CM_Q_TO_JPG 1033 "Convert to JPG"
LangString ILP_CM_Q_TO_JPG 1034 "Convertir a JPG"
LangString ILP_CM_Q_TO_JPG 1036 "Convertir en JPG"
LangString ILP_CM_Q_TO_JPG 1081 "JPG में बदलें"

LangString ILP_CM_Q_EXTRACT_HERE 1033 "Extract here"
LangString ILP_CM_Q_EXTRACT_HERE 1034 "Extraer aquí"
LangString ILP_CM_Q_EXTRACT_HERE 1036 "Extraire ici"
LangString ILP_CM_Q_EXTRACT_HERE 1081 "यहीं निकालें"

; A static verb can't show the archive's name ("Extract to photos\" needs
; a shell extension), so this says what it does instead: a new folder named
; after the ZIP, next to it.
LangString ILP_CM_Q_EXTRACT_FOLDER 1033 "Extract to a new folder"
LangString ILP_CM_Q_EXTRACT_FOLDER 1034 "Extraer en una carpeta nueva"
LangString ILP_CM_Q_EXTRACT_FOLDER 1036 "Extraire dans un nouveau dossier"
LangString ILP_CM_Q_EXTRACT_FOLDER 1081 "नए फ़ोल्डर में निकालें"

; Open in the app (--action), with options to choose first.
LangString ILP_CM_IMAGE_TO_PDF 1033 "Images to PDF…"
LangString ILP_CM_IMAGE_TO_PDF 1034 "Imágenes a PDF…"
LangString ILP_CM_IMAGE_TO_PDF 1036 "Images en PDF…"
LangString ILP_CM_IMAGE_TO_PDF 1081 "इमेज से PDF…"

LangString ILP_CM_CONVERT_IMAGE 1033 "Convert image format…"
LangString ILP_CM_CONVERT_IMAGE 1034 "Convertir formato de imagen…"
LangString ILP_CM_CONVERT_IMAGE 1036 "Convertir le format d'image…"
LangString ILP_CM_CONVERT_IMAGE 1081 "इमेज फ़ॉर्मेट बदलें…"

LangString ILP_CM_SCAN 1033 "Make scanned PDF…"
LangString ILP_CM_SCAN 1034 "Crear PDF escaneado…"
LangString ILP_CM_SCAN 1036 "Créer un PDF numérisé…"
LangString ILP_CM_SCAN 1081 "स्कैन की गई PDF बनाएँ…"

LangString ILP_CM_MERGE 1033 "Merge PDFs…"
LangString ILP_CM_MERGE 1034 "Unir PDF…"
LangString ILP_CM_MERGE 1036 "Fusionner des PDF…"
LangString ILP_CM_MERGE 1081 "PDF जोड़ें…"

LangString ILP_CM_COMPRESS 1033 "Compress…"
LangString ILP_CM_COMPRESS 1034 "Comprimir…"
LangString ILP_CM_COMPRESS 1036 "Compresser…"
LangString ILP_CM_COMPRESS 1081 "कंप्रेस करें…"

LangString ILP_CM_SPLIT 1033 "Split…"
LangString ILP_CM_SPLIT 1034 "Dividir…"
LangString ILP_CM_SPLIT 1036 "Diviser…"
LangString ILP_CM_SPLIT 1081 "बाँटें…"

LangString ILP_CM_PDF_TO_IMAGE 1033 "Convert to images…"
LangString ILP_CM_PDF_TO_IMAGE 1034 "Convertir a imágenes…"
LangString ILP_CM_PDF_TO_IMAGE 1036 "Convertir en images…"
LangString ILP_CM_PDF_TO_IMAGE 1081 "इमेज में बदलें…"

LangString ILP_CM_PROTECT 1033 "Protect with password…"
LangString ILP_CM_PROTECT 1034 "Proteger con contraseña…"
LangString ILP_CM_PROTECT 1036 "Protéger par mot de passe…"
LangString ILP_CM_PROTECT 1081 "पासवर्ड से सुरक्षित करें…"

LangString ILP_CM_ZIP_TO_PDF 1033 "ZIP to PDF…"
LangString ILP_CM_ZIP_TO_PDF 1034 "ZIP a PDF…"
LangString ILP_CM_ZIP_TO_PDF 1036 "ZIP en PDF…"
LangString ILP_CM_ZIP_TO_PDF 1081 "ZIP से PDF…"

; The extensions, and which menu each gets. PDF_MACRO, IMAGE_MACRO and
; ZIP_MACRO are inserted with the extension as their only argument. The image
; list is IMAGE_EXTS in src/lib/tools.ts; keep the two in step.
!macro _ILP_CM_EACH_EXT PDF_MACRO IMAGE_MACRO ZIP_MACRO
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
  !insertmacro ${ZIP_MACRO} zip
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

; One item: ORDER is its position, FLAG "run" (in place) or "action" (open in
; the app), ID the quick action or tool id, LABEL a LangString name.
!macro _ILP_CM_ITEM EXT ORDER FLAG ID LABEL
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${ID}" "MUIVerb" "$(${LABEL})"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${ID}" "MultiSelectModel" "Player"
  WriteRegStr SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${ID}\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --${FLAG} ${ID} "%1"'
!macroend

; A line above item ORDER-ID: the first open-in-the-app one.
!macro _ILP_CM_SEPARATOR_BEFORE EXT ORDER ID
  WriteRegDWORD SHCTX "${ILP_CM_ROOT}\.${EXT}\shell\${ILP_CM_NAME}\shell\${ORDER}-${ID}" "CommandFlags" 0x20
!macroend

; PDFs: the two jobs that need no choices, done in place; then the tools,
; opened in the app. Merge is meant for several selected files, but it is
; offered for one too, as the app's Merge tool also takes a single file.
; Item keys stay within 1-9: Explorer orders them by key name, so a "10-"
; would sort before "2-".
!macro _ILP_CM_PDF_MENU EXT
  !insertmacro _ILP_CM_PARENT ${EXT}
  !insertmacro _ILP_CM_ITEM ${EXT} 1 run compress ILP_CM_Q_COMPRESS
  !insertmacro _ILP_CM_ITEM ${EXT} 2 run merge ILP_CM_Q_MERGE
  !insertmacro _ILP_CM_ITEM ${EXT} 3 action merge ILP_CM_MERGE
  !insertmacro _ILP_CM_SEPARATOR_BEFORE ${EXT} 3 merge
  !insertmacro _ILP_CM_ITEM ${EXT} 4 action compress ILP_CM_COMPRESS
  !insertmacro _ILP_CM_ITEM ${EXT} 5 action split ILP_CM_SPLIT
  !insertmacro _ILP_CM_ITEM ${EXT} 6 action pdf-to-image ILP_CM_PDF_TO_IMAGE
  !insertmacro _ILP_CM_ITEM ${EXT} 7 action protect ILP_CM_PROTECT
!macroend

; Images. In place: one PDF per image, everything in one PDF, or JPG copies
; (not offered on a JPG). In the app: Images to PDF with page-size and order
; choices, format conversion with quality and resizing, and the scanner,
; which first cleans up photos of paper (shadows, dull colour).
!macro _ILP_CM_IMAGE_MENU EXT
  !insertmacro _ILP_CM_PARENT ${EXT}
  !insertmacro _ILP_CM_ITEM ${EXT} 1 run image-to-pdf ILP_CM_Q_IMAGE_TO_PDF
  !insertmacro _ILP_CM_ITEM ${EXT} 2 run images-to-one-pdf ILP_CM_Q_ONE_PDF
  !if "${EXT}" != "jpg"
    !if "${EXT}" != "jpeg"
      !insertmacro _ILP_CM_ITEM ${EXT} 3 run convert-to-jpg ILP_CM_Q_TO_JPG
    !endif
  !endif
  !insertmacro _ILP_CM_ITEM ${EXT} 4 action image-to-pdf ILP_CM_IMAGE_TO_PDF
  !insertmacro _ILP_CM_SEPARATOR_BEFORE ${EXT} 4 image-to-pdf
  !insertmacro _ILP_CM_ITEM ${EXT} 5 action convert-image ILP_CM_CONVERT_IMAGE
  !insertmacro _ILP_CM_ITEM ${EXT} 6 action scan ILP_CM_SCAN
!macroend

; ZIP files: extract in place, beside the ZIP or into a new folder named
; after it (src/lib/quickActions.ts, sidecar/ops/zip_extract.py); or open
; ZIP to PDF in the app.
!macro _ILP_CM_ZIP_MENU EXT
  !insertmacro _ILP_CM_PARENT ${EXT}
  !insertmacro _ILP_CM_ITEM ${EXT} 1 run extract-here ILP_CM_Q_EXTRACT_HERE
  !insertmacro _ILP_CM_ITEM ${EXT} 2 run extract-to-folder ILP_CM_Q_EXTRACT_FOLDER
  !insertmacro _ILP_CM_ITEM ${EXT} 3 action zip-to-pdf ILP_CM_ZIP_TO_PDF
  !insertmacro _ILP_CM_SEPARATOR_BEFORE ${EXT} 3 zip-to-pdf
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
  !insertmacro _ILP_CM_EACH_EXT _ILP_CM_PDF_MENU _ILP_CM_IMAGE_MENU _ILP_CM_ZIP_MENU
  !insertmacro _ILP_CM_NOTIFY
!macroend

!macro ILP_REMOVE_CONTEXT_MENU
  !insertmacro _ILP_CM_EACH_EXT _ILP_CM_DELETE _ILP_CM_DELETE _ILP_CM_DELETE
  !insertmacro _ILP_CM_NOTIFY
!macroend
