// Background script initialization log
console.log('🚀 GitHub Activity Summarizer background script initialized');

// Helper function to get repository info from URL
function getRepoInfoFromUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

// Function to fetch GitHub data
async function fetchGitHubData(owner, repo) {
  const baseUrl = 'https://api.github.com';
  const headers = {
    'Accept': 'application/vnd.github.v3+json'
  };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const since = yesterday.toISOString();

  try {
    // Fetch PRs
    const prs = await fetch(
      `${baseUrl}/repos/${owner}/${repo}/pulls?state=all&since=${since}`,
      { headers }
    ).then(res => res.json());

    // Fetch Issues
    const issues = await fetch(
      `${baseUrl}/repos/${owner}/${repo}/issues?since=${since}`,
      { headers }
    ).then(res => res.json());

    // Fetch Commits
    const commits = await fetch(
      `${baseUrl}/repos/${owner}/${repo}/commits?since=${since}`,
      { headers }
    ).then(res => res.json());

    // Fetch Discussions (if available)
    let discussions = [];
    try {
      discussions = await fetch(
        `${baseUrl}/repos/${owner}/${repo}/discussions`,
        { headers }
      ).then(res => res.json());
    } catch (e) {
      console.log('Discussions not available for this repository');
    }

    return { prs, issues, commits, discussions };
  } catch (error) {
    console.error('Error fetching GitHub data:', error);
    throw error;
  }
}

// Function to get API key securely from storage
async function getGeminiApiKey() {
  try {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (!result.geminiApiKey) {
      // If API key is not in storage, try to load from environment
      const response = await fetch(chrome.runtime.getURL('config.json'));
      const config = await response.json();
      await chrome.storage.local.set({ geminiApiKey: config.GEMINI_API_KEY });
      return config.GEMINI_API_KEY;
    }
    return result.geminiApiKey;
  } catch (error) {
    console.error('Error loading API key:', error);
    throw new Error('Failed to load API key');
  }
}

// Function to generate summary using Gemini
async function generateSummaryWithGemini(data) {
  const API_KEY = await getGeminiApiKey();
  // Using Gemini Flash 2.0 endpoint
  const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  console.group('Gemini API Interaction');
  console.log('📊 Input Data Statistics:');
  console.log('- Pull Requests:', data.prs.length);
  console.log('- Issues:', data.issues.length);
  console.log('- Commits:', data.commits.length);
  console.log('- Discussions:', data.discussions.length);

  const prompt = `Please create a concise summary of the following GitHub repository activity from the past 24 hours:
    
    Pull Requests (${data.prs.length}): ${JSON.stringify(data.prs.map(pr => ({
      title: pr.title,
      state: pr.state,
      url: pr.html_url
    })))}
    
    Issues (${data.issues.length}): ${JSON.stringify(data.issues.map(issue => ({
      title: issue.title,
      state: issue.state,
      url: issue.html_url
    })))}
    
    Commits (${data.commits.length}): ${JSON.stringify(data.commits.map(commit => ({
      message: commit.commit?.message,
      author: commit.commit?.author?.name,
      url: commit.html_url
    })))}
    
    Format the summary in a clear, readable way highlighting the most important changes and discussions.`;

  console.log('📝 Prompt sent to Gemini:', prompt);

  try {
    console.log('🚀 Sending request to Gemini API...');
    const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      })
    });

    console.log('📥 Raw API Response Status:', response.status);
    const result = await response.json();
    console.log('📦 Parsed API Response:', result);
    
    if (!result || !result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      console.error('❌ Invalid API Response Structure:', result);
      throw new Error('Invalid response from Gemini API: ' + JSON.stringify(result));
    }

    const summary = result.candidates[0].content.parts[0].text || 'No summary generated';
    console.log('✨ Generated Summary:', summary);
    console.groupEnd();
    return summary;
  } catch (error) {
    console.error('❌ Error in Gemini API call:', error);
    console.groupEnd();
    throw new Error('Failed to generate summary: ' + error.message);
  }
}

// Function to get EmailJS credentials
async function getEmailJSConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('config.json'));
    const config = await response.json();
    return config.EMAIL_JS;
  } catch (error) {
    console.error('Error loading EmailJS config:', error);
    throw new Error('Failed to load EmailJS configuration');
  }
}

// Function to send email
async function sendEmail(email, summary) {
  console.group('Email Sending');
  console.log('📧 Attempting to send email to:', email);
  console.log('📋 Summary to be sent:', summary);

  try {
    const emailConfig = await getEmailJSConfig();
    
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: emailConfig.SERVICE_ID,
        template_id: emailConfig.TEMPLATE_ID,
        user_id: emailConfig.PUBLIC_KEY,
        template_params: {
          to_email: email,
          summary: summary,
          repo_name: 'GitHub Repository Summary',
          date: new Date().toLocaleDateString()
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send email: ' + response.statusText);
    }

    console.log('✅ Email sent successfully');
    console.groupEnd();
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    console.groupEnd();
    throw new Error('Failed to send email: ' + error.message);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateSummary') {
    console.group('Processing Generate Summary Request');
    console.log('🔍 Processing URL:', request.url);
    
    const repoInfo = getRepoInfoFromUrl(request.url);
    console.log('📂 Repository Info:', repoInfo);
    
    if (!repoInfo) {
      console.error('❌ Invalid GitHub repository URL');
      sendResponse({ success: false, error: 'Invalid GitHub repository URL' });
      console.groupEnd();
      return true;
    }

    // Process the request
    (async () => {
      try {
        console.log('🔄 Fetching GitHub data...');
        const data = await fetchGitHubData(repoInfo.owner, repoInfo.repo);
        console.log('📊 Fetched GitHub Data:', data);
        
        // Check if we have any data to summarize
        if (!data.prs.length && !data.issues.length && !data.commits.length && !data.discussions.length) {
          console.log('ℹ️ No activity found in the last 24 hours');
          sendResponse({ 
            success: false, 
            error: 'No activity found in the last 24 hours for this repository' 
          });
          console.groupEnd();
          return;
        }
        
        const summary = await generateSummaryWithGemini(data);
        await sendEmail(request.email, summary);
        console.log('✅ Process completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('❌ Error in background script:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'An unexpected error occurred' 
        });
      }
      console.groupEnd();
    })();

    return true; // Required for async response
  }
}); 