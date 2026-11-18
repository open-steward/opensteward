/**
 * Markdown viewer for the `docs/` directory.
 *
 *   GET /guides             -> renders docs/README.md
 *   GET /guides/<path>.md   -> renders the file
 *   GET /guides/<path>      -> same file, extensionless (what the search
 *                              index emits); the literal path wins first
 *   GET /guides/<dir>       -> redirect to /guides/<dir>/ (with trailing slash)
 *   GET /guides/<dir>/      -> renders <dir>/README.md (or index.md) if
 *                              present, else a directory listing
 *   GET /guides/<file.png>  -> serves the raw asset (images, JSON, YAML, HTML)
 *
 * Mermaid `\`\`\`mermaid` fenced code blocks render via the mermaid.js
 * CDN module loaded in the page shell. Relative markdown links are
 * rewritten to stay inside the /guides/ prefix.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, normalize, relative, resolve } from 'path'
import { execFileSync } from 'child_process'
import { Marked, type Tokens } from 'marked'
import {
  isIntegratePath,
  parseFrontmatter,
  renderCoverageBody,
  renderIntegrateBody,
  type IntegrateFrontmatter,
} from './integrate-guides.js'
import { BRANDING_HEAD_LINKS } from './branding.js'
import { NAV_STYLES, renderHeader } from './header.js'
import { SEARCH_PALETTE_HTML, SEARCH_PALETTE_SCRIPT, SEARCH_PALETTE_STYLES } from './search-palette.js'

const GITHUB_REPO_URL = process.env.OST_DOCS_REPO_URL ?? 'https://github.com/open-steward/opensteward'
const GITHUB_BRANCH = process.env.OST_DOCS_BRANCH ?? 'main'

const gitMtimeCache = new Map<string, { value: string; expires: number }>()
function gitLastUpdated(absPath: string, docsRoot: string): string {
  const now = Date.now()
  const hit = gitMtimeCache.get(absPath)
  if (hit && hit.expires > now) return hit.value
  let value = ''
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', absPath], {
      cwd: docsRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
    value = out
  } catch {
    value = ''
  }
  gitMtimeCache.set(absPath, { value, expires: now + 60_000 })
  return value
}

const HTML_HEAD = `
  <link rel="stylesheet" href="/design/tokens.css">
  <link rel="stylesheet" href="/design/base.css">
  <link rel="stylesheet" href="/design/components.css">
  <link rel="icon" href="/design/logo/mark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/design/logo/mark-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
  ${BRANDING_HEAD_LINKS}
  <link rel="stylesheet" href="/design/vendor/phosphor/regular/style.css">
  <script src="/design/vendor/svg-pan-zoom/svg-pan-zoom.min.js"></script>
  <script>
    (function () {
      try {
        var legacy = localStorage.getItem('oi-theme')
        if (legacy && !localStorage.getItem('os-theme')) {
          localStorage.setItem('os-theme', legacy)
          localStorage.removeItem('oi-theme')
        }
        var stored = localStorage.getItem('os-theme')
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        var theme = stored || (prefersDark ? 'dark' : 'light')
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      } catch (e) {}
    })()
    function oiToggleTheme() {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      else document.documentElement.removeAttribute('data-theme')
      try { localStorage.setItem('os-theme', next) } catch (e) {}
      document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
        var i = btn.querySelector('i')
        if (i) i.className = next === 'dark' ? 'ph ph-sun' : 'ph ph-moon'
      })
      document.dispatchEvent(new CustomEvent('os-theme-change', { detail: { theme: next } }))
    }
  </script>
  <style>${NAV_STYLES}</style>
  <style>${SEARCH_PALETTE_STYLES}</style>
`

const STYLES = `
  body { background: var(--paper); color: var(--fg-1); }

  .guides-layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr) 220px;
    gap: var(--space-8);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-6);
  }
  @media (max-width: 1100px) {
    .guides-layout { grid-template-columns: 240px minmax(0, 1fr); }
    .guides-toc { display: none; }
  }
  @media (max-width: 880px) {
    .guides-layout { grid-template-columns: 1fr; }
    .guides-sidebar { display: none; }
  }
  .guides-toc {
    position: sticky; top: 80px; align-self: start;
    max-height: calc(100vh - 96px); overflow-y: auto;
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
  }
  .guides-toc h3 {
    font-size: var(--text-xs); text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-3);
    margin: 0 var(--space-3) var(--space-2);
  }
  .guides-toc ul { list-style: none; padding: 0; margin: 0; }
  .guides-toc li { margin: 2px 0; }
  .guides-toc a {
    display: block;
    padding: 3px var(--space-3);
    color: var(--fg-2);
    text-decoration: none;
    border-left: 2px solid transparent;
    border-radius: 0;
    font-size: var(--text-sm);
    line-height: 1.4;
  }
  .guides-toc a.is-h3 { padding-left: var(--space-5); font-size: var(--text-xs); }
  .guides-toc a:hover { color: var(--fg-1); background: var(--surface-1); }
  .guides-toc a.is-active {
    color: var(--accent-fg);
    border-left-color: var(--accent);
    background: var(--selected-bg, transparent);
  }
  /* Code-copy button inside rendered markdown <pre> blocks. */
  .guides-content .code-copy { position: relative; }
  .guides-content .code-copy pre { margin: 0; padding-right: 56px; }
  .guides-content .code-copy__btn {
    position: absolute;
    top: 8px; right: 8px;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px;
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    color: var(--fg-2);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--motion-fast, 120ms), background var(--motion-fast, 120ms);
  }
  .guides-content pre:hover + .code-copy__btn,
  .guides-content .code-copy:hover .code-copy__btn,
  .guides-content .code-copy:focus-within .code-copy__btn { opacity: 1; }
  .guides-content .code-copy__btn:hover { background: var(--surface-1); color: var(--fg-1); }
  .guides-sidebar {
    position: sticky; top: 80px; align-self: start;
    max-height: calc(100vh - 96px); overflow-y: auto;
    padding: var(--space-2) 0;
    border-right: 1px solid var(--border-subtle);
  }
  .guides-sidebar h3 { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--fg-3); margin: var(--space-4) var(--space-3) var(--space-2); }
  .guides-sidebar ul { list-style: none; padding: 0; margin: 0; }
  .guides-sidebar li { margin: 2px 0; }
  .guides-sidebar a {
    display: block;
    padding: 4px var(--space-3);
    color: var(--fg-2);
    text-decoration: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .guides-sidebar a:hover { background: var(--surface-1); color: var(--fg-1); }
  .guides-sidebar a[aria-current="page"] { background: var(--accent-muted); color: var(--accent-fg); }

  .guides-content {
    max-width: 80ch;
    line-height: var(--leading-relaxed);
    color: var(--fg-1);
  }
  .guides-content h1 { font-size: var(--text-3xl); letter-spacing: var(--tracking-tight); margin: 0 0 var(--space-4); }
  .guides-content h2 { font-size: var(--text-2xl); margin: var(--space-8) 0 var(--space-3); border-top: 1px solid var(--border-subtle); padding-top: var(--space-6); }
  .guides-content h3 { font-size: var(--text-xl); margin: var(--space-6) 0 var(--space-2); }
  .guides-content p, .guides-content li { color: var(--fg-1); }
  .guides-content a { color: var(--accent-fg); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .guides-content a:hover { color: var(--accent); }
  .guides-content code:not(pre code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }
  .guides-content pre {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow-x: auto;
    font-size: var(--text-sm);
  }
  .guides-content pre code {
    font-family: var(--font-mono);
    color: var(--fg-1);
  }
  .guides-content table {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-4) 0;
    font-size: var(--text-sm);
  }
  .guides-content th, .guides-content td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
    text-align: left;
    vertical-align: top;
  }
  .guides-content th { color: var(--fg-2); font-weight: 600; background: var(--surface-1); }
  .guides-content blockquote {
    margin: var(--space-4) 0;
    padding: var(--space-3) var(--space-4);
    border-left: 3px solid var(--accent);
    background: var(--surface-1);
    color: var(--fg-2);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }
  .guides-content blockquote > p:first-child { margin-top: 0; }
  .guides-content blockquote > p:last-child { margin-bottom: 0; }
  .guides-content img { max-width: 100%; height: auto; border-radius: var(--radius-md); }
  .guides-content hr { border: 0; border-top: 1px solid var(--border-subtle); margin: var(--space-6) 0; }
  .guides-content .mermaid {
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin: var(--space-4) 0;
    text-align: center;
    overflow-x: auto;
  }
  .guides-content .mermaid svg { max-width: 100%; height: auto; }

  .guides-breadcrumb {
    color: var(--fg-3);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }
  .guides-breadcrumb a { color: var(--fg-2); }

  .guides-listing { list-style: none; padding: 0; margin: var(--space-4) 0; }
  .guides-listing li { margin: var(--space-2) 0; }
  .guides-listing a {
    display: flex; gap: var(--space-2); align-items: center;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--fg-1);
  }
  .guides-listing a:hover { border-color: var(--border-default); background: var(--surface-1); }
  .guides-listing i { color: var(--fg-3); }

  /* ── Mermaid expand-to-fullscreen ─────────────────────────────── */
  .oi-chart-wrap { position: relative; }
  .oi-chart-expand {
    position: absolute; top: 8px; right: 8px;
    width: 32px; height: 32px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--fg-2);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    z-index: 2;
  }
  .oi-chart-wrap:hover .oi-chart-expand,
  .oi-chart-wrap:focus-within .oi-chart-expand { opacity: 1; }
  .oi-chart-expand:hover { background: var(--surface-1); color: var(--fg-1); }
  .oi-chart-expand:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; opacity: 1; }
  @media (max-width: 700px) {
    .oi-chart-expand { display: none; }
  }

  #oi-chart-modal {
    width: 90vw; height: 90vh;
    max-width: none; max-height: none;
    padding: 0;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-0);
    color: var(--fg-1);
    overflow: hidden;
  }
  #oi-chart-modal::backdrop { background: rgba(0, 0, 0, 0.5); }
  .oi-chart-modal-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
    font-size: var(--text-sm);
    color: var(--fg-3);
  }
  .oi-chart-modal-bar button {
    background: transparent;
    border: 0;
    color: var(--fg-2);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
  }
  .oi-chart-modal-bar button:hover { background: var(--surface-1); color: var(--fg-1); }
  #oi-chart-modal-svg {
    width: 100%; height: calc(90vh - 44px);
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-0);
  }
  #oi-chart-modal-svg svg {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
  }

  /* ============================================================================
     Integration-guide affordances (docs/integrate/**/*.md). Selectors here are
     emitted by the renderer's frontmatter parser + section-walker; authors
     never write the HTML. See docs/integrate/README.md and
     docs/integrate/_template.md for the markdown shapes that produce each
     block.
     ============================================================================ */
  .guide-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-5);
    align-items: center;
    padding: var(--space-5) var(--space-6);
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    margin: 0 0 var(--space-6);
  }
  .guide-header__icon {
    width: 56px; height: 56px;
    border-radius: var(--radius-lg);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 24px;
    background: var(--surface-1);
    color: var(--fg-2);
  }
  .guide-header[data-vertical="accounting"]        .guide-header__icon { background: var(--vertical-accounting-bg, var(--surface-1));        color: var(--vertical-accounting, var(--fg-1)); }
  .guide-header[data-vertical="crm"]               .guide-header__icon { background: var(--vertical-crm-bg, var(--surface-1));               color: var(--vertical-crm, var(--fg-1)); }
  .guide-header[data-vertical="ecommerce"]         .guide-header__icon { background: var(--vertical-ecommerce-bg, var(--surface-1));         color: var(--vertical-ecommerce, var(--fg-1)); }
  .guide-header[data-vertical="logistics"]         .guide-header__icon { background: var(--vertical-logistics-bg, var(--surface-1));         color: var(--vertical-logistics, var(--fg-1)); }
  .guide-header[data-vertical="payments"]          .guide-header__icon { background: var(--vertical-payments-bg, var(--surface-1));          color: var(--vertical-payments, var(--fg-1)); }
  .guide-header[data-vertical="docsign"]           .guide-header__icon { background: var(--vertical-docsign-bg, var(--surface-1));           color: var(--vertical-docsign, var(--fg-1)); }
  .guide-header[data-vertical="projects"]          .guide-header__icon { background: var(--vertical-projects-bg, var(--surface-1));          color: var(--vertical-projects, var(--fg-1)); }
  .guide-header[data-vertical="customer-support"]  .guide-header__icon { background: var(--vertical-customer-support-bg, var(--surface-1));  color: var(--vertical-customer-support, var(--fg-1)); }
  .guide-header[data-vertical="inventory"]         .guide-header__icon { background: var(--vertical-inventory-bg, var(--surface-1));         color: var(--vertical-inventory, var(--fg-1)); }
  .guide-header__title-row { min-width: 0; }
  .guide-header__eyebrow {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--fg-3); font-weight: 600;
    margin: 0 0 4px;
  }
  .guide-header__title {
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: var(--tracking-snug);
    color: var(--fg-1);
    margin: 0;
    line-height: var(--leading-tight);
  }
  .guide-header__meta {
    display: grid;
    grid-template-columns: max-content max-content;
    gap: 2px 18px;
    font-size: var(--text-sm);
    align-items: baseline;
    white-space: nowrap;
    margin: 0;
  }
  .guide-header__meta dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--fg-3);
    font-weight: 600;
  }
  .guide-header__meta dd {
    margin: 0;
    color: var(--fg-1);
    font-weight: 500;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .guide-header__meta dd .dot {
    width: 6px; height: 6px;
    border-radius: var(--radius-full);
    background: var(--success, #10b981);
  }
  .guide-header__meta dd .dot--neutral { background: var(--fg-4, #9ca3af); }
  .guide-header__meta dd .dot--stale   { background: var(--warning, #f59e0b); }

  @media (max-width: 760px) {
    .guide-header { grid-template-columns: auto 1fr; }
    .guide-header__meta { grid-column: 1 / -1; }
  }

  .guide-lede {
    font-size: var(--text-lg);
    line-height: var(--leading-snug);
    color: var(--fg-2);
    margin: 0 0 var(--space-8);
    text-wrap: pretty;
    max-width: 65ch;
  }

  .guides-content h2 .step-n {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.62em;
    color: var(--fg-3);
    font-weight: 500;
    letter-spacing: 0;
    margin-right: var(--space-2);
    vertical-align: 2px;
  }

  .shot {
    margin: var(--space-4) 0 var(--space-5);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-0);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .shot__bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-subtle);
  }
  .shot__dots { display: inline-flex; gap: 5px; }
  .shot__dots span {
    width: 9px; height: 9px;
    border-radius: var(--radius-full);
    background: var(--border-default);
  }
  .shot__url {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--fg-3);
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xs);
    padding: 2px 8px;
    text-align: center;
    max-width: 360px;
  }
  .shot__body {
    position: relative;
    background:
      linear-gradient(var(--surface-1), var(--surface-1)),
      radial-gradient(circle, var(--border-subtle) 1px, transparent 1px);
    background-size: 100% 100%, 16px 16px;
    background-blend-mode: multiply;
    min-height: 220px;
    display: grid;
    place-items: center;
    padding: var(--space-6);
  }
  .shot__body img { max-width: 100%; height: auto; display: block; border-radius: var(--radius-sm); }
  .shot__placeholder {
    display: inline-flex; flex-direction: column; align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: var(--surface-0);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    color: var(--fg-3);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    max-width: 90%; text-align: center;
  }
  .shot__placeholder i { font-size: 18px; color: var(--fg-4, #9ca3af); }
  .shot__placeholder b { color: var(--fg-2); font-weight: 600; font-family: var(--font-sans); font-size: var(--text-sm); }
  .shot__caption {
    padding: 8px 14px;
    font-size: 12px;
    color: var(--fg-3);
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-0);
    font-style: italic;
  }
  .shot__caption code {
    font-family: var(--font-mono);
    font-style: normal;
    background: var(--surface-1);
    padding: 1px 5px;
    border-radius: var(--radius-xs);
    font-size: 11px;
  }

  .callback {
    margin: var(--space-4) 0 var(--space-5);
    border: 1px solid var(--accent-200, var(--border-default));
    background: var(--accent-50, var(--surface-1));
    border-radius: var(--radius-md);
    padding: var(--space-5) var(--space-5) var(--space-4);
  }
  .callback__label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--accent-fg, var(--accent, var(--fg-1)));
    font-weight: 600;
    margin: 0 0 var(--space-2);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .callback__url-row {
    display: flex; align-items: center; gap: var(--space-2);
    background: var(--surface-0);
    border: 1px solid var(--accent-200, var(--border-default));
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }
  .callback__url {
    flex: 1; min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--text-base);
    color: var(--fg-1);
    overflow-x: auto;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }
  .callback__url .ph-slot {
    background: var(--accent-100, var(--surface-1));
    border: 1px dashed var(--accent-300, var(--border-default));
    border-radius: var(--radius-xs);
    padding: 0 4px;
    color: var(--accent-fg, var(--accent, var(--fg-1)));
  }
  .callback__copy {
    display: inline-flex; align-items: center; gap: 5px;
    height: 28px; padding: 0 10px;
    border: 1px solid var(--border-default);
    background: var(--surface-0);
    border-radius: var(--radius-sm);
    color: var(--fg-2);
    font-size: 12px; font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
  }
  .callback__copy:hover { background: var(--surface-1); color: var(--fg-1); }
  .callback__example {
    margin-top: var(--space-3);
    font-size: var(--text-sm);
    color: var(--fg-2);
    display: flex; gap: var(--space-2); align-items: baseline;
  }
  .callback__example b {
    font-weight: 600;
    color: var(--accent-fg, var(--accent, var(--fg-1)));
    min-width: 9ch;
  }
  .callback__example code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--fg-1);
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
  }

  .scopes {
    border: 1px solid var(--border-default);
    background: var(--surface-0);
    border-radius: var(--radius-md);
    padding: var(--space-2) 0;
    margin: var(--space-3) 0 var(--space-5);
  }
  .scopes__row {
    display: grid;
    grid-template-columns: 20px max-content 1fr auto;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    align-items: baseline;
    border-bottom: 1px solid var(--border-subtle);
  }
  .scopes__row:last-child { border-bottom: 0; }
  .scopes__check {
    width: 16px; height: 16px;
    border-radius: 4px;
    background: var(--accent, var(--fg-2));
    color: var(--fg-on-accent, var(--surface-0));
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px;
    transform: translateY(2px);
  }
  .scopes__name {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--fg-1);
    font-weight: 500;
  }
  .scopes__desc { font-size: var(--text-sm); color: var(--fg-2); }
  .scopes__opt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--fg-3);
    font-weight: 600;
    align-self: center;
  }

  .xlink {
    display: flex; align-items: center; gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-0);
    text-decoration: none !important;
    color: inherit;
    margin: var(--space-3) 0 var(--space-5);
    transition: border-color var(--dur-fast, 120ms), box-shadow var(--dur-fast, 120ms);
  }
  .xlink:hover { border-color: var(--accent, var(--fg-2)); box-shadow: var(--shadow-sm); }
  .xlink__icon {
    width: 36px; height: 36px;
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--fg-2);
    font-size: 18px;
    flex-shrink: 0;
  }
  .xlink__body { flex: 1; min-width: 0; }
  .xlink__title {
    font-weight: 600;
    color: var(--fg-1);
    font-size: var(--text-base);
    margin: 0 0 2px;
    display: block;
  }
  .xlink__path {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--fg-3);
    display: block;
  }
  .xlink__arrow { color: var(--fg-3); font-size: 18px; }

  .trouble { display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-3) 0; }
  .trouble__row {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    background: var(--surface-0);
  }
  .trouble__err {
    display: flex; gap: 8px;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--danger-fg, #b91c1c);
    background: var(--danger-bg, #fef2f2);
    border: 1px solid #F0CFC7;
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    width: max-content;
    max-width: 100%;
    margin-bottom: var(--space-3);
  }
  .trouble__err i { font-size: 14px; }
  .trouble__row p { margin: 0; }
  .trouble__row p + p { margin-top: var(--space-2); }
  .trouble__row b { font-weight: 600; color: var(--fg-1); }

  .guides-sidebar__dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: var(--radius-full);
    margin-right: 8px;
    background: var(--fg-4, #9ca3af);
  }
  .guides-sidebar__dot--ok   { background: var(--success, #10b981); }
  .guides-sidebar__dot--miss { background: var(--fg-4, #9ca3af); }

  /* Integration-guide coverage matrix at /guides/integrate */
  .integrate-coverage__header { margin: 0 0 var(--space-6); }
  .integrate-coverage__lede {
    font-size: var(--text-lg);
    line-height: var(--leading-snug);
    color: var(--fg-2);
    margin: var(--space-2) 0 var(--space-5);
    max-width: 65ch;
  }
  .integrate-coverage__counts {
    display: grid;
    grid-template-columns: repeat(4, max-content);
    gap: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-6);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    width: max-content; max-width: 100%;
  }
  .integrate-coverage__counts div { display: flex; flex-direction: column; }
  .integrate-coverage__counts dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--fg-3);
    font-weight: 600;
    margin: 0;
  }
  .integrate-coverage__counts dd {
    margin: 0;
    color: var(--fg-1);
    font-weight: 600;
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
  }
  .integrate-coverage__filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: var(--space-4) 0 0;
    align-items: center;
  }
  .integrate-coverage__search {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    min-width: 260px;
    flex: 1 1 320px;
    height: 36px;
  }
  .integrate-coverage__search:focus-within { border-color: var(--accent); }
  .integrate-coverage__search i { color: var(--fg-3); }
  .integrate-coverage__search input {
    flex: 1; border: 0; outline: none; background: transparent;
    color: var(--fg-1); font: inherit; font-size: var(--text-sm);
  }
  .integrate-coverage__chips { display: inline-flex; flex-wrap: wrap; gap: var(--space-2); }
  .integrate-coverage__chip {
    appearance: none; border: 1px solid var(--border-default);
    background: var(--paper); color: var(--fg-2);
    font: inherit; font-size: var(--text-xs);
    padding: 4px var(--space-3); border-radius: 999px; cursor: pointer;
  }
  .integrate-coverage__chip:hover { background: var(--surface-1); color: var(--fg-1); }
  .integrate-coverage__chip.is-active {
    background: var(--accent-muted, var(--surface-2));
    color: var(--accent-fg, var(--fg-1));
    border-color: transparent;
  }
  .integrate-coverage__empty {
    margin: var(--space-4) 0;
    color: var(--fg-3); font-size: var(--text-sm);
    text-align: center;
    padding: var(--space-6);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
  }
  .integrate-coverage__group { margin: 0 0 var(--space-6); }
  .integrate-coverage__group h2 {
    font-size: var(--text-lg);
    margin: 0 0 var(--space-3);
    font-weight: 600;
    color: var(--fg-1);
  }
  .integrate-coverage__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .integrate-coverage__table th {
    text-align: left;
    background: var(--surface-1);
    color: var(--fg-3);
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    border-bottom: 1px solid var(--border-subtle);
  }
  .integrate-coverage__table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--fg-1);
  }
  .integrate-coverage__table tr:last-child td { border-bottom: 0; }
  .integrate-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--surface-1);
  }
  .integrate-status--ok      { color: var(--success, #10b981); background: var(--surface-1); }
  .integrate-status--warn    { color: var(--warning, #b45309); background: var(--surface-1); }
  .integrate-status--partner { color: var(--accent, var(--fg-2)); background: var(--surface-1); }
  .integrate-status--miss    { color: var(--fg-3); background: var(--surface-1); }
`

interface SidebarItem {
  href: string
  label: string
  active: boolean
  children?: SidebarItem[]
}

interface RenderContext {
  /** Absolute path of the docs root (the `docs/` folder). */
  docsRoot: string
  /** URL the request landed on (e.g. `/guides/architecture/persistence.md`). */
  urlPath: string
  /**
   * Path of the file relative to docsRoot (e.g. `architecture/persistence.md`).
   * For directory index requests, the resolved README.md path is used.
   */
  relPath: string
}

// Every `docs/` subdirectory of prose gets a sidebar group here, with two
// exceptions. `docs/integrate/` is listed separately above, as a single link
// to the coverage matrix rather than a group of per-platform guides.
// `docs/api-reference/` is deliberately absent: /guides/api-reference* 301s to
// the Swagger page (/unified-api), so a sidebar entry would only redirect away from itself.
// `docs/openapi/`, `docs/platforms/` and `docs/postman/` hold generated data,
// not prose, and have their own pages in the nav.
const KNOWN_TOP_LEVEL = [
  { dir: 'admin', label: 'Admin console' },
  { dir: 'architecture', label: 'Architecture' },
  { dir: 'business-cases', label: 'Business cases' },
  { dir: 'deployment', label: 'Deployment' },
  { dir: 'environment', label: 'Environment' },
  { dir: 'operations', label: 'Operations' },
  { dir: 'sdk', label: 'SDK' },
  { dir: 'security', label: 'Security' },
]

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/\s+/g, ' ').trim()
}

/**
 * Make sure a resolved absolute path stays inside `root`. Used to neutralise
 * `..`/symlink traversal attempts before reading from disk.
 */
function isUnderRoot(root: string, absPath: string): boolean {
  const rel = relative(root, absPath)
  return !!rel && !rel.startsWith('..') && !rel.startsWith('/')
}

function rewriteRelativeLink(href: string, ctx: RenderContext): string {
  // External / anchor / mailto / absolute URLs — pass through.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href
  if (href.startsWith('//')) return href
  if (href.startsWith('#')) return href
  if (href.startsWith('/')) return href

  // Resolve against the markdown file's directory inside docsRoot.
  const sourceDir = dirname(ctx.relPath)
  // Pull anchor + query off the end before joining so they don't bleed into the path.
  const hashIdx = href.indexOf('#')
  const queryIdx = href.indexOf('?')
  const splitAt = [hashIdx, queryIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1
  const pathPart = splitAt >= 0 ? href.slice(0, splitAt) : href
  const tail = splitAt >= 0 ? href.slice(splitAt) : ''

  const joined = normalize(join(sourceDir, pathPart))
  // `..` traversal that escapes docsRoot. These are deliberate cross-tree
  // references — `../LICENSE`, `../NOTICE`, `../CONTRIBUTING.md`,
  // `../apps/mcp-server/README.md`, `../../docker-compose.hardening.yml`,
  // etc. — pointing at repo-root files docs-server doesn't serve.
  // Rewrite to a GitHub blob URL so the link actually resolves.
  if (joined.startsWith('..')) {
    const repoRelative = joined.replace(/\\/g, '/').replace(/^(\.\.\/)+/, '')
    return `${GITHUB_REPO_URL}/blob/${GITHUB_BRANCH}/${repoRelative}${tail}`
  }

  return '/guides/' + joined.replace(/\\/g, '/') + tail
}

function buildMarked(ctx: RenderContext): Marked {
  const m = new Marked({ gfm: true, breaks: false })
  m.use({
    renderer: {
      // Mermaid fenced blocks: emit `<pre class="mermaid">` so mermaid.js
      // auto-runs them. Other languages keep the default highlight markup.
      code({ text, lang }: Tokens.Code): string {
        if ((lang ?? '').trim().toLowerCase() === 'mermaid') {
          return `<pre class="mermaid">${escapeHtml(text)}</pre>`
        }
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
        return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>`
      },
      link({ href, title, tokens }: Tokens.Link): string {
        const out = rewriteRelativeLink(href, ctx)
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        const inner = (this as unknown as { parser: { parseInline: (t: unknown) => string } }).parser.parseInline(tokens)
        return `<a href="${escapeHtml(out)}"${titleAttr}>${inner}</a>`
      },
      image({ href, title, text }: Tokens.Image): string {
        const out = rewriteRelativeLink(href, ctx)
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        return `<img src="${escapeHtml(out)}" alt="${escapeHtml(text)}"${titleAttr}>`
      },
    },
  })
  return m
}

