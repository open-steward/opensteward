/**
 * build-search-index.ts — emits apps/docs-server/dist/search-index.json
 *
 * Walks docs/ for .md files, parses out heading text + first paragraph,
 * and writes a flat JSON array consumed by the ⌘K search palette on
 * the docs server.
 *
 * Run via `pnpm docs:search-index` (or as part of `pnpm docs:all`).
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

interface SearchEntry {
  url: string
  title: string
  headings: string[]
  snippet: string
  /** Full plaintext body — lunr indexes this so any keyword in the
   *  document, not just the title or first paragraph, is searchable. */
  body: string
}

const REPO_ROOT = process.cwd()
const DOCS_DIR = join(REPO_ROOT, 'docs')
const OUT_DIR = join(REPO_ROOT, 'apps', 'docs-server', 'dist')
const OUT_FILE = join(OUT_DIR, 'search-index.json')

/**
 * Top-level `docs/` directories that must never be indexed.
 *
 * This index is generated at image-build time and ships INSIDE the published
 * docs-server image, with up to 12,000 characters of each document's body
 * inlined — so anything indexed here reaches every self-hosting operator even
 * though `docs/` itself is only bind-mounted at runtime. These directories
 * hold OpenSteward's own internal planning and research notes, which are not
 * operator documentation.
 *
 * They are also gitignored, so normally nothing is here to walk. This skip is
 * the second line of defence: a local working copy in one of these paths
 * would be indexed and shipped despite the `.gitignore`.
 */
const EXCLUDED_DIRS = new Set(['superpowers', 'research'])

function walkMd(dir: string, relRoot = dir): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const abs = join(dir, name)
    const s = statSync(abs)
    if (s.isDirectory()) {
      // Only top-level docs/<dir> names are matched, so a nested directory
      // that happens to share the name is unaffected.
      if (dir === relRoot && EXCLUDED_DIRS.has(name)) continue
      found.push(...walkMd(abs, relRoot))
    } else if (s.isFile() && name.endsWith('.md')) found.push(abs)
  }
  return found
}

function stripMd(s: string): string {
  return s
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_>#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parse(absPath: string): SearchEntry {
  const md = readFileSync(absPath, 'utf8').replace(/^---[\s\S]*?---\s*/, '')
  const rel = relative(DOCS_DIR, absPath).replace(/\\/g, '/')
  const slug = rel.replace(/\.md$/, '').replace(/\/README$/, '')
  const url = slug ? `/guides/${slug}` : '/guides'

  const headings: string[] = []
  let title = ''
  for (const line of md.split('\n')) {
    const m = /^(#{1,3})\s+(.+)$/.exec(line)
    if (!m) continue
    const text = stripMd(m[2])
    if (m[1] === '#' && !title) title = text
    else headings.push(text)
  }
  if (!title) title = slug || 'Docs'

  let snippet = ''
  const bodyChunks: string[] = []
  // Strip fenced code blocks before scanning paragraphs — code samples
  // are rarely useful as keyword search material and they bloat the
  // index. Headings and inline code stay (stripped down to plain text).
  const noFences = md.replace(/```[\s\S]*?```/g, ' ')
  for (const block of noFences.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (!trimmed) continue
    const plain = stripMd(trimmed)
    if (!plain) continue
    bodyChunks.push(plain)
    if (!snippet && !/^#+\s/.test(trimmed) && plain.length >= 20) {
      snippet = plain.length > 200 ? plain.slice(0, 197) + '…' : plain
    }
  }
  const body = bodyChunks.join(' ').slice(0, 12_000) // cap per-doc size

  return { url, title, headings, snippet, body }
}

function main(): void {
  const files = walkMd(DOCS_DIR)
  const entries = files.map(parse)
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(entries))
  console.log(`Wrote ${entries.length} entries → ${relative(REPO_ROOT, OUT_FILE)}`)
}

main()
