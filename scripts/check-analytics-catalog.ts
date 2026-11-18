#!/usr/bin/env node
/**
 * CI guard: the SQL-access view catalog cannot change shape in a breaking way
 * without the change being acknowledged.
 *
 * Read-only SQL access exposes one view per stored resource type
 * (`apps/integration-server/src/analytics/view-catalog.ts`). BI tools and
 * warehouses write queries against those column names and types, so removing
 * a view or column, or changing a column's type, breaks them — the deployment
 * then provisions a new `os_analytics_v{N+1}` and keeps N for a while, but the
 * change still needs a release note. `catalog.lock.json` pins the shape (names
 * and types only — masks follow the classification and are not part of it):
 *
 *   breaking change, lock not updated   → fails
 *   additive change (new view/column)   → passes with a note to refresh the lock
 *   --update                            → rewrites the lock; bumps its `version`
 *                                         when the change is breaking
 *
 * Run: `pnpm check:analytics-catalog` (`--update` to accept a change).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const LOCK_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/integration-server/src/analytics/catalog.lock.json',
)

export interface LockColumn {
  name: string
  type: string
  maskedType: string
}
export interface LockView {
  name: string
  columns: LockColumn[]
}
export interface CatalogLock {
  /** Catalog major version: bumped by `--update` on every breaking change. */
  version: number
  /** sha256 of the shape below. */
  shapeHash: string
  views: LockView[]
}

interface CatalogLike {
  views: Array<{ name: string; columns: Array<{ name: string; type: string; maskedType: string }> }>
}

export function shapeOf(catalog: CatalogLike): LockView[] {
  return catalog.views
    .map((v) => ({
      name: v.name,
      columns: v.columns.map((c) => ({ name: c.name, type: c.type, maskedType: c.maskedType })),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
}

export function shapeHash(views: LockView[]): string {
  return createHash('sha256').update(JSON.stringify(views)).digest('hex')
}

export interface CheckResult {
  status: 'ok' | 'additive' | 'breaking'
  breaking: string[]
  additive: string[]
  next: CatalogLock
}

/** Compare the current catalog to the lock; `next` is what `--update` writes. */
export function checkAnalyticsCatalog(
  lock: CatalogLock | null,
  catalog: CatalogLike,
  diff: (
    prev: CatalogLike,
    next: CatalogLike,
  ) => { breaking: boolean; breakingChanges: string[]; additiveChanges: string[] },
): CheckResult {
  const views = shapeOf(catalog)
  const hash = shapeHash(views)
  if (!lock) {
    return {
      status: 'breaking',
      breaking: ['no lock file'],
      additive: [],
      next: { version: 1, shapeHash: hash, views },
    }
  }
  if (lock.shapeHash === hash) {
    return { status: 'ok', breaking: [], additive: [], next: lock }
  }
  const d = diff({ views: lock.views }, { views })
  return {
    status: d.breaking ? 'breaking' : 'additive',
    breaking: d.breakingChanges,
    additive: d.additiveChanges,
    next: { version: d.breaking ? lock.version + 1 : lock.version, shapeHash: hash, views },
  }
}

/** One column per line (as prettier prints it): compact, and a diff reads as column changes. */
export function formatLock(lock: CatalogLock): string {
  const views = lock.views.map(
    (v) =>
      `    {\n      "name": ${JSON.stringify(v.name)},\n      "columns": [\n` +
      v.columns
        .map(
          (c) =>
            `        { "name": ${JSON.stringify(c.name)}, "type": ${JSON.stringify(c.type)}, ` +
            `"maskedType": ${JSON.stringify(c.maskedType)} }`,
        )
        .join(',\n') +
      `\n      ]\n    }`,
  )
  return (
    `{\n  "version": ${lock.version},\n  "shapeHash": ${JSON.stringify(lock.shapeHash)},\n` +
    `  "views": [\n${views.join(',\n')}\n  ]\n}\n`
  )
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update')
  const { buildCatalog, diffCatalogs } =
    await import('../apps/integration-server/src/analytics/view-catalog.ts')
  const lock = existsSync(LOCK_PATH)
    ? (JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as CatalogLock)
    : null
  const r = checkAnalyticsCatalog(lock, buildCatalog(), diffCatalogs)
  const list = (xs: string[]) => xs.map((x) => `  - ${x}`).join('\n')

  if (update) {
    writeFileSync(LOCK_PATH, formatLock(r.next))
    console.log(
      r.status === 'ok'
        ? 'catalog.lock.json already current.'
        : `catalog.lock.json updated (${r.status}; catalog version ${r.next.version}).`,
    )
    return
  }
  if (r.status === 'ok') {
    console.log(`OK — the SQL view catalog matches catalog.lock.json (version ${r.next.version}).`)
    return
  }
  if (r.status === 'additive') {
    console.log(
      `OK — additive SQL view catalog change(s) since catalog.lock.json:\n${list(r.additive)}\n` +
        `Refresh the lock with \`pnpm check:analytics-catalog --update\`.`,
    )
    return
  }
  console.error(
    `\nBreaking SQL view catalog change(s) since catalog.lock.json:\n${list(r.breaking)}\n` +
      (r.additive.length ? `\n(and additive:\n${list(r.additive)})\n` : '') +
      `\nBI queries written against these views will break. Deployments keep the previous\n` +
      `version (os_analytics_v{N}) beside the new one, but the change needs a release note.\n` +
      `If it is intended, run \`pnpm check:analytics-catalog --update\` (bumps the lock to\n` +
      `version ${r.next.version}) and commit apps/integration-server/src/analytics/catalog.lock.json.\n`,
  )
  process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
}
