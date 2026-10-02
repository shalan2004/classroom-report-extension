// Minimal service worker. This extension does almost everything in the
// content script and popup; the background worker only seeds the default
// common notes the first time the extension is installed.
const STORAGE_KEY_COMMON_NOTES = 'commonNotes';

const DEFAULT_COMMON_NOTES = [
  {
    id: 'default-recording',
    text:
      '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Give the recording another look and complete your HW\u203C\uFE0F',
  },
  {
    id: 'default-steps',
    text: '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Don\u2019t forget to write the steps\u203C\uFE0F',
  },
  {
    id: 'default-ruler',
    text: '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Please use a ruler\u203C\uFE0F',
  },
];

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([STORAGE_KEY_COMMON_NOTES]);
  if (!existing[STORAGE_KEY_COMMON_NOTES]) {
    await chrome.storage.local.set({
      [STORAGE_KEY_COMMON_NOTES]: DEFAULT_COMMON_NOTES,
    });
  }
});
