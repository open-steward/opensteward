import {
  createBaseServer,
  createVersionRouter,
  buildServersBlock,
  resolveLogoConfig,
  registerLogoProxy,
  RuntimeSettingsClient,
  SETTING,
  type LogoConfig,
  type OpenApiServersConfig,
} from '@opensteward/shared'
import staticPlugin from '@fastify/static'
// js-yaml 5 removed its default export. A namespace import is the form that
// works under BOTH native ESM (docs-server compiles to nodenext) and the
// CommonJS interop the other apps emit — a default import crashes the
// former at boot with "does not provide an export named 'default'".
import * as yaml from 'js-yaml'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import type { FastifyInstance } from 'fastify'
import { designSystemRoot } from '@opensteward/design-system'
import { renderPlatformsBody, VERTICAL_OPENAPI_TAG, type VerticalKey } from '@opensteward/platforms-ui'
import { renderIntegrateCoveragePage, resolveGuidePath } from './guides.js'
import { BRANDING_HEAD_LINKS, registerBrandingRoutes } from './branding.js'
import { NAV_STYLES, renderHeader } from './header.js'
import { operatorApiPlugin } from './operator-api.js'
import { renderPostmanPage } from './postman.js'
import { renderSwaggerReference } from './swagger-reference.js'
import {
  SEARCH_PALETTE_HTML,
  SEARCH_PALETTE_SCRIPT,
  SEARCH_PALETTE_STYLES,
} from './search-palette.js'

export interface BuildServerOptions {
  docsDir: string
  providersDir?: string
  /** Repo `docs/` directory rendered at /guides/. */
  guidesDir?: string
}

const VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

export const SPEC_JSON_URL = '/specs/openapi.json'
export const SPEC_YAML_URL = '/specs/openapi.yaml'

export function hasUnifiedSpec(docsDir: string): boolean {
  return existsSync(path.join(docsDir, 'openapi.json'))
}

/**
 * Pull operator-overrideable server variables from the integration-server.
 * 60 s in-memory TTL, fail-open: any error returns null so handlers fall
 * back to the on-disk spec's compiled defaults via
 * `buildServersBlock(undefined)`. Never throws.
 *
 * Configured at boot via `INTEGRATION_SERVER_URL` env var; unset → never
 * fetches (always returns null). The fetch path is plain `fetch()` — no
 * auth, no body.
 */
const SERVER_VARIABLES_TTL_MS = 60_000
let serverVariablesCache: { value: OpenApiServersConfig | null; fetchedAt: number } | null = null
export async function fetchServerVariables(): Promise<OpenApiServersConfig | null> {
  const base = process.env['INTEGRATION_SERVER_URL']
  if (!base) return null
  const now = Date.now()
  if (serverVariablesCache && now - serverVariablesCache.fetchedAt < SERVER_VARIABLES_TTL_MS) {
    return serverVariablesCache.value
  }
  try {
    const url = base.replace(/\/+$/, '') + '/openapi/server-variables'
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) })
    if (!res.ok) throw new Error(`integration-server returned ${res.status}`)
    const body = (await res.json()) as OpenApiServersConfig
    serverVariablesCache = { value: body, fetchedAt: now }
    return body
  } catch {
    // Fail-open: don't disturb served docs because of a transient outage.
    serverVariablesCache = { value: null, fetchedAt: now }
    return null
  }
}

/** Test-only: reset the in-memory cache so unit tests start fresh. */
export function _resetServerVariablesCache(): void {
  serverVariablesCache = null
}

/**
 * Build a Postman-env-friendly `baseUrl` string from the admin-DB-merged
 * server variables. Mirrors the spec's URL template (`{scheme}://{host}:
 * {port}`) but omits the port when it's the scheme's well-known default
 * (`:443` for https, `:80` for http) so the value reads cleanly in the
 * Postman environment editor.
 *
 * Falls back to `http://localhost:3010` (the compiled default) when no
 * overrides are available — never undefined, so the Postman env file
 * always has a value the user can hit.
 */
export function composePostmanBaseUrl(overrides: OpenApiServersConfig | null): string {
  const scheme = overrides?.scheme?.default ?? 'http'
  const host = overrides?.host?.default ?? 'localhost'
  const port = overrides?.port?.default ?? '3010'
  const omitPort = (scheme === 'https' && port === '443') || (scheme === 'http' && port === '80')
  return omitPort ? `${scheme}://${host}` : `${scheme}://${host}:${port}`
}

// Tag rail data is computed client-side from /specs/openapi.json
// (see swaggerHtml below) so it reflects the live spec without a
// server restart.

const HEAD = `
  <link rel="stylesheet" href="/design/tokens.css">
  <link rel="stylesheet" href="/design/base.css">
  <link rel="stylesheet" href="/design/components.css">
  <link rel="icon" href="/design/logo/mark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/design/logo/mark-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/png" sizes="32x32" href="/design/logo/icons/icon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/design/logo/icons/icon-16.png">
  <link rel="apple-touch-icon" href="/design/logo/icons/apple-touch-icon.png">
  <link rel="manifest" href="/design/logo/site.webmanifest">
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
        btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
      })
      document.dispatchEvent(new CustomEvent('os-theme-change', { detail: { theme: next } }))
    }
  </script>
  <style>${NAV_STYLES}</style>
  <style>${SEARCH_PALETTE_STYLES}</style>
`

