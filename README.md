# DevToolbox

**Small tools. Less repetitive work.**

A lightweight, fully client-side utility toolbox for developers, DevOps engineers and anyone who
does the same small conversions over and over again. No build step, no framework, no backend —
just HTML, CSS and vanilla ES modules.

> **Your data stays in your browser.** Every tool runs locally. Nothing you paste is uploaded,
> logged or stored on a server.

---

## Features

- **58+ working tools** across nine categories — no placeholder pages.
- **Instant search** (`Ctrl` + `K`) across tool names, descriptions, keywords and categories.
- **Favorites and recent tools**, stored in `localStorage`.
- **Light / dark / system theme** with a neumorphic (soft UI) design system.
- **Fully responsive** — the sidebar becomes a drawer on mobile, touch targets stay ≥ 44 px.
- **Installable PWA** that keeps working offline.
- **Accessible**: semantic HTML, labelled controls, keyboard navigation and visible focus states.
- **Zero dependencies.** No React, no Tailwind, no jQuery, no bundler.

### Tool categories

| Category | Examples |
| --- | --- |
| Developer | JSON Formatter, YAML ⇄ JSON, Base64, URL encode, JWT Decoder, UUID, Hashes, Regex Tester, Timestamps, Time Zone Converter, QR Code Generator, Cron Helper |
| AWS / DevOps | ARN Parser, Region Lookup, CLI Builder, Terraform Variables, Security Group Rules, CIDR Calculator, Subnet Splitter, Docker Run → Compose, Docker Image Parser, Kubernetes YAML, Resource Converter |
| Git | Command Builder, Gitignore Generator, Branch Name Generator, Commit Message Helper, Diff Statistics |
| Python | JSON → Pydantic, JSON → Dataclass, Requirements Generator, `.env` Generator, Dict Formatter |
| Networking | IPv4 Calculator, Port Lookup, HTTP Status Lookup, MAC Formatter, DNS Record Helper |
| Text | Case Converter, Line Processor, Whitespace Cleaner, Text Counter, Slug Generator, Text Diff |
| Calculators | Percentage, EMI, Age, Date Difference, Date Add / Subtract, Time Duration, Data Size, Bandwidth, Units |
| Security | Password Generator, Strength Checker, Secret Detector, Hex ⇄ Text, PEM Formatter |

---

## Screenshots

<!-- Add screenshots here -->

| Dashboard | Tool view | Dark mode |
| --- | --- | --- |
| _`docs/screenshot-dashboard.png`_ | _`docs/screenshot-tool.png`_ | _`docs/screenshot-dark.png`_ |

---

## Installation

```bash
git clone <repository>
cd devtoolbox
```

There is nothing to install and nothing to build.

## Local development

The app uses native ES modules, so it must be served over HTTP — opening `index.html` directly
with the `file://` protocol will be blocked by the browser's module CORS rules.

Pick whichever server you already have:

```bash
# Python 3
python -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Then open <http://localhost:8080>.

Edit any file and reload — there is no watcher, compiler or cache to clear (hard-reload if the
service worker is active, or disable it in DevTools → Application → Service Workers).

## Deploying to GitHub Pages

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`.
3. Open `https://<username>.github.io/<repository-name>/`.

All asset paths are relative (`./js/app.js`, `assets/icons/...`) and routing is hash-based
(`#/tool/json-formatter`), so the app works from a subdirectory without any server rewrites.

## Self-hosting

Copy the repository contents into any static web root:

```nginx
server {
    listen 80;
    root /var/www/devtoolbox;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

Apache, Caddy and `python -m http.server` work the same way — no special configuration is needed.

## PWA usage

- Open the site and use your browser's **Install app** action.
- The service worker pre-caches the shell and caches tool modules on first use, so previously
  visited tools keep working offline.
- To ship an update, bump `VERSION` in [`service-worker.js`](service-worker.js); the old cache is
  deleted on activation.

---

## Architecture

```
/
├── index.html              # App shell markup
├── style.css               # Imports the CSS layers below
├── script.js               # Entry point → js/app.js
├── manifest.json
├── service-worker.js
├── assets/icons/
├── css/
│   ├── variables.css       # Design tokens (light + dark)
│   ├── layout.css          # Reset and app grid
│   ├── components.css      # Buttons, inputs, toasts, modals, tables
│   └── tools.css           # Dashboard and tool surfaces
└── js/
    ├── app.js              # Shell: nav, search, theme, routing, views
    ├── router.js           # Hash router
    ├── registry.js         # Central tool registry + search ranking
    ├── storage.js          # localStorage wrapper (favourites, recents, theme)
    ├── ui.js               # Reusable DOM components
    ├── utils.js            # Generic helpers
    ├── lib/
    │   ├── yaml.js         # Minimal YAML parser/serialiser
    │   ├── qrcode.js       # QR Code (ISO/IEC 18004) encoder
    │   └── json-error.js   # Friendly JSON parse errors
    └── tools/              # One module per topic, several tools each
