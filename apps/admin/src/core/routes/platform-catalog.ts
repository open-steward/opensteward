/**
 * The generated platform catalogue, read from disk.
 *
 * `docs/platforms/platforms.json` is 1.1 MB of metadata for all 1,545
 * platforms and ships with the image. It is the only place the admin can get a
 * platform's *display name* without an upstream call — `/api/platforms` returns
 * the same names but costs a request per render, and the dashboard renders on
 * every visit.
 *
 * Parsed once per process and held in module scope. Two consumers:
 * `platforms-data.ts` serves it to the Browse tab; the dashboard uses
 * `platformNameIndex()` to label the adapters it lists.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

// Five levels up from `dist/core/routes/` — the repo root, where docs/ lives.
// Keep this file beside platforms-data.ts: both depend on that depth.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const CATALOG_PATH = join(REPO_ROOT, 'docs', 'platforms', 'platforms.json')

export interface CatalogPlatform {
  slug: string
  vertical: string
  [key: string]: unknown
}

/** What a page needs to name and picture a platform, keyed `vertical/slug`. */
export interface CatalogPlatformSummary {
  name: string
  /** `#rrggbb` brand colour, when the catalogue has one. */
  primaryColor?: string
  /** Bare hostname, e.g. `fortnox.se` — what Brandfetch's CDN is keyed on. */
  domain?: string
}

export interface Catalog {
  generated_at?: string
  total: number
  counts: Record<string, number>
  platforms: CatalogPlatform[]
}

let catalogCache: Catalog | null = null
let nameIndexCache: Map<string, string> | null = null
let indexCache: Map<string, CatalogPlatformSummary> | null = null
let guideSetCache: Set<string> | null = null

/** Throws when the catalogue is missing or unparseable — callers that must
 *  render the catalogue itself want to know. */
export function loadCatalog(): Catalog {
  if (!catalogCache) {
    const raw = readFileSync(CATALOG_PATH, 'utf8')
    catalogCache = JSON.parse(raw) as Catalog
  }
  return catalogCache
}

/**
 * `vertical/slug` → display name, for labelling a platform the operator has
 * enabled.
 *
 * Never throws. A missing catalogue returns an empty map so the caller falls
 * back to the slug, which is still a correct identifier — the alternative is a
 * dashboard that 500s because a cosmetic file is absent.
 */
export function platformIndex(): Map<string, CatalogPlatformSummary> {
  if (indexCache) return indexCache
  const index = new Map<string, CatalogPlatformSummary>()
  try {
    for (const p of loadCatalog().platforms) {
      const name = typeof p.name === 'string' ? p.name.trim() : ''
      if (!name) continue
      index.set(`${p.vertical}/${p.slug}`, {
        name,
        primaryColor: typeof p.primary_color === 'string' ? p.primary_color : undefined,
        domain: typeof p.domain === 'string' ? p.domain : undefined,
      })
    }
  } catch {
    // Missing or unparseable catalogue: callers fall back to slugs and
    // vertical-coloured monograms rather than failing the page.
  }
  indexCache = index
  return index
}

export function platformNameIndex(): Map<string, string> {
  if (nameIndexCache) return nameIndexCache
  const index = new Map<string, string>()
  for (const [key, entry] of platformIndex()) index.set(key, entry.name)
  nameIndexCache = index
  return index
}

/**
 * Whether `docs/integrate/<vertical>/<slug>.md` exists on docs-server.
 *
 * The catalogue's `has_guide` is generated from the files themselves, so it is
 * the same source the public Browse cards gate their "Guide" link on. 80 of
 * 1,545 platforms have one; accounting, CRM, logistics and projects have none.
 *
 * Never throws: an unreadable catalogue reports no guides, which hides a link
 * rather than offering a 404.
 */
export function platformHasGuide(vertical: string, slug: string): boolean {
  if (!guideSetCache) {
    const guides = new Set<string>()
    try {
      for (const p of loadCatalog().platforms) {
        if (p.has_guide === true) guides.add(`${p.vertical}/${p.slug}`)
      }
    } catch {
      // Empty set; every platform reports no guide.
    }
    guideSetCache = guides
  }
  return guideSetCache.has(`${vertical}/${slug}`)
}

/** Test seam — the caches are per-process and would otherwise leak between suites. */
export function resetCatalogCache(): void {
  catalogCache = null
  nameIndexCache = null
  indexCache = null
  guideSetCache = null
}
