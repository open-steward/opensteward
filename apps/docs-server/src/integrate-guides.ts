/**
 * Renderer hooks for `docs/integrate/<vertical>/<platform>.md` guides.
 *
 * See docs/integrate/README.md for the three section formats that validate
 * (walkthrough-v2 is canonical; semi-detailed and walkthrough-legacy are
 * also accepted) and docs/integrate/_template.md for the markdown shapes the
 * helpers below detect.
 *
 * Affordances emitted:
 *   - `.guide-header` card from YAML frontmatter
 *   - `.guide-lede` wrapper on the first paragraph
 *   - `.step-n` ordinal prefix on every H2
 *   - `.shot` browser-chrome frame around every image in the 2nd H2 section
 *     (with `.shot__placeholder` fallback when the file 404s)
 *   - `.callback` block when the 3rd section's blockquote matches the
 *     canonical shape
 *   - `.scopes` checklist when the 4th section's `<ul>` items match the
 *     canonical shape
 *   - `.xlink` cross-link card for `/platforms/<...>` hrefs
 *   - `.trouble` cards in the 6th section, keyed by a code-prefixed H3
 *
 * Those four are keyed on H2 ordinal position — the numbering the
 * walkthrough-legacy template used, where section 2 was the dev-portal
 * walkthrough and section 6 was troubleshooting. In canonical walkthrough-v2
 * the ordinals land elsewhere (Walkthrough 1, Platform-specific notes 2,
 * Webhooks 3, Troubleshooting 4), so `.shot` frames miss the Walkthrough
 * screenshots and `.trouble` cards never reach Troubleshooting on those
 * guides. `.callback` and `.scopes` are shape-gated on top of the ordinal and
 * bail out when the content doesn't match, so a mismatched slot renders as
 * plain markdown rather than wrongly.
 *
 * All helpers operate on the HTML string produced by `marked.parse(...)` after
 * the standard postProcessMarkdownBody (anchors, TOC) has already run. They're
 * regex-based because the markdown surface is controlled — authors write the
 * shapes documented in `_template.md` and the renderer normalises them into
 * the markup the CSS in guides.ts targets.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface IntegrateFrontmatter {
  vertical: 'accounting' | 'crm' | 'ecommerce' | 'logistics' | 'payments' | 'docsign' | 'projects' | 'customer-support' | 'inventory'
  platform: string
  title: string
  auth_type: 'oauth2' | 'oauth2_cc' | 'api_key' | 'session' | 'local'
  partner_program: boolean
  estimated_time: string
  last_verified: string
  written_by: string
  [extra: string]: unknown
}

const VERTICAL_ICON: Record<string, string> = {
  accounting: 'ph-calculator',
  crm: 'ph-users-three',
  ecommerce: 'ph-shopping-bag-open',
  logistics: 'ph-truck',
  payments: 'ph-credit-card',
  docsign: 'ph-signature',
  projects: 'ph-kanban',
  'customer-support': 'ph-headset',
  inventory: 'ph-warehouse',
}

const VERTICAL_LABEL: Record<string, string> = {
  accounting: 'Accounting',
  crm: 'CRM',
  ecommerce: 'Ecommerce',
  logistics: 'Logistics',
  payments: 'Payments',
  docsign: 'E-signature',
  projects: 'Projects',
  'customer-support': 'Customer Support',
  inventory: 'Inventory',
}

const AUTH_LABEL: Record<string, string> = {
  oauth2: 'OAuth 2.0',
  oauth2_cc: 'OAuth 2.0 (client credentials)',
  api_key: 'API key',
  session: 'Session cookie',
  local: 'Local',
}

const STALE_DAYS = 180

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

/**
 * Detect `---\n…\n---\n` at the head of a markdown file and return both the
 * parsed key/value map and the body with frontmatter removed. Flat YAML only —
 * no nesting, no anchors. Boolean strings (`true`/`false`) coerce; everything
 * else stays as string. Returns null when no frontmatter is present.
 */
