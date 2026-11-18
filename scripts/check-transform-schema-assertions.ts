/**
 * Ratchet: every adapter transform test should assert that its output
 * survives the canonical Zod schema.
 *
 * This is the assertion that earns its keep. In an audit of this suite,
 * every one of 44 transform bugs found was caught by `Schema.parse()` /
 * `Schema.safeParse()`; none were caught by the ~75k single-field `toBe`
 * assertions surrounding them.
 *
 * Discovery covers both test layouts documented in
 * scripts/check-transform-tests.ts: the nested layout
 * (`unit/adapters/<slug>/transform/<resource>.test.ts`) and the flat layout
 * (`unit/adapters/<slug>.test.ts` / `<slug>-transform.test.ts`). A test
 * file's own path is not a reliable signal on its own — some files sit
 * under a `transform/` directory but only cover unrelated concerns (e.g.
 * webhook signature verification) and import nothing from `transform/`. So a
 * file qualifies as a transform test if it imports from a `.../transform/...`
 * source module, regardless of where the test file itself lives.
 *
 * Baseline shape matches scripts/check-transform-tests.ts — a JSON file
 * listing files *known* to lack the assertion — but the enforcement is
 * asymmetric, unlike that sibling ratchet. Growth is blocked exactly the
 * same way: a file not in the baseline and lacking the assertion fails the
 * build. Shrinkage is different: a baseline file that has since gained the
 * assertion is only reported (see `fixed` below) and does NOT fail the
 * build, so the baseline can sit at a stale, larger-than-necessary count
 * indefinitely unless someone runs --update. check-transform-tests.ts fails
 * on that same situation, forcing every individual improvement to be banked
 * immediately.
 *
 * That's deliberate here, not an oversight: this baseline is meant to be
 * emptied in bulk, not file-by-file over time the way
 * check-transform-tests.ts's baseline shrinks. Hard-failing on every
 * intermediate improvement would force a baseline commit per file for no
 * safety benefit — nothing regresses by leaving a fixed file's stale entry
 * in place; the guard just under-reports how much has already been fixed
 * until someone runs --update.
 *
 * Revert-coupling hazard: once a genuine bug fixed here has *also* had its
 * test file dropped from the baseline (i.e. the fix and the baseline edit
 * landed as separate commits, which is the norm), reverting only the
 * production-code fix commit restores the pre-fix behaviour but leaves the
 * test file's baseline entry gone — the file is back to lacking a passing
 * schema assertion while no longer allow-listed, so this guard treats it as
 * a fresh regression and fails CI. A single-adapter revert therefore always
 * needs a matching baseline touch-up (re-add that file's path to
 * `transform-schema-assertion-baseline.json`) in the same change, not just
 * a code revert.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const TESTS_ROOT = join(REPO_ROOT, 'apps/integration-server/tests/verticals')
const BASELINE_PATH = join(REPO_ROOT, 'scripts/transform-schema-assertion-baseline.json')

const soft = process.argv.includes('--soft')
const update = process.argv.includes('--update')

/** Any `.test.ts` file under a vertical's `unit/adapters/` tree, either layout. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.includes('/unit/adapters/') && full.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/** True if the file imports from a `.../transform/...` source module. */
const IMPORTS_TRANSFORM = /from\s+['"][^'"]*\/transform\/[^'"]*['"]/

/** True if the file asserts its output against a canonical Zod schema. */
const HAS_SCHEMA_ASSERTION = /\w+Schema\s*\.\s*(?:safeParse|parse)\s*\(/

/**
 * Basenames of pure-helper modules that live under a `transform/` directory
 * but export no `transform*` resource function — e.g. paytm's
 * `transform/shared.ts` (date/currency helpers: `paytmToIso`,
 * `toMinorUnits`, ...) or podio's `transform/helpers.ts` (field accessors).
 * A test file for one of these can never satisfy this guard: the
 * schema-resolution convention below looks for an export named
 * `<Resource>Schema`, so `shared.test.ts` would need a `SharedSchema` (and
 * `helpers.test.ts` a `HelpersSchema`) to exist — and by construction no
 * such schema exists anywhere in any vertical's canonical `schema/`, since
 * there's no `Shared` or `Helpers` resource. Excluded by this explicit list
 * of basenames, not a broader pattern, so a genuine resource transform test
 * is never silently dropped from discovery.
 */
const HELPER_MODULE_BASENAMES = new Set(['shared', 'helpers', 'utils', 'common'])

/** True if this is a transform-directory test file for a helper module (see above), not a resource transform. */
function isHelperModuleTest(file: string): boolean {
  const match = /\/transform\/([^/]+)\.test\.ts$/.exec(file)
  return match !== null && HELPER_MODULE_BASENAMES.has(match[1])
}

const files = walk(TESTS_ROOT)
  .filter((f) => IMPORTS_TRANSFORM.test(readFileSync(f, 'utf8')))
  .filter((f) => !isHelperModuleTest(f))
  .sort()
const lacking = files
  .filter((f) => !HAS_SCHEMA_ASSERTION.test(readFileSync(f, 'utf8')))
  .map((f) => relative(REPO_ROOT, f))

if (update) {
  writeFileSync(BASELINE_PATH, JSON.stringify(lacking, null, 2) + '\n')
  console.log(`Baseline updated: ${lacking.length} file(s) lack a schema assertion.`)
  process.exit(0)
}

const baseline: string[] = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
const baselineSet = new Set(baseline)
const regressions = lacking.filter((f) => !baselineSet.has(f))
const fixed = baseline.filter((f) => !lacking.includes(f))

console.log(
  `Transform tests: ${files.length} total, ${lacking.length} lack a schema assertion ` +
    `(baseline allows ${baseline.length}).`,
)

if (fixed.length > 0) {
  console.log(
    `${fixed.length} baseline file(s) now assert schema validity. ` +
      `Run \`pnpm check:transform-schema-assertions --update\` to bank the progress.`,
  )
}

if (regressions.length === 0) {
  console.log('OK — no new transform test omits its schema assertion.')
  process.exit(0)
}

console.error(
  `\n${regressions.length} transform test(s) omit a Schema.parse()/safeParse() assertion:\n`,
)
for (const f of regressions.slice(0, 25)) console.error(`  ${f}`)
if (regressions.length > 25) console.error(`  ... and ${regressions.length - 25} more`)
console.error(
  `\nAdd an assertion that the transform output parses against its canonical schema, e.g.\n` +
    `  expect(() => InvoiceSchema.parse(result)).not.toThrow()\n` +
    `  // or: expect(InvoiceSchema.safeParse(result).success).toBe(true)\n`,
)
process.exit(soft ? 0 : 1)