function findReadme(absDir: string): string | null {
  for (const candidate of ['README.md', 'index.md']) {
    const p = join(absDir, candidate)
    if (existsSync(p)) return p
  }
  return null
}

function buildSidebarSections(docsRoot: string, currentRelPath: string): SidebarItem[] {
  const sections: SidebarItem[] = [
    {
      href: '/guides',
      label: 'Overview',
      active: currentRelPath === 'README.md',
    },
  ]

  // Hand-curated top-level list — surfaces the markdown guides we ship.
  const handpicked = [
    { rel: 'why-opensteward.md', label: 'Why OpenSteward' },
    { rel: 'dev-api.md', label: 'Developer Guide' },
    { rel: 'GLOSSARY.md', label: 'Glossary' },
  ]
  for (const item of handpicked) {
    if (existsSync(join(docsRoot, item.rel))) {
      sections.push({
        href: '/guides/' + item.rel,
        label: item.label,
        active: currentRelPath === item.rel,
      })
    }
  }

  // Pin the dedicated Platforms + Postman + Unified API pages here so
  // the sidebar stays consistent with the header nav. All three live
  // outside /guides/ because they have richer UIs than a static markdown
  // render — Swagger UI for the Unified API in particular.
  sections.push({ href: '/platforms', label: 'Platforms', active: false })
  sections.push({ href: '/postman', label: 'Postman', active: false })
  sections.push({ href: '/unified-api', label: 'Unified API', active: false })

  // MCP guide — appears underneath the Unified API link. Gated on
  // file existence so the link doesn't 404 in deployments where the
  // docs/mcp.md file is missing.
  if (existsSync(join(docsRoot, 'mcp.md'))) {
    sections.push({
      href: '/guides/mcp.md',
      label: 'MCP (AI agents)',
      active: currentRelPath === 'mcp.md',
    })
  }

  // Integration guides — links to the coverage matrix. Per-platform guide
  // pages live underneath at /guides/integrate/<vertical>/<slug>.md and
  // are reachable from the matrix, so the sidebar doesn't expand them.
  if (existsSync(join(docsRoot, 'integrate'))) {
    sections.push({
      href: '/guides/integrate',
      label: 'Integration guides',
      active: currentRelPath === 'integrate' || currentRelPath.startsWith('integrate/'),
    })
  }

  // Per-directory groups — list every .md file alphabetically; bring
  // README.md to the top.
  for (const top of KNOWN_TOP_LEVEL) {
    const absDir = join(docsRoot, top.dir)
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue
    const entries = readdirSync(absDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
    if (entries.length === 0) continue
    const sortKey = (name: string) => (name === 'README.md' ? '\x00' : name.toLowerCase())
    entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    const children: SidebarItem[] = entries.map((name) => {
      const rel = `${top.dir}/${name}`
      const label =
        name === 'README.md'
          ? 'Overview'
          : name
              .replace(/\.md$/, '')
              .replace(/-/g, ' ')
              .replace(/^./, (c) => c.toUpperCase())
      return {
        href: '/guides/' + rel,
        label,
        active: currentRelPath === rel,
      }
    })
    sections.push({ href: '/guides/' + top.dir + '/', label: top.label, active: false, children })
  }

  return sections
}

function buildSidebar(docsRoot: string, currentRelPath: string): string {
  const sections = buildSidebarSections(docsRoot, currentRelPath)
  const renderItem = (it: SidebarItem): string => {
    const aria = it.active ? ' aria-current="page"' : ''
    return `<li><a href="${escapeHtml(it.href)}"${aria}>${escapeHtml(it.label)}</a></li>`
  }

  let out = '<ul>'
  for (const section of sections) {
    if (section.children && section.children.length > 0) {
      out += `<h3>${escapeHtml(section.label)}</h3><ul>`
      for (const child of section.children) out += renderItem(child)
      out += '</ul>'
    } else {
      out += renderItem(section)
    }
  }
  out += '</ul>'
  return out
}

/**
 * Flatten the sidebar to just leaf entries (skip group headers and external
 * non-guides links). Used to compute prev/next for the in-page nav pair.
 */
function flattenSidebarLeaves(sections: SidebarItem[]): SidebarItem[] {
  const out: SidebarItem[] = []
  for (const s of sections) {
    if (s.children && s.children.length > 0) {
      for (const c of s.children) {
        if (c.href.startsWith('/guides')) out.push(c)
      }
    } else if (s.href.startsWith('/guides')) {
      out.push(s)
    }
  }
  return out
}

function buildNavPair(sections: SidebarItem[], currentRelPath: string): string {
  const flat = flattenSidebarLeaves(sections)
  const currentHref = currentRelPath === 'README.md' ? '/guides' : '/guides/' + currentRelPath
  const idx = flat.findIndex((it) => it.href === currentHref)
  if (idx < 0) return ''
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx < flat.length - 1 ? flat[idx + 1] : null
  if (!prev && !next) return ''
  // Class names match the design-system rules in components.css:
  //   .docs-nav-pair__label → small caption ("Previous" / "Next")
  //   .docs-nav-pair__title → the page title (block-level, gap above)
  const prevHtml = prev
    ? `<a class="docs-nav-pair__link docs-nav-pair__link--prev" href="${escapeHtml(prev.href)}"><span class="docs-nav-pair__label">‹ Previous</span><span class="docs-nav-pair__title">${escapeHtml(prev.label)}</span></a>`
    : '<span></span>'
  const nextHtml = next
    ? `<a class="docs-nav-pair__link docs-nav-pair__link--next" href="${escapeHtml(next.href)}"><span class="docs-nav-pair__label">Next ›</span><span class="docs-nav-pair__title">${escapeHtml(next.label)}</span></a>`
    : '<span></span>'
  return `<nav class="docs-nav-pair" aria-label="Previous and next">${prevHtml}${nextHtml}</nav>`
}

function breadcrumbHtml(relPath: string): string {
  if (!relPath || relPath === 'README.md') return ''
  const parts = relPath.split('/').filter(Boolean)
  let acc = '/guides'
  const crumbs: string[] = [`<a href="/guides">Guides</a>`]
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    const isLast = i === parts.length - 1
    acc += '/' + seg
    if (isLast) {
      crumbs.push(escapeHtml(seg.replace(/\.md$/, '').replace(/-/g, ' ')))
    } else {
      crumbs.push(`<a href="${acc}/">${escapeHtml(seg)}</a>`)
    }
  }
  return `<nav class="guides-breadcrumb">${crumbs.join(' / ')}</nav>`
}