export function parseFrontmatter(md: string): {
  frontmatter: Record<string, string | boolean>
  body: string
} | null {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!m) return null
  const block = m[1]
  const frontmatter: Record<string, string | boolean> = {}
  for (const line of block.split('\n')) {
    const trimmed = line.replace(/#.*$/, '').trim()
    if (!trimmed) continue
    const kv = trimmed.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    let value: string | boolean = kv[2].trim()
    // Unquote and de-bool.
    value = (value as string).replace(/^['"](.*)['"]$/, '$1')
    if (value === 'true') value = true
    else if (value === 'false') value = false
    frontmatter[kv[1]] = value
  }
  return { frontmatter, body: md.slice(m[0].length) }
}

export function isIntegratePath(relPath: string): boolean {
  return relPath === 'integrate' || relPath.startsWith('integrate/')
}

function daysSince(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function renderGuideHeader(fm: IntegrateFrontmatter): string {
  const icon = VERTICAL_ICON[fm.vertical] ?? 'ph-puzzle-piece'
  const verticalLabel = VERTICAL_LABEL[fm.vertical] ?? fm.vertical
  const authLabel = AUTH_LABEL[fm.auth_type] ?? fm.auth_type
  const stale = daysSince(fm.last_verified)
  const staleDotClass = stale === null ? 'dot--neutral' : stale > STALE_DAYS ? 'dot--stale' : ''
  const partnerLabel = fm.partner_program ? 'Required' : 'Not required'
  return `<section class="guide-header" data-vertical="${escapeAttr(fm.vertical)}">
  <div class="guide-header__icon"><i class="ph ${escapeAttr(icon)}" aria-hidden="true"></i></div>
  <div class="guide-header__title-row">
    <p class="guide-header__eyebrow">${escapeHtml(verticalLabel)} · ${escapeHtml(authLabel)}</p>
    <h1 class="guide-header__title">${escapeHtml(fm.title)}</h1>
  </div>
  <dl class="guide-header__meta">
    <dt>Time</dt>            <dd>~${escapeHtml(fm.estimated_time)}</dd>
    <dt>Partner program</dt> <dd><span class="dot dot--neutral"></span>${escapeHtml(partnerLabel)}</dd>
    <dt>Last verified</dt>   <dd><span class="dot ${escapeAttr(staleDotClass)}"></span>${escapeHtml(fm.last_verified)}</dd>
  </dl>
</section>`
}

/** Wrap the first `<p>` we encounter in the .guide-lede class. */
function wrapLede(html: string): string {
  let replaced = false
  return html.replace(/<p>/, (match) => {
    if (replaced) return match
    replaced = true
    return '<p class="guide-lede">'
  })
}

/**
 * Walk the post-postProcess body, group content by H2 section, apply
 * per-section transforms, and reassemble.
 *
 * H2 markup after postProcess looks like:
 *   <h2 id="prerequisites"><a href="#prerequisites" class="heading-anchor" …>#</a>Prerequisites</h2>
 */
function transformSections(
  body: string,
  ctx: { docsRoot: string; relPath: string },
): string {
  const h2Re = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g
  const segments: Array<{ heading: string | null; html: string }> = []
  let cursor = 0
  let match: RegExpExecArray | null
  // First segment: preamble (anything before the first H2).
  while ((match = h2Re.exec(body)) !== null) {
    if (segments.length === 0 && match.index > 0) {
      segments.push({ heading: null, html: body.slice(0, match.index) })
    }
    // The heading itself becomes the marker for the new segment; we'll
    // assemble (heading + content) for each subsequent slice.
    segments.push({ heading: match[0], html: '' })
    cursor = match.index + match[0].length
    // Capture content until the next H2.
    h2Re.lastIndex = cursor
    const next = h2Re.exec(body)
    if (next) {
      segments[segments.length - 1].html = body.slice(cursor, next.index)
      h2Re.lastIndex = next.index // re-feed the next H2 to the outer iteration
    } else {
      segments[segments.length - 1].html = body.slice(cursor)
      break
    }
  }
  if (segments.length === 0) return body

  let sectionIdx = 0
  const out: string[] = []
  for (const seg of segments) {
    if (seg.heading === null) {
      out.push(seg.html)
      continue
    }
    sectionIdx++
    const stepN = String(sectionIdx).padStart(2, '0')
    const headingWithStep = injectStepN(seg.heading, stepN)
    let content = seg.html
    if (sectionIdx === 2) content = transformScreenshots(content, ctx)
    if (sectionIdx === 3) content = transformCallback(content)
    if (sectionIdx === 4) content = transformScopes(content)
    if (sectionIdx === 6) content = transformTroubleshooting(content)
    content = transformXlink(content)
    out.push(headingWithStep + content)
  }
  return out.join('')
}

/** Insert `<span class="step-n">NN</span>` right after the H2's anchor (or
 *  start of the heading content when no anchor is present). */
function injectStepN(headingHtml: string, stepN: string): string {
  // Anchor injected by postProcessMarkdownBody looks like:
  //   <a href="#…" class="heading-anchor" aria-label="…">#</a>
  return headingHtml.replace(
    /(<h2[^>]*>)(\s*<a\s+href="#[^"]*"\s+class="heading-anchor"[^>]*>#<\/a>)?/,
    (_full, open: string, anchor: string | undefined) =>
      `${open}${anchor ?? ''}<span class="step-n">${stepN}</span>`,
  )
}

/**
 * Section 2 transform — wrap every `<img>` (whether bare or inside a `<p>`)
 * in a `.shot` browser-chrome frame. When the file referenced by `src` is
 * missing from disk, swap the `<img>` for a `.shot__placeholder` block so
 * a missing screenshot is loud on the rendered page instead of a broken image.
 */
function transformScreenshots(
  html: string,
  ctx: { docsRoot: string; relPath: string },
): string {
  // Match either <p><img …></p> or <img …> standalone.
  const imgRe = /(<p>)?<img\s+src="([^"]+)"\s+alt="([^"]*)"(?:[^>]*)>(<\/p>)?/g
  return html.replace(imgRe, (_full, _pOpen, src, alt) => {
    const filename = src.split('/').pop() ?? src
    const fileExists = imageExistsOnDisk(src, ctx.docsRoot)
    const inner = fileExists
      ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
      : `<div class="shot__placeholder">
          <i class="ph ph-image-square" aria-hidden="true"></i>
          <b>Screenshot pending</b>
          ${escapeHtml(filename)}
        </div>`
    return `<figure class="shot">
      <div class="shot__bar">
        <div class="shot__dots"><span></span><span></span><span></span></div>
        <div class="shot__url">${escapeHtml(filename)}</div>
      </div>
      <div class="shot__body">${inner}</div>
      ${alt ? `<figcaption class="shot__caption">${escapeHtml(alt)}</figcaption>` : ''}
    </figure>`
  })
}

function imageExistsOnDisk(src: string, docsRoot: string): boolean {
  // /assets/screenshots/… → docsRoot/assets/screenshots/…
  if (!src.startsWith('/assets/')) return true // external URL; assume reachable
  const rel = src.slice('/assets/'.length).replace(/^\/+/, '')
  return existsSync(join(docsRoot, 'assets', rel))
}

/**
 * Section 3 transform — detect the canonical callback blockquote shape:
 *
 *   <blockquote>
 *   <p><strong>Callback URL</strong>: <code>…</code></p>
 *   <p>Example for the local dev stack: <code>…</code></p>
 *   </blockquote>
 *
 * …and re-emit as a `.callback` block. Wraps the `<your-deployment-url>`
 * placeholder (already entity-escaped) in a `.ph-slot` span so it reads
 * as a fill-in, not a literal.
 */
function transformCallback(html: string): string {
  const re = /<blockquote>\s*<p><strong>Callback URL<\/strong>:\s*<code>([^<]+)<\/code><\/p>\s*<p>Example for the local dev stack:\s*<code>([^<]+)<\/code><\/p>\s*<\/blockquote>/
  return html.replace(re, (_full, urlRaw: string, exampleRaw: string) => {
    const urlPretty = urlRaw.replace(
      /&lt;your-deployment-url&gt;/g,
      '<span class="ph-slot">&lt;your-deployment-url&gt;</span>',
    )
    const copyValue = urlRaw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    return `<div class="callback">
      <p class="callback__label"><i class="ph ph-link" aria-hidden="true"></i>Callback URL</p>
      <div class="callback__url-row">
        <span class="callback__url">${urlPretty}</span>
        <button type="button" class="callback__copy" data-copy="${escapeAttr(copyValue)}" aria-label="Copy callback URL">
          <i class="ph ph-copy" aria-hidden="true"></i>Copy
        </button>
      </div>
      <p class="callback__example"><b>Local dev:</b> <code>${escapeHtml(exampleRaw)}</code></p>
    </div>`
  })
}

/**
 * Section 4 transform — detect a `<ul>` directly under section 4 where every
 * item matches:
 *
 *   <li><code>scope_name</code> — Description text. (required)</li>
 *
 * Convert the whole list to a `.scopes` block. Items not matching the shape
 * are left untouched (the list renders as a normal `<ul>`).
 */
function transformScopes(html: string): string {
  // Iterate over <ul>…</ul> blocks; only rewrite when every <li> matches.
  return html.replace(/<ul>([\s\S]*?)<\/ul>/, (full, inner: string) => {
    const liRe = /<li>([\s\S]*?)<\/li>/g
    const items: Array<{ name: string; desc: string; optional: boolean }> = []
    let m: RegExpExecArray | null
    while ((m = liRe.exec(inner)) !== null) {
      const itemHtml = m[1].trim()
      // Expect: <code>name</code> — Description (required|optional)
      const match = itemHtml.match(
        /^<code>([^<]+)<\/code>\s*[—\-]\s*([\s\S]+?)\s*\((required|optional)\)\.?\s*$/,
      )
      if (!match) return full // bail out — leave the list as-is
      items.push({ name: match[1], desc: match[2].trim(), optional: match[3] === 'optional' })
    }
    if (items.length === 0) return full
    const rows = items
      .map(
        (it) => `<div class="scopes__row">
        <span class="scopes__check" aria-hidden="true">✓</span>
        <code class="scopes__name">${escapeHtml(it.name)}</code>
        <span class="scopes__desc">${it.desc}</span>
        <span class="scopes__opt">${it.optional ? 'Optional' : 'Required'}</span>
      </div>`,
      )
      .join('')
    return `<div class="scopes" role="list">${rows}</div>`
  })
}

/**
 * Cross-link card transform — rewrites any `<a href="/platforms/…">…</a>`
 * (with or without a trailing `{.xlink}` text node) into a `.xlink` card.
 * The trailing `{.xlink}` (raw text emitted by marked when the author uses
 * the attribute hint) is consumed too.
 */
function transformXlink(html: string): string {
  const re = /<a\s+href="(\/platforms\/[^"]+)"[^>]*>([\s\S]*?)<\/a>(\{\.xlink[^}]*\})?/g
  return html.replace(re, (_full, href: string, label: string) => {
    const text = stripTags(label) || href
    return `<a class="xlink" href="${escapeAttr(href)}">
      <span class="xlink__icon"><i class="ph ph-sliders-horizontal" aria-hidden="true"></i></span>
      <span class="xlink__body">
        <span class="xlink__title">${escapeHtml(text)}</span>
        <span class="xlink__path">${escapeHtml(href)}</span>
      </span>
      <span class="xlink__arrow"><i class="ph ph-arrow-right" aria-hidden="true"></i></span>
    </a>`
  })
}

/**
 * Section 6 transform — convert every H3 whose first content child is a
 * `<code>` into one `.trouble__row` card. Following content (paragraphs,
 * lists, etc.) up to the next H3 or end-of-section becomes the card body.
 *
 * H3 markup after postProcess:
 *   <h3 id="invalid-redirect-uri"><a … class="heading-anchor">#</a><code>invalid_redirect_uri</code></h3>
 */
function transformTroubleshooting(html: string): string {
  // Split section content into "intro" (everything before the first H3) and
  // "cards" (each starting at an H3 whose first content child is a <code>).
  const h3Re = /<h3(\s[^>]*)?>([\s\S]*?)<\/h3>/g
  const matches: Array<{ index: number; full: string; inner: string }> = []
  let m: RegExpExecArray | null
  while ((m = h3Re.exec(html)) !== null) {
    matches.push({ index: m.index, full: m[0], inner: m[2] })
  }
  if (matches.length === 0) return html

  const intro = html.slice(0, matches[0].index)
  const cards: string[] = []
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i]
    const bodyStart = heading.index + heading.full.length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length
    const cardBody = html.slice(bodyStart, bodyEnd).trim()
    // Extract the leading <code>…</code> from the heading inner — strip
    // the anchor link first.
    const innerSansAnchor = heading.inner.replace(/^<a [^>]*class="heading-anchor"[^>]*>#<\/a>/, '')
    const codeMatch = innerSansAnchor.match(/^\s*<code>([^<]+)<\/code>([\s\S]*)$/)
    if (!codeMatch) {
      // Not a trouble card — keep the H3 + body verbatim.
      cards.push(heading.full + cardBody)
      continue
    }
    const errCode = codeMatch[1]
    const tail = codeMatch[2].trim()
    const headingExtra = tail ? ` <span>${tail}</span>` : ''
    cards.push(`<article class="trouble__row" id="${escapeAttr(slugForCode(errCode))}">
      <div class="trouble__err"><i class="ph ph-warning-octagon" aria-hidden="true"></i><code>${escapeHtml(errCode)}</code>${headingExtra}</div>
      ${cardBody}
    </article>`)
  }
  return intro + `<div class="trouble">${cards.join('')}</div>`
}

function slugForCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Top-level entry: take the post-postProcess body + parsed frontmatter and
 * return the final integrate-guide body (with header card, lede, sections
 * transformed). Idempotent — if frontmatter is missing required keys, the
 * caller should fall through to the standard renderer.
 */
export function renderIntegrateBody(
  postProcessedBody: string,
  fm: IntegrateFrontmatter,
  ctx: { docsRoot: string; relPath: string },
): string {
  // 1. Drop the H1 (we render the title inside guide-header).
  const bodyNoH1 = postProcessedBody.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, '')
  // 2. Wrap first <p> as the lede.
  const leded = wrapLede(bodyNoH1)
  // 3. Walk sections + apply per-section + universal transforms.
  const transformed = transformSections(leded, ctx)
  // 4. Prepend the guide-header card.
  return renderGuideHeader(fm) + '\n' + transformed
}

/**
 * Lightweight summary row for the coverage index: one row per adapter that
 * has a guide or needs one (see `buildCoverageIndex` for which those are),
 * joined against the on-disk guides directory. Consumed by
 * `renderCoverageBody`, which the `/guides/integrate` and `/integrate`
 * handlers render.
 */
export interface CoverageRow {
  vertical: string
  slug: string
  name: string
  authType: string
  status: 'documented' | 'stale' | 'partner-only' | 'missing'
  lastVerified: string | null
  guideHref: string | null
}

