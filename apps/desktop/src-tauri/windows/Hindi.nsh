; Hindi text for the messages Tauri adds to the installer (reinstall page,
; WebView2 setup, "app is running" prompts). NSIS's own Hindi pack covers
; everything else. Tauri ships no Hindi file, so tauri.conf.json points
; bundle.windows.nsis.customLanguageFiles here. The keys must match Tauri's
; English.nsh for the tauri-bundler version in use; a missing key falls back
; to English with a build warning.
LangString addOrReinstall ${LANG_HINDI} "घटक जोड़ें या फिर से इंस्टॉल करें"
LangString alreadyInstalled ${LANG_HINDI} "पहले से इंस्टॉल है"
LangString alreadyInstalledLong ${LANG_HINDI} "${PRODUCTNAME} ${VERSION} पहले से इंस्टॉल है। आप जो करना चाहते हैं उसे चुनें और आगे बढ़ने के लिए अगला पर क्लिक करें।"
LangString appRunning ${LANG_HINDI} "${PRODUCTNAME} चल रहा है! कृपया पहले इसे बंद करें, फिर दोबारा कोशिश करें।"
LangString appRunningOkKill ${LANG_HINDI} "${PRODUCTNAME} चल रहा है!$\nइसे बंद करने के लिए OK पर क्लिक करें"
LangString chooseMaintenanceOption ${LANG_HINDI} "रखरखाव का वह विकल्प चुनें जो आप करना चाहते हैं।"
LangString chooseHowToInstall ${LANG_HINDI} "चुनें कि आप ${PRODUCTNAME} को कैसे इंस्टॉल करना चाहते हैं।"
LangString createDesktop ${LANG_HINDI} "डेस्कटॉप शॉर्टकट बनाएँ"
LangString dontUninstall ${LANG_HINDI} "अनइंस्टॉल न करें"
LangString dontUninstallDowngrade ${LANG_HINDI} "अनइंस्टॉल न करें (इस इंस्टॉलर में अनइंस्टॉल किए बिना पुराना संस्करण लगाने की अनुमति नहीं है)"
LangString failedToKillApp ${LANG_HINDI} "${PRODUCTNAME} को बंद नहीं किया जा सका। कृपया पहले इसे बंद करें, फिर दोबारा कोशिश करें"
LangString installingWebview2 ${LANG_HINDI} "WebView2 इंस्टॉल हो रहा है..."
LangString newerVersionInstalled ${LANG_HINDI} "${PRODUCTNAME} का नया संस्करण पहले से इंस्टॉल है! पुराना संस्करण इंस्टॉल करने की सलाह नहीं दी जाती। अगर आप सच में यह पुराना संस्करण इंस्टॉल करना चाहते हैं, तो बेहतर है कि पहले मौजूदा संस्करण को अनइंस्टॉल करें। आप जो करना चाहते हैं उसे चुनें और आगे बढ़ने के लिए अगला पर क्लिक करें।"
LangString older ${LANG_HINDI} "पुराना"
LangString olderOrUnknownVersionInstalled ${LANG_HINDI} "आपके सिस्टम पर ${PRODUCTNAME} का $R4 संस्करण इंस्टॉल है। इंस्टॉल करने से पहले मौजूदा संस्करण को अनइंस्टॉल करने की सलाह दी जाती है। आप जो करना चाहते हैं उसे चुनें और आगे बढ़ने के लिए अगला पर क्लिक करें।"
LangString silentDowngrades ${LANG_HINDI} "इस इंस्टॉलर में पुराना संस्करण लगाने की अनुमति नहीं है, इसलिए साइलेंट इंस्टॉलर आगे नहीं बढ़ सकता। कृपया इसकी जगह ग्राफ़िकल इंस्टॉलर का उपयोग करें।$\n"
LangString unableToUninstall ${LANG_HINDI} "अनइंस्टॉल नहीं हो सका!"
LangString uninstallApp ${LANG_HINDI} "${PRODUCTNAME} अनइंस्टॉल करें"
LangString uninstallBeforeInstalling ${LANG_HINDI} "इंस्टॉल करने से पहले अनइंस्टॉल करें"
LangString unknown ${LANG_HINDI} "अज्ञात"
LangString webview2AbortError ${LANG_HINDI} "WebView2 इंस्टॉल नहीं हो सका! इसके बिना ऐप नहीं चल सकता। इंस्टॉलर को फिर से शुरू करके देखें।"
LangString webview2DownloadError ${LANG_HINDI} "त्रुटि: WebView2 डाउनलोड नहीं हो सका - $0"
LangString webview2DownloadSuccess ${LANG_HINDI} "WebView2 बूटस्ट्रैपर सफलतापूर्वक डाउनलोड हो गया"
LangString webview2Downloading ${LANG_HINDI} "WebView2 बूटस्ट्रैपर डाउनलोड हो रहा है..."
LangString webview2InstallError ${LANG_HINDI} "त्रुटि: WebView2 इंस्टॉल नहीं हो सका, एग्ज़िट कोड $1"
LangString webview2InstallSuccess ${LANG_HINDI} "WebView2 सफलतापूर्वक इंस्टॉल हो गया"
LangString deleteAppData ${LANG_HINDI} "ऐप्लिकेशन का डेटा हटाएँ"
