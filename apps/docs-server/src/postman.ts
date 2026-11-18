/**
 * Dedicated Postman page rendered at /postman.
 *
 * Shows the unified collection's metadata, a one-click "Run in Postman"
 * button (works only when the collection JSON is reachable from the
 * Postman cloud — i.e. a publicly hosted docs-server), plus direct
 * download links for the collection + the two pre-built environments.
 */
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { BRANDING_HEAD_LINKS } from './branding.js'
import { NAV_STYLES, renderHeader } from './header.js'
import {
  SEARCH_PALETTE_HTML,
  SEARCH_PALETTE_SCRIPT,
  SEARCH_PALETTE_STYLES,
} from './search-palette.js'

const HEAD = `
  <link rel="stylesheet" href="/design/tokens.css">
  <link rel="stylesheet" href="/design/base.css">
  <link rel="stylesheet" href="/design/components.css">
  <link rel="icon" href="/design/logo/mark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/design/logo/mark-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
  ${BRANDING_HEAD_LINKS}
  <link rel="stylesheet" href="/design/vendor/phosphor/regular/style.css">
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
    }
  </script>
  <style>${NAV_STYLES}</style>
  <style>${SEARCH_PALETTE_STYLES}</style>
`

const STYLES = `
  body { background: var(--paper); color: var(--fg-1); }

  .pm-main { max-width: var(--content-max); margin: 0 auto; padding: var(--space-10) var(--space-6); }
  .pm-hero { margin-bottom: var(--space-8); }
  .pm-hero h1 { font-size: var(--text-3xl); letter-spacing: var(--tracking-tight); margin: var(--space-2) 0 var(--space-3); }
  .pm-hero p { color: var(--fg-2); max-width: 64ch; }

  .pm-card {
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-5) var(--space-6);
    margin-bottom: var(--space-4);
  }
  .pm-card h2 { margin: 0 0 var(--space-3); font-size: var(--text-lg); }
  .pm-card p { margin: 0 0 var(--space-3); color: var(--fg-2); font-size: var(--text-sm); line-height: var(--leading-relaxed); }
  .pm-card ol { margin: 0 0 var(--space-2) var(--space-5); padding: 0; color: var(--fg-1); font-size: var(--text-sm); line-height: var(--leading-relaxed); }
  .pm-card ol li { margin: var(--space-2) 0; }

  .pm-meta { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: var(--space-2) 0 var(--space-5); color: var(--fg-3); font-size: var(--text-xs); }
  .pm-meta .chip {
    display: inline-flex; align-items: center; gap: 4px;
    height: 22px; padding: 0 8px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
    color: var(--fg-3);
    font-weight: 500;
  }

  .pm-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); }
  .pm-button-host { min-height: 44px; }

  .pm-files { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
  .pm-file {
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--fg-1);
    text-decoration: none;
    font-size: var(--text-sm);
  }
  .pm-file:hover { border-color: var(--border-default); background: var(--surface-0); }
  .pm-file i { font-size: 22px; color: var(--fg-3); }
  .pm-file__name { font-weight: 500; }
  .pm-file__hint { color: var(--fg-3); font-size: var(--text-xs); display: block; margin-top: 2px; }

  pre.pm-code {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    overflow-x: auto;
    color: var(--fg-1);
  }

  .pm-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  @media (max-width: 880px) {
    .pm-grid { grid-template-columns: 1fr; }
  }

  details.pm-cli {
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-6);
  }
  details.pm-cli > summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--fg-1);
    list-style: none;
    display: flex; align-items: center; gap: var(--space-2);
  }
  details.pm-cli > summary::-webkit-details-marker { display: none; }
  details.pm-cli > summary::before {
    content: '\\203A';
    color: var(--fg-3);
    transition: transform var(--motion-fast, 120ms);
    display: inline-block;
  }
  details.pm-cli[open] > summary::before { transform: rotate(90deg); }
  details.pm-cli > *:not(summary) { margin-top: var(--space-4); }
`

interface CollectionInfo {
  name: string
  description?: string
  itemCount: number
}

interface PostmanFile {
  url: string
  filename: string
  bytes: number
  label: string
  hint: string
}

