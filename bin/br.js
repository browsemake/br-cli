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
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(out);
        } else {
          resolve(out);
        }
      });
    });
    req.on('error', (e) => console.error(e.message));
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
    try {
      await send('/goto', 'POST', { url });
      console.log('Navigated to', url);
    } catch (error) {
      console.error('Error navigating:', error);
    }
  });

program
  .command('scrollIntoView')
  .description('Scroll the page until a specific element is in view.')
  .argument('<selectorOrId>', 'The CSS selector or node ID for the target element.')
  .action(async (selector) => {
    try {
      await send('/scroll-into-view', 'POST', { selector });
      console.log('Scrolled', selector, 'into view.');
    } catch (error) {
      console.error('Error scrolling into view:', error);
    }
  });

program
  .command('scrollTo')
  .description('Scroll the page to a given percentage of its total height.')
  .argument('<percentage>', 'A number from 0 to 100.')
  .action(async (percentage) => {
    try {
      await send('/scroll-to', 'POST', { percentage });
      console.log(`Scrolled to ${percentage}%.`);
    } catch (error) {
      console.error('Error scrolling:', error);
    }
  });

program
  .command('fill')
  .description('Fill a form field with the provided text.')
  .argument('<selectorOrId>', 'The CSS selector or node ID for the input field.')
  .argument('<text>', 'The text to fill the field with.')
  .action(async (selector, text) => {
    try {
      await send('/fill', 'POST', { selector, text });
      console.log('Filled', selector);
    } catch (error) {
      console.error('Error filling field:', error);
    }
  });

program
  .command('fill-secret')
  .description('Fill a form field with a value from a specified environment variable. The value is masked in logs.')
  .argument('<selectorOrId>', 'The CSS selector or node ID for the input field.')
  .argument('<envVar>', 'The name of the environment variable containing the secret.')
  .action(async (selector, envVar) => {
    const secret = process.env[envVar];
    if (!secret) {
      console.error(`Error: Environment variable "${envVar}" is not set.`);
      return;
    }
    try {
      await send('/fill-secret', 'POST', { selector, secret });
      console.log('Filled secret value into', selector);
    } catch (error) {
      console.error('Error filling secret field:', error);
    }
  });

program
  .command('type')
  .description('Simulate typing text into a form field, character by character.')
  .argument('<selectorOrId>', 'The CSS selector or node ID for the input field.')
  .argument('<text>', 'The text to type into the field.')
  .action(async (selector, text) => {
    try {
      await send('/type', 'POST', { selector, text });
      console.log('Typed text into', selector);
    } catch (error) {
      console.error('Error typing into field:', error);
    }
  });

program
  .command('press')
  .description("Simulate a single key press (e.g., 'Enter', 'Tab').")
  .argument('<key>', "The key to press, as defined in Playwright's documentation.")
  .action(async (key) => {
    try {
      await send('/press', 'POST', { key });
      console.log('Pressed', key);
    } catch (error) {
      console.error('Error pressing key:', error);
    }
  });

program
  .command('nextChunk')
  .description('Scroll down by one viewport height to view the next chunk of content.')
  .action(async () => {
    try {
      await send('/next-chunk', 'POST');
      console.log('Scrolled to the next chunk.');
    } catch (error) {
      console.error('Error scrolling to next chunk:', error);
    }
  });

program
  .command('prevChunk')
  .description('Scroll up by one viewport height to view the previous chunk of content.')
  .action(async () => {
    try {
      await send('/prev-chunk', 'POST');
      console.log('Scrolled to the previous chunk.');
    } catch (error) {
      console.error('Error scrolling to previous chunk:', error);
    }
  });

program
  .command('click')
  .description('Click an element matching the specified CSS selector.')
  .argument('<selectorOrId>', 'The CSS selector or node ID for the element to click.')
  .action(async (selector) => {
    try {
      await send('/click', 'POST', { selector });
      console.log('Clicked', selector);
    } catch (error) {
      console.error('Error clicking element:', error);
    }
  });

program
  .command('screenshot')
  .description('Capture a screenshot of the current page and save it to a temporary file.')
  .action(async () => {
    try {
      const file = await send('/screenshot');
      console.log('Screenshot saved to:', file);
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }
  });

program
  .command('view-html')
  .description('Output the full HTML source of the current page (paginated, 5000 chars per page).')
  .option('-p, --page <number>', 'Page number to view', '1')
  .action(async (opts) => {
    try {
      const page = Number(opts.page) || 1;
      const html = await send(`/html?page=${page}`);
      if (html.length === 0) {
        console.log('No HTML content found for this page.');
        return;
      }
      const PAGE_SIZE = 5000;
      const totalPages = Math.ceil(html.length / PAGE_SIZE);
      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const chunk = html.slice(start, end);
      console.log(chunk);
      console.log(`\n--- Page ${page} of ${totalPages} ---`);
      if (totalPages > 1) {
        console.log('Use --page <n> to view a different page.');
      }
      if (html.length > PAGE_SIZE) {
        console.log('Hint: If the HTML is too large to view comfortably, try the "view-tree" command for a structured overview.');
      }
    } catch (error) {
      console.error('Error viewing HTML:', error);
    }
  });

program
  .command('history')
  .alias('hist')
  .description('Display the history of actions performed in the current session.')
  .action(async () => {
    try {
      const hist = await send('/history');
      console.log(hist);
    } catch (error) {
      console.error('Error viewing history:', error);
    }
  });

program
  .command('clear-history')
  .description("Clear the session's action history.")
  .action(async () => {
    try {
      await send('/history/clear', 'POST');
      console.log('History cleared.');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  });
  
program
  .command('view-tree')
  .description("Display a hierarchical tree of the page's accessibility and DOM nodes.")
  .action(async () => {
    try {
      const tree = await send('/tree');
      console.log(tree);
    } catch (error) {
      console.error('Error viewing tree:', error);
    }
  });

program
  .command('tabs')
  .description('List all open tabs (pages) in the browser daemon.')
  .action(async () => {
    try {
      const tabs = JSON.parse(await send('/tabs'));
      tabs.forEach(tab => {
        console.log(`${tab.isActive ? '*' : ' '}${tab.index}: ${tab.title} (${tab.url})`);
      });
    } catch (error) {
      console.error('Error listing tabs:', error);
    }
  });

program
  .command('switch-tab')
  .description('Switch to a different open tab by its index.')
  .argument('<index>', 'The index of the tab to switch to.')
  .action(async (index) => {
    try {
      await send('/tabs/switch', 'POST', { index: Number(index) });
      console.log('Switched to tab', index);
    } catch (error) {
      console.error('Error switching tab:', error);
    }
  });

program.parse();