const LOGO_ROW_PROVIDERS: Array<{ label: string; vertical: string }> = [
  { label: 'Shopify', vertical: 'ecommerce' },
  { label: 'QuickBooks', vertical: 'accounting' },
  { label: 'Xero', vertical: 'accounting' },
  { label: 'EasyPost', vertical: 'logistics' },
  { label: 'FedEx', vertical: 'logistics' },
  { label: 'Salesforce', vertical: 'crm' },
  { label: 'HubSpot', vertical: 'crm' },
  { label: 'Stripe', vertical: 'payments' },
  { label: 'PayPal', vertical: 'payments' },
  { label: 'DocuSign', vertical: 'docsign' },
  { label: 'Asana', vertical: 'projects' },
  { label: 'Zendesk', vertical: 'customer-support' },
  { label: 'Cin7', vertical: 'inventory' },
]

// Adapter counts are hand-maintained here and must match each vertical's
// `platforms/metadata.ts`, the source both generated catalogues derive from:
// `docs/openapi/platform-slugs.json` (served at /specs/, read by the
// Unified API's vertical cascade) and `docs/platforms/platforms.json`
// (served at /data/platforms/, read by the /platforms page).
const VERTICAL_BLURB: Record<string, string> = {
  accounting: 'Invoices, contacts, accounts, transactions. 281 adapters.',
  crm: 'Contacts, deals, companies, activities. 152 adapters.',
  ecommerce: 'Products, orders, customers, fulfilments. 176 adapters.',
  logistics: 'Shipments, carriers, rates, labels. 320 adapters.',
  payments: 'Charges, refunds, subscriptions, payouts. 159 adapters.',
  docsign: 'Envelopes, documents, signers, templates. 116 adapters.',
  projects: 'Projects, tasks, comments, workspaces. 116 adapters.',
  'customer-support': 'Tickets, messages, contacts, macros. 105 adapters.',
  inventory: 'Products, locations, stock levels, transfers. 123 adapters.',
}

function verticalTileClass(name: string): string {
  // Every vertical in VERTICALS has a matching `.vtile--{stem}` modifier in
  // components.css (and a `--vertical-{stem}` token). Don't truncate to a
  // subset — that leaves docsign/projects/customer-support/inventory tiles
  // uncoloured.
  return VERTICALS.includes(name) ? `vtile vtile--lg vtile--${name}` : 'vtile vtile--lg'
}

const VERTICAL_LABEL_OVERRIDES: Record<string, string> = {
  crm: 'CRM',
  'customer-support': 'Customer support',
  api: 'API',
  sdk: 'SDK',
}

