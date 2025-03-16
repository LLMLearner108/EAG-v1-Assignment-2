document.addEventListener('DOMContentLoaded', function() {
  const summarizeButton = document.getElementById('summarize');
  const emailInput = document.getElementById('email');
  const statusDiv = document.getElementById('status');

  summarizeButton.addEventListener('click', async () => {
    const email = emailInput.value;
    if (!email || !email.includes('@')) {
      statusDiv.textContent = 'Please enter a valid email address';
      return;
    }

    statusDiv.textContent = 'Generating summary...';
    summarizeButton.disabled = true;

    try {
      // Get the current tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;

      if (!url.includes('github.com')) {
        statusDiv.textContent = 'Please navigate to a GitHub repository';
        summarizeButton.disabled = false;
        return;
      }

      // Send message to background script
      chrome.runtime.sendMessage({
        action: 'generateSummary',
        url: url,
        email: email
      }, response => {
        if (response.success) {
          statusDiv.textContent = 'Summary will be sent to your email shortly!';
        } else {
          statusDiv.textContent = 'Error: ' + response.error;
        }
        summarizeButton.disabled = false;
      });
    } catch (error) {
      statusDiv.textContent = 'Error: ' + error.message;
      summarizeButton.disabled = false;
    }
  });
}); 