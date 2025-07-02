#!/usr/bin/env node
const { program } = require('commander');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PID_FILE = path.join(__dirname, '../daemon.pid');
const PORT = 3030;

function getRunningPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
    process.kill(pid, 0);
    return pid;
  } catch (err) {
    return null;
  }
}

function send(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let out = '';
      res.on('data', chunk => out += chunk);
      res.on('end', () => resolve(out));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

program
  .command('start')
  .description('Start the headless browser daemon process.')
  .action(async () => {
    const pid = getRunningPid();
    if (pid) {
      try {
        const health = await send('/health');
        if (health === 'ok') {
          console.log('Daemon is already running.');
          return;
        }
      } catch (err) {
        // Health check failed, assume daemon is stale
        console.log('Found stale daemon process, attempting to stop it...');
        try {
          process.kill(pid);
          fs.unlinkSync(PID_FILE);
          console.log('Stale daemon stopped.');
        } catch (killErr) {
          console.error('Failed to stop stale daemon, please check for zombie processes.');
          return;
        }
      }
    }

    const child = spawn(process.execPath, [path.join(__dirname, '../daemon.js')], {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      console.error('Daemon failed to start in a timely manner.');
      if (stderr.trim()) console.error('Error output:\n', stderr.trim());
      process.exit(1);
    }, 5000);

    child.stdout.on('data', data => {
      stdout += data.toString();
      if (stdout.includes('br daemon running')) {
        clearTimeout(timeout);
        fs.writeFileSync(PID_FILE, String(child.pid));
        child.unref();
        console.log('Daemon started successfully.');
        process.exit(0);
      }
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('exit', code => {
      if (stdout.includes('br daemon running')) return;
      clearTimeout(timeout);
      console.error(`Daemon exited unexpectedly with code ${code}.`);
      if (stderr.trim()) console.error('Error output:\n', stderr.trim());
      process.exit(1);
    });
  });

program
  .command('stop')
  .description('Stop the headless browser daemon process.')
  .action(() => {
    const pid = getRunningPid();
    if (!pid) {
      console.log('Daemon is not running.');
      return;
    }
    try {
      process.kill(pid);
      fs.unlinkSync(PID_FILE);
      console.log('Daemon stopped.');
    } catch (err) {
      console.error('Failed to stop daemon:', err.message);
    }
  });

program
  .command('goto')
  .description('Navigate the browser to a specific URL.')
  .argument('<url>', 'The full URL to navigate to (e.g., "https://example.com").')
  .action(async (url) => {
    await send('/goto', 'POST', { url });
    console.log('Navigated to', url);
  });

program
  .command('scrollIntoView')
  .description('Scroll the page until a specific element is in view.')
  .argument('<selector>', 'The CSS selector for the target element.')
  .action(async (selector) => {
    await send('/scroll-into-view', 'POST', { selector });
    console.log('Scrolled', selector, 'into view.');
  });

program
  .command('scrollTo')
  .description('Scroll the page to a given percentage of its total height.')
  .argument('<percentage>', 'A number from 0 to 100.')
  .action(async (percentage) => {
    await send('/scroll-to', 'POST', { percentage });
    console.log(`Scrolled to ${percentage}%.`);
  });

program
  .command('fill')
  .description('Fill a form field with the provided text.')
  .argument('<selector>', 'The CSS selector for the input field.')
  .argument('<text>', 'The text to fill the field with.')
  .action(async (selector, text) => {
    await send('/fill', 'POST', { selector, text });
    console.log('Filled', selector);
  });

program
  .command('fill-secret')
  .description('Fill a form field with a value from a specified environment variable. The value is masked in logs.')
  .argument('<selector>', 'The CSS selector for the input field.')
  .argument('<envVar>', 'The name of the environment variable containing the secret.')
  .action(async (selector, envVar) => {
    const secret = process.env[envVar];
    if (!secret) {
      console.error(`Error: Environment variable "${envVar}" is not set.`);
      return;
    }
    await send('/fill-secret', 'POST', { selector, secret });
    console.log('Filled secret value into', selector);
  });

program
  .command('type')
  .description('Simulate typing text into a form field, character by character.')
  .argument('<selector>', 'The CSS selector for the input field.')
  .argument('<text>', 'The text to type into the field.')
  .action(async (selector, text) => {
    await send('/type', 'POST', { selector, text });
    console.log('Typed text into', selector);
  });

program
  .command('press')
  .description("Simulate a single key press (e.g., 'Enter', 'Tab').")
  .argument('<key>', "The key to press, as defined in Playwright's documentation.")
  .action(async (key) => {
    await send('/press', 'POST', { key });
    console.log('Pressed', key);
  });

program
  .command('nextChunk')
  .description('Scroll down by one viewport height to view the next chunk of content.')
  .action(async () => {
    await send('/next-chunk', 'POST');
    console.log('Scrolled to the next chunk.');
  });

program
  .command('prevChunk')
  .description('Scroll up by one viewport height to view the previous chunk of content.')
  .action(async () => {
    await send('/prev-chunk', 'POST');
    console.log('Scrolled to the previous chunk.');
  });

program
  .command('click')
  .description('Click an element matching the specified CSS selector.')
  .argument('<selector>', 'The CSS selector for the element to click.')
  .action(async (selector) => {
    await send('/click', 'POST', { selector });
    console.log('Clicked', selector);
  });

program
  .command('screenshot')
  .description('Capture a screenshot of the current page and save it to a temporary file.')
  .action(async () => {
    const file = await send('/screenshot');
    console.log('Screenshot saved to:', file);
  });

program
  .command('view-html')
  .description('Output the full HTML source of the current page.')
  .action(async () => {
    const html = await send('/html');
    console.log(html);
  });

program
  .command('history')
  .alias('hist')
  .description('Display the history of actions performed in the current session.')
  .action(async () => {
    const hist = await send('/history');
    console.log(hist);
  });

program
  .command('clear-history')
  .description("Clear the session's action history.")
  .action(async () => {
    await send('/history/clear', 'POST');
    console.log('History cleared.');
  });
  
program
  .command('view-tree')
  .description("Display a hierarchical tree of the page's accessibility and DOM nodes.")
  .action(async () => {
    const { tree } = await send('/tree');
    console.log(tree);
  });

program
  .command('tabs')
  .description('List all open tabs (pages) in the browser daemon.')
  .action(async () => {
    const tabs = JSON.parse(await send('/tabs'));
    tabs.forEach(tab => {
      console.log(`${tab.isActive ? '*' : ' '}${tab.index}: ${tab.title} (${tab.url})`);
    });
  });

program
  .command('switch-tab')
  .description('Switch to a different open tab by its index.')
  .argument('<index>', 'The index of the tab to switch to.')
  .action(async (index) => {
    await send('/tabs/switch', 'POST', { index: Number(index) });
    console.log('Switched to tab', index);
  });

program.parse();