function verticalLabel(name: string): string {
  if (!name) return ''
  if (VERTICAL_LABEL_OVERRIDES[name]) return VERTICAL_LABEL_OVERRIDES[name]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * OpenAPI tag name for a vertical. `/unified-api#tag/<tag>` only deep-links
 * when the fragment matches `tags[].name` in the generated spec exactly, and
 * the tag is not always the display label (customer-support is one word in
 * the spec). The table lives in @opensteward/platforms-ui so the catalogue's
 * per-card API links and these landing cards cannot drift apart.
 */
function verticalTag(name: string): string {
  return VERTICAL_OPENAPI_TAG[name as VerticalKey] ?? verticalLabel(name)
}

/**
 * /unified-api page — the developer API, on the shared Swagger reference
 * shell (see swagger-reference.ts for the sidebar, filtering and theming;
 * /operator-api renders on the same shell so the two look and behave alike).
 *
 * "Try it out" is enabled, but it calls the integration-server on a
 * different origin, so the browser preflights every request. The API sends
 * no `Access-Control-*` headers unless the operator opts in via
 * `CORS_ORIGIN` (comma-separated origin list) on integration-server;
 * docker-compose defaults it to this server's origin. Without it the console
 * renders fine and every call is blocked before it arrives.
 *
 * The function takes no arguments — the spec is fetched client-side so the
 * sidebar reflects the live spec without a server restart.
 */
export function swaggerHtml(): string {
  return renderSwaggerReference({
    title: 'Unified API',
    head: HEAD,
    specJsonUrl: SPEC_JSON_URL,
    anchorLinks: [
      { href: SPEC_JSON_URL, label: 'openapi.json', className: 'mono' },
      { href: SPEC_YAML_URL, label: 'openapi.yaml', className: 'mono' },
    ],
    groupNoun: 'vertical',
    groupsEyebrow: 'Verticals',
    // Only this API has operations taking `vertical` + `platform`, and only
    // it serves /specs/platform-slugs.json for the cascade to read.
    adapterCascade: true,
  })
}

export function landingHtml(hasSpec: boolean): string {
  // Vertical cards link two ways: to the /platforms catalog opened on that
  // vertical's pill (`#vertical=<slug>`, read by @opensteward/platforms-ui),
  // and to the unified Swagger UI's tag for that vertical (e.g.
  // `/unified-api#tag/Accounting`) — Swagger's deepLinking scrolls to and
  // expands the matching tag group. The title stays on the tag: this section
  // is about the API's shape, and the blurb lists that vertical's resources.
  const verticalCards = VERTICALS.map((name) => {
    const label = verticalLabel(name)
    const blurb = VERTICAL_BLURB[name] ?? 'Unified REST API across every platform in this vertical.'
    const tagAnchor = `/unified-api#tag/${verticalTag(name)}`
    const adaptersHref = `/platforms#vertical=${name}`
    return `
    <article class="vertical-card">
      <span class="${verticalTileClass(name)}">${label.slice(0, 2)}</span>
      <div class="vertical-card__body-col">
        <a class="vertical-card__title-link" href="${tagAnchor}">${label}</a>
        <p class="vertical-card__body">${blurb}</p>
        <div class="vertical-card__meta">
          <a href="${adaptersHref}" class="mono">Browse ${label} adapters</a>
          <span class="muted">·</span>
          <a href="${tagAnchor}" class="mono">View endpoints</a>
        </div>
      </div>
    </article>`
  }).join('\n')
  const hasSpecs = hasSpec

  const emptyState = `
    <div class="card" style="text-align: center; padding: var(--space-8);">
      <p class="muted">No OpenAPI specs found. Generate them with <code class="mono">pnpm docs:all</code>.</p>
    </div>
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation - OpenSteward</title>
  ${HEAD}
  <style>
    .marketing { max-width: var(--content-max); margin: 0 auto; padding: var(--space-12) var(--space-6); }

    .hero { padding: var(--space-16) 0 var(--space-12); text-align: center; }
    .hero__eyebrow { margin-bottom: var(--space-4); }
    .hero h1 { font-size: var(--text-5xl); line-height: 1.05; letter-spacing: -0.03em; margin: 0 auto var(--space-4); max-width: 18ch; }
    .hero__lead { font-size: var(--text-xl); color: var(--fg-2); max-width: 56ch; margin: 0 auto var(--space-6); }
    .hero__actions { display: inline-flex; gap: var(--space-3); }

    .install {
      background: var(--surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-5) var(--space-6);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--fg-1);
      max-width: 640px;
      margin: 0 auto;
      text-align: left;
      overflow-x: auto;
    }

    .section { margin-top: var(--space-16); }
    .section__head { text-align: center; margin-bottom: var(--space-8); }
    .section__head .eyebrow { margin-bottom: var(--space-2); }
    .section__head h2 { font-size: var(--text-3xl); margin: 0 auto var(--space-3); max-width: 24ch; }
    .section__head p { color: var(--fg-2); max-width: 56ch; margin: 0 auto; }

    .verticals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--space-4);
    }
    .vertical-card {
      display: flex; gap: var(--space-4);
      padding: var(--space-5);
      background: var(--surface-0);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--fg-1);
      transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
    }
    .vertical-card:hover { border-color: var(--border-strong); }
    .vertical-card__body-col { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .vertical-card__title-link {
      font-size: var(--text-lg); font-weight: 600; color: var(--fg-1); text-decoration: none;
    }
    .vertical-card__title-link:hover { color: var(--accent-fg); }
    .vertical-card__body { color: var(--fg-2); font-size: var(--text-sm); margin: var(--space-1) 0 var(--space-3); }
    .vertical-card__meta { display: flex; gap: var(--space-2); align-items: center; font-size: var(--text-sm); flex-wrap: wrap; }
    .vertical-card__meta a { color: var(--accent-fg); }

    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-5); }
    .feature { padding: 0; }
    .feature__icon { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; background: var(--accent-100); color: var(--accent-700); border-radius: var(--radius-md); margin-bottom: var(--space-3); font-size: 18px; }
    .feature__title { font-weight: 600; margin-bottom: var(--space-1); }
    .feature__body { color: var(--fg-2); font-size: var(--text-sm); }

    footer.marketing-footer {
      border-top: 1px solid var(--border-subtle);
      padding: var(--space-8) var(--space-6);
      color: var(--fg-3);
      font-size: var(--text-sm);
      max-width: var(--content-max);
      margin: var(--space-16) auto 0;
      display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4);
    }

    /* Trust row — platform placeholder tiles under hero */
    .trust-row { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-3); padding: var(--space-6) 0 0; }
    .trust-tile { display: inline-flex; align-items: center; gap: var(--space-2); padding: 6px 12px 6px 8px; background: var(--surface-0); border: 1px solid var(--border-subtle); border-radius: var(--radius-full); font-size: var(--text-sm); color: var(--fg-2); }
    .trust-tile .vtile { width: 22px; height: 22px; font-size: 9px; border-radius: var(--radius-sm); }
    .trust-row__label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-caps); color: var(--fg-3); text-align: center; margin-bottom: var(--space-4); }

    /* Status chip — version + operational dot, sits next to the hero eyebrow */
    .status-chip {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: 4px 10px;
      background: var(--surface-0);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      color: var(--fg-2);
      font-family: var(--font-mono);
    }
    .status-chip__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--success, #16a34a);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--success, #16a34a) 60%, transparent);
      animation: status-chip-pulse 1800ms ease-out infinite;
    }
    @keyframes status-chip-pulse {
      0%   { box-shadow: 0 0 0 0   color-mix(in srgb, var(--success, #16a34a) 60%, transparent); }
      70%  { box-shadow: 0 0 0 6px color-mix(in srgb, var(--success, #16a34a) 0%,  transparent); }
      100% { box-shadow: 0 0 0 0   color-mix(in srgb, var(--success, #16a34a) 0%,  transparent); }
    }
    .status-chip__sep { color: var(--fg-4); }

    /* Responsive */
    @media (max-width: 780px) {
      .marketing { padding: var(--space-8) var(--space-4); }
      .hero { padding: var(--space-10) 0 var(--space-6); }
      .hero h1 { font-size: var(--text-3xl); }
      .hero__lead { font-size: var(--text-md); }
      .hero__actions { flex-direction: column; gap: var(--space-2); }
      .hero__actions .btn { width: 100%; justify-content: center; }
      .section__head h2 { font-size: var(--text-2xl); }
      .install { font-size: 12px; padding: var(--space-3) var(--space-4); }
      .verticals { grid-template-columns: 1fr; }
      .features { grid-template-columns: 1fr 1fr; }
      footer.marketing-footer { flex-direction: column; gap: var(--space-2); align-items: flex-start; }
    }
    @media (max-width: 480px) {
      .features { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderHeader({
    anchorLinks: [
      { href: '#verticals', label: 'Verticals' },
      { href: '#business-cases', label: 'Industries' },
      { href: '#features', label: 'Features' },
    ],
  })}

  <section class="marketing hero">
    <div class="eyebrow hero__eyebrow">
      <span class="status-chip"><span class="status-chip__dot" aria-hidden="true"></span>v1.0 <span class="status-chip__sep">·</span> operational</span>
      <span style="margin-left: var(--space-3);">Source available · Elastic-2.0 · self-hosted</span>
    </div>
    <h1>Your customers' data. On your servers.</h1>
    <p class="hero__lead">Unified REST API across accounting, CRM, e-commerce, logistics, payments, e-signature, project management, customer support, and inventory. 1,548 adapters, one canonical schema, and nothing between your app and the upstream platform.</p>
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="/unified-api">Browse the Unified API</a>
      <a class="btn btn--secondary btn--lg" href="https://github.com/open-steward/opensteward">Read the code</a>
    </div>
  </section>

  <section class="marketing" style="padding-top: 0;">
    <div class="code-tabs" role="tablist" aria-label="Install" style="max-width: 720px; margin: 0 auto;">
      <div class="code-tabs__bar">
        <button type="button" role="tab" class="code-tabs__btn" aria-selected="true" data-tab="docker">docker</button>
        <button type="button" role="tab" class="code-tabs__btn" aria-selected="false" data-tab="pnpm">pnpm</button>
        <button type="button" role="tab" class="code-tabs__btn" aria-selected="false" data-tab="curl">curl</button>
        <button type="button" class="code-tabs__copy" data-tabs-copy aria-label="Copy snippet"><i class="ph ph-copy" aria-hidden="true"></i> Copy</button>
      </div>
      <div class="code-tabs__panel" data-active="true" data-panel="docker"><pre><code>git clone https://github.com/open-steward/opensteward.git
cd opensteward
docker compose up --build</code></pre></div>
      <div class="code-tabs__panel" data-active="false" data-panel="pnpm"><pre><code>pnpm install
pnpm docs:all
pnpm dev:integration-server</code></pre></div>
      <div class="code-tabs__panel" data-active="false" data-panel="curl"><pre><code>curl -fsSL https://raw.githubusercontent.com/open-steward/opensteward/main/docker-compose.yml -o docker-compose.yml
docker compose up --build</code></pre></div>
    </div>

    <div class="trust-row__label" style="margin-top: var(--space-10)">Works with the platforms you already use</div>
    <div class="trust-row">
      ${LOGO_ROW_PROVIDERS.map(
        (p) => `
        <span class="trust-tile"><span class="${verticalTileClass(p.vertical).replace('vtile--lg ', '')}">${p.label.slice(0, 1)}</span>${p.label}</span>
      `,
      ).join('')}
      <span class="trust-tile" style="color: var(--fg-3);">+ 1,535 more</span>
    </div>
  </section>

  <section class="marketing section" id="verticals">
    <div class="section__head">
      <div class="eyebrow">Verticals</div>
      <h2>One shape for every platform</h2>
      <p>Each vertical ships a canonical Zod-validated schema. Platform-specific fields are preserved on the <code class="mono">metadata</code> field. Full upstream payloads for payments (<code class="mono">raw</code>) and accounting (<code class="mono">metadata</code>) are opt-in via <code class="mono">data_store.raw_payload.*</code> — off by default — and card security codes are always stripped.</p>
    </div>
    <div class="verticals">
      ${hasSpecs ? verticalCards : emptyState}
    </div>
    <div style="text-align: center; margin-top: var(--space-6);">
      <a class="btn btn--secondary" href="/platforms">Browse all 1,548 platforms →</a>
    </div>
  </section>

  <section class="marketing section" id="business-cases">
    <div class="section__head">
      <div class="eyebrow">Industry playbooks</div>
      <h2>For regulated industries</h2>
      <p>Two industries that pay the highest price for getting integration wrong. Each playbook covers the workflows, the compliance lever, and the gaps — honestly.</p>
    </div>
    <div class="verticals">
      <article class="vertical-card">
        <span class="vtile vtile--lg vtile--accounting">B</span>
        <div class="vertical-card__body-col">
          <a class="vertical-card__title-link" href="/guides/business-cases/banks.md">For banks</a>
          <p class="vertical-card__body">Customer-360 over every payment + accounting platform your borrowers use. KYC-friendly consent. Internal AI risk agents without exposing prod DBs.</p>
          <div class="vertical-card__meta">
            <a href="/guides/business-cases/banks.md" class="mono">read the bank playbook</a>
          </div>
        </div>
      </article>
      <article class="vertical-card">
        <span class="vtile vtile--lg vtile--payments">I</span>
        <div class="vertical-card__body-col">
          <a class="vertical-card__title-link" href="/guides/business-cases/insurance.md">For insurance</a>
          <p class="vertical-card__body">Pre-fill claims and underwriting from policyholders' accounting + commerce + logistics data. Broker dashboards across CRMs. AI underwriting copilots on read-only data.</p>
          <div class="vertical-card__meta">
            <a href="/guides/business-cases/insurance.md" class="mono">read the insurance brief</a>
          </div>
        </div>
      </article>
    </div>
    <div style="text-align: center; margin-top: var(--space-6);">
      <a class="btn btn--secondary" href="/guides/business-cases/">All industry playbooks →</a>
    </div>
  </section>

  <section class="marketing section" id="features">
    <div class="section__head">
      <div class="eyebrow">Why OpenSteward</div>
      <h2>Built in the open. Yours to run.</h2>
    </div>
    <div class="features">
      <div class="feature">
        <div class="feature__icon"><i class="ph ph-shield-check"></i></div>
        <div class="feature__title">Data sovereignty</div>
        <p class="feature__body">Customer data flows directly between your app and the upstream platform. Nothing passes through a third-party proxy.</p>
      </div>
      <div class="feature">
        <div class="feature__icon"><i class="ph ph-coins"></i></div>
        <div class="feature__title">No per-call pricing</div>
        <p class="feature__body">Flat infrastructure cost. A single instance handles millions of syncs per month.</p>
      </div>
      <div class="feature">
        <div class="feature__icon"><i class="ph ph-code-simple"></i></div>
        <div class="feature__title">Type-safe end-to-end</div>
        <p class="feature__body">TypeScript strict + Zod validation at every boundary. Around 84,000 tests.</p>
      </div>
      <div class="feature">
        <div class="feature__icon"><i class="ph ph-gear-six"></i></div>
        <div class="feature__title">Extensible</div>
        <p class="feature__body">Add adapters or entire verticals. The scaffold CLI gets you a new adapter in one command.</p>
      </div>
    </div>
  </section>

  <footer class="marketing-footer">
    <div>© 2026 Falco Consulting AB · Elastic-2.0</div>
    <div>Self-hosted · <a href="https://github.com/open-steward/opensteward" style="color: var(--fg-2);">Source on GitHub</a></div>
  </footer>
  <script>
    (function () {
      document.querySelectorAll('.code-tabs').forEach(function (tabs) {
        var btns = tabs.querySelectorAll('.code-tabs__btn');
        var panels = tabs.querySelectorAll('.code-tabs__panel');
        var copy = tabs.querySelector('[data-tabs-copy]');
        function activate(name) {
          btns.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'); });
          panels.forEach(function (p) { p.setAttribute('data-active', p.dataset.panel === name ? 'true' : 'false'); });
        }
        btns.forEach(function (b) { b.addEventListener('click', function () { activate(b.dataset.tab); }); });
        if (copy) copy.addEventListener('click', function () {
          var active = tabs.querySelector('.code-tabs__panel[data-active="true"] pre code');
          if (!active) return;
          navigator.clipboard.writeText(active.textContent || '').then(function () {
            copy.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i> Copied';
            setTimeout(function () { copy.innerHTML = '<i class="ph ph-copy" aria-hidden="true"></i> Copy'; }, 1600);
          });
        });
      });
    })();
  </script>
  ${SEARCH_PALETTE_HTML}
  <script>${SEARCH_PALETTE_SCRIPT}</script>
</body>
</html>`
}

/**
 * @param logoConfig Resolved logo settings. Passed in rather than read here so
 *   the caller can layer the operator's admin-saved values over the
 *   environment; `resolveLogoConfig()` with no argument reads the
 *   environment alone.
 */
export function providersHtml(logoConfig: LogoConfig = resolveLogoConfig()): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Platforms - Documentation - OpenSteward</title>
  ${HEAD}
  <style>
    body { background: var(--paper); color: var(--fg-1); }
    footer.providers-footer {
      border-top: 1px solid var(--border-subtle);
      margin-top: var(--space-16);
      padding: var(--space-8) var(--space-6);
      max-width: var(--content-max);
      margin-left: auto;
      margin-right: auto;
      color: var(--fg-3);
      font-size: var(--text-sm);
      display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4);
    }
  </style>