export interface PostmanRenderOptions {
  /** Absolute path to docs/postman/ on disk. */
  postmanDir: string
  /** URL prefix where the postman files are served (e.g. `/specs/postman`). */
  filesBaseUrl: string
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function readCollectionInfo(absPath: string): CollectionInfo | null {
  if (!existsSync(absPath)) return null
  try {
    const json = JSON.parse(readFileSync(absPath, 'utf8')) as {
      info?: { name?: string; description?: string }
      item?: unknown[]
    }
    return {
      name: json.info?.name ?? 'OpenSteward',
      description: json.info?.description ?? '',
      itemCount: Array.isArray(json.item) ? json.item.length : 0,
    }
  } catch {
    return null
  }
}

function fileEntry(
  absPath: string,
  baseUrl: string,
  label: string,
  hint: string,
): PostmanFile | null {
  if (!existsSync(absPath)) return null
  const filename = path.basename(absPath)
  const bytes = readFileSync(absPath).length
  return {
    url: `${baseUrl.replace(/\/$/, '')}/${filename}`,
    filename,
    bytes,
    label,
    hint,
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function renderPostmanPage(opts: PostmanRenderOptions): string {
  const collectionPath = path.join(opts.postmanDir, 'openapi.postman_collection.json')
  const localEnvPath = path.join(opts.postmanDir, 'openapi-local.postman_environment.json')
  const prodEnvPath = path.join(opts.postmanDir, 'openapi-production.postman_environment.json')
  const testEnvPath = path.join(opts.postmanDir, 'openapi-test.postman_environment.json')

  const info = readCollectionInfo(collectionPath)
  const files = [
    fileEntry(collectionPath, opts.filesBaseUrl, 'Collection', 'Every /v1/* path, grouped by tag.'),
    fileEntry(
      localEnvPath,
      opts.filesBaseUrl,
      'Local env',
      'baseUrl=http://localhost:3010, basePath=/v1',
    ),
    fileEntry(
      prodEnvPath,
      opts.filesBaseUrl,
      'Production env',
      'baseUrl=https://your-deployment.example.com, basePath=/v1',
    ),
    // Same collection, one variable different. There is no separate sandbox
    // collection to keep in sync — that is the whole reason the versioned
    // requests are built as `{{baseUrl}}{{basePath}}<path>`.
    fileEntry(
      testEnvPath,
      opts.filesBaseUrl,
      'Sandbox env',
      'baseUrl=http://localhost:3010, basePath=/test/v1 — synthetic data, needs an osk_test_ key',
    ),
  ].filter((f): f is PostmanFile => f !== null)

  const collectionFile = files.find((f) => f.filename.endsWith('collection.json'))
  const collectionUrlForButton = collectionFile?.url ?? ''

  const meta = info
    ? `<div class="pm-meta">
      <span class="chip"><i class="ph ph-package" aria-hidden="true"></i>${escapeHtml(info.name)}</span>
      <span class="chip"><i class="ph ph-folder-notch" aria-hidden="true"></i>${info.itemCount} folders</span>
    </div>`
    : ''

  const fileCards = files
    .map(
      (f) => `<a class="pm-file" href="${escapeHtml(f.url)}" download>
        <i class="ph ph-download-simple" aria-hidden="true"></i>
        <div>
          <span class="pm-file__name">${escapeHtml(f.label)}</span>
          <span class="pm-file__hint">${escapeHtml(f.filename)} · ${escapeHtml(formatBytes(f.bytes))} · ${escapeHtml(f.hint)}</span>
        </div>
      </a>`,
    )
    .join('\n')

  const description = info?.description
    ? `<p>${escapeHtml(info.description.split('\n')[0])}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Postman - Documentation - OpenSteward</title>
  ${HEAD}
  <style>${STYLES}</style>
</head>
<body>
  ${renderHeader()}
  <main class="pm-main">
    <div class="pm-hero">
      <div class="eyebrow">Postman</div>
      <h1>Run the unified API from Postman</h1>
      ${description}
      ${meta}
    </div>

    <div class="pm-grid">
      <section class="pm-card">
        <h2>One-click import</h2>
        <p>Opens the collection inside the Postman web client. Only works when the docs-server is reachable from the public internet — on localhost the Postman cloud cannot fetch the JSON.</p>
        <div class="pm-actions">
          <div class="pm-button-host" data-postman-action="collection/import" data-postman-var-1="${escapeHtml(collectionUrlForButton)}">
            <a href="https://www.postman.com/" class="btn btn--secondary" target="_blank" rel="noreferrer noopener">
              <i class="ph ph-arrow-square-out" aria-hidden="true"></i>&nbsp;Open Postman
            </a>
          </div>
        </div>
      </section>

      <section class="pm-card">
        <h2>Download the files</h2>
        <p>Drop these straight into Postman: <strong>File → Import</strong> and pick the collection plus whichever environment you need.</p>
        <div class="pm-files">${fileCards}</div>
      </section>
    </div>

    <details class="pm-cli">
      <summary>Manual import (CLI)</summary>
      <ol>
        <li>Save the JSON files anywhere on your machine.</li>
        <li>Open Postman desktop or web → <strong>File → Import → Files</strong>.</li>
        <li>Drop the collection + the environment(s) onto the import dialog. Postman parses both and links them automatically.</li>
        <li>Pick an environment from the top-right dropdown — <span class="mono">openapi-local</span> targets the docker-compose stack, <span class="mono">openapi-production</span> needs a custom <span class="mono">baseUrl</span> + <span class="mono">apiKey</span>, and <span class="mono">openapi-test</span> points the same requests at the sandbox.</li>
        <li>Set the <span class="mono">apiKey</span> environment variable to a real <span class="mono">osk_…</span> developer key (mint one in the admin UI under Admin → API keys).</li>
        <li><span class="mono">basePath</span> prefixes the versioned requests and defaults to <span class="mono">/v1</span>. The unversioned routes (<span class="mono">/admin/*</span>, <span class="mono">/auth/*</span>, <span class="mono">/health</span>) do not use it, so leave it alone unless you are targeting a different API version.</li>
        <li>The sandbox environment is that same variable set to <span class="mono">/test/v1</span>, plus an <span class="mono">osk_test_…</span> key — no OAuth, no upstream account, and no outbound calls. The unversioned routes are not mounted there, so those requests keep pointing at the live surface.</li>
      </ol>
      <p>Or grab them straight from your terminal:</p>
      <pre class="pm-code">${files.map((f) => `curl -O ${f.url}`).join('\n')}</pre>
    </details>
  </main>

  <script
    data-postman-script="postman-button"
    src="https://run.pstmn.io/button.js"
    defer
  ></script>
  ${SEARCH_PALETTE_HTML}
  <script>${SEARCH_PALETTE_SCRIPT}</script>
</body>
</html>`
}
