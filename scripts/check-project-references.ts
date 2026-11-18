/**
 * CI guard: integration-server's per-vertical project references stay wired
 * up, and nothing builds it through a bare `tsc`.
 *
 * integration-server does not compile as one program. Each vertical is its
 * own composite project (`tsconfig.<vertical>.json`), plus `kernel` and
 * `app`, and `tsconfig.json` is a solution file that only lists references.
 * That is what keeps the typecheck's peak RSS near 1.3 GB instead of 4.1 GB
 * — see the table in the Dockerfile.
 *
 * Two things rot silently, and neither produces an error:
 *
 *   1. A new vertical lands without a `tsconfig.<vertical>.json`, or with one
 *      that nothing references. Its files are then in no project at all, so
 *      they are never typechecked and never emitted — and the build is green.
 *   2. Someone "simplifies" `build` or `typecheck` back to `tsc` /
 *      `tsc --noEmit`. Against a solution file those compile nothing and exit
 *      0 in about a tenth of a second, with real type errors in the tree.
 *
 * Rule: every vertical directory has a project, the solution and the app
 * project both reference every one of them, and the app's `build` and
 * `typecheck` scripts go through `tsc -b`.
 *
 * Run: `pnpm tsx scripts/check-project-references.ts` (add `--soft` to report only).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const APP_DIR = join(REPO_ROOT, 'apps', 'integration-server')
/** Holds one leaf module every vertical depends on; it is not a vertical. */
const NOT_A_VERTICAL = new Set(['shared'])

export interface RefProblem {
  where: string
  detail: string
}

interface TsConfig {
  extends?: string
  files?: string[]
  include?: string[]
  references?: { path: string }[]
}

/**
 * tsconfigs may carry comments; strip them before parsing.
 *
 * String-aware on purpose. A naive block-comment regex eats the `/**\/` in
 * an include glob like `src/verticals/accounting/**\/*`, which silently
 * turns this guard into one that reports every vertical as unconfigured.
 */
export function parseTsConfig(source: string): TsConfig {
  let out = ''
  let inString = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (inString) {
      out += c
      if (c === '\\') {
        out += source[++i] ?? ''
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i++
      continue
    }
    out += c
  }
  return JSON.parse(out) as TsConfig
}

const refNames = (cfg: TsConfig): Set<string> =>
  new Set((cfg.references ?? []).map((r) => r.path.replace(/^\.\//, '')))

export function findProblems(
  verticals: string[],
  configs: Map<string, TsConfig>,
  scripts: Record<string, string | undefined>,
): RefProblem[] {
  const problems: RefProblem[] = []
  const expected = ['tsconfig.kernel.json', ...verticals.map((v) => `tsconfig.${v}.json`)]

  for (const v of verticals) {
    const name = `tsconfig.${v}.json`
    const cfg = configs.get(name)
    if (!cfg) {
      problems.push({ where: name, detail: `vertical "${v}" has no project file` })
      continue
    }
    const covers = (cfg.include ?? []).some((i) => i.startsWith(`src/verticals/${v}/`))
    if (!covers) problems.push({ where: name, detail: `does not include src/verticals/${v}/**/*` })
    if (!refNames(cfg).has('tsconfig.kernel.json')) {
      problems.push({ where: name, detail: 'does not reference tsconfig.kernel.json' })
    }
  }

  const solution = configs.get('tsconfig.json')
  if (!solution) {
    problems.push({ where: 'tsconfig.json', detail: 'missing' })
  } else {
    if ((solution.files ?? ['missing']).length !== 0) {
      problems.push({ where: 'tsconfig.json', detail: 'solution file must set "files": []' })
    }
    const have = refNames(solution)
    for (const name of [...expected, 'tsconfig.app.json']) {
      if (!have.has(name))
        problems.push({ where: 'tsconfig.json', detail: `does not reference ${name}` })
    }
  }

  const app = configs.get('tsconfig.app.json')
  if (!app) {
    problems.push({ where: 'tsconfig.app.json', detail: 'missing' })
  } else {
    const have = refNames(app)
    for (const name of expected) {
      if (!have.has(name))
        problems.push({ where: 'tsconfig.app.json', detail: `does not reference ${name}` })
    }
  }

  // The solution file carries no compilerOptions, so anything extending it
  // silently loses strict, skipLibCheck and the rest of tsconfig.base.json —
  // a typecheck that still runs but no longer means what it says.
  const test = configs.get('tsconfig.test.json')
  if (test && (test.extends ?? '').endsWith('/tsconfig.json')) {
    problems.push({
      where: 'tsconfig.test.json',
      detail: `extends "${test.extends}", the solution file, so it inherits no compilerOptions — extend ../../tsconfig.base.json instead`,
    })
  }

  for (const key of ['build', 'typecheck'] as const) {
    const cmd = scripts[key]
    if (cmd === undefined) {
      problems.push({ where: `package.json#${key}`, detail: 'missing' })
    } else if (!/\btsc\b.*(\s-b\b|\s--build\b)/.test(cmd)) {
      problems.push({
        where: `package.json#${key}`,
        detail: `"${cmd}" does not use \`tsc -b\` — against a solution tsconfig it compiles nothing and exits 0`,
      })
    }
  }

  return problems
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const verticals = readdirSync(join(APP_DIR, 'src', 'verticals'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NOT_A_VERTICAL.has(e.name))
    .map((e) => e.name)
    .sort()

  const configs = new Map<string, TsConfig>()
  for (const name of readdirSync(APP_DIR)) {
    if (!name.startsWith('tsconfig.') && name !== 'tsconfig.json') continue
    if (!name.endsWith('.json')) continue
    const full = join(APP_DIR, name)
    if (!existsSync(full)) continue
    configs.set(name, parseTsConfig(readFileSync(full, 'utf8')))
  }

  const scripts =
    (
      JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
      }
    ).scripts ?? {}

  const problems = findProblems(verticals, configs, scripts)

  console.log(`Checked ${verticals.length} vertical project(s) and ${configs.size} tsconfig(s).`)
  if (problems.length > 0) {
    console.error(`\n✖ ${problems.length} project-reference problem(s):`)
    for (const p of problems) console.error(`  - ${p.where}: ${p.detail}`)
    console.error(
      '\nA vertical with no project is never typechecked and never emitted,\n' +
        'and the build stays green. See the comment block in the Dockerfile.',
    )
    if (!soft) process.exitCode = 1
    return
  }
  console.log(
    '✓ Every vertical has a project, both aggregates reference them all, and build/typecheck use `tsc -b`.',
  )
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
