/**
 * Ratchet for the three CI gates that run warning-only (`|| true`
 * in .github/workflows/test.yml): test-file typecheck, `pnpm -r run lint`,
 * and `prettier --check` over scripts/ and every package's src tree. Each
 * carries pre-existing debt (see `warning-gate-baseline.json`), so a hard
 * gate would fail on every run. This script makes the existing
 * count a *ceiling* instead: it re-runs the gate's real command, extracts
 * the same count a human would read off the raw output, and compares
 * against `warning-gate-baseline.json`.
 *
 *   - count > baseline  → NEW problems were introduced. FAILS, with the delta.
 *   - count < baseline  → the baseline is stale — genuine cleanup happened
 *     that nobody banked. FAILS too, exactly the way
 *     check-transform-tests.ts:168 fails when a baseline adapter gains a
 *     test: shrinkage must be committed deliberately (`--update`), not
 *     left to sit as slack the count can silently grow back into. This is
 *     what makes it a one-way ratchet instead of a high-water mark.
 *     (Contrast check-transform-schema-assertions.ts, which deliberately
 *     only *logs* this case — its baseline is meant to be emptied in bulk,
 *     where forcing a baseline commit on every intermediate file would be
 *     ceremony with no safety benefit. These three gates instead shrink
 *     file-by-file over time the same way check-transform-tests.ts's
 *     baseline shrinks, so shrinkage must be banked immediately and they
 *     follow its stricter behaviour.)
 *   - count === baseline → pass.
 *
 * Counting is intentionally not "grep the last line" — each tool's output
 * has a different shape and a different way to get it subtly wrong:
 *   - tsc:      one `error TS\d+:` per reported error, on the line the
 *               error starts on; multi-line explanations don't repeat it.
 *   - eslint (via `pnpm -r run lint`): one `✖ N problems (E errors,
 *               W warnings)` summary line PER WORKSPACE (pnpm -r runs 5).
 *               The number that matters is the sum of E across every such
 *               line — not the last line printed, and not W.
 *   - prettier --check: one `[warn] <path>` line per failing file, plus a
 *               trailing `[warn] Code style issues found in N files`
 *               summary that must NOT be counted as a file itself. The
 *               summary's own N is cross-checked against the counted line
 *               total as a second, independent measurement — if they
 *               disagree, something about the output shape changed and
 *               this script refuses to guess which number is right.
 *
 * The trap this guards against: every one of these commands exits non-zero
 * when it finds problems, which is exactly what a crash also looks like
 * from the outside (OOM, a missing workspace, a missing binary). Reading a
 * crash as "0 problems found" would silently re-baseline the gate to zero
 * on `--update`, or silently pass it outright without `--update` — the
 * worst possible failure mode for a guard, since it fails open. So this
 * script never trusts a bare exit code:
 *   - `count > 0` is trusted regardless of exit code (these tools always
 *     exit non-zero when count > 0 — that's not a crash, it's the report).
 *   - `count === 0` is trusted ONLY when the exit code is also 0. A zero
 *     count paired with a non-zero exit is treated as a crash, not a clean
 *     pass, and fails loudly (see `assertNotCrashed` below) — this holds
 *     even under `--soft`, because `--soft` means "don't fail the ratchet
 *     comparison," not "don't notice the tool didn't run."
 *   - A handful of unambiguous crash signatures (V8 OOM abort, death by
 *     signal, a Go runtime OOM, `spawn ENOENT`, a shell "command not found",
 *     pnpm unable to resolve a workspace/script) are checked independently of
 *     the count, so a crash that happens to leave a partial, non-empty,
 *     non-zero-count output behind (e.g. tsc is OOM-killed after already
 *     printing some real errors) is still caught rather than silently
 *     under-counted. Note that `tsc` is the native TypeScript 7 Go binary:
 *     it cannot emit a V8 message, so the signal-shaped signature — not the
 *     V8 one — is what actually catches a typecheck OOM today.
 *
 * Flags:
 *   --update   rewrite this gate's baseline entry to the current count,
 *              then exit 0.
 *   --soft     report but never fail the ratchet comparison (exit 0).
 *              Crashes still fail loudly even with --soft — see above.
 *
 * Run: `pnpm check:warning-gates <gate>` (`pnpm check:warning-gates:soft <gate>`),
 * gate one of: typecheck-tests | lint | prettier.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = join(import.meta.dirname, '..')
const BASELINE_FILE = join(import.meta.dirname, 'warning-gate-baseline.json')

type GateId = 'typecheck-tests' | 'lint' | 'prettier'
const GATE_IDS: GateId[] = ['typecheck-tests', 'lint', 'prettier']

interface GateSpec {
  id: GateId
  label: string
  command: string
  args: string[]
  env?: Record<string, string>
  /** Extract the count a human reading the raw output would report. */
  extractCount: (output: string) => number
}