function shellHtml(opts: {
  title: string
  sidebar: string
  body: string
  toc?: string
  /** First paragraph of the rendered markdown — used in <meta description>. */
  description?: string
  /** Canonical URL (full /guides/... path) for OG + canonical link. */
  canonicalPath?: string
  /** Sidebar partial used in mobile (collapsible <details>). */
  mobileSidebar?: string
  /** Bottom-of-page prev/next pair, rendered after the body. */
  navPair?: string
  /** Last-updated + edit-on-GitHub strip, rendered after the body. */
  metaStrip?: string
}): string {
  const tocAside = opts.toc
    ? `<aside class="toc" aria-label="On this page">${opts.toc}</aside>`
    : '<div></div>'
  const desc = opts.description ?? 'OpenSteward documentation.'
  // Guard against page title that already contains "Documentation" (e.g. the
  // docs-root README's H1) — otherwise the document title doubles up.
  const docTitle = /\bdocumentation\b/i.test(opts.title)
    ? `${opts.title} - OpenSteward`
    : `${opts.title} - Documentation - OpenSteward`
  const ogTitle = docTitle
  const canonical = opts.canonicalPath
    ? `<link rel="canonical" href="${escapeAttr(opts.canonicalPath)}">`
    : ''
  const bodyTail = [
    opts.navPair ?? '',
    opts.metaStrip ?? '',
  ].join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <meta name="description" content="${escapeAttr(desc)}">
  <meta property="og:title" content="${escapeAttr(ogTitle)}">
  <meta property="og:description" content="${escapeAttr(desc)}">
  <meta property="og:type" content="article">
  ${canonical}
  ${HTML_HEAD}
  <style>${STYLES}</style>
</head>
<body>
  <a href="#main" class="skip-link">Skip to content</a>
  ${renderHeader()}
  ${opts.mobileSidebar ? `<details class="guides-sidebar-mobile"><summary><i class="ph ph-list" aria-hidden="true"></i> Documentation</summary>${opts.mobileSidebar}</details>` : ''}
  <div class="guides-layout">
    <aside class="guides-sidebar" aria-label="Documentation navigation">${opts.sidebar}</aside>
    <main id="main" class="guides-content">${opts.body}${bodyTail}</main>
    ${tocAside}
  </div>
  <dialog id="oi-chart-modal" aria-label="Expanded chart view">
    <div class="oi-chart-modal-bar">
      <span>Drag to pan · scroll to zoom · double-click to reset · Esc to close</span>
      <button type="button" id="oi-chart-modal-close" aria-label="Close"><i class="ph ph-x"></i></button>
    </div>
    <div id="oi-chart-modal-svg"></div>
  </dialog>
  ${SEARCH_PALETTE_HTML}
  <script>${SEARCH_PALETTE_SCRIPT}</script>
  <!-- Mermaid's UMD build, served locally so this page makes no third-party
       request. It sets globalThis.mermaid, so the module below reads the
       global rather than importing. See THIRD-PARTY-NOTICES.md. -->
  <script src="/design/vendor/mermaid/mermaid.min.js"></script>
  <script type="module">
    const mermaid = globalThis.mermaid
    function currentMermaidTheme() {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default'
    }
    async function renderAndAttach() {
      mermaid.initialize({ startOnLoad: false, theme: currentMermaidTheme(), securityLevel: 'loose' })
      try { await mermaid.run({ querySelector: 'pre.mermaid' }) } catch (e) {}
      // Wait one frame so mermaid's SVG is in the DOM before we wrap.
      requestAnimationFrame(attachExpandButtons)
    }
    renderAndAttach()
    document.addEventListener('os-theme-change', () => {
      // Close any open modal first — otherwise the cloned SVG inside it
      // would be stale relative to the page's re-rendered theme.
      closeModal()
      // Re-render every diagram with the new theme. Mermaid replaces each
      // SVG, so we strip the wrap + attach flag so attachExpandButtons can
      // re-wrap on the next render.
      const blocks = document.querySelectorAll('pre.mermaid')
      blocks.forEach((el) => {
        const src = el.getAttribute('data-mermaid-src') ?? el.textContent ?? ''
        el.setAttribute('data-mermaid-src', src)
        el.removeAttribute('data-processed')
        el.textContent = src
        delete el.dataset.oiExpandAttached
        // If a previous render wrapped this pre, unwrap so mermaid's run
        // can find it via 'pre.mermaid' (still works either way, but the
        // wrap node is one-time scaffolding).
        const parent = el.parentElement
        if (parent && parent.classList.contains('oi-chart-wrap')) {
          parent.replaceWith(el)
        }
      })
      renderAndAttach()
    })

    function attachExpandButtons() {
      const charts = document.querySelectorAll('pre.mermaid')
      charts.forEach((pre) => {
        if (pre.dataset.oiExpandAttached === '1') return
        if (!pre.querySelector('svg')) return // failed render — no button
        // Wrap the <pre> in a positioning context so the button anchors top-right.
        const wrap = document.createElement('div')
        wrap.className = 'oi-chart-wrap'
        pre.parentElement.insertBefore(wrap, pre)
        wrap.appendChild(pre)
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'oi-chart-expand'
        btn.setAttribute('aria-label', 'Open chart in fullscreen')
        btn.innerHTML = '<i class="ph ph-arrows-out" aria-hidden="true"></i>'
        btn.addEventListener('click', () => openModal(pre))
        wrap.appendChild(btn)
        pre.dataset.oiExpandAttached = '1'
      })
    }

    let activeSpz = null
    function openModal(pre) {
      const svg = pre.querySelector('svg')
      if (!svg) return
      const dialog = document.getElementById('oi-chart-modal')
      const slot = document.getElementById('oi-chart-modal-svg')
      if (!dialog || !slot || typeof window.svgPanZoom !== 'function') return
      // Clone so the inline chart stays untouched. Strip inline sizing so
      // svg-pan-zoom can resize freely against the slot's dimensions.
      const clone = svg.cloneNode(true)
      clone.removeAttribute('style')
      clone.removeAttribute('width')
      clone.removeAttribute('height')
      slot.replaceChildren(clone)
      dialog.showModal()
      // Init pan-zoom AFTER the dialog is open so the slot has real dimensions.
      activeSpz = window.svgPanZoom(clone, {
        zoomEnabled: true,
        panEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
        minZoom: 0.5,
        maxZoom: 20,
        zoomScaleSensitivity: 0.4,
        dblClickZoomEnabled: false, // we use double-click to reset instead
      })
      clone.addEventListener('dblclick', () => activeSpz && activeSpz.reset())
    }

    function closeModal() {
      const dialog = document.getElementById('oi-chart-modal')
      if (dialog && dialog.open) dialog.close()
      // Cleanup happens in the 'close' event listener below — single source.
    }

    // Wire close affordances + cleanup once per page load.
    document.addEventListener('DOMContentLoaded', () => {
      const dialog = document.getElementById('oi-chart-modal')
      if (!dialog) return
      const closeBtn = document.getElementById('oi-chart-modal-close')
      if (closeBtn) closeBtn.addEventListener('click', () => dialog.close())
      // Backdrop click closes (target is the dialog itself, not a child).
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close()
      })
      // Native <dialog> close (Esc, .close(), backdrop) — single cleanup point.
      dialog.addEventListener('close', () => {
        if (activeSpz) {
          try { activeSpz.destroy() } catch (e) {}
          activeSpz = null
        }
        const slot = document.getElementById('oi-chart-modal-svg')
        if (slot) slot.replaceChildren()
      })
    })

    // ── Code-copy: clicking any [data-copy] writes its value to clipboard.
    // Single delegated listener so dynamically-rendered mermaid wrappers
    // (which can re-mount after theme toggles) still work.
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-copy]')
      if (!btn) return
      var text = btn.getAttribute('data-copy') || ''
      if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return
      navigator.clipboard.writeText(text).then(function () {
        var orig = btn.innerHTML
        btn.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i> Copied'
        setTimeout(function () { btn.innerHTML = orig }, 1400)
      })
    })

    // ── TOC active-section observer: highlight the heading currently in view.
    ;(function () {
      var tocLinks = Array.prototype.slice.call(
        document.querySelectorAll('.guides-toc a[href^="#"]'),
      )
      if (tocLinks.length === 0) return
      var byId = {}
      tocLinks.forEach(function (a) {
        var id = a.getAttribute('href').slice(1)
        byId[id] = a
      })
      var headings = tocLinks
        .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)) })
        .filter(Boolean)
      if (headings.length === 0) return
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var link = byId[entry.target.id]
          if (!link) return
          if (entry.isIntersecting) {
            tocLinks.forEach(function (a) { a.classList.remove('is-active') })
            link.classList.add('is-active')
          }
        })
      }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 })
      headings.forEach(function (h) { observer.observe(h) })
    })()
  </script>
