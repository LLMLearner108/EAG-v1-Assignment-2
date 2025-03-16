// Background script initialization log
console.log('🚀 GitHub Activity Summarizer background script initialized');

// Helper function to get repository info from URL
function getRepoInfoFromUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  
  // Clean up the repo name by removing special characters and .git extension
  const repoName = match[2]
    .replace(/\.git$/, '')           // Remove .git extension if present
    .replace(/[^\w\s-]/g, '')       // Remove special characters except word chars, spaces, and hyphens
    .replace(/[-\s]+/g, ' ')        // Replace multiple hyphens or spaces with single space
    .trim();                        // Remove leading/trailing spaces
  
  return {
    owner: match[1],
    repo: repoName
  };
}

// Function to fetch GitHub data
async function fetchGitHubData(owner, repo) {
  const baseUrl = 'https://api.github.com';
  const headers = {
    'Accept': 'application/vnd.github.v3+json'
  };

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  try {
    // Helper function to safely fetch and process data
    async function fetchGitHubEndpoint(url) {
      console.log('🔄 Fetching:', url);
      const response = await fetch(url, { headers });
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('❌ Expected array but got:', typeof data, data);
        return [];
      }
      
      return data;
    }

    // Fetch PRs and filter for recent ones
    const allPrs = await fetchGitHubEndpoint(
      `${baseUrl}/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100`
    );
    const prs = allPrs.filter(pr => new Date(pr.updated_at) >= lastWeek);
    console.log(`Found ${prs.length} recent PRs`);

    // Fetch Issues and filter for recent ones (excluding PRs)
    const allIssues = await fetchGitHubEndpoint(
      `${baseUrl}/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&per_page=100`
    );
    const issues = allIssues.filter(issue => 
      !issue.pull_request && // Exclude PRs
      new Date(issue.updated_at) >= lastWeek // Only recent issues
    );
    console.log(`Found ${issues.length} recent issues`);

    // Fetch Commits from the last week
    const commits = await fetchGitHubEndpoint(
      `${baseUrl}/repos/${owner}/${repo}/commits?since=${lastWeek.toISOString()}&per_page=100`
    );
    console.log(`Found ${commits.length} recent commits`);

    // Fetch Discussions
    let discussions = [];
    try {
      const discussionsResponse = await fetch(
        `${baseUrl}/repos/${owner}/${repo}/discussions`,
        { 
          headers: {
            ...headers,
            'Accept': 'application/vnd.github.discussions-preview+json'
          }
        }
      ).then(res => res.json());
      
      if (Array.isArray(discussionsResponse)) {
        discussions = discussionsResponse.filter(d => new Date(d.updated_at) >= lastWeek);
      }
    } catch (e) {
      console.log('Discussions not available for this repository:', e.message);
    }
    console.log(`Found ${discussions.length} recent discussions`);

    // Log summary of findings
    console.group('📊 Activity Summary');
    console.log(`PRs: ${prs.length}, Issues: ${issues.length}, Commits: ${commits.length}, Discussions: ${discussions.length}`);
    console.groupEnd();

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
  const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Format dates for the prompt
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  
  const dateFormat = { year: 'numeric', month: 'long', day: 'numeric' };
  const startDate = lastWeek.toLocaleDateString('en-US', dateFormat);
  const endDate = today.toLocaleDateString('en-US', dateFormat);

  console.group('Gemini API Interaction');
  console.log('📊 Input Data Statistics:');
  console.log('- Pull Requests:', data.prs.length);
  console.log('- Issues:', data.issues.length);
  console.log('- Commits:', data.commits.length);
  console.log('- Discussions:', data.discussions.length);

  const prompt = `Please create a concise summary of the following GitHub repository activity from ${startDate} to ${endDate}:
    
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
    
    Format the summary in a clear, readable way highlighting the most important changes and discussions from the past week. Please include the titles of the PRs, Issues and Discussions in the summary. Give a short summary for each of these items above. Use markdown to delineate the different sections and format the headings to each section in bold.

    Start the summary with "GitHub Activity Summary for the period of ${startDate} to ${endDate}:"`;

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
async function sendEmail(email, summary, url) {
  console.group('Email Sending');
  console.log('📧 Attempting to send email to:', email);
  console.log('📋 Summary to be sent:', summary);

  try {
    const emailConfig = await getEmailJSConfig();
    const repoInfo = getRepoInfoFromUrl(url);
    const repoName = repoInfo ? repoInfo.repo : 'GitHub Repository';
    
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
          repo_name: repoName,
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
    console.log('Starting new request');
    console.log('Processing URL:', request.url);
    
    const repoInfo = getRepoInfoFromUrl(request.url);
    console.log('Repository Info:', repoInfo);
    
    if (!repoInfo) {
      console.log('❌ Invalid GitHub repository URL');
      sendResponse({ success: false, error: 'Invalid GitHub repository URL' });
      return true;
    }

    // Process the request
    (async () => {
      try {
        console.log('Fetching GitHub data...');
        const data = await fetchGitHubData(repoInfo.owner, repoInfo.repo);
        console.log('Fetched Data Summary:', {
          prs: data.prs.length,
          issues: data.issues.length,
          commits: data.commits.length,
          discussions: data.discussions.length
        });
        
        const hasActivity = Array.isArray(data.prs) && Array.isArray(data.issues) && 
                          Array.isArray(data.commits) && Array.isArray(data.discussions) &&
                          (data.prs.length > 0 || data.issues.length > 0 || 
                           data.commits.length > 0 || data.discussions.length > 0);
        
        if (!hasActivity) {
          const today = new Date();
          const lastWeek = new Date(today);
          lastWeek.setDate(today.getDate() - 7);
          const dateFormat = { year: 'numeric', month: 'long', day: 'numeric' };
          const startDate = lastWeek.toLocaleDateString('en-US', dateFormat);
          const endDate = today.toLocaleDateString('en-US', dateFormat);
          
          console.log('No activity found in date range');
          const errorMessage = `No activity found in this repository between ${startDate} and ${endDate}`;
          sendResponse({ success: false, error: errorMessage });
          return;
        }
        
        const summary = await generateSummaryWithGemini(data);
        await sendEmail(request.email, summary, request.url);
        console.log('Process completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('❌ Error in background script:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'An unexpected error occurred' 
        });
      }
    })();

    return true; // Required for async response
  }
}); 