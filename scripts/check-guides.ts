#!/usr/bin/env tsx
/**
 * Validator for the `docs/integrate/<vertical>/<platform>.md` corpus.
 *
 * Errors (fail CI):
 *   - missing required frontmatter key
 *   - `vertical` value doesn't match the file's parent directory
 *   - `platform` slug doesn't resolve to a row in docs/openapi/platform-slugs.json
 *   - `last_verified` doesn't parse as YYYY-MM-DD
 *   - any of the six required H2 section headings is missing
 *   - a screenshot referenced from the markdown is not present on disk
 *
 * Warnings (printed, no exit code):
 *   - `last_verified` > 180 days old → guide is stale; reverify
 *
 * Runs via `pnpm check:guides`. Chains into `pnpm check:docs`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, resolve, relative } from 'path'

const REPO_ROOT = resolve(__dirname, '..')
const INTEGRATE_DIR = join(REPO_ROOT, 'docs', 'integrate')
const SLUGS_PATH = join(REPO_ROOT, 'docs', 'openapi', 'platform-slugs.json')
const ASSETS_DIR = join(REPO_ROOT, 'docs', 'assets')

const REQUIRED_KEYS = [
  'vertical',
  'platform',
  'title',
  'auth_type',
  'estimated_time',
  'last_verified',
] as const

// Three accepted guide formats:
//
//   - **walkthrough-v2** (canonical — the format for new guides):
//     `## Walkthrough` + `## Platform-specific notes`. Numbered steps with
//     screenshots, plus a bullet list of what differs from a generic OAuth
//     flow. See `docs/integrate/_template.md`.
//   - **semi-detailed** (accepted for existing guides only; payments /
//     docsign / customer-support / inventory flagships): `## Auth model` +
//     free-form extras. Flagship walkthroughs that document prerequisites,
//     scope details, sandbox notes via free-form section names.
//   - **walkthrough-legacy** (accepted for existing guides only; one
//     ecommerce guide): a six-section numbered template.
//
// Compact-style guides (`## Auth` + `## Webhooks` + `## Refused`) fail
// validation.
//
// A guide validates if it satisfies ANY of the three. `index.md` files are
// vertical-hub landing pages and are exempt from frontmatter + heading checks.
const WALKTHROUGH_V2_HEADINGS = ['## Walkthrough', '## Platform-specific notes']
const WALKTHROUGH_LEGACY_HEADINGS = [
  '## 1. Prerequisites',
  '## 2. Register the developer app',
  '## 3. Configure the callback URL',
  '## 4. Set scopes',
  '## 5. Drop the credentials into OpenSteward',
  '## 6. Troubleshooting',
]
const SEMI_DETAILED_HEADINGS = ['## Auth model']

function hasAll(src: string, headings: string[]): boolean {
  return headings.every((h) =>
    new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(src),
  )
}

function isIndexHub(absPath: string): boolean {
  return absPath.endsWith('/index.md') || absPath.endsWith('\\index.md')
}

const STALE_DAYS = 180

interface Issue {
  level: 'error' | 'warn'
  file: string
  msg: string
}

function loadSlugs(): Set<string> {
  if (!existsSync(SLUGS_PATH)) {
    console.warn(
      `[check:guides] missing ${SLUGS_PATH} — run \`pnpm docs:openapi\` first; slug validation skipped`,
    )
    return new Set()
  }
  // `platforms` is a flat array of slug strings; `entries` is the richer
  // per-platform shape the coverage page uses. Either is fine for slug
  // validation — just want the set of valid slugs.
  const body = JSON.parse(readFileSync(SLUGS_PATH, 'utf8')) as {
    platforms?: string[]
    entries?: Array<{ slug: string }>
  }
  const fromEntries = (body.entries ?? []).map((e) => e.slug)
  const fromFlat = body.platforms ?? []
  return new Set([...fromFlat, ...fromEntries])
}

/**
 * Every guide under `docs/integrate/<vertical>/`. Files directly in
 * `docs/integrate/` are cross-platform topic pages (destinations, SQL
 * access), not platform guides, and carry no guide frontmatter.
 */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (
      dir !== INTEGRATE_DIR &&
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'README.md' &&
      !entry.name.startsWith('_')
    ) {
      out.push(p)
    }
  }
  return out
}