</body>
</html>`
}

function extractDescription(md: string): string {
  const stripped = md.replace(/^---[\s\S]*?---\s*/, '')
  for (const block of stripped.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (!trimmed) continue
    if (/^#+\s/.test(trimmed)) continue
    if (/^[-*]\s/.test(trimmed)) continue
    if (/^```/.test(trimmed)) continue
    if (/^!\[/.test(trimmed)) continue
    const plain = trimmed
      .replace(/`[^`]*`/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_>#`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain.length >= 20) return plain.length > 200 ? plain.slice(0, 197) + '…' : plain
  }
  return 'OpenSteward documentation.'
}

function buildMetaStrip(ctx: RenderContext, absPath: string): string {
  const updated = gitLastUpdated(absPath, ctx.docsRoot)
  const repoRel = relative(ctx.docsRoot, absPath).replace(/\\/g, '/')
  const editUrl = `${GITHUB_REPO_URL}/edit/${GITHUB_BRANCH}/docs/${repoRel}`
  const updatedHtml = updated
    ? `<span class="doc-meta-strip__updated">Last updated <time datetime="${escapeAttr(updated)}">${escapeHtml(updated)}</time></span>`
    : '<span></span>'
  const editHtml = `<a class="doc-meta-strip__edit" href="${escapeAttr(editUrl)}" rel="noopener" target="_blank"><i class="ph ph-pencil-simple" aria-hidden="true"></i> Edit on GitHub</a>`
  return `<div class="doc-meta-strip">${updatedHtml}${editHtml}</div>`
}