interface PlatformSlugRow {
  slug: string
  name: string
  vertical: string
  auth_type?: string
}

/**
 * Read every guide under `docs/integrate/`, then join against
 * `docs/openapi/platform-slugs.json` so we surface BOTH platforms with
 * guides (with their freshness) AND platforms without (so the table
 * doubles as a backlog).
 *
 * Returns rows grouped by vertical so the renderer can emit one table
 * per group. Verticals are listed in stable order regardless of
 * platform-slugs.json ordering.
 */
export function buildCoverageIndex(docsRoot: string): Record<string, CoverageRow[]> {
  const slugsPath = join(docsRoot, 'openapi', 'platform-slugs.json')
  let platforms: PlatformSlugRow[] = []
  try {
    const body = JSON.parse(readFileSync(slugsPath, 'utf8')) as {
      platforms?: Array<PlatformSlugRow | string>
      entries?: PlatformSlugRow[]
    }
    // Prefer the richer `entries` field when the generator emits it
    // (carries vertical + auth_type per adapter). Fall back to the flat
    // `platforms` array for older snapshots — those won't have vertical
    // metadata, so the coverage page comes out empty rather than wrong.
    if (Array.isArray(body.entries)) {
      platforms = body.entries
    } else if (Array.isArray(body.platforms)) {
      platforms = body.platforms.map((p) =>
        typeof p === 'string' ? { slug: p, name: p, vertical: '' } : p,
      )
    }
  } catch {
    /* empty */
  }

  // Walk the guides directory + index by `<vertical>/<slug>`.
  const guidesByKey: Record<string, IntegrateFrontmatter> = {}
  const integrateRoot = join(docsRoot, 'integrate')
  if (existsSync(integrateRoot)) {
    for (const v of readdirSync(integrateRoot, { withFileTypes: true })) {
      if (!v.isDirectory()) continue
      const vDir = join(integrateRoot, v.name)
      for (const f of readdirSync(vDir, { withFileTypes: true })) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue
        const slug = f.name.replace(/\.md$/, '')
        try {
          const md = readFileSync(join(vDir, f.name), 'utf8')
          const parsed = parseFrontmatter(md)
          if (parsed) {
            guidesByKey[`${v.name}/${slug}`] = parsed.frontmatter as unknown as IntegrateFrontmatter
          }
        } catch {
          /* malformed file — skipped */
        }
      }
    }
  }

  // Build rows for every adapter that has a guide OR uses OAuth (where the
  // operator still has to register a dev-portal app, even if no guide is
  // written yet). For api_key / session adapters without a guide there is
  // no operator-side setup to document, so we omit them from the backlog.
  const rows: CoverageRow[] = []
  for (const p of platforms) {
    if (!p.vertical) continue
    const authType = p.auth_type ?? ''
    const key = `${p.vertical}/${p.slug}`
    const fm = guidesByKey[key]
    const isOAuth = authType === 'oauth2' || authType === 'oauth2_cc'
    if (!fm && !isOAuth) continue
    let status: CoverageRow['status'] = 'missing'
    let lastVerified: string | null = null
    if (fm) {
      lastVerified = typeof fm.last_verified === 'string' ? fm.last_verified : null
      const days = lastVerified ? daysSince(lastVerified) : null
      if (fm.partner_program === true) status = 'partner-only'
      else if (days !== null && days > STALE_DAYS) status = 'stale'
      else status = 'documented'
    }
    rows.push({
      vertical: p.vertical,
      slug: p.slug,
      name: p.name,
      authType,
      status,
      lastVerified,
      guideHref: fm ? `/guides/integrate/${p.vertical}/${p.slug}.md` : null,
    })
  }

  // Sort within each vertical by name.
  rows.sort((a, b) => a.vertical.localeCompare(b.vertical) || a.name.localeCompare(b.name))
  const grouped: Record<string, CoverageRow[]> = {}
  for (const r of rows) {
    if (!grouped[r.vertical]) grouped[r.vertical] = []
    grouped[r.vertical].push(r)
  }
  return grouped
}

