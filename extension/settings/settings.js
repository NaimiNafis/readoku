// Readoku Settings JavaScript
document.addEventListener('DOMContentLoaded', function () {
  const fontSizeInput = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');
  const fontBoldCheckbox = document.getElementById('fontBold');
  const hotkeySelect = document.getElementById('hotkey');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // Load saved settings
  chrome.storage.local.get(['popupFontSize', 'popupFontColor', 'popupFontBold', 'readokuHotkey'], function (result) {
    if (result.popupFontSize) {
      fontSizeInput.value = result.popupFontSize;
    }
    if (result.popupFontColor) {
      fontColorInput.value = result.popupFontColor;
    }
    if (result.popupFontBold !== undefined) {
      fontBoldCheckbox.checked = result.popupFontBold;
    }
    if (result.readokuHotkey) {
      hotkeySelect.value = result.readokuHotkey;
    }
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', function () {
    const settingsToSave = {
      popupFontSize: fontSizeInput.value,
      popupFontColor: fontColorInput.value,
      popupFontBold: fontBoldCheckbox.checked,
      readokuHotkey: hotkeySelect.value
    };

    chrome.storage.local.set(settingsToSave, function () {
      console.log('Readoku settings saved:', settingsToSave);
      // Optionally, provide user feedback (e.g., a temporary "Settings Saved!" message)
      alert('Settings saved!'); // Simple feedback for now

      // Notify content script about potential hotkey change immediately
      // and other scripts if appearance settings need live updates elsewhere (not implemented yet for live appearance update)
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: settingsToSave });
    });
  });
}); 