/**
 * Strip ANSI SGR (colour/style) escape sequences from captured tool output
 * before any extraction runs — applied once, centrally, to every gate's
 * combined stdout+stderr, not as a per-extractor patch. Colour behaviour
 * depends on `CI`, `FORCE_COLOR`, `NO_COLOR`, TTY detection, and tool
 * version — none of which this script controls precisely enough to promise
 * "no gate will ever emit colour," and a per-tool fix would only close the
 * one instance that happened to break, not the class.
 *
 * This is not hypothetical: under `CI=true` (which this repo's actual CI
 * sets), prettier's `[warn] <path>` lines come out as literal bytes
 * `[` ESC `[33m` `warn` ESC `[39m` `]` — i.e. `[\x1b[33mwarn\x1b[39m]`, not
 * `[warn]`. On such output the per-file regex below, which looks for a
 * literal `[warn] ` prefix, matches zero lines, and the extractor would
 * silently read 0 files while the summary line's plain digits survive
 * untouched (digits aren't coloured). That is caught, not silently
 * swallowed, because `extractPrettierCount` cross-checks the file count
 * against the summary count and refuses to guess when they disagree — see
 * below. Without that check this would be a silent 0-count free pass: eslint
 * and tsc don't colour their output under the conditions tested so far,
 * but that is an accident of today's heuristics, not a guarantee, so this
 * strip runs unconditionally for all three gates rather than only prettier.
 * `NO_COLOR: '1'` is also set on every spawned command (see `runGate`) as a
 * second, independent layer — belt and braces, since this guard's failure
 * mode if colour output slips through uncaught is silently reporting zero.
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Lines tsc emits one per error: `path(line,col): error TS1234: message`. */
export function extractTypecheckCount(output: string): number {
  return output.split('\n').filter((line) => /error TS\d+:/.test(line)).length
}

/**
 * `pnpm -r run lint` prefixes every line with `<workspace> lint: ` and
 * prints one `✖ N problems (E errors, W warnings)` summary per workspace
 * that has a `lint` script (5 of 12 today). Sum E across every such line;
 * ignore W entirely, and ignore workspaces that print no summary at all
 * (0 problems — pnpm silently skips workspaces with no `lint` script, and
 * eslint prints nothing when a workspace is fully clean).
 */
export function extractLintErrorCount(output: string): number {
  const re = /✖\s*\d+\s*problems?\s*\((\d+)\s*errors?,\s*\d+\s*warnings?\)/g
  let total = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(output))) total += Number(match[1])
  return total
}

/**
 * `prettier --check` prints one `[warn] <path>` line per failing file, then
 * a trailing `[warn] Code style issues found in N files.` summary that is
 * NOT itself a file. Count file lines by excluding that summary shape, then
 * cross-check the count against the summary's own N — if the output format
 * ever changes such that these two disagree, that's a sign the extraction
 * regex silently stopped matching what it used to, which is exactly the
 * "lenient direction" failure this script is built to avoid, so it refuses
 * to pick a winner and fails loudly instead.
 */
export function extractPrettierCount(output: string): number {
  const fileLines = output
    .split('\n')
    .filter((line) => /^\[warn\] /.test(line) && !/^\[warn\] Code style issues found/.test(line))
  const summaryMatch = /Code style issues found in (\d+) files?/.exec(output)
  if (summaryMatch) {
    const summaryCount = Number(summaryMatch[1])
    if (summaryCount !== fileLines.length) {
      throw new Error(
        `prettier output parsing is inconsistent: the summary line says ${summaryCount} file(s) ` +
          `but ${fileLines.length} distinct "[warn] <path>" line(s) were counted. Refusing to guess ` +
          `which number is right — inspect the raw \`prettier --check\` output and fix the extraction regex.`,
      )
    }
  }
  return fileLines.length
}

/**
 * Every workspace with a `typecheck:tests` script. vitest strips types, so a
 * test file no gate typechecks can drift from the types it exercises with the
 * suite still green; check-warning-gates.test.ts fails when a workspace adds
 * the script without being listed here. license-token's tests pin the token
 * format the license service signs against.
 */
export const TYPECHECK_TESTS_WORKSPACES = [
  'integration-server',
  '@opensteward/license-token',
] as const