```

**Data flow:** `registry.js` describes every tool as metadata plus a lazy `load()` function.
`app.js` renders navigation, search results, category pages and the dashboard from that list, then
dynamically imports the tool module only when the route is opened. Tools receive a host element and
build their own UI from `ui.js` primitives, which keeps every tool visually identical.

## Adding a new tool

1. **Write the tool.** Add an exported function to an existing module in `js/tools/`, or create a
   new module. It receives the host element:

   ```js
   import { createIO, el, panel } from "../ui.js";

   export function reverseText(host) {
       const io = createIO({
           inputLabel: "Text",
           outputLabel: "Reversed",
           downloadName: "reversed.txt",
           actions: [{ label: "Reverse", primary: true, onClick: () => run() }],
           onInput: () => run(),
       });

       function run() {
           io.setOutput([...io.input.value].reverse().join(""));
       }

       host.append(el("div", { class: "tool-body" }, io.node));
   }
   ```

2. **Register it** in `js/registry.js`:

   ```js
   {
       id: "reverse-text",
       name: "Reverse Text",
       category: "text",
       description: "Reverse a string character by character",
       keywords: ["reverse", "mirror", "backwards"],
       icon: "↔",
       load: lazy("./tools/text-extra.js", "reverseText"),
   }
   ```

3. **Add the module path** to `PRECACHE` in `service-worker.js` if you want it available offline
   before it is first opened.

That is all — the sidebar entry, search index, category card and favourites support appear
automatically.

### UI building blocks

`js/ui.js` exports `el`, `panel`, `field`, `input`, `textarea`, `select`, `checkbox`, `segmented`,
`button`, `copyButton`, `downloadButton`, `codeOutput`, `statusBox`, `keyValueList`, `dataTable`,
`formGrid`, `createIO`, `toast`, `openModal` and `emptyState`. Use them instead of writing raw
markup so every tool stays consistent.

---

## Privacy model

- **No backend.** There are no API calls, analytics, telemetry or third-party requests.
- **No external fonts or CDNs.** Everything is served from the same origin.
- **Nothing sensitive is persisted.** `localStorage` holds only favourites, recent tool ids, the
  theme choice and small display preferences — never tool input.
- **Secrets stay in memory.** The password, PEM and secret-detector tools deliberately avoid
  storage and autocomplete; matched secrets are masked before display.
- **JWT decoding does not verify signatures.** Decoding tells you what a token claims, not whether
  the claim is trustworthy.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl` / `⌘` + `K` | Focus the search box |
| `/` | Focus search (when not typing) |
| `↑` `↓` `Enter` | Navigate and open search results |
| `Esc` | Close the search results, drawer or modal |
| `Ctrl` / `⌘` + `Enter` | Run the current tool from its input field |

## Browser support

Any evergreen browser with ES modules, `crypto.getRandomValues`, `Intl.RelativeTimeFormat` and
`replaceChildren` — Chrome/Edge 86+, Firefox 78+, Safari 14+. Hashing requires a secure context
(`https://` or `localhost`).

## Contributing

- Keep it dependency-free: HTML, CSS and vanilla ES modules only.
- Never inject untrusted input with `innerHTML`; use `textContent` and the `ui.js` helpers.
- Never use `eval()` or execute user input.
- Every visible tool must actually work — no placeholders, no fake buttons.
- Use the existing design tokens in `css/variables.css` instead of hard-coded colours.
- Handle bad input gracefully with `statusBox()`; never use `alert()` for validation.
- Test light mode, dark mode, mobile width and keyboard navigation before opening a PR.

## License

MIT

