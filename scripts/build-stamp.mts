/**
 * Build stamps: which sources a workspace library's `dist/` was compiled from.
 *
 * Apps import `@opensteward/shared` and the other library packages through
 * their package.json `exports`, which point into `dist/`, never `src/`. Nothing
 * rebuilds that `dist/` before `pnpm --filter integration-server test`. So in a
 * checkout whose sources moved (a `git merge --ff-only`, a branch switch) while
 * its `dist/` did not, the suite runs today's app code against an older
 * library. That fails as a scatter of unrelated-looking tests rather than as a
 * build error. On 2026-09-29 it produced 172 failures in 8 files, twice, from a
 * checkout whose packages/shared/dist was three days older than its src, and
 * it passed on every rerun from a freshly built worktree. It was taken for a
 * flaky suite.
 *
 * Each library's `build` script ends with `node ../../scripts/build-stamp.mts`,
 * which writes `dist/.build-stamp.json` holding a hash of the package's `src/`.
 * `staleWorkspaceBuilds` compares that stamp with the `src/` on disk, for every
 * `workspace:` dependency of an app. apps/integration-server calls it from a
 * vitest globalSetup, so a stale build stops the run before any test starts.
 *
 * The hash is of file contents, not mtimes. A git checkout touches files it
 * does not change, and both `tsc` (incremental) and turbo (cache hit) leave
 * outputs alone when their inputs did not change. An mtime check would call a
 * correctly built `dist/` stale, and rebuilding would not clear it.
 *
 * The builds run it with plain `node`, which strips the types, so no library
 * needs tsx as a build dependency. Keep this file to erasable TypeScript syntax
 * and `node:` imports.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAMP_FILE = '.build-stamp.json'

/**
 * What `tsc` compiles. Anything else under `src/` (a `.DS_Store`, an editor
 * backup) must not count as a source change. Turbo ignores such files when it
 * hashes the build's inputs, so it would replay the cached stamp, and the
 * mismatch would never clear.
 */
const COMPILED = /\.(?:[cm]?tsx?|json)$/

interface PackageJson {
  name?: string
  main?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface Stamp {
  sources: string
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function compiledFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) compiledFiles(path, out)
    else if (entry.isFile() && COMPILED.test(entry.name)) out.push(path)
  }
  return out
}

/** sha256 over every compiled file under `<pkgDir>/src`: its path, then its bytes. */
export function hashSources(pkgDir: string): string {
  const srcDir = join(pkgDir, 'src')
  const files = compiledFiles(srcDir)
    .map((file) => ({ file, rel: relative(srcDir, file).split(sep).join('/') }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const hash = createHash('sha256')
  for (const { file, rel } of files) {
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

/**
 * Stamp `<pkgDir>/dist` with the hash of `<pkgDir>/src`. Run at the end of the
 * package's build.
 *
 * Refuses when the package's entry point is missing. With `tsconfig.tsbuildinfo`
 * still present, `tsc` treats a hand-deleted `dist/` as current, emits nothing
 * and exits 0. Stamping that empty `dist/` would certify a build that did not
 * happen.
 */
export function writeBuildStamp(pkgDir: string): void {
  const pkg = readJson<PackageJson>(join(pkgDir, 'package.json'))
  const name = pkg.name ?? pkgDir
  if (pkg.main && !existsSync(join(pkgDir, pkg.main))) {
    throw new Error(
      `${name}: the build did not produce ${pkg.main}. If dist/ was deleted by hand, ` +
        'tsc skipped the emit because tsconfig.tsbuildinfo says the outputs are current. ' +
        'Delete the tsbuildinfo too, or run `pnpm exec turbo run build --force`.',
    )
  }
  const stamp: Stamp = { sources: hashSources(pkgDir) }
  writeFileSync(join(pkgDir, 'dist', STAMP_FILE), `${JSON.stringify(stamp)}\n`)
}

/**
 * One line per `workspace:` dependency of the app at `appDir` whose `dist/`
 * was not built from the `src/` now on disk. An empty array means every
 * workspace build is current.
 */
export function staleWorkspaceBuilds(appDir: string): string[] {
  const pkg = readJson<PackageJson>(join(appDir, 'package.json'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const problems: string[] = []
  for (const [name, spec] of Object.entries(deps)) {
    if (!spec.startsWith('workspace:')) continue
    const link = join(appDir, 'node_modules', name)
    if (!existsSync(link)) {
      problems.push(`${name}: not installed. Run \`pnpm install\`.`)
      continue
    }
    const pkgDir = realpathSync(link)
    const stampPath = join(pkgDir, 'dist', STAMP_FILE)
    if (!existsSync(stampPath)) {
      problems.push(
        `${name}: dist/${STAMP_FILE} is missing: never built, or built before build stamps existed.`,
      )
      continue
    }
    const stamp = readJson<Partial<Stamp>>(stampPath)
    if (stamp.sources !== hashSources(pkgDir)) {
      problems.push(`${name}: dist/ was built from other sources than its src/ holds now.`)
    }
  }
  return problems
}

const argv1 = process.argv[1]
const isMain =
  argv1 !== undefined && existsSync(argv1) && fileURLToPath(import.meta.url) === realpathSync(argv1)
if (isMain) writeBuildStamp(process.cwd())
