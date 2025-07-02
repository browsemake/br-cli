const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

let lastIdToXPath = {}; // Global variable to store the last idToXPath mapping
const secrets = new Set();
const history = [];

function record(action, args = {}) {
  history.push({ action, args, timestamp: new Date().toISOString() });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  let pages = [await context.newPage()];
  let activePageIndex = 0;

  function getActivePage() {
    return pages[activePageIndex];
  }

  context.on('page', newPage => {
    pages.push(newPage);
  });

  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.send('ok');
  });

  app.get('/tabs', async (req, res) => {
    try {
      const tabInfo = await Promise.all(pages.map(async (p, i) => ({
        index: i,
        title: await p.title(),
        url: p.url(),
        isActive: i === activePageIndex
      })));
      res.json(tabInfo);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/tabs/switch', (req, res) => {
    const { index } = req.body;
    if (index === undefined || index < 0 || index >= pages.length) {
      return res.status(400).send('invalid tab index');
    }
    activePageIndex = index;
    record('switch-tab', { index });
    res.send('ok');
  });

  app.post('/goto', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).send('missing url');
    try {
      await getActivePage().goto(url);
      record('goto', { url });
      res.send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  async function resolveAndPerformAction(req, res, actionFn, recordAction, recordArgs = {}) {
  let { selector } = req.body;
  if (!selector) return res.status(400).send('missing selector');

  try {
    if (!isNaN(selector) && !isNaN(parseFloat(selector))) {
      const xpath = lastIdToXPath[selector];
      if (!xpath) return res.status(404).send('XPath not found for ID');
      selector = xpath;
    }
    await actionFn(selector);
    record(recordAction, { selector, ...recordArgs });
    res.send('ok');
  } catch (err) {
    res.status(500).send(err.message);
  }
}

app.post('/scroll-into-view', async (req, res) => {
  await resolveAndPerformAction(req, res, async (selector) => {
    await getActivePage().evaluate(sel => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView();
    }, selector);
  }, 'scrollIntoView');
});

  app.post('/scroll-to', async (req, res) => {
    let { percentage } = req.body;
    if (percentage === undefined) return res.status(400).send('missing percentage');
    percentage = Math.max(0, Math.min(100, Number(percentage)));
    try {
      await getActivePage().evaluate(pct => {
        window.scrollTo(0, document.body.scrollHeight * (pct / 100));
      }, percentage);
      record('scrollTo', { percentage });
      res.send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/fill', async (req, res) => {
  const { text } = req.body;
  if (text === undefined) return res.status(400).send('missing text');
  await resolveAndPerformAction(req, res, async (selector) => {
    await getActivePage().fill(selector, text);
  }, 'fill', { text });
});

  app.post('/fill-secret', async (req, res) => {
  const { secret } = req.body;
  if (secret === undefined) return res.status(400).send('missing secret');
  await resolveAndPerformAction(req, res, async (selector) => {
    await getActivePage().fill(selector, secret);
    secrets.add(secret);
  }, 'fill-secret');
});

  app.post('/type', async (req, res) => {
  const { text } = req.body;
  if (text === undefined) return res.status(400).send('missing text');
  await resolveAndPerformAction(req, res, async (selector) => {
    await getActivePage().type(selector, text);
  }, 'type', { text });
});

  app.post('/press', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).send('missing key');
    try {
      await getActivePage().keyboard.press(key);
      record('press', { key });
      res.send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/next-chunk', async (req, res) => {
    try {
      await getActivePage().evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      record('next-chunk');
      res.send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/prev-chunk', async (req, res) => {
    try {
      await getActivePage().evaluate(() => {
        window.scrollBy(0, -window.innerHeight);
      });
      record('prev-chunk');
      res.send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/click', async (req, res) => {
  await resolveAndPerformAction(req, res, async (selector) => {
    await getActivePage().click(selector);
  }, 'click');
});

  app.get('/screenshot', async (req, res) => {
    try {
      const dir = path.join(os.tmpdir(), 'br_cli');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const file = path.join(dir, `shot-${Date.now()}.png`);
      await getActivePage().screenshot({ path: file });
      res.send(file);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.get('/html', async (req, res) => {
    try {
      let html = await getActivePage().content();
      for (const secret of secrets) {
        if (!secret) continue;
        html = html.split(secret).join('***');
      }
      res.send(html);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.get('/history', (req, res) => {
    res.json(history);
  });

  app.post('/history/clear', (req, res) => {
    history.length = 0;
    res.send('ok');
  });

  app.get('/tree', async (req, res) => {
    try {
      const page = getActivePage();
      const session = await page.context().newCDPSession(page);
      await session.send('DOM.enable');
      await session.send('Accessibility.enable');

      const { nodes: axNodes } = await session.send('Accessibility.getFullAXTree');
      const { nodes: domNodes } = await session.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
      await session.detach();

      const domMap = new Map();
      for (const node of domNodes) {
        domMap.set(node.nodeId, { ...node, children: [] });
      }
      for (const node of domMap.values()) {
        if (node.parentId) {
          const parent = domMap.get(node.parentId);
          if (parent) parent.children.push(domMap.get(node.nodeId));
        }
      }
      const backendIdToNode = new Map();
      for (const node of domMap.values()) backendIdToNode.set(node.backendNodeId, node);

      function computeXPath(node) {
        if (!node.parentId) return `/${node.nodeName.toLowerCase()}`;
        const parent = domMap.get(node.parentId);
        if (!parent) {
          // If parent is not found, return a simplified XPath for the current node
          return `//${node.nodeName.toLowerCase()}`;
        }
        const siblings = parent.children.filter(c => c.nodeName === node.nodeName);
        const index = siblings.indexOf(node) + 1;
        return computeXPath(parent) + `/${node.nodeName.toLowerCase()}[${index}]`;
      }
      for (const node of domMap.values()) {
        node.xpath = computeXPath(node);
      }

      const axMap = new Map();
      const childSet = new Set();
      for (const node of axNodes) {
        axMap.set(node.nodeId, node);
        for (const childId of node.childIds || []) childSet.add(childId);
      }
      const rootAx = axNodes.find(n => !childSet.has(n.nodeId)) || axNodes[0];

      let idToXPath = {};
      function buildTree(nodeId, indent = 0) {
        const axNode = axMap.get(nodeId);
        if (!axNode) return '';
        const domNode = backendIdToNode.get(axNode.backendDOMNodeId);
        if (domNode) idToXPath[axNode.nodeId] = domNode.xpath;
        const role = axNode.role?.value || '';
        const name = axNode.name?.value || '';
        const tag = domNode ? `<${domNode.nodeName.toLowerCase()}>` : '';
        let str = `${'  '.repeat(indent)}[${axNode.nodeId}] ${role}${tag ? ' ' + tag : ''}${name ? ': ' + name : ''}
`;
        for (const childId of axNode.childIds || []) {
          str += buildTree(childId, indent + 1);
        }
        return str;
      }

      const tree = buildTree(rootAx.nodeId, 0);
      lastIdToXPath = idToXPath; // Store the mapping globally
      res.json({ tree });
    } catch (err) {
      res.status(500).send(err.message + " " + err.stack);
    }
  });

  app.post('/xpath-for-id', (req, res) => {
    const { id } = req.body;
    if (id === undefined) return res.status(400).send('missing id');
    const xpath = lastIdToXPath[id];
    if (!xpath) return res.status(404).send('XPath not found for ID');
    res.json({ xpath });
  }); " " + err.stack);    }  });  app.post('/xpath-for-id', (req, res) => {    const { id } = req.body;    if (id === undefined) return res.status(400).send('missing id');    const xpath = lastIdToXPath[id];    if (!xpath) return res.status(404).send('XPath not found for ID');    res.json({ xpath });  });

  const port = 3030;
  app.listen(port, () => {
    console.log(`br daemon running on port ${port}`);
    process.stdout.uncork();
  });

  async function shutdown() {
    await browser.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch(err => {
  console.error('daemon error:', err);
  process.exit(1);
});
