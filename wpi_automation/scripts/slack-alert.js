#!/usr/bin/env node

/**
 * Standalone Slack alert script for WPI automation and other Node/Python tools.
 *
 * Usage:
 *   node scripts/slack-alert.js <level> <title> [field1=value1] [field2=value2] ...
 *
 * Examples:
 *   node scripts/slack-alert.js critical "WPI fetch failed" "Step=fetch" "Error=timeout"
 *   node scripts/slack-alert.js info "WPI update complete" "Updated=12" "Failed=0"
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const ENABLE_SLACK_NOTIFICATIONS = process.env.ENABLE_SLACK_NOTIFICATIONS === 'true';

const levelEmoji = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨'
};

function formatDate() {
  return new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
}

function sendSlackAlert(level, title, fields) {
  if (!ENABLE_SLACK_NOTIFICATIONS || !SLACK_WEBHOOK_URL) {
    console.log(`[Slack Alert] ${level}: ${title} (disabled or no webhook configured)`);
    return Promise.resolve(false);
  }

  const emoji = levelEmoji[level] || 'ℹ️';
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${title}` }
    },
    {
      type: 'section',
      fields: Object.entries(fields).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${value || 'N/A'}`
      }))
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `WPI Automation alert sent at ${formatDate()}`
        }
      ]
    }
  ];

  const payload = JSON.stringify({ blocks });
  const url = new URL(SLACK_WEBHOOK_URL);

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('✅ Slack alert sent:', title);
            resolve(true);
          } else {
            console.error('❌ Slack alert failed:', res.statusCode, data);
            resolve(false);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('❌ Slack alert request error:', err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node slack-alert.js <level> <title> [field1=value1] ...');
    process.exit(1);
  }

  const [level, title, ...fieldPairs] = args;
  const fields = {};
  for (const pair of fieldPairs) {
    const [key, ...rest] = pair.split('=');
    fields[key] = rest.join('=');
  }

  const success = await sendSlackAlert(level, title, fields);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

module.exports = { sendSlackAlert };