/** Status pill HTML for the coverage table. */
function statusPill(status: CoverageRow['status']): string {
  const map: Record<CoverageRow['status'], { label: string; emoji: string; className: string }> = {
    documented: { label: 'Documented', emoji: '✅', className: 'integrate-status--ok' },
    stale: { label: 'Stale', emoji: '⚠️', className: 'integrate-status--warn' },
    'partner-only': { label: 'Partner only', emoji: '🤝', className: 'integrate-status--partner' },
    missing: { label: 'Missing', emoji: '❌', className: 'integrate-status--miss' },
  }
  const v = map[status]
  return `<span class="integrate-status ${v.className}">${v.emoji} ${escapeHtml(v.label)}</span>`
}

/**
 * Render the coverage page body — one table per vertical, plus a top-line
 * summary counter. The result is a self-contained HTML body suitable for
 * wrapping in the existing docs shell.
 */
export function renderCoverageBody(docsRoot: string): string {
  const grouped = buildCoverageIndex(docsRoot)
  const allRows = Object.values(grouped).flat()
  const documented = allRows.filter((r) => r.status === 'documented').length
  const stale = allRows.filter((r) => r.status === 'stale').length
  const partnerOnly = allRows.filter((r) => r.status === 'partner-only').length
  const missing = allRows.filter((r) => r.status === 'missing').length

  const verticalOrder = ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'docsign', 'projects', 'customer-support', 'inventory']
  const tables = verticalOrder
    .filter((v) => grouped[v]?.length)
    .map((v) => {
      const rows = grouped[v]
      const rowsHtml = rows
        .map((r) => {
          const guide = r.guideHref
            ? `<a href="${escapeAttr(r.guideHref)}">${escapeHtml(r.name)}</a>`
            : escapeHtml(r.name)
          const verified = r.lastVerified
            ? `<time datetime="${escapeAttr(r.lastVerified)}">${escapeHtml(r.lastVerified)}</time>`
            : '<span class="muted">—</span>'
          // data-* attributes power the client-side filter input below.
          return `<tr data-slug="${escapeAttr(r.slug)}" data-name="${escapeAttr(r.name.toLowerCase())}" data-vertical="${escapeAttr(r.vertical)}" data-auth="${escapeAttr(r.authType)}" data-status="${escapeAttr(r.status)}">
            <td>${guide}</td>
            <td><code class="mono">${escapeHtml(r.authType)}</code></td>
            <td>${statusPill(r.status)}</td>
            <td>${verified}</td>
          </tr>`
        })
        .join('')
      return `<section class="integrate-coverage__group" data-vertical-group="${escapeAttr(v)}">
        <h2>${escapeHtml(VERTICAL_LABEL[v] ?? v)}</h2>
        <table class="integrate-coverage__table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Auth</th>
              <th>Guide</th>
              <th>Last verified</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </section>`
    })
    .join('')

  return `<div class="integrate-coverage" data-integrate-coverage>
    <header class="integrate-coverage__header">
      <p class="page-header__eyebrow">Documentation</p>
      <h1 class="page-header__title">Integration guides</h1>
      <p class="integrate-coverage__lede">
        Per-platform setup walkthroughs for the OAuth dev-portal steps. Operators register a developer app
        with the upstream provider, paste the resulting client credentials into OpenSteward, and the
        adapter takes over. Each row links to the guide when one exists.
      </p>
      <dl class="integrate-coverage__counts">
        <div><dt>Documented</dt><dd data-count="documented">${documented}</dd></div>
        <div><dt>Stale</dt><dd data-count="stale">${stale}</dd></div>
        <div><dt>Partner only</dt><dd data-count="partner-only">${partnerOnly}</dd></div>
        <div><dt>Missing</dt><dd data-count="missing">${missing}</dd></div>
      </dl>
      <div class="integrate-coverage__filters">
        <label class="integrate-coverage__search">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <input
            type="search"
            placeholder="Filter by platform, slug, vertical, auth, or status…"
            data-integrate-filter
            aria-label="Filter integration guides"
            autocomplete="off"
          />
        </label>
        <div class="integrate-coverage__chips" role="group" aria-label="Quick filters">
          <button type="button" data-integrate-chip="" class="integrate-coverage__chip is-active">All</button>
          <button type="button" data-integrate-chip="documented" class="integrate-coverage__chip">Documented</button>
          <button type="button" data-integrate-chip="stale" class="integrate-coverage__chip">Stale</button>
          <button type="button" data-integrate-chip="partner-only" class="integrate-coverage__chip">Partner only</button>
          <button type="button" data-integrate-chip="missing" class="integrate-coverage__chip">Missing</button>
        </div>
      </div>
      <p class="integrate-coverage__empty" data-integrate-empty hidden>
        No platforms match the current filter.
      </p>
    </header>
    ${tables}
  </div>
  <script>
  (function () {
    const root = document.querySelector('[data-integrate-coverage]')
    if (!root) return
    const input = root.querySelector('[data-integrate-filter]')
    const chips = Array.from(root.querySelectorAll('[data-integrate-chip]'))
    const empty = root.querySelector('[data-integrate-empty]')
    const rows = Array.from(root.querySelectorAll('tbody tr'))
    const groups = Array.from(root.querySelectorAll('[data-vertical-group]'))
    let activeStatus = ''
    function apply() {
      const q = (input.value || '').trim().toLowerCase()
      let shown = 0
      for (const r of rows) {
        const text =
          (r.dataset.name || '') +
          ' ' + (r.dataset.slug || '') +
          ' ' + (r.dataset.vertical || '') +
          ' ' + (r.dataset.auth || '') +
          ' ' + (r.dataset.status || '')
        const matchesQ = !q || text.toLowerCase().indexOf(q) !== -1
        const matchesStatus = !activeStatus || r.dataset.status === activeStatus
        const visible = matchesQ && matchesStatus
        r.style.display = visible ? '' : 'none'
        if (visible) shown++
      }
      for (const g of groups) {
        const visibleRows = Array.from(g.querySelectorAll('tbody tr')).some(
          (r) => r.style.display !== 'none',
        )
        g.style.display = visibleRows ? '' : 'none'
      }
      if (empty) empty.hidden = shown > 0
    }
    if (input) input.addEventListener('input', apply)
    for (const chip of chips) {
      chip.addEventListener('click', () => {
        activeStatus = chip.dataset.integrateChip || ''
        for (const c of chips) c.classList.toggle('is-active', c === chip)
        apply()
      })
    }
  })()
  </script>`
}
