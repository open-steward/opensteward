/**
 * CI guard: integration-server's `typecheck` script can actually fail.
 *
 * A check that cannot fail is worse than no check — it reports green and
 * nobody looks again. This one is not hypothetical here: with the app split
 * into project references, `tsc --noEmit` against the solution tsconfig
 * compiles nothing and exits 0 in about a tenth of a second, with real type
 * errors sitting in the tree. `check:project-references` catches the script
 * being written that way; this catches the same class arriving by any other
 * route (a tsconfig that includes nothing, a vertical dropped from the
 * solution, a `// @ts-nocheck` at the top of a barrel).
 *
 * Method: inject a deliberate type error into a file deep in the reference
 * graph, run the real `typecheck` script, and require a non-zero exit. The
 * file is always restored, including on failure.
 *
 * Run: `pnpm tsx scripts/check-typecheck-bites.ts` (add `--soft` to report only).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const APP_DIR = join(REPO_ROOT, 'apps', 'integration-server')
/**
 * A leaf inside a vertical project, so a green result means the vertical
 * projects are genuinely being checked — not just the `app` project.
 */
const PROBE = join(APP_DIR, 'src', 'verticals', 'crm', 'adapters', 'nutshell', 'index.ts')
const POISON = '\nconst __typecheckProbe: number = "check-typecheck-bites"\n'

function runTypecheck(): number {
  const result = spawnSync('pnpm', ['run', 'typecheck'], {
    cwd: APP_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return result.status ?? 1
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const original = readFileSync(PROBE, 'utf8')
  let poisoned: number

  try {
    writeFileSync(PROBE, original + POISON)
    poisoned = runTypecheck()
  } finally {
    writeFileSync(PROBE, original)
  }

  if (poisoned === 0) {
    console.error('✖ `pnpm --filter integration-server run typecheck` passed with a deliberate')
    console.error(`  type error in ${PROBE.replace(REPO_ROOT + '/', '')}.`)
    console.error('\n  The typecheck is vacuous. Most likely the script lost its `-b`, or a')
    console.error('  project stopped being referenced — see scripts/check-project-references.ts.')
    if (!soft) process.exitCode = 1
    return
  }

  const clean = runTypecheck()
  if (clean !== 0) {
    console.error('✖ typecheck fails on an unmodified tree — fix that first; this guard cannot')
    console.error('  tell a real error from the one it injects.')
    if (!soft) process.exitCode = 1
    return
  }

  console.log('✓ typecheck fails on an injected type error and passes on a clean tree.')
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
