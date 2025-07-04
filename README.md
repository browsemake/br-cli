# br-cli (Browser CLI)
`br` is a AI friendly command line tool for browser automation. It can be directly used by [Claude Code](https://github.com/anthropics/claude-code) or [Gemini CLI](https://github.com/google-gemini/gemini-cli) for agentic tasks.

**Why need another browser automation? Why CLI?** Current AI agent cannot control local browser easily, thus making many personal tasks impossible (For example, login or captcha). br-cli fills the gap by providing agent the CLI to control browser with session management. This way agent can still plan while use browser almost like human. The workflow is also recored and can be replayed for future use.

![browsemake_cliscreen](https://github.com/user-attachments/assets/44e7bd82-465e-4150-b9af-2af412bb6eed)

Features:
- **Browser Action**: Comprehensive action for browser automation (navigation, click, etc.)
- **LLM friendly output**: LLM friendly command output with error correction hint
- **Daemon mode**: Always-on daemon mode so it lives across multiple LLM sessions
- **Structured web page view**: Accessibility tree view for easier LLM interpretation than HTML
- **Secrete management**: Secret management to isolate password from LLM
- **History tracking**: History tracking for replay and scripting

## Install
```bash
npm install -g @browsemake/br-cli
```

## Usage
Used by human:

```bash
br start
br goto https://github.com/
```

Used by AI:

```
# In Gemini CLI or Claude Code:
> You have browser automation tool 'br', use it to go to github and search for repo browsemake/br-cli
```

## Demo
Example of using Gemini CLI and br-cli together to navigate to GitHub:
<div align="center">
    <a href="https://www.loom.com/share/0ef198e259864ae08afa9ae9f78acfac">
      <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/0ef198e259864ae08afa9ae9f78acfac-3e42df07f2040874-full-play.gif">
    </a>
</div>

## Command

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

Commands that accept a CSS selector (like `click`, `fill`, `scrollIntoView`, `type`) can also accept a numeric ID. These IDs are displayed in the output of `br view-tree` and allow for direct interaction with elements identified in the tree.

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

### List open tabs

```bash
br tabs
```

### Switch to a tab by index

```bash
br switch-tab 1
```

### Stop the daemon

```bash
br stop
```

The daemon runs a headless Chromium browser and exposes a small HTTP API. The CLI communicates with it to perform actions like navigation and clicking elements.
