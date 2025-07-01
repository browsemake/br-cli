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
  .description('start browser daemon')
  .action(() => {
    if (getRunningPid()) {
      console.log('daemon already running');
      return;
    }
    const child = spawn(process.execPath, [path.join(__dirname, '../daemon.js')], {
      detached: true,
      stdio: 'ignore'
    });
    fs.writeFileSync(PID_FILE, String(child.pid));
    child.unref();
    console.log('daemon started');
  });

program
  .command('stop')
  .description('stop browser daemon')
  .action(() => {
    const pid = getRunningPid();
    if (!pid) {
      console.log('daemon not running');
      return;
    }
    try {
      process.kill(pid);
      fs.unlinkSync(PID_FILE);
      console.log('daemon stopped');
    } catch (err) {
      console.error('failed to stop daemon:', err.message);
    }
  });

program
  .command('goto <url>')
  .description('navigate to url')
  .action(async (url) => {
    await send('/goto', 'POST', { url });
    console.log('navigated to', url);
  });

program
  .command('scrollIntoView <selector>')
  .description('scroll element into view')
  .action(async (selector) => {
    await send('/scroll-into-view', 'POST', { selector });
    console.log('scrolled into view', selector);
  });

program
  .command('scrollTo <percentage>')
  .description('scroll to percentage of page height')
  .action(async (percentage) => {
    await send('/scroll-to', 'POST', { percentage });
    console.log('scrolled to', percentage + '%');
  });

program
  .command('fill <selector> <text>')
  .description('fill input with text')
  .action(async (selector, text) => {
    await send('/fill', 'POST', { selector, text });
    console.log('filled', selector);
  });

program
  .command('fill-secret <selector> <envVar>')
  .description('fill input with secret from env var')
  .action(async (selector, envVar) => {
    const secret = process.env[envVar];
    if (!secret) {
      console.error(`environment variable ${envVar} is not set`);
      return;
    }
    await send('/fill-secret', 'POST', { selector, secret });
    console.log('filled secret', selector);
  });

program
  .command('type <selector> <text>')
  .description('type text into input (alias for fill)')
  .action(async (selector, text) => {
    await send('/type', 'POST', { selector, text });
    console.log('typed in', selector);
  });

program
  .command('press <key>')
  .description('press keyboard key')
  .action(async (key) => {
    await send('/press', 'POST', { key });
    console.log('pressed', key);
  });

program
  .command('nextChunk')
  .description('scroll down one viewport height')
  .action(async () => {
    await send('/next-chunk', 'POST');
    console.log('scrolled next chunk');
  });

program
  .command('prevChunk')
  .description('scroll up one viewport height')
  .action(async () => {
    await send('/prev-chunk', 'POST');
    console.log('scrolled previous chunk');
  });

program
  .command('click <selector>')
  .description('click element by selector')
  .action(async (selector) => {
    await send('/click', 'POST', { selector });
    console.log('clicked', selector);
  });

program
  .command('screenshot')
  .description('capture screenshot to temp folder')
  .action(async () => {
    const file = await send('/screenshot');
    console.log('screenshot saved to', file);
  });

program
  .command('view-html')
  .description('output current page html')
  .action(async () => {
    const html = await send('/html');
    console.log(html);
  });

program
  .command('history')
  .description('print recorded action history')
  .action(async () => {
    const hist = await send('/history');
    console.log(hist);
  });

program
  .command('clear-history')
  .description('clear recorded action history')
  .action(async () => {
    await send('/history/clear', 'POST');
    console.log('history cleared');
  });
  
program
  .command('view-tree')
  .description('output combined accessibility and DOM tree')
  .action(async () => {
    const { tree } = await send('/tree');
    console.log(tree);
  });

program.parse();
