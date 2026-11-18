/**
 * CI guard + coverage ratchet for adapter transform tests.
 *
 * Convention (CONTRIBUTING §6): every adapter under
 * `apps/integration-server/src/verticals/<v>/adapters/<slug>/` that ships a
 * `transform/` directory should have at least one matching test under
 * `apps/integration-server/tests/verticals/<v>/` — either the per-resource
 * layout (`unit/adapters/<slug>/transform/<resource>.test.ts`) or the flat
 * layout (`unit/adapters/<slug>.test.ts` / `<slug>-transform.test.ts`).
 *
 * ~50% of adapters have no transform test today (payments ~0%). Backfilling all
 * of them at once is impractical, so this guard works as a one-way ratchet:
 *
 *   - The current untested set is frozen in `transform-test-baseline.json`.
 *   - A NEW untested adapter (has `transform/`, no test, not in the baseline)
 *     FAILS the build — new work must ship with a test or be added to the
 *     baseline deliberately.
 *   - A baseline adapter that has SINCE GAINED a test FAILS too: the baseline is
 *     stale and must shrink. Run `--update` to rewrite it. This is what stops
 *     coverage from silently backsliding — the list can only get shorter.
 *
 * Flags:
 *   --update   rewrite the baseline to the current untested set, then exit 0.
 *   --soft     report but never fail (exit 0). Use locally / in soft CI.
 *
 * Run: `pnpm check:transform-tests` (`pnpm check:transform-tests:soft`).
 * Exit 0 when coverage holds the line, 1 otherwise.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const SRC_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const TEST_DIR = join(REPO_ROOT, 'apps/integration-server/tests/verticals')
const BASELINE_FILE = join(import.meta.dirname, 'transform-test-baseline.json')

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

function dirs(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

/** Adapter slugs in a vertical that ship a `transform/` directory. */
function adaptersWithTransform(vertical: string): string[] {
  const base = join(SRC_DIR, vertical, 'adapters')
  return dirs(base).filter((slug) => existsSync(join(base, slug, 'transform')))
}

/** Every `*.test.ts` path under a vertical's test tree. */
function testFiles(vertical: string): string[] {
  const root = join(TEST_DIR, vertical)
  const out: string[] = []
  const walk = (p: string) => {
    if (!existsSync(p)) return
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.test.ts')) out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * A slug is "tested" if any test path references it at a path boundary — as an
 * `adapters/<slug>/` directory, or a `<slug>.test.ts` / `<slug>-*.test.ts`
 * filename. Boundary anchors (`/`, `.`, `-`) avoid `ada` matching `adabox`.
 */
function isTested(slug: string, files: string[]): boolean {
  return files.some(
    (f) =>
      f.includes(`/adapters/${slug}/`) || f.includes(`/${slug}.test.ts`) || f.includes(`/${slug}-`),
  )
}

interface Row {
  vertical: string
  adapters: number
  tested: number
}

const rows: Row[] = []
const untested: string[] = [] // `vertical/slug`

for (const vertical of VERTICALS) {
  const slugs = adaptersWithTransform(vertical)
  const files = testFiles(vertical)
  let tested = 0
  for (const slug of slugs) {
    if (isTested(slug, files)) tested++
    else untested.push(`${vertical}/${slug}`)
  }
  rows.push({ vertical, adapters: slugs.length, tested })
}
untested.sort()

// ── Coverage table (always printed) ────────────────────────────────────────
const totAdapters = rows.reduce((a, r) => a + r.adapters, 0)
const totTested = rows.reduce((a, r) => a + r.tested, 0)
const pct = (n: number, d: number) => (d === 0 ? '100' : ((100 * n) / d).toFixed(1))
console.log('transform-test coverage:')
console.log('  vertical          | adapters | tested |    % | gap')
console.log('  ------------------+----------+--------+------+-----')
for (const r of rows) {
  console.log(
    `  ${r.vertical.padEnd(17)} | ${String(r.adapters).padStart(8)} | ${String(r.tested).padStart(6)} | ${pct(
      r.tested,
      r.adapters,
    ).padStart(4)} | ${String(r.adapters - r.tested).padStart(3)}`,
  )
}
console.log(
  `  TOTAL: ${totTested}/${totAdapters} adapters tested (${pct(totTested, totAdapters)}%)`,
)

// ── --update: freeze the current untested set as the new baseline ───────────
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_FILE, JSON.stringify(untested, null, 2) + '\n')
  console.log(
    `\n✓ baseline updated: ${untested.length} known-untested adapter(s) → ${BASELINE_FILE}`,
  )
  process.exit(0)
}

const baseline: string[] = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  : []
const baselineSet = new Set(baseline)
const untestedSet = new Set(untested)

// New untested adapters that aren't grandfathered in — the forward-looking gate.
const newlyUntested = untested.filter((s) => !baselineSet.has(s))
// Baseline entries that now HAVE tests — the ratchet must tighten.
const nowTested = baseline.filter((s) => !untestedSet.has(s))

const soft = process.argv.includes('--soft')
const stream = soft ? console.warn : console.error

let failed = false

if (newlyUntested.length > 0) {
  failed = true
  stream(
    `\n✗ ${newlyUntested.length} adapter(s) ship a transform/ but have NO test and are not in the baseline:`,
  )
  for (const s of newlyUntested) stream(`    - ${s}`)
  stream(
    `  Add a test under tests/verticals/<v>/unit/adapters/<slug>/transform/, ` +
      `or (if deliberate) run \`pnpm check:transform-tests --update\`.`,
  )
}

if (nowTested.length > 0) {
  failed = true
  stream(
    `\n✗ ${nowTested.length} baseline adapter(s) now HAVE tests — the baseline is stale and must shrink:`,
  )
  for (const s of nowTested) stream(`    - ${s}`)
  stream(`  Run \`pnpm check:transform-tests --update\` to ratchet the baseline down.`)
}

if (!failed) {
  console.log(
    `\n✓ transform-test ratchet holds (${baseline.length} known-untested adapter(s) grandfathered).`,
  )
  process.exit(0)
}

process.exit(soft ? 0 : 1)