/**
 * Render a 404/403 page inside the full guides shell. The body uses the
 * design-system `.empty-state` block — message + the standard sidebar so
 * the user can still navigate without bouncing back to /guides.
 */
function renderErrorPage(docsRoot: string, urlPath: string, status: 404 | 403): string {
  const sidebar = buildSidebar(docsRoot, '')
  const heading = status === 404 ? 'Page not found' : 'Access forbidden'
  const msg = status === 404
    ? 'The page you requested does not exist in this docs build.'
    : 'You do not have access to that path.'
  const requested = escapeHtml(urlPath)
  const body = `
    <div class="empty-state">
      <div class="empty-state__icon"><i class="ph ph-compass" aria-hidden="true"></i></div>
      <h1 class="empty-state__title">${escapeHtml(heading)}</h1>
      <p class="empty-state__body">${escapeHtml(msg)}</p>
      <p class="empty-state__body"><code class="mono">${requested}</code></p>
      <p class="empty-state__actions">
        <a class="btn btn--primary" href="/guides">Back to docs</a>
        <a class="btn btn--secondary" href="/">Home</a>
      </p>
    </div>
  `
  return shellHtml({
    title: heading,
    sidebar,
    body,
    mobileSidebar: sidebar,
  })
}

function renderMarkdownPage(absPath: string, ctx: RenderContext): string {
  const rawMd = readFileSync(absPath, 'utf8')

  // Integration guides (`docs/integrate/<vertical>/<platform>.md`) carry
  // YAML frontmatter and one of the section formats documented in
  // docs/integrate/README.md. Strip the frontmatter before marked sees
  // it (otherwise the `---` lines render as horizontal rules around a
  // garbage paragraph) and run the integrate-specific transforms after
  // the standard postProcess.
  const fmParsed = parseFrontmatter(rawMd)
  const isIntegrate = isIntegratePath(ctx.relPath) && fmParsed !== null && hasRequiredFrontmatter(fmParsed.frontmatter)
  const md = fmParsed ? fmParsed.body : rawMd

  const marked = buildMarked(ctx)
  const rawBody = marked.parse(md) as string
  const { body: postProcessed, toc } = postProcessMarkdownBody(rawBody)
  const body = isIntegrate
    ? renderIntegrateBody(postProcessed, fmParsed!.frontmatter as unknown as IntegrateFrontmatter, ctx)
    : postProcessed

  const titleMatch = md.match(/^#\s+(.+)$/m)
  const fmTitle = fmParsed?.frontmatter['title']
  const title = isIntegrate && typeof fmTitle === 'string' ? fmTitle : titleMatch?.[1].trim() ?? ctx.relPath
  const sections = buildSidebarSections(ctx.docsRoot, ctx.relPath)
  const sidebar = buildSidebar(ctx.docsRoot, ctx.relPath)
  const breadcrumb = breadcrumbHtml(ctx.relPath)
  const description = extractDescription(md)
  const canonicalPath = ctx.relPath === 'README.md' ? '/guides' : '/guides/' + ctx.relPath
  const navPair = buildNavPair(sections, ctx.relPath)
  const metaStrip = buildMetaStrip(ctx, absPath)
  return shellHtml({
    title,
    sidebar,
    body: breadcrumb + body,
    toc,
    description,
    canonicalPath,
    mobileSidebar: sidebar,
    navPair,
    metaStrip,
  })
}

/**
 * Coverage page for the integration-guide corpus. Routed at
 * `/guides/integrate` by docs-server's request handler. Same shell as
 * every other guide page — sidebar, breadcrumb, mobile sidebar — so
 * navigation stays consistent.
 */
export function renderIntegrateCoveragePage(docsRoot: string): string {
  const relPath = 'integrate'
  const sidebar = buildSidebar(docsRoot, relPath)
  const breadcrumb = breadcrumbHtml(relPath)
  const body = renderCoverageBody(docsRoot)
  return shellHtml({
    title: 'Integration guides',
    sidebar,
    body: breadcrumb + body,
    description: 'Per-platform OAuth dev-portal setup guides for OpenSteward adapters.',
    canonicalPath: '/guides/integrate',
    mobileSidebar: sidebar,
  })
}

/**
 * Six required frontmatter keys (see docs/integrate/README.md). When any are
 * missing, fall through to the standard markdown renderer so a malformed
 * guide still renders something — `check:guides` is the place to fail loud.
 */
function hasRequiredFrontmatter(fm: Record<string, string | boolean>): boolean {
  return (
    typeof fm['vertical'] === 'string' &&
    typeof fm['platform'] === 'string' &&
    typeof fm['title'] === 'string' &&
    typeof fm['auth_type'] === 'string' &&
    typeof fm['estimated_time'] === 'string' &&
    typeof fm['last_verified'] === 'string'
  )
}

/**
 * Walk the rendered markdown HTML and:
 *  - assign stable slug ids to every <h2>/<h3>/<h4> so the TOC (h2 + h3) and
 *    cross-page links can target them. Slugs follow GitHub's rules — the
 *    docs are written and link-checked against GitHub, their primary reader —
 *    so the same `#anchor` lands on the same heading in both places.
 *  - emit a TOC list (h2 + nested h3)
 *  - wrap every non-mermaid <pre> in <div class="code-copy code-copy--block">
 *    with a copy button bound by `data-copy` (handled by the global listener)
 */
function postProcessMarkdownBody(html: string): { body: string; toc: string } {
  const slugCounts: Record<string, number> = {}
  const tocItems: Array<{ id: string; text: string; level: 2 | 3 }> = []

  // GitHub (github-slugger): lowercase, drop everything but letters, marks,
  // numbers, `_`, spaces and hyphens, then turn each space into a hyphen —
  // one per space, so "Backup + restore" is `backup--restore` there too.
  function slugify(text: string): string {
    const base = text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .trim()
      .replace(/ /g, '-')
      || 'section'
    const n = (slugCounts[base] ?? 0) + 1
    slugCounts[base] = n
    return n === 1 ? base : `${base}-${n}`
  }

  let body = html.replace(
    /<h([234])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_full, levelStr: string, attrs: string | undefined, inner: string) => {
      const level = parseInt(levelStr, 10) as 2 | 3 | 4
      // Strip HTML tags from inner for slug + TOC label.
      const text = inner.replace(/<[^>]+>/g, '').trim()
      if (!text) return _full
      // If an id already exists on the heading (rare — markdown extensions),
      // honour it. Otherwise generate.
      const hasId = attrs && /\sid=("|')/.test(attrs)
      const id = hasId
        ? attrs.match(/\sid=("|')([^"']+)\1/)![2]!
        : slugify(text)
      // h4 gets an id (so links can land on it) but stays out of the TOC.
      if (level !== 4) tocItems.push({ id, text, level })
      const safeAttrs = hasId ? attrs : `${attrs ?? ''} id="${id}"`
      const anchor = `<a href="#${id}" class="heading-anchor" aria-label="Permalink to ${escapeAttr(text)}">#</a>`
      return `<h${level}${safeAttrs}>${anchor}${inner}</h${level}>`
    },
  )

  // Wrap <pre> in .code-copy. Skip <pre class="mermaid"> — the in-page
  // script already wraps those with .oi-chart-wrap.
  body = body.replace(
    /<pre(\s[^>]*)?>([\s\S]*?)<\/pre>/g,
    (full, attrs: string | undefined, inner: string) => {
      if (attrs && /class\s*=\s*("|')[^"']*\bmermaid\b/.test(attrs)) return full
      // Strip nested <code> tags + entities to get the raw text the user
      // wants on the clipboard.
      const text = inner
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
      const dataCopy = text.replace(/"/g, '&quot;')
      return `<div class="code-copy code-copy--block"><pre${attrs ?? ''}>${inner}</pre><button type="button" class="code-copy__btn" data-copy="${dataCopy}" aria-label="Copy snippet"><i class="ph ph-copy" aria-hidden="true"></i> Copy</button></div>`
    },
  )

  // Build the TOC list.
  let toc = ''
  if (tocItems.length > 0) {
    toc = '<h3 class="toc__title">On this page</h3><ul class="toc__list">'
    for (const item of tocItems) {
      const cls = ` class="toc__link toc__link--depth-${item.level}"`
      toc += `<li><a href="#${item.id}"${cls}>${escapeHtml(item.text)}</a></li>`
    }
    toc += '</ul>'
  }
  return { body, toc }
}

function renderDirectoryListing(absDir: string, ctx: RenderContext): string {
  const dirRel = ctx.relPath.replace(/(?:^|\/)README\.md$/, '') || ''
  const sidebar = buildSidebar(ctx.docsRoot, ctx.relPath)
  const entries = readdirSync(absDir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => {
      // Directories first, then markdown, then everything else.
      const rank = (e: { isDirectory: () => boolean; name: string }) =>
        e.isDirectory() ? 0 : e.name.endsWith('.md') ? 1 : 2
      return rank(a) - rank(b) || a.name.localeCompare(b.name)
    })
  const items = entries
    .map((e) => {
      const childRel = dirRel ? `${dirRel}/${e.name}` : e.name
      const href = '/guides/' + childRel + (e.isDirectory() ? '/' : '')
      const icon = e.isDirectory()
        ? 'ph-folder'
        : e.name.endsWith('.md')
          ? 'ph-file-text'
          : 'ph-file'
      return `<li><a href="${escapeHtml(href)}"><i class="ph ${icon}" aria-hidden="true"></i><span>${escapeHtml(e.name)}</span></a></li>`
    })
    .join('\n')
  const body = `<h1>${escapeHtml(dirRel || 'Docs')}</h1>
    <p class="muted">Directory listing — no README.md was found in this folder.</p>
    <ul class="guides-listing">${items}</ul>`
  const breadcrumb = breadcrumbHtml(ctx.relPath)
  return shellHtml({
    title: dirRel || 'Docs',
    sidebar,
    body: breadcrumb + body,
    mobileSidebar: sidebar,
    canonicalPath: '/guides/' + dirRel,
  })
}

const RAW_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.txt': 'text/plain',
}

export interface RenderResult {
  status: number
  contentType?: string
  body?: string | Buffer
  /** Set on a redirect — 301 for the /platforms, /postman and /unified-api
   *  renames, 308 for the trailing-slash form of a directory. */
  redirectTo?: string
}

/**
 * Resolve `urlPath` (e.g. `/guides/architecture/persistence.md`) to a
 * rendered HTML page or a raw asset response. Caller is responsible for
 * applying the result to the Fastify reply.
 */
export function resolveGuidePath(docsRoot: string, urlPath: string): RenderResult {
  // Strip the `/guides` prefix; everything after it is treated as a path
  // under docsRoot.
  let relUrl = urlPath.replace(/^\/guides/, '')
  if (relUrl.startsWith('/')) relUrl = relUrl.slice(1)
  const decodedRel = decodeURIComponent(relUrl)

  // Permanent redirects (301) to the dedicated /platforms, /postman, and
  // /unified-api pages — these URL renames are stable, so caches and
  // crawlers should update their indexed location rather than re-fetch
  // the redirect on every hit.
  if (decodedRel === 'platforms' || decodedRel.startsWith('platforms/') ||
      decodedRel === 'providers' || decodedRel.startsWith('providers/')) {
    return { status: 301, redirectTo: '/platforms' }
  }
  if (decodedRel === 'postman' || decodedRel.startsWith('postman/')) {
    return { status: 301, redirectTo: '/postman' }
  }
  if (decodedRel === 'api-reference' || decodedRel.startsWith('api-reference/')) {
    return { status: 301, redirectTo: '/unified-api' }
  }

  // Empty path -> docs/README.md
  if (decodedRel === '' || decodedRel === '/') {
    const readme = findReadme(docsRoot)
    if (!readme) return { status: 404, contentType: 'text/html', body: renderErrorPage(docsRoot, urlPath, 404) }
    return {
      status: 200,
      contentType: 'text/html',
      body: renderMarkdownPage(readme, {
        docsRoot,
        urlPath: '/guides/',
        relPath: relative(docsRoot, readme),
      }),
    }
  }

  const absRequested = resolve(docsRoot, decodedRel)
  if (!isUnderRoot(docsRoot, absRequested) && absRequested !== docsRoot) {
    return { status: 403, contentType: 'text/html', body: renderErrorPage(docsRoot, urlPath, 403) }
  }
  if (!existsSync(absRequested)) {
    // Extensionless fallback: `/guides/architecture/services` -> `services.md`.
    // The search index strips `.md` when building each entry's url (see
    // scripts/build-search-index.ts) and the Cmd-K palette navigates straight
    // to it, so without this the majority of palette results 404 even though
    // the document exists. Rendered pages link with the `.md` suffix, which
    // still resolves above — both forms are supported deliberately.
    //
    // Checked only after the literal path misses, so a real file or directory
    // always wins over the fallback. `isUnderRoot` is re-asserted because this
    // synthesises a new path; appending a suffix cannot escape the root, but
    // the guard is cheap and keeps that property local rather than inferred.
    const withMd = `${absRequested}.md`
    if (isUnderRoot(docsRoot, withMd) && existsSync(withMd) && statSync(withMd).isFile()) {
      return {
        status: 200,
        contentType: 'text/html',
        body: renderMarkdownPage(withMd, {
          docsRoot,
          urlPath,
          relPath: relative(docsRoot, withMd),
        }),
      }
    }
    return { status: 404, contentType: 'text/html', body: renderErrorPage(docsRoot, urlPath, 404) }
  }

  const stats = statSync(absRequested)
  if (stats.isDirectory()) {
    // Always force trailing slash for directory URLs so relative links
    // resolve correctly. 308 (Permanent + preserves method) is the
    // modern choice here — the trailing-slash form is canonical and
    // browsers can safely cache the redirect.
    if (!urlPath.endsWith('/')) {
      return { status: 308, redirectTo: urlPath + '/' }
    }
    const readme = findReadme(absRequested)
    if (readme) {
      return {
        status: 200,
        contentType: 'text/html',
        body: renderMarkdownPage(readme, {
          docsRoot,
          urlPath,
          relPath: relative(docsRoot, readme),
        }),
      }
    }
    return {
      status: 200,
      contentType: 'text/html',
      body: renderDirectoryListing(absRequested, {
        docsRoot,
        urlPath,
        relPath: decodedRel,
      }),
    }
  }

  // It's a file.
  if (absRequested.endsWith('.md')) {
    return {
      status: 200,
      contentType: 'text/html',
      body: renderMarkdownPage(absRequested, {
        docsRoot,
        urlPath,
        relPath: relative(docsRoot, absRequested),
      }),
    }
  }
  // Raw asset (image / json / yaml / html / etc.)
  const ext = absRequested.slice(absRequested.lastIndexOf('.')).toLowerCase()
  return {
    status: 200,
    contentType: RAW_MIME[ext] ?? 'application/octet-stream',
    body: readFileSync(absRequested),
  }
}
