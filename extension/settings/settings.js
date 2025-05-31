// Readoku Settings JavaScript
document.addEventListener('DOMContentLoaded', function () {
  const fontSizeInput = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');
  const fontBoldCheckbox = document.getElementById('fontBold');
  const hotkeySelect = document.getElementById('hotkey');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');
  const fontPreview = document.getElementById('fontPreview');

  const DEFAULT_SETTINGS = {
    popupFontSize: '16',
    popupFontColor: '#191919',
    popupFontBold: false,
    readokuHotkey: 'Shift'
  };

  function applyPreviewStyles() {
    if (fontPreview) {
      fontPreview.style.fontSize = `${fontSizeInput.value || DEFAULT_SETTINGS.popupFontSize}px`;
      fontPreview.style.color = fontColorInput.value || DEFAULT_SETTINGS.popupFontColor;
      fontPreview.style.fontWeight = fontBoldCheckbox.checked ? 'bold' : 'normal';
    }
  }

  function loadSettings() {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), function (result) {
      fontSizeInput.value = result.popupFontSize || DEFAULT_SETTINGS.popupFontSize;
      fontColorInput.value = result.popupFontColor || DEFAULT_SETTINGS.popupFontColor;
      fontBoldCheckbox.checked = result.popupFontBold !== undefined ? result.popupFontBold : DEFAULT_SETTINGS.popupFontBold;
      hotkeySelect.value = result.readokuHotkey || DEFAULT_SETTINGS.readokuHotkey;
      applyPreviewStyles(); // Apply styles to preview after loading
    });
  }

  function saveSettings(settings, showAlert = true) {
    chrome.storage.local.set(settings, function () {
      console.log('Readoku settings saved:', settings);
      if (showAlert) {
        alert('Settings saved!');
      }
      // Notify other scripts (content.js, popup.js will pick up from storage change listener)
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: settings });
    });
  }

  // Load settings on page load
  loadSettings();

  // Event listeners for live preview
  fontSizeInput.addEventListener('input', applyPreviewStyles);
  fontColorInput.addEventListener('input', applyPreviewStyles);
  fontBoldCheckbox.addEventListener('change', applyPreviewStyles);

  // Save settings button
  saveSettingsBtn.addEventListener('click', function () {
    const currentSettings = {
      popupFontSize: fontSizeInput.value,
      popupFontColor: fontColorInput.value,
      popupFontBold: fontBoldCheckbox.checked,
      readokuHotkey: hotkeySelect.value
    };
    saveSettings(currentSettings);
  });

  // Reset to Defaults button
  resetSettingsBtn.addEventListener('click', function () {
    if (confirm('Are you sure you want to reset all settings to their defaults?')) {
      fontSizeInput.value = DEFAULT_SETTINGS.popupFontSize;
      fontColorInput.value = DEFAULT_SETTINGS.popupFontColor;
      fontBoldCheckbox.checked = DEFAULT_SETTINGS.popupFontBold;
      hotkeySelect.value = DEFAULT_SETTINGS.readokuHotkey;
      applyPreviewStyles();
      saveSettings(DEFAULT_SETTINGS, false); // Save defaults, maybe don't show alert or a different one
      alert('Settings have been reset to defaults.');
    }
  });
}); 