</head>
<body>
  ${renderHeader()}

  ${renderPlatformsBody({
    dataUrl: '/data/platforms/platforms.json',
    logoBasePath: '/data/platforms/logos',
    showOverlay: false,
    apiTagBase: '/unified-api#tag/',
    // Logos are not shipped; the logo source decides whether this deployment
    // loads any. Default 'none' means a self-hosted docs-server makes no
    // third-party request — see docs/operations/platform-logos.md.
    ...logoConfig,
  })}

  <footer class="providers-footer">
    <div>© 2026 Falco Consulting AB · Elastic-2.0</div>
    <div>Self-hosted · <a href="https://github.com/open-steward/opensteward" style="color: var(--fg-2);">Source on GitHub</a></div>
  </footer>
  ${SEARCH_PALETTE_HTML}
  <script>${SEARCH_PALETTE_SCRIPT}</script>
</body>
</html>`
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const fastify = await createBaseServer({ contentSecurityPolicy: false })

  // Operator-managed logo settings, polled from admin-api.
  //
  // The admin and this service render the same catalog component, so they must
  // agree on the logo source or the two pages disagree about whether logos
  // exist at all. 15s rather than the client's 60s default because the
  // interactive loop is "save the setting, reload the catalog, expect logos" —
  // a minute of monogram tiles reads as broken.
  //
  // No push-invalidation hook: docs-server runs multiple replicas behind one
  // Service, so a single refresh POST would reach one pod and leave the others
  // stale — non-deterministic where TTL polling converges.
  const runtimeSettings = new RuntimeSettingsClient({
    adminApiUrl: process.env['ADMIN_API_URL'] ?? null,
    serviceSecret: process.env['SERVICE_SECRET'] ?? null,
    ttlMs: 15_000,
    logger: { warn: (msg, err) => fastify.log.warn({ err }, `[runtime-settings] ${msg}`) },
  })
  await runtimeSettings.start()
  fastify.addHook('onClose', async () => runtimeSettings.stop())

  /**
   * Effective logo config: admin-saved values layered over the environment.
   * `getString(key, '')` returns '' on a cold or failed cache, and an empty
   * override falls through to the env var — so an unreachable admin-api
   * degrades to env-only configuration.
   */
  const logoConfig = (): LogoConfig =>
    resolveLogoConfig(
      {
        source: runtimeSettings.getString(SETTING.LOGOS_SOURCE, ''),
        brandfetchClientId: runtimeSettings.getString(SETTING.LOGOS_BRANDFETCH_CLIENT_ID, ''),
      },
      { warn: (msg) => fastify.log.warn(msg) },
    )

  await fastify.register(staticPlugin, {
    root: designSystemRoot,
    prefix: '/design/',
    decorateReply: false,
  })

  // Operator branding: dynamic /branding.css + /branding/favicon linked from
  // every page's <head>. Fetched from admin-api (60 s cache, fail-open).
  registerBrandingRoutes(fastify)

  // Dynamic handlers for openapi.{json,yaml}. The on-disk spec is the
  // build-time artifact (carries config.yml-aware servers); these handlers
  // overlay live admin-DB overrides fetched from the integration-server's
  // /openapi/server-variables endpoint. The merge is per-request but cached
  // 60 s. Failure to reach integration-server → fall back to compiled
  // defaults via buildServersBlock(undefined). Registered BEFORE the static
  // /specs/ mount so the named routes win for these two paths; every other
  // file under /specs/ still flows through fastifyStatic.
  if (existsSync(opts.docsDir)) {
    const specJsonPath = path.join(opts.docsDir, 'openapi.json')
    const specYamlPath = path.join(opts.docsDir, 'openapi.yaml')
    const cachedSpec = existsSync(specJsonPath)
      ? (JSON.parse(readFileSync(specJsonPath, 'utf8')) as Record<string, unknown>)
      : null
    const cachedYaml = existsSync(specYamlPath) ? readFileSync(specYamlPath, 'utf8') : null

    if (cachedSpec) {
      const buildMerged = async (): Promise<Record<string, unknown>> => {
        const overrides = await fetchServerVariables()
        // Refresh BOTH the root server entry AND any per-path-item `servers`
        // override (attached by the generator to /admin/*, /auth/*, /health,
        // /connections*, /webhooks/* paths). The unversioned variant carries
        // its own copy of scheme/host/port variables; admin-DB edits flow
        // into it via the same merge.
        const root = buildServersBlock(overrides ?? undefined)
        const test = buildServersBlock(overrides ?? undefined, { variant: 'test' })
        const unversioned = buildServersBlock(overrides ?? undefined, { variant: 'unversioned' })
        // Not `root`: that carries the global server's description, so a
        // reader would see an override apparently identical to the entry
        // above it, with no hint why it exists — and no sandbox option.
        const liveOnly = buildServersBlock(overrides ?? undefined, { variant: 'live-only' })
        const paths = cachedSpec['paths'] as Record<string, Record<string, unknown>> | undefined
        const refreshedPaths: Record<string, unknown> = {}
        if (paths) {
          for (const [key, item] of Object.entries(paths)) {
            if (!item.servers) {
              refreshedPaths[key] = item
              continue
            }
            // Rebuild the SAME kind the generator attached — clobbering a
            // live-only block with an unversioned one would both lose its
            // description and strip its `/v1`. The live-only set may be
            // empty; the mapping stays honest for any genuinely live-only
            // route.
            const kind = item['x-opensteward-servers']
            refreshedPaths[key] = {
              ...item,
              servers: kind === 'live-only' ? liveOnly : unversioned,
            }
          }
        }
        // Both entries, so the Servers dropdown offers live and sandbox and an
        // operator's host/port edits reach both.
        return { ...cachedSpec, servers: [...root, ...test], paths: refreshedPaths }
      }
      fastify.get('/specs/openapi.json', async () => buildMerged())
      if (cachedYaml) {
        fastify.get('/specs/openapi.yaml', async (_req, reply) => {
          const merged = await buildMerged()
          reply.type('application/x-yaml')
          return yaml.dump(merged, { lineWidth: 120, noRefs: true })
        })
      }
    }

    await fastify.register(staticPlugin, {
      root: opts.docsDir,
      prefix: '/specs/',
      decorateReply: false,
    })
  }

  // Postman collection + envs served raw, so the dedicated /postman page +
  // its "Run in Postman" button can link directly to a downloadable URL.
  const postmanDir =
    opts.guidesDir && existsSync(path.join(opts.guidesDir, 'postman'))
      ? path.join(opts.guidesDir, 'postman')
      : null
  if (postmanDir) {
    // Dynamic handler for the production env file. The collection itself is
    // pure structure (paths + schemas + Postman {{baseUrl}} variable) and
    // changes only on redeploy — keep it on the static mount. The env file
    // is what carries `baseUrl`, which IS runtime-mutable via /settings →
    // OpenAPI. Overlay the live admin-DB-merged value so the *next download*
    // after an operator edit reflects the deployment's actual URL.
    //
    // Postman client snapshots on import; this only helps users importing
    // (or re-importing) AFTER an operator edit. That's the realistic case —
    // operators set their baseUrl before sharing the Postman bundle.
    //
    // The local env file stays static (always http://localhost:3010) — it's
    // for developer-on-laptop, not production deployment.
    const prodEnvPath = path.join(postmanDir, 'openapi-production.postman_environment.json')
    const cachedProdEnv = existsSync(prodEnvPath)
      ? (JSON.parse(readFileSync(prodEnvPath, 'utf8')) as {
          values: Array<{ key: string; value: string; type: string; enabled: boolean }>
          [k: string]: unknown
        })
      : null

    if (cachedProdEnv) {
      fastify.get('/specs/postman/openapi-production.postman_environment.json', async () => {
        const overrides = await fetchServerVariables()
        const baseUrl = composePostmanBaseUrl(overrides)
        // Build a fresh values array — never mutate the cache.
        const values = cachedProdEnv.values.map((v) =>
          v.key === 'baseUrl' ? { ...v, value: baseUrl } : v,
        )
        return { ...cachedProdEnv, values }
      })
    }

    await fastify.register(staticPlugin, {
      root: postmanDir,
      prefix: '/specs/postman/',
      decorateReply: false,
    })
  }

  // Platform logos, from the admin-api database first and the on-disk
  // directory second. Registered BEFORE the /data/platforms/ static mount
  // below so the named route wins: find-my-way resolves static > parametric >
  // wildcard, so /data/platforms/logos/xero.svg matches this route while
  // /data/platforms/platforms.json still falls through to the wildcard. Same
  // ordering rule as the named /specs/ routes above.
  //
  // Because this route always wins for logos, the disk fallback has to live
  // inside the handler — the static mount will never serve one again.
  registerLogoProxy(fastify, {
    diskRoot: opts.providersDir ? path.join(opts.providersDir, 'logos') : null,
  })

  const providersDir = opts.providersDir
  if (providersDir && existsSync(providersDir)) {
    await fastify.register(staticPlugin, {
      root: providersDir,
      prefix: '/data/platforms/',
      decorateReply: false,
    })
  }

  // Static assets referenced from guide markdown — screenshots primarily.
  // Lives under docs/assets/ in the repo; mounted at /assets/ so markdown
  // can use `![](/assets/screenshots/<name>.png)`. The screenshots
  // themselves are generated by `pnpm docs:screenshots` against a running
  // admin instance — see apps/admin/scripts/screenshots/.
  const assetsDir = opts.guidesDir ? path.join(opts.guidesDir, 'assets') : null
  if (assetsDir && existsSync(assetsDir)) {
    await fastify.register(staticPlugin, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false,
    })
  }

  fastify.get('/health', async () => ({ status: 'ok' }))

  // /version — { name, version, gitSha, buildTime }. See
  // apps/admin-api/src/core/server.ts for the rationale on reading
  // package.json from cwd rather than baking the value at build time.
  const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  await fastify.register(
    createVersionRouter({
      name: pkg.name ?? 'docs-server',
      version: pkg.version ?? '0.0.0',
    }),
  )

  // robots.txt — allow everything, point crawlers at the sitemap.
  fastify.get('/robots.txt', async (_request, reply) => {
    reply.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n')
  })

  // sitemap.xml — built from the same search index so every guides/*.md
  // is listed. Falls back to a minimal stub of the canonical landing
  // surfaces when the index isn't generated yet.
  fastify.get('/sitemap.xml', async (_request, reply) => {
    const urls: string[] = ['/', '/guides', '/platforms', '/postman', '/unified-api']
    if (existsSync(searchIndexPath)) {
      try {
        const entries = JSON.parse(readFileSync(searchIndexPath, 'utf8')) as Array<{ url: string }>
        for (const e of entries) if (e?.url) urls.push(e.url)
      } catch {
        // fall through with the static list
      }
    }
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...new Set(urls)].map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`
    reply.type('application/xml').send(body)
  })

  // Search index — built by scripts/build-search-index.ts at deploy time
  // and dropped into apps/docs-server/dist/search-index.json. When the
  // build hasn't run yet (local dev, fresh check-out), respond with an
  // empty array so the ⌘K palette degrades gracefully.
  const searchIndexPath = path.join(import.meta.dirname, 'search-index.json')
  fastify.get('/search-index.json', async (_request, reply) => {
    if (existsSync(searchIndexPath)) {
      reply.type('application/json').send(readFileSync(searchIndexPath))
      return
    }
    reply.type('application/json').send('[]')
  })

  const hasSpec = hasUnifiedSpec(opts.docsDir)

  fastify.get('/', async (_request, reply) => {
    reply.type('text/html').send(landingHtml(hasSpec))
  })

  fastify.get('/platforms', async (_request, reply) => {
    reply.type('text/html').send(providersHtml(logoConfig()))
  })

  // Deep-link route from integrate guides (the `.xlink` cards emitted by
  // integrate-guides.ts use this shape: `/platforms/<vertical>/<slug>`).
  // Renders the catalog page; client-side filtering can auto-select the
  // requested platform from the URL path if it wants.
  fastify.get('/platforms/:vertical/:slug', async (_request, reply) => {
    reply.type('text/html').send(providersHtml(logoConfig()))
  })

  // /providers is an alias for /platforms (301).
  fastify.get('/providers', async (_request, reply) => {
    reply.code(301).redirect('/platforms')
  })

  // Single Swagger UI for the full unified spec. Vertical-scoped browsing
  // happens via Swagger's tag deep-linking (`/unified-api#tag/Accounting`,
  // etc.). The /unified-api URL is canonical — there is no /docs route.
  fastify.get('/unified-api', async (_request, reply) => {
    reply.type('text/html').send(swaggerHtml())
  })

  // /api-reference was this page's URL until it was renamed to pair with
  // /operator-api. 301 so bookmarks, the admin console of an older release
  // and links on other sites keep working, and crawlers move their index.
  // Browsers carry the `#tag/<Vertical>` fragment across the redirect, so
  // deep links land on the same tag; a query string is kept explicitly.
  fastify.get('/api-reference', async (request, reply) => {
    const q = request.url.indexOf('?')
    reply.code(301).redirect(q === -1 ? '/unified-api' : `/unified-api${request.url.slice(q)}`)
  })

  // Operator API tab. Pure Swagger UI shell sourced from
  // `docs/openapi/admin-api.openapi.json` (served via the /specs/
  // mount above). The plugin file holds no endpoint descriptions of
  // its own — every operation rendered here came out of the admin-api
  // route handlers' Zod schemas via the snapshot generator.
  await fastify.register(operatorApiPlugin)

  if (postmanDir) {
    fastify.get('/postman', async (_request, reply) => {
      reply
        .type('text/html')
        .send(renderPostmanPage({ postmanDir, filesBaseUrl: '/specs/postman' }))
    })
  }

  // Markdown guides at /guides/* — rendered from the repo `docs/` folder
  // with mermaid support and a sidebar generated from the directory tree.
  if (opts.guidesDir && existsSync(opts.guidesDir)) {
    const guidesRoot = opts.guidesDir

    // Integration-guide coverage matrix. Routed BEFORE the wildcard guide
    // handler so /guides/integrate (without a trailing slash or .md) hits
    // the coverage table instead of falling through to the directory
    // listing of docs/integrate/. /integrate is an alias for parity with
    // /platforms, /postman, /unified-api.
    const coverageHandler = async (_request: unknown, reply: import('fastify').FastifyReply) => {
      reply.type('text/html')
      return reply.send(renderIntegrateCoveragePage(guidesRoot))
    }
    fastify.get('/guides/integrate', coverageHandler)
    fastify.get('/integrate', coverageHandler)

    const handler = async (request: { url: string }, reply: import('fastify').FastifyReply) => {
      // Strip the query string before resolving — `marked` rewrites links to
      // include `#anchor` already; query strings are unused but harmless.
      const urlPath = request.url.split('?')[0]
      const result = resolveGuidePath(guidesRoot, urlPath)
      if (result.redirectTo) {
        return reply.code(result.status).redirect(result.redirectTo)
      }
      reply.code(result.status)
      if (result.contentType) reply.type(result.contentType)
      return reply.send(result.body ?? '')
    }
    fastify.get('/guides', handler)
    fastify.get('/guides/', handler)
    fastify.get('/guides/*', handler)
  }

  return fastify
}