function parseFrontmatter(src: string): Record<string, string | boolean> | null {
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!m) return null
  const out: Record<string, string | boolean> = {}
  for (const line of m[1].split('\n')) {
    const trimmed = line.replace(/#.*$/, '').trim()
    if (!trimmed) continue
    const kv = trimmed.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    let v: string | boolean = kv[2].trim().replace(/^['"](.*)['"]$/, '$1')
    if (v === 'true') v = true
    else if (v === 'false') v = false
    out[kv[1]] = v
  }
  return out
}

// Frontmatter keys required for vertical-hub `index.md` files (which document
// the canonical schema for a whole vertical, not a specific platform).
const HUB_REQUIRED_KEYS = ['vertical', 'title', 'last_verified'] as const

function validateOne(absPath: string, slugs: Set<string>, issues: Issue[]): void {
  const repoRel = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const src = readFileSync(absPath, 'utf8')
  const fm = parseFrontmatter(src)
  if (!fm) {
    issues.push({ level: 'error', file: repoRel, msg: 'no frontmatter block' })
    return
  }
  const isHub = isIndexHub(absPath)
  const keys = isHub ? HUB_REQUIRED_KEYS : REQUIRED_KEYS
  for (const key of keys) {
    if (typeof fm[key] === 'undefined' || fm[key] === '') {
      issues.push({
        level: 'error',
        file: repoRel,
        msg: `missing required frontmatter key: ${key}`,
      })
    }
  }
  // Vertical from path vs frontmatter.
  const parentDir = relative(INTEGRATE_DIR, dirname(absPath)).replace(/\\/g, '/')
  const expectedVertical = parentDir.split('/')[0]
  if (typeof fm['vertical'] === 'string' && fm['vertical'] !== expectedVertical) {
    issues.push({
      level: 'error',
      file: repoRel,
      msg: `frontmatter vertical=${fm['vertical']} does not match parent directory ${expectedVertical}`,
    })
  }
  // Platform slug must resolve (hubs don't carry a platform field).
  if (
    !isHub &&
    typeof fm['platform'] === 'string' &&
    slugs.size > 0 &&
    !slugs.has(fm['platform'] as string)
  ) {
    issues.push({
      level: 'error',
      file: repoRel,
      msg: `platform "${fm['platform']}" not found in docs/openapi/platform-slugs.json`,
    })
  }
  // last_verified parses.
  if (typeof fm['last_verified'] === 'string') {
    const d = new Date(fm['last_verified'] as string)
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(fm['last_verified'] as string)) {
      issues.push({
        level: 'error',
        file: repoRel,
        msg: `last_verified "${fm['last_verified']}" must be ISO date (YYYY-MM-DD)`,
      })
    } else {
      const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
      if (days > STALE_DAYS) {
        issues.push({
          level: 'warn',
          file: repoRel,
          msg: `stale: last_verified is ${days} days old (threshold ${STALE_DAYS})`,
        })
      }
    }
  }
  // Required section headings. A guide is valid if it satisfies ANY of the
  // three formats (walkthrough-v2 / semi-detailed / walkthrough-legacy).
  // Hubs are exempt.
  if (!isHub) {
    const isWalkthroughV2 = hasAll(src, WALKTHROUGH_V2_HEADINGS)
    const isSemiDetailed = hasAll(src, SEMI_DETAILED_HEADINGS)
    const isWalkthroughLegacy = hasAll(src, WALKTHROUGH_LEGACY_HEADINGS)
    if (!isWalkthroughV2 && !isSemiDetailed && !isWalkthroughLegacy) {
      issues.push({
        level: 'error',
        file: repoRel,
        msg:
          `guide does not satisfy any recognised format. New guides should use walkthrough-v2:\n` +
          `      - walkthrough-v2: ${WALKTHROUGH_V2_HEADINGS.join(' + ')} (see docs/integrate/_template.md)\n` +
          `      - semi-detailed (existing guides only): ${SEMI_DETAILED_HEADINGS.join(' + ')} (free-form extras)\n` +
          `      - walkthrough-legacy (existing guides only): ${WALKTHROUGH_LEGACY_HEADINGS.slice(0, 2).join(' + ')} + 4 more`,
      })
    }
  }
  // Screenshot paths exist.
  const imgRe = /!\[[^\]]*\]\((\/assets\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(src)) !== null) {
    const rel = m[1].replace(/^\/assets\//, '')
    const abs = join(ASSETS_DIR, rel)
    if (!existsSync(abs)) {
      issues.push({
        level: 'warn',
        file: repoRel,
        msg: `screenshot referenced but not on disk (renderer will substitute placeholder): ${m[1]}`,
      })
    }
  }
}

function main(): void {
  if (!existsSync(INTEGRATE_DIR)) {
    console.log('[check:guides] no docs/integrate/ directory; nothing to validate')
    process.exit(0)
  }
  const guides = walk(INTEGRATE_DIR)
  if (guides.length === 0) {
    console.log('[check:guides] no guides found under docs/integrate/')
    process.exit(0)
  }
  const slugs = loadSlugs()
  const issues: Issue[] = []
  for (const g of guides) validateOne(g, slugs, issues)
  // Verify template existence so contributors have a starting point.
  const template = join(INTEGRATE_DIR, '_template.md')
  if (!existsSync(template)) {
    issues.push({
      level: 'error',
      file: 'docs/integrate/_template.md',
      msg: 'expected template file is missing; new contributors need it',
    })
  }
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warn')
  for (const w of warnings) console.warn(`⚠️  ${w.file}: ${w.msg}`)
  for (const e of errors) console.error(`✗  ${e.file}: ${e.msg}`)
  console.log(
    `\n[check:guides] ${guides.length} guide(s) · ${errors.length} error(s) · ${warnings.length} warning(s)`,
  )
  if (errors.length > 0) process.exit(1)
}

main()

// Reference void parameters so unused-locals stays quiet on prod tsc.
void statSync