const GATES: Record<GateId, GateSpec> = {
  'typecheck-tests': {
    id: 'typecheck-tests',
    label: 'typecheck (test files)',
    command: 'pnpm',
    // --no-bail: a failure in one workspace must not stop (or kill) the others
    // mid-run, or the count would cover only part of the scope.
    args: [
      ...TYPECHECK_TESTS_WORKSPACES.flatMap((w) => ['--filter', w]),
      '--no-bail',
      'run',
      'typecheck:tests',
    ],
    // No NODE_OPTIONS heap bump here: `tsc` is the native TypeScript 7 Go
    // binary — it does not run on Node, has no V8 heap, and ignores
    // NODE_OPTIONS entirely. The only Node process in this gate is tsx
    // running this script as an orchestrator. The ~27,400-file program still
    // peaks around 4.2GB RSS, but that memory is not governed by a V8 flag,
    // so an OOM shows up as a signal-shaped death — which is why
    // CRASH_SIGNATURES also matches those.
    // See docs/architecture/testing.md "Test-file typechecking".
    extractCount: extractTypecheckCount,
  },
  lint: {
    id: 'lint',
    label: 'lint',
    command: 'pnpm',
    // NOT `pnpm run lint` (that's `turbo run lint`, a different invocation
    // with different caching/output). This mirrors test.yml's step exactly:
    // the flat, uncached `pnpm -r run lint` across every workspace.
    args: ['-r', 'run', 'lint'],
    extractCount: extractLintErrorCount,
  },
  prettier: {
    id: 'prettier',
    label: 'prettier (TypeScript only)',
    command: 'pnpm',
    args: ['exec', 'prettier', '--check', 'scripts/**/*.ts', 'packages/**/src/**/*.ts'],
    extractCount: extractPrettierCount,
  },
}

/**
 * Unambiguous signatures of the tool not having run to completion at all —
 * checked independently of the extracted count, because a crash midway
 * through (e.g. tsc OOMing after already printing some real errors) can
 * leave behind a non-zero, non-empty count that would otherwise look like a
 * legitimate (if incomplete) report.
 */
const CRASH_SIGNATURES: { pattern: RegExp; meaning: string }[] = [
  { pattern: /FATAL ERROR:/, meaning: 'V8 fatal error (likely an OOM abort)' },
  { pattern: /JavaScript heap out of memory/i, meaning: 'Node heap exhausted' },
  // `tsc` is the native TypeScript 7 Go binary, so the two V8 signatures above
  // never fire for a typecheck. A Go process killed by the kernel OOM
  // killer prints NOTHING — it just dies on SIGKILL — and pnpm renders that as
  // `Command failed with signal "SIGKILL"`. Without this pattern a tsc killed
  // part-way through leaves a partial, non-zero error count that
  // `assertNotCrashed` trusts (it only distrusts an exact 0), so the ratchet
  // fails claiming the baseline is stale and invites an `--update` that would
  // permanently ratchet coverage down to whatever the dying compiler printed.
  // Deliberately keyed on the word "signal": a gate that merely FAILS prints
  // `Exit status 1`, which must keep reading as a normal failure — the lint
  // ratchet exits non-zero by design at 48 errors on every green run.
  {
    pattern: /Command failed with signal "SIG\w+"/,
    meaning: 'the underlying binary was killed by a signal (SIGKILL usually means the OOM killer)',
  },
  {
    pattern: /^fatal error: (runtime: )?out of memory/m,
    meaning: 'the Go runtime exhausted memory',
  },
  { pattern: /spawn \S+ ENOENT/, meaning: 'the underlying binary could not be spawned' },
  { pattern: /^sh: .*: command not found/m, meaning: 'the underlying binary is not installed' },
  { pattern: /No projects matched the filters/i, meaning: 'pnpm --filter resolved no workspace' },
  { pattern: /ERR_PNPM_NO_SCRIPT/, meaning: 'the target workspace has no such script' },
  { pattern: /^Error: Cannot find module/m, meaning: 'a required module failed to resolve' },
]

export function crashSignature(output: string): string | undefined {
  for (const { pattern, meaning } of CRASH_SIGNATURES) {
    if (pattern.test(output)) return meaning
  }
  return undefined
}

/**
 * Refuse to read "0 problems" off a run that didn't actually finish. A
 * count > 0 is trusted on its own (these tools always exit non-zero when
 * they find problems — that is not a crash signature). A count of exactly 0
 * is only trusted when the process also exited 0. This check is NOT
 * suppressed by --soft: --soft controls whether a real ratchet comparison
 * fails the build, not whether a broken tool run is allowed to masquerade
 * as a clean one.
 */
