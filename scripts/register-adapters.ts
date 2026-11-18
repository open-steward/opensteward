/**
 * Batch-register newly generated adapters into a vertical's `factories.ts`
 * and `platforms/metadata.ts`. Idempotent: only adds slugs that have an
 * adapter dir but are not yet a factory key. Metadata is pulled from the
 * missing-platforms catalog (default /tmp/missing_platforms.json).
 *
 * After running this, run `pnpm generate:webhook-aggregators` and the gates
 * (tsc, check:adapter-parity, check:webhook-verifiers, vitest).
 *
 * Usage: tsx scripts/register-adapters.ts <vertical> [catalog.json]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const VDIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')

const vertical = process.argv[2]
const rest = process.argv.slice(3)
const catalogPath = rest.find((a) => !a.startsWith('--')) ?? '/tmp/missing_platforms.json'
const onlyArg = rest.find((a) => a.startsWith('--only='))
const onlyList = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean))
  : null
if (!vertical) {
  console.error(
    'usage: tsx scripts/register-adapters.ts <vertical> [catalog.json] [--only=slug1,slug2]',
  )
  process.exit(1)
}

const adaptersDir = join(VDIR, vertical, 'adapters')
const factoriesFile = join(VDIR, vertical, 'adapter/factories.ts')
const metadataFile = join(VDIR, vertical, 'platforms/metadata.ts')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const catBySlug = new Map<string, Record<string, unknown>>()
for (const e of catalog[vertical] ?? []) catBySlug.set(e.slug as string, e)

const dirs = readdirSync(adaptersDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

let factoriesSrc = readFileSync(factoriesFile, 'utf8')
const factoryKeys = new Set(
  [...factoriesSrc.matchAll(/(?:^|[\s,{])'?([a-z0-9-]+)'?\s*:\s*factory\(/g)].map((m) => m[1]),
)

// 'shared' is a helper dir, not a platform adapter
const NON_PLATFORM_DIRS = new Set(['shared'])

const toRegister = dirs
  .filter((slug) => !NON_PLATFORM_DIRS.has(slug))
  .filter((slug) => !factoryKeys.has(slug))
  .filter((slug) => !onlyList || onlyList.has(slug))
if (toRegister.length === 0) {
  console.log(
    `register-adapters[${vertical}]: nothing to register (all ${dirs.length} dirs already in factories.ts)`,
  )
  process.exit(0)
}

// ── factories.ts: add imports + object entries ─────────────────────────────
function classOf(slug: string): string {
  const idx = readFileSync(join(adaptersDir, slug, 'index.ts'), 'utf8')
  const m = idx.match(/export class (\w*Adapter)\b/)
  if (!m) throw new Error(`no "export class XAdapter" in ${slug}/index.ts`)
  return m[1]
}
const key = (slug: string) => (/^[a-z][a-z0-9]*$/.test(slug) ? slug : `'${slug}'`)

const imports = toRegister.map((s) => `import { ${classOf(s)} } from '../adapters/${s}'`).join('\n')
const lines = toRegister.map((s) => `  ${key(s)}: factory(${classOf(s)}),`).join('\n')

// Insert imports after the last `from '../adapters/...'` import.
const lastImport = [...factoriesSrc.matchAll(/^import .*from '\.\.\/adapters\/[^']+'\n/gm)].pop()
if (!lastImport) throw new Error('could not find adapter imports in factories.ts')
const impIdx = lastImport.index! + lastImport[0].length
factoriesSrc = factoriesSrc.slice(0, impIdx) + imports + '\n' + factoriesSrc.slice(impIdx)

// Insert factory lines before the final closing brace of the file (the
// ADAPTER_FACTORIES object is the last statement).
const lastBrace = factoriesSrc.lastIndexOf('\n}')
factoriesSrc = factoriesSrc.slice(0, lastBrace) + '\n' + lines + factoriesSrc.slice(lastBrace)
writeFileSync(factoriesFile, factoriesSrc)

// ── metadata.ts: add PlatformMetadata entries ──────────────────────────────
const CORE = [
  'slug',
  'name',
  'description',
  'website',
  'category',
  'primary_color',
  'auth_type',
  'hq_country',
  'docs_url',
  'pricing_url',
  'founded_year',
  'recommendedScopes',
  'requiresSubdomain',
]
function fmt(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => `'${String(x).replace(/'/g, "\\'")}'`).join(', ')}]`
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}
const missingMeta: string[] = []
const entries = toRegister
  .map((slug) => {
    const e = catBySlug.get(slug)
    if (!e) {
      missingMeta.push(slug)
      return ''
    }
    let out = '  {\n'
    for (const f of CORE) if (e[f] !== undefined) out += `    ${f}: ${fmt(e[f])},\n`
    out += '  },'
    return out
  })
  .filter(Boolean)
  .join('\n')

let metaSrc = readFileSync(metadataFile, 'utf8')
const metaSlugs = new Set(
  [...metaSrc.matchAll(/(?:^|[\s{])slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]),
)
const newMeta = entries && toRegister.some((s) => !metaSlugs.has(s))
if (newMeta) {
  // Find the platforms array's opening `[` (inline `export const PLATFORMS …= [`
  // or `const PLATFORMS_ARRAY …= [`), then bracket-count (string-aware) to its
  // matching `]` and insert the new entries just before it.
  const open = metaSrc.search(/(?:export\s+)?const\s+PLATFORMS(?:_ARRAY)?[^=]*=\s*\[/)
  if (open < 0) throw new Error('could not find the PLATFORMS array literal in metadata.ts')
  const arrStart = metaSrc.indexOf('[', open)
  let depth = 0
  let i = arrStart
  let quote = ''
  for (; i < metaSrc.length; i++) {
    const c = metaSrc[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) break
    }
  }
  // i is the matching `]`. Back up over trailing whitespace to insert cleanly.
  let ins = i
  while (ins > 0 && /\s/.test(metaSrc[ins - 1])) ins--
  metaSrc = metaSrc.slice(0, ins) + '\n' + entries + '\n' + metaSrc.slice(ins)
  writeFileSync(metadataFile, metaSrc)
}

console.log(
  `register-adapters[${vertical}]: registered ${toRegister.length} adapter(s): ${toRegister.join(', ')}`,
)
if (missingMeta.length)
  console.warn(
    `  WARNING: no catalog metadata for: ${missingMeta.join(', ')} (factory added, metadata MISSING — add manually)`,
  )
console.log(
  '  next: pnpm generate:webhook-aggregators && pnpm check:adapter-parity && pnpm check:webhook-verifiers && tsc --noEmit',
)
