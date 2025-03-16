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

// Function to generate summary using Gemini
async function generateSummaryWithGemini(data) {
  const GEMINI_API_KEY = 'AIzaSyC1yRLL-NCpVqLzDMUN0ag5jkruPhf9Y1U';
  const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';

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
    const response = await fetch(`${API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
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

// Function to send email
async function sendEmail(email, summary) {
  console.group('Email Sending');
  console.log('📧 Attempting to send email to:', email);
  console.log('📋 Summary to be sent:', summary);
  // Note: You'll need to implement your own email sending logic here
  // For example, you could use a service like SendGrid or your own SMTP server
  console.log('⚠️ Email sending not implemented yet');
  console.groupEnd();
  return true;
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