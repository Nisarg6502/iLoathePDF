/**
 * Attributes for the text boxes that ask writing-assistant extensions
 * (Grammarly, LanguageTool) to leave them alone, since those send what you
 * type to their servers. Spell check is off for the same reason: Chrome's
 * "enhanced" spell check sends text to Google.
 */
export const NO_ASSISTANTS = {
  spellCheck: false,
  autoComplete: "off",
  autoCorrect: "off",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lt-active": "false",
} as const;
