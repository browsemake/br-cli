# br_cli

A simple CLI tool to control a background browser using Playwright.

## Usage

Install dependencies (requires Node.js 18+). After installing the CLI you must
download the Playwright browser binaries. This is a one‑time step and works on
Windows, Linux and macOS:

```bash
npm install -g @halfjuice/br-cli
npx playwright install
```

### Start the daemon

```bash
br start
```
If starting the daemon fails (for example due to missing Playwright browsers),
the CLI prints the error output so you can diagnose the issue.

### Navigate to a URL

```bash
br goto https://example.com
```

### Click an element

```bash
br click "button.submit"
```

### Scroll element into view

```bash
br scrollIntoView "#footer"
```

### Scroll to percentage of page

```bash
br scrollTo 50
```

### Fill an input field

```bash
br fill "input[name='q']" "search text"
```

### Fill an input field with a secret

```bash
MY_SECRET="top-secret" br fill-secret "input[name='password']" MY_SECRET
```

When retrieving page HTML with `br view-html`, any text provided via
`fill-secret` is masked to avoid exposing secrets.

### Type text into an input

```bash
br type "input[name='q']" "search text"
```

### Press a key

```bash
br press Enter
```

### Scroll next/previous chunk

```bash
br nextChunk
br prevChunk
```

### View page HTML

```bash
br view-html
```

### View action history

```bash
br history
```

### Clear action history

```bash
br clear-history
```

### Capture a screenshot

```bash
br screenshot
```

### View accessibility and DOM tree

```bash
br view-tree
```

Outputs a hierarchical tree combining accessibility roles with DOM element
information. It also builds an ID-to-XPath map for quick element lookup.

### Stop the daemon

```bash
br stop
```

The daemon runs a headless Chromium browser and exposes a small HTTP API. The CLI communicates with it to perform actions like navigation and clicking elements.
