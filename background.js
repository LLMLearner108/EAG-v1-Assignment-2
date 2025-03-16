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

  const prompt = `Please create a concise summary of the following GitHub repository activity from the past 24 hours:
    
    Pull Requests: ${JSON.stringify(data.prs)}
    Issues: ${JSON.stringify(data.issues)}
    Commits: ${JSON.stringify(data.commits)}
    Discussions: ${JSON.stringify(data.discussions)}
    
    Format the summary in a clear, readable way highlighting the most important changes and discussions.`;

  try {
    const response = await fetch(`${API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error generating summary with Gemini:', error);
    throw error;
  }
}

// Function to send email
async function sendEmail(email, summary) {
  // Note: You'll need to implement your own email sending logic here
  // For example, you could use a service like SendGrid or your own SMTP server
  console.log(`Would send email to ${email} with summary: ${summary}`);
  // For now, we'll just return true to simulate success
  return true;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateSummary') {
    const repoInfo = getRepoInfoFromUrl(request.url);
    
    if (!repoInfo) {
      sendResponse({ success: false, error: 'Invalid GitHub repository URL' });
      return true;
    }

    // Process the request
    (async () => {
      try {
        const data = await fetchGitHubData(repoInfo.owner, repoInfo.repo);
        const summary = await generateSummaryWithGemini(data);
        await sendEmail(request.email, summary);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Required for async response
  }
}); 