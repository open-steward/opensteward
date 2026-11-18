/**
 * Bulk retrofit script for the Connect Link credential-form framework.
 *
 * Walks every adapter under apps/integration-server/src/verticals/<vertical>/
 * adapters/<slug>/, looks up its `auth_type` from the vertical's metadata,
 * and:
 *
 *   - api_key / session / local → patches index.ts to import + assign
 *     `simpleApiKey()` to `credentialFields` + `exchangeCredentials`.
 *     Idempotent: skips adapters that already have `credentialFields`.
 *   - oauth2_cc                  → flags for manual review, prints a checklist.
 *   - oauth2                     → no-op (already link-ready).
 *
 * Inserts only — never deletes existing methods. Each insertion lands
 * immediately after the `class <Name>Adapter implements <X> {` line so the
 * diff is one minimal block per adapter.
 *
 * Usage:
 *   pnpm --filter integration-server tsx scripts/retrofit-credential-forms.ts [--vertical=<v>] [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { PLATFORMS as ACCOUNTING } from '../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM } from '../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE } from '../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS } from '../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as DOCSIGN } from '../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS } from '../src/verticals/projects/platforms/metadata'
import { PLATFORMS as SUPPORT } from '../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INVENTORY } from '../src/verticals/inventory/platforms/metadata'

interface PlatformMetaLike {
  slug: string
  auth_type?: string
  authType?: string
}

const SOURCES: Array<{ vertical: string; rows: readonly PlatformMetaLike[] }> = [
  { vertical: 'accounting', rows: ACCOUNTING as readonly PlatformMetaLike[] },
  { vertical: 'crm', rows: CRM as readonly PlatformMetaLike[] },
  { vertical: 'ecommerce', rows: ECOMMERCE as readonly PlatformMetaLike[] },
  { vertical: 'logistics', rows: LOGISTICS as readonly PlatformMetaLike[] },
  { vertical: 'docsign', rows: DOCSIGN as readonly PlatformMetaLike[] },
  { vertical: 'projects', rows: PROJECTS as readonly PlatformMetaLike[] },
  { vertical: 'customer-support', rows: SUPPORT as readonly PlatformMetaLike[] },
  { vertical: 'inventory', rows: INVENTORY as readonly PlatformMetaLike[] },
]

const ROOT = join(__dirname, '..', 'src', 'verticals')

interface RetrofitResult {
  vertical: string
  slug: string
  authType: string
  status: 'patched' | 'already-done' | 'oauth-skip' | 'oauth-cc-manual' | 'no-class' | 'no-index'
  notes?: string
}

function args(): { vertical?: string; dryRun: boolean } {
  const argv = process.argv.slice(2)
  const v = argv.find((a) => a.startsWith('--vertical='))?.split('=')[1]
  return { vertical: v, dryRun: argv.includes('--dry-run') }
}

function adapterDir(vertical: string, slug: string): string {
  return join(ROOT, vertical, 'adapters', slug)
}

function exists(p: string): boolean {
  try { statSync(p); return true } catch { return false }
}

function isLinkReadyType(authType: string): boolean {
  return authType === 'api_key' || authType === 'session' || authType === 'local'
}

const MARKER = 'credentialFields'
const SHARED_PKG = "from '@opensteward/shared'"
const SIMPLE_KEY_IMPORT_NAME = 'simpleApiKey'

function patchIndex(filePath: string, slug: string): RetrofitResult['status'] | { error: string } {
  const src = readFileSync(filePath, 'utf8')
  if (src.includes(`${MARKER}(`) || src.includes(`${MARKER} =`) || src.includes(`${MARKER}:`)) {
    return 'already-done'
  }
  // Find the adapter class declaration line.
  const classRe = /^(\s*)export\s+class\s+\w+Adapter\s+implements\s+\w+(?:Adapter)?\s*\{\s*$/m
  const match = src.match(classRe)
  if (!match) return { error: 'no-class-line-found' }
  const indent = (match[1] ?? '') + '  '
  const insertion =
    `\n` +
    `${indent}// Connect Link support — single API-key form.\n` +
    `${indent}credentialFields = SIMPLE_API_KEY_FORM.credentialFields\n` +
    `${indent}exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials\n`

  // Splice the insertion after the matched line.
  const matchEnd = (match.index ?? 0) + match[0].length
  let updated = src.slice(0, matchEnd) + insertion + src.slice(matchEnd)

  // Add a value import for `simpleApiKey` from @opensteward/shared, if
  // not already present. We deliberately do NOT extend an existing
  // `import type { … } from '@opensteward/shared'` line — that would
  // declare the helper as a type-only import and TypeScript would reject
  // its use as a value. Instead we extend an existing *value* import, or
  // prepend a fresh value import.
  const valueImportRe = /(import\s*\{[^}]*?)(\}\s*from\s*'@opensteward\/shared')/
  const hasValueImport = valueImportRe.test(updated)
  const alreadyImported = new RegExp(`\\b${SIMPLE_KEY_IMPORT_NAME}\\b\\s*[},]`).test(updated)
  if (!alreadyImported) {
    if (hasValueImport) {
      updated = updated.replace(valueImportRe, (_full, head: string, tail: string) => {
        if (head.includes(SIMPLE_KEY_IMPORT_NAME)) return _full
        const trimmed = head.replace(/\s+$/, '')
        const sep = trimmed.endsWith(',') || trimmed.endsWith('{') ? ' ' : ', '
        return `${trimmed}${sep}${SIMPLE_KEY_IMPORT_NAME} ${tail}`
      })
    } else {
      updated = `import { ${SIMPLE_KEY_IMPORT_NAME} } from '@opensteward/shared'\n` + updated
    }
  }
  // Module-level helper instance — single one per file, reused by the two
  // fields above. Use a precise marker (the `const NAME =` declaration)
  // because the field assignments themselves reference the same identifier.
  if (!updated.includes('const SIMPLE_API_KEY_FORM =')) {
    // Place it right before the class declaration so the form is in scope.
    updated = updated.replace(
      classRe,
      `const SIMPLE_API_KEY_FORM = ${SIMPLE_KEY_IMPORT_NAME}()\n\n$&`,
    )
  }

  writeFileSync(filePath, updated)
  return 'patched'
}

function processAdapter(vertical: string, slug: string, authType: string, dryRun: boolean): RetrofitResult {
  const dir = adapterDir(vertical, slug)
  if (!exists(dir)) return { vertical, slug, authType, status: 'no-index', notes: 'adapter dir missing' }
  const indexPath = join(dir, 'index.ts')
  if (!exists(indexPath)) return { vertical, slug, authType, status: 'no-index', notes: 'index.ts missing' }
  if (authType === 'oauth2') return { vertical, slug, authType, status: 'oauth-skip' }
  if (authType === 'oauth2_cc') {
    const src = readFileSync(indexPath, 'utf8')
    if (src.includes(`${MARKER}(`) || src.includes(`${MARKER} =`) || src.includes(`${MARKER}:`)) {
      return { vertical, slug, authType, status: 'already-done' }
    }
    return { vertical, slug, authType, status: 'oauth-cc-manual' }
  }
  if (!isLinkReadyType(authType)) {
    return { vertical, slug, authType, status: 'oauth-skip', notes: `unsupported auth_type ${authType}` }
  }
  if (dryRun) {
    const src = readFileSync(indexPath, 'utf8')
    if (src.includes(`${MARKER}(`) || src.includes(`${MARKER} =`)) {
      return { vertical, slug, authType, status: 'already-done' }
    }
    return { vertical, slug, authType, status: 'patched', notes: '(dry-run)' }
  }
  const result = patchIndex(indexPath, slug)
  if (typeof result === 'object' && 'error' in result) {
    return { vertical, slug, authType, status: 'no-class', notes: result.error }
  }
  return { vertical, slug, authType, status: result }
}

function main(): void {
  const { vertical: vFilter, dryRun } = args()
  const results: RetrofitResult[] = []

  for (const source of SOURCES) {
    if (vFilter && source.vertical !== vFilter) continue
    for (const p of source.rows) {
      const slug = p.slug
      const authType = String(p.auth_type ?? p.authType ?? 'oauth2')
      results.push(processAdapter(source.vertical, slug, authType, dryRun))
    }
  }

  // Walk the adapters/ directories too — catch any adapter dir that lacks
  // a metadata row (these usually need a manual fix). `shared` is the
  // per-vertical base interface module, not an adapter — skip it.
  const NON_ADAPTER_DIRS = new Set(['shared'])
  for (const source of SOURCES) {
    if (vFilter && source.vertical !== vFilter) continue
    const dir = join(ROOT, source.vertical, 'adapters')
    if (!exists(dir)) continue
    const known = new Set(source.rows.map((r) => r.slug))
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      if (NON_ADAPTER_DIRS.has(ent.name)) continue
      if (known.has(ent.name)) continue
      results.push({ vertical: source.vertical, slug: ent.name, authType: '?', status: 'no-index', notes: 'no metadata row' })
    }
  }

  // Summary.
  const grouped: Record<string, RetrofitResult[]> = {}
  for (const r of results) {
    grouped[r.status] = grouped[r.status] ?? []
    grouped[r.status]!.push(r)
  }

  console.log('\n── retrofit summary ─────────────────────────────────────')
  for (const status of ['patched', 'already-done', 'oauth-cc-manual', 'oauth-skip', 'no-class', 'no-index']) {
    const list = grouped[status] ?? []
    if (list.length === 0) continue
    console.log(`\n[${status}] ${list.length}`)
    if (status === 'oauth-cc-manual' || status === 'no-class') {
      for (const r of list) console.log(`  ${r.vertical}/${r.slug} (${r.authType})${r.notes ? ' — ' + r.notes : ''}`)
    } else if (status === 'no-index') {
      for (const r of list) console.log(`  ${r.vertical}/${r.slug}${r.notes ? ' — ' + r.notes : ''}`)
    } else if (status === 'patched' || status === 'already-done') {
      // print first 8 only, then count
      for (const r of list.slice(0, 8)) console.log(`  ${r.vertical}/${r.slug}`)
      if (list.length > 8) console.log(`  … ${list.length - 8} more`)
    }
  }
  console.log('\n')
}

main()
