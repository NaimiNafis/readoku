document.addEventListener('DOMContentLoaded', function () {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const toggleStatusText = document.getElementById('toggleStatusText');
  const settingsBtn = document.getElementById('settingsBtn');
  const searchBtn = document.getElementById('searchBtn');
  const infoBtn = document.getElementById('infoBtn');
  const scanHint = document.querySelector('.scan-hint span'); // For updating hotkey hint

  // Load initial state and hotkey from storage
  chrome.storage.local.get(['extensionEnabled', 'readokuHotkey'], function (result) {
    const isEnabled = result.extensionEnabled === undefined ? true : result.extensionEnabled;
    toggleSwitch.checked = isEnabled;
    toggleStatusText.textContent = isEnabled ? 'On' : 'Off';
    document.body.classList.toggle('extension-on', isEnabled);
    document.body.classList.toggle('extension-off', !isEnabled);

    const hotkey = result.readokuHotkey || 'Shift'; // Default to Shift
    if (scanHint) {
      scanHint.textContent = hotkey;
    }
  });

  // Listen for storage changes to update hotkey hint dynamically
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.readokuHotkey) {
      if (scanHint) {
        scanHint.textContent = changes.readokuHotkey.newValue || 'Shift';
      }
    }
  });

  // Handle toggle switch changes
  toggleSwitch.addEventListener('change', function () {
    const isEnabled = toggleSwitch.checked;
    toggleStatusText.textContent = isEnabled ? 'On' : 'Off';
    document.body.classList.toggle('extension-on', isEnabled);
    document.body.classList.toggle('extension-off', !isEnabled);

    chrome.storage.local.set({ extensionEnabled: isEnabled });
    chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled: isEnabled });
  });

  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  searchBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('search/search.html') });
  });

  infoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/NaimiNafis/readoku' });
  });
}); 