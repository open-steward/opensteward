/**
 * Regression pins for ANSI colour handling: under `CI=true` (which this
 * repo's `test.yml` sets at the workflow `env:` level), prettier's
 * `[warn] <path>` lines come out with the word `warn` wrapped in SGR colour
 * codes — literal bytes `[` ESC `[33m` `warn` ESC `[39m` `]`, not `[warn]`.
 * Without `stripAnsi`, `extractPrettierCount`'s per-file regex (a plain
 * `[warn] ` prefix) matches zero lines and would silently report 0 problems
 * (and one `--update` would baseline prettier to 0 while staying green),
 * except that `extractPrettierCount`'s own summary/file-count cross-check
 * catches the resulting disagreement and throws instead. These tests pin
 * both the strip and that cross-check.
 *
 * Run: `pnpm exec tsx --test scripts/check-warning-gates.test.ts`. Plain
 * `node:test` + `node:assert` — no framework dependency, matching every
 * other script in this directory, which are dependency-free `tsx` scripts
 * with no workspace of their own to host a vitest config.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripAnsi,
  extractPrettierCount,
  extractLintErrorCount,
  crashSignature,
  TYPECHECK_TESTS_WORKSPACES,
} from './check-warning-gates.ts'

/** SGR-wrap `warn` exactly the way prettier does under `CI=true`: `\x1b[33mwarn\x1b[39m`. */
function colourWarn(): string {
  return '\x1b[33mwarn\x1b[39m'
}

/** Build a synthetic `prettier --check` transcript with `n` failing files, optionally coloured. */
function prettierTranscript(paths: string[], coloured: boolean): string {
  const warn = coloured ? colourWarn() : 'warn'
  const lines = paths.map((p) => `[${warn}] ${p}`)
  lines.push(
    `[${warn}] Code style issues found in ${paths.length} files. Run Prettier with --write to fix.`,
  )
  return `Checking formatting...\n${lines.join('\n')}\n`
}

const SAMPLE_PATHS = Array.from({ length: 112 }, (_, i) => `scripts/fixture-${i}.ts`)

test('stripAnsi removes the exact SGR sequence prettier emits under CI=true', () => {
  const raw = `[${colourWarn()}] scripts/check-adapter-parity.ts`
  assert.equal(stripAnsi(raw), '[warn] scripts/check-adapter-parity.ts')
})

test('stripAnsi is a no-op on plain text, including text that merely resembles a code (no ESC byte)', () => {
  // "[33m" with no preceding ESC (\x1b) is just text, not a colour code, and
  // must survive untouched — otherwise this would be stripping content, not
  // escape sequences, on any file path or message that happens to contain
  // digit-bracket substrings.
  const plain = '[warn] packages/shared/src/[33m-not-a-real-code].ts'
  assert.equal(stripAnsi(plain), plain)
})

test('extractPrettierCount reads 0 files from a coloured transcript when ANSI is NOT stripped first', () => {
  // Pins the hazard itself: un-stripped coloured output makes the per-file
  // regex (which requires a literal "[warn] " prefix that colour codes
  // break) match zero lines; the consistency check must throw rather than
  // silently return 0.
  const coloured = prettierTranscript(SAMPLE_PATHS, true)
  assert.throws(
    () => extractPrettierCount(coloured),
    /summary line says 112 file\(s\) but 0 distinct/,
    'un-stripped coloured output should hit the consistency check, not silently return 0',
  )
})

test('extractPrettierCount(stripAnsi(...)) reads 112 files from a coloured transcript — the actual fix', () => {
  const coloured = prettierTranscript(SAMPLE_PATHS, true)
  assert.equal(extractPrettierCount(stripAnsi(coloured)), 112)
})

test('extractPrettierCount reads 112 files from an uncoloured transcript unchanged (no regression for the common case)', () => {
  const plain = prettierTranscript(SAMPLE_PATHS, false)
  assert.equal(extractPrettierCount(plain), 112)
})

test('extractPrettierCount still throws when file-count and summary genuinely disagree, post-stripAnsi', () => {
  // ANSI stripping must not paper over real disagreements — construct a
  // transcript (already colour-free, as if it had already been through
  // stripAnsi) whose summary line lies about the file count.
  const lines = SAMPLE_PATHS.slice(0, 5).map((p) => `[warn] ${p}`)
  lines.push('[warn] Code style issues found in 6 files. Run Prettier with --write to fix.')
  const transcript = `Checking formatting...\n${lines.join('\n')}\n`
  assert.throws(
    () => extractPrettierCount(transcript),
    /summary line says 6 file\(s\) but 5 distinct/,
    'a genuine mismatch must still fail loudly, not be silently resolved by ANSI stripping',
  )
})

