document.addEventListener('DOMContentLoaded', function () {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const toggleStatusText = document.getElementById('toggleStatusText');
  // const settingsBtn = document.getElementById('settingsBtn');
  // const searchBtn = document.getElementById('searchBtn');
  // const helpBtn = document.getElementById('helpBtn');

  // Load initial state from storage
  chrome.storage.local.get(['extensionEnabled'], function (result) {
    const isEnabled = result.extensionEnabled === undefined ? true : result.extensionEnabled; // Default to true (on)
    toggleSwitch.checked = isEnabled;
    toggleStatusText.textContent = isEnabled ? 'On' : 'Off';
    document.body.classList.toggle('extension-on', isEnabled);
    document.body.classList.toggle('extension-off', !isEnabled);
  });

  // Handle toggle switch changes
  toggleSwitch.addEventListener('change', function () {
    const isEnabled = toggleSwitch.checked;
    toggleStatusText.textContent = isEnabled ? 'On' : 'Off';
    document.body.classList.toggle('extension-on', isEnabled);
    document.body.classList.toggle('extension-off', !isEnabled);

    chrome.storage.local.set({ extensionEnabled: isEnabled });
    // Send message to background script
    chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled: isEnabled });
  });

  // Placeholder for button functionalities
  // settingsBtn.addEventListener('click', () => {
  //   console.log('Settings button clicked');
  //   // chrome.runtime.openOptionsPage(); // If you have an options page
  // });

  // searchBtn.addEventListener('click', () => {
  //   console.log('Search button clicked');
  //   // Implement search functionality or open a search interface
  // });

  // helpBtn.addEventListener('click', () => {
  //   console.log('Help button clicked');
  //   // Open a help page or guide
  // });
}); 