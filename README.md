# EAG-v1-Assignment-2

This repo is a part of the EAG-v1 Course which focusses on Agentic Frameworks.

Create a chrome plugin with Google Gemini Flash 2.0 integrated with it in some way

# GitHub Activity Summarizer Chrome Extension

A Chrome extension that summarizes GitHub repository activity from the past 24 hours using Gemini AI.

## Features

- Monitors PRs, issues, commits, and discussions from the past 24 hours
- Generates AI-powered summaries using Gemini
- Sends summaries directly to your email

## Installation

1. Clone this repository or download the files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the directory containing these files
5. The extension icon should appear in your Chrome toolbar

## Usage

1. Navigate to any GitHub repository
2. Click the extension icon in your Chrome toolbar
3. Enter your email address
4. Click "Generate Summary"
5. Wait for the summary to be sent to your email

## Note

For the email functionality to work, you'll need to implement your own email sending logic in the `sendEmail` function within `background.js`. You can use services like SendGrid or set up your own SMTP server.

## Configuration

The extension uses the Gemini API key from your `.env` file. Make sure the API key is valid and has the necessary permissions.