test('extractLintErrorCount is unaffected by stripAnsi on plain (uncoloured) eslint summary lines', () => {
  // eslint's summary line is uncoloured under CI=true in observed runs, but
  // stripAnsi runs unconditionally for every gate — confirm it's harmless
  // on lint's shape too, not just a no-op that happens to dodge prettier's.
  const raw =
    'packages/shared lint: ✖ 2 problems (0 errors, 2 warnings)\n' +
    'apps/integration-server lint: ✖ 96 problems (48 errors, 48 warnings)\n'
  assert.equal(extractLintErrorCount(stripAnsi(raw)), 48)
})

/**
 * Crash-signature pins. `tsc` (TypeScript 7) is a native Go binary, not a
 * Node process, which determines how it dies. The V8-shaped
 * signatures below it (`FATAL ERROR:`, `JavaScript heap out of memory`) can
 * never be emitted by a Go compiler — when the kernel OOM-kills it, it dies
 * on SIGKILL and prints nothing at all. The transcript in
 * `PNPM_SIGKILL_TRANSCRIPT` is the verbatim output observed when a 5-way
 * concurrent `docker compose build` exhausted a 5.9GB VM and the kernel
 * killed the integration-server typecheck.
 *
 * Why this matters beyond tidiness: `assertNotCrashed` only distrusts a count
 * of exactly 0. A tsc killed part-way through has already printed some real
 * errors, so it yields a partial NON-ZERO count that would be taken at face
 * value. The ratchet then fails claiming the baseline is stale and should be
 * shrunk via `--update` — and following that advice would permanently ratchet
 * coverage down to whatever the dying compiler happened to print.
 */
const PNPM_SIGKILL_TRANSCRIPT = [
  '> integration-server@1.0.0 typecheck:tests /app/apps/integration-server',
  '> tsc --noEmit -p tsconfig.test.json',
  '',
  'tests/verticals/accounting/unit/adapters/fortnox/transform/invoice.test.ts(12,7): error TS2322: Type mismatch.',
  '/app/apps/integration-server:',
  ' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  integration-server@1.0.0 typecheck:tests: `tsc --noEmit -p tsconfig.test.json`',
  'Command failed with signal "SIGKILL"',
].join('\n')

/** A lint run that legitimately fails with real errors — must NOT look like a crash. */
const LINT_REAL_FAILURE_TRANSCRIPT = [
  '/app/apps/integration-server/src/verticals/projects/adapters/trello/index.ts',
  '  49:3  warning  Unused eslint-disable directive',
  '',
  '✖ 96 problems (48 errors, 48 warnings)',
  '/Users/x/opensteward/apps/integration-server:',
  ' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  integration-server@1.0.0 lint: `eslint src`',
  'Exit status 1',
].join('\n')

test('crashSignature detects a Go-compiler SIGKILL, which emits no V8 text at all', () => {
  const hit = crashSignature(PNPM_SIGKILL_TRANSCRIPT)
  assert.ok(
    hit,
    'a tsc killed by the OOM killer must be recognised as a crash — it prints neither ' +
      '"FATAL ERROR:" nor "JavaScript heap out of memory"; tsc is a native Go binary and cannot emit V8 text',
  )
})

test('crashSignature detects a Go runtime out-of-memory abort', () => {
  assert.ok(crashSignature('fatal error: runtime: out of memory\n\ngoroutine 1 [running]:'))
})

test('crashSignature does NOT fire on a lint run that legitimately failed with real errors', () => {
  assert.equal(
    crashSignature(LINT_REAL_FAILURE_TRANSCRIPT),
    undefined,
    'a non-zero exit carrying a real problem count is a normal gate failure, not a crash — ' +
      'treating it as a crash would break the lint ratchet, which fails by design at 48 errors',
  )
})

test('crashSignature still detects the original V8 signatures (no regression)', () => {
  assert.ok(crashSignature('FATAL ERROR: Reached heap limit Allocation failed'))
  assert.ok(crashSignature('JavaScript heap out of memory'))
  assert.ok(crashSignature('spawn tsc ENOENT'))
})

test('the typecheck-tests gate runs every workspace that has a typecheck:tests script', () => {
  // A script no gate runs is dead: its test files drift from their types with CI green.
  const root = join(import.meta.dirname, '..')
  const withScript: string[] = []
  for (const top of ['apps', 'packages']) {
    for (const dir of readdirSync(join(root, top))) {
      const path = join(root, top, dir, 'package.json')
      if (!existsSync(path)) continue
      const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
        name: string
        scripts?: Record<string, string>
      }
      if (pkg.scripts?.['typecheck:tests']) withScript.push(pkg.name)
    }
  }
  assert.ok(withScript.includes('integration-server'), 'the walk found no workspace')
  assert.deepEqual([...TYPECHECK_TESTS_WORKSPACES].sort(), withScript.sort())
})