function assertNotCrashed(gate: GateSpec, output: string, exitCode: number, count: number): void {
  const signature = crashSignature(output)
  if (signature) {
    console.error(`\n✗ ${gate.label}: the command did not complete normally (${signature}).`)
    console.error(`  command: ${gate.command} ${gate.args.join(' ')}`)
    console.error(`  ...last 40 line(s) of output:`)
    for (const line of output.split('\n').slice(-40)) console.error(`  ${line}`)
    console.error(
      `\nThis is being treated as a crash, not a problem count of ${count} — fix the underlying ` +
        `issue and re-run. (This check is not skipped by --soft.)`,
    )
    process.exit(1)
  }
  if (exitCode !== 0 && count === 0) {
    console.error(
      `\n✗ ${gate.label}: the command exited ${exitCode} but 0 problems were extracted from its ` +
        `output. A clean run exits 0; this looks like an unrecognized failure, not a clean pass.`,
    )
    console.error(`  command: ${gate.command} ${gate.args.join(' ')}`)
    console.error(`  ...last 40 line(s) of output:`)
    for (const line of output.split('\n').slice(-40)) console.error(`  ${line}`)
    console.error(`\nThis check is not skipped by --soft.`)
    process.exit(1)
  }
}

function runGate(gate: GateSpec): number {
  const result = spawnSync(gate.command, gate.args, {
    cwd: REPO_ROOT,
    // NO_COLOR is the widely-respected convention (chalk, eslint, prettier,
    // ...) for suppressing colour output; set on every gate as the second
    // layer of defence, ahead of gate.env so a gate-specific override could
    // still win if one is ever needed. The first, load-bearing layer is
    // `stripAnsi` below — NO_COLOR is belt-and-braces, not the guarantee,
    // since a tool can ignore it (or a future version could change its
    // detection heuristics) and stripAnsi still has to hold the line.
    env: { ...process.env, NO_COLOR: '1', ...gate.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = stripAnsi(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  const exitCode = result.status ?? (result.signal ? 1 : 0)
  const count = gate.extractCount(output)
  assertNotCrashed(gate, output, exitCode, count)
  return count
}

// ── CLI ──────────────────────────────────────────────────────────────────
// Wrapped in a function, guarded by an entrypoint check below, so
// scripts/check-warning-gates.test.ts can `import` the pure extraction
// functions above without triggering a real run (spawning processes,
// calling process.exit) as a side effect of the import.
function main(): void {
  const cliArgs = process.argv.slice(2)
  const soft = cliArgs.includes('--soft')
  const update = cliArgs.includes('--update')
  const gateArg = cliArgs.find((a) => !a.startsWith('--'))

  if (!gateArg || !GATE_IDS.includes(gateArg as GateId)) {
    console.error(`Usage: tsx scripts/check-warning-gates.ts <gate> [--soft] [--update]`)
    console.error(`  gate: one of ${GATE_IDS.join(' | ')}`)
    process.exit(1)
  }

  const gate = GATES[gateArg as GateId]
  console.log(`Running: ${gate.command} ${gate.args.join(' ')}`)
  const count = runGate(gate)
  console.log(`${gate.label}: ${count} problem(s).`)

  const baseline: Record<GateId, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))

  if (update) {
    baseline[gate.id] = count
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + '\n')
    console.log(`\n✓ baseline updated: ${gate.id} → ${count}`)
    process.exit(0)
  }

  const base = baseline[gate.id]
  const stream = soft ? console.warn : console.error

  if (count > base) {
    stream(
      `\n✗ ${gate.label}: ${count} problem(s), up from a baseline of ${base} (+${count - base}). ` +
        `New problems were introduced — fix them, or if the growth is deliberate and reviewed, ` +
        `run \`pnpm check:warning-gates ${gate.id} --update\`.`,
    )
    process.exit(soft ? 0 : 1)
  }

  if (count < base) {
    stream(
      `\n✗ ${gate.label}: ${count} problem(s), down from a baseline of ${base} (-${base - count}). ` +
        `The baseline is stale and should shrink. Run \`pnpm check:warning-gates ${gate.id} --update\` ` +
        `to bank the improvement — this fails on purpose (see the docstring at the top of this file) ` +
        `so progress can't sit un-banked and silently regress back toward the old ceiling.`,
    )
    process.exit(soft ? 0 : 1)
  }

  console.log(`\n✓ ${gate.label}: ratchet holds at ${base}.`)
  process.exit(0)
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
