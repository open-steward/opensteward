/**
 * CI guard: the packages publish-npm.yml puts on the public npm registry install
 * from that registry alone, and carry the license they are meant to.
 *
 * Why: `pnpm publish` rewrites `workspace:*` to a plain version, so a published
 * package that depends on another workspace package — `@opensteward/shared` is
 * private and never published — installs with a dependency nobody can resolve.
 * publish-npm.yml stated that rule only in a comment. The `license` field is what
 * a consumer's legal review reads: mcp-server and sdk are Apache-2.0 so they can
 * be adopted without one; license-token is Elastic-2.0, the license-key contract
 * shared with the license service (D-C).
 *
 * Rules, for every package in PUBLISHED_PACKAGES:
 *   1. its package.json `name` is the name it is listed under;
 *   2. no dependency field (dependencies, peer, optional, dev) holds a
 *      `workspace:` spec, a local path spec (`file:`, `link:`, `portal:`, or a
 *      bare relative or absolute path), an `@opensteward/` (or look-alike
 *      `@open-steward/`) package, or an npm alias to one
 *      (`"shared": "npm:@opensteward/shared@^1"`). The alias form matters
 *      because every package.json here already aliases typescript that way;
 *   3. its `license` is the one listed;
 * publish-npm.yml publishes (the `for dir in …; do` loop) and builds (the
 * "Build packages" `--filter`s) exactly these packages; and every other
 * workspace package (the `packages:` globs of pnpm-workspace.yaml) is
 * `"private": true`, so a stray `pnpm publish` or `pnpm -r publish` refuses it.
 * The last rule is for @opensteward/cli above all: it imports the private
 * @opensteward/shared at runtime, so published it would not install.
 *
 * Run: `pnpm check:published-packages` (add `--soft` to report only).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/publish-npm.yml'
const WORKSPACE = 'pnpm-workspace.yaml'

export interface PublishedPackage {
  dir: string
  license: string
}

export const PUBLISHED_PACKAGES: Readonly<Record<string, PublishedPackage>> = {
  '@opensteward/mcp-server': { dir: 'apps/mcp-server', license: 'Apache-2.0' },
  '@opensteward/sdk': { dir: 'packages/sdk', license: 'Apache-2.0' },
  '@opensteward/license-token': { dir: 'packages/license-token', license: 'Elastic-2.0' },
}

const DEP_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
] as const

export interface DepViolation {
  pkg: string
  field: string
  dep: string
  spec: string
}

/** An `@opensteward/` package name, or the look-alike `@open-steward/` scope. */
const INTERNAL_SCOPE = /^@open-?steward\//

/**
 * True when a dependency spec can only resolve inside this repository: a
 * `workspace:` protocol, a local path (`file:`, `link:`, `portal:`, or a bare
 * path the way npm-package-arg reads one: anything starting with `.`, so `.`
 * and `..` too, or with `~/`, `/`, `\` or a drive letter), or an npm alias to
 * an internal package (`npm:@opensteward/shared@^1`), which keeps the private
 * name under another.
 */
function isInternalSpec(spec: string): boolean {
  if (/^(workspace|file|link|portal):/.test(spec)) return true
  if (/^(?:\.|~\/|[/\\]|[a-zA-Z]:)/.test(spec)) return true
  return spec.startsWith('npm:') && INTERNAL_SCOPE.test(spec.slice('npm:'.length))
}

/** Dependencies the public registry cannot resolve for a published package. */
export function findInternalDeps(pkg: string, manifest: Record<string, unknown>): DepViolation[] {
  const out: DepViolation[] = []
  for (const field of DEP_FIELDS) {
    const deps = manifest[field]
    if (!deps || typeof deps !== 'object') continue
    for (const [dep, spec] of Object.entries(deps as Record<string, unknown>)) {
      const s = String(spec)
      if (isInternalSpec(s) || INTERNAL_SCOPE.test(dep)) {
        out.push({ pkg, field, dep, spec: s })
      }
    }
  }
  return out
}

/** Directories the publish step's `for dir in …; do` loop walks; [] if the loop has another form. */
export function publishedDirs(yaml: string): string[] {
  const m = /^\s*for dir in ([^;\n]+); do\s*$/m.exec(yaml)
  return m ? m[1]!.trim().split(/\s+/) : []
}

/** Package names the "Build packages" step builds (its `--filter` arguments). */
export function buildFilters(yaml: string): string[] {
  const m = /- name: Build packages\s*\n\s*run: ([^\n]*)/.exec(yaml)
  return m ? [...m[1]!.matchAll(/--filter\s+(\S+)/g)].map((f) => f[1]!) : []
}

/** The `packages:` entries of pnpm-workspace.yaml, quotes stripped, comments skipped. */
export function workspaceGlobs(yaml: string): string[] {
  const out: string[] = []
  let inPackages = false
  for (const line of yaml.split('\n')) {
    if (/^[^\s#]/.test(line)) inPackages = /^packages:\s*$/.test(line)
    else if (inPackages) {
      const m = /^\s+-\s+(['"]?)([^'"\s#]+)\1/.exec(line)
      if (m) out.push(m[2]!)
    }
  }
  return out
}

/**
 * Workspace packages outside the published set that lack `"private": true`. Expands
 * the two glob forms pnpm-workspace.yaml uses, `dir` and `dir/*`; any other form is
 * reported rather than skipped, so a new glob cannot hide a package from this rule.
 */
function unpublishedNotPrivate(
  root: string,
  packages: Readonly<Record<string, PublishedPackage>>,
): string[] {
  let yaml: string
  try {
    yaml = readFileSync(join(root, WORKSPACE), 'utf8')
  } catch {
    return [`${WORKSPACE}: cannot read it`]
  }
  const problems: string[] = []
  const dirs: string[] = []
  for (const glob of workspaceGlobs(yaml)) {
    if (/^[^*!]+\/\*$/.test(glob)) {
      const base = glob.slice(0, -2)
      if (!existsSync(join(root, base))) continue
      for (const e of readdirSync(join(root, base), { withFileTypes: true })) {
        if (e.isDirectory()) dirs.push(`${base}/${e.name}`)
      }
    } else if (/^[^*!]+$/.test(glob)) {
      dirs.push(glob)
    } else {
      problems.push(`${WORKSPACE}: cannot expand the glob ${JSON.stringify(glob)}`)
    }
  }
  const published = new Set(Object.values(packages).map((p) => p.dir))
  for (const dir of dirs) {
    // A directory without a package.json is not a workspace package.
    if (published.has(dir) || !existsSync(join(root, dir, 'package.json'))) continue
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as Record<
        string,
        unknown
      >
    } catch (err) {
      problems.push(
        `${dir}/package.json: cannot read it (${err instanceof Error ? err.message : String(err)})`,
      )
      continue
    }
    if (manifest['private'] !== true) {
      problems.push(
        `${dir}/package.json: ${String(manifest['name'])} is not a published package but is not "private": true, so \`pnpm publish\` would put it on npm`,
      )
    }
  }
  return problems
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...a].sort()
  const y = [...b].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Every problem with the published set, one line each. Empty means clean. */
export function checkPublishedPackages(
  root: string = REPO_ROOT,
  packages: Readonly<Record<string, PublishedPackage>> = PUBLISHED_PACKAGES,
): string[] {
  const problems: string[] = []
  for (const [name, { dir, license }] of Object.entries(packages)) {
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as Record<
        string,
        unknown
      >
    } catch (err) {
      problems.push(
        `${dir}/package.json: cannot read it (${err instanceof Error ? err.message : String(err)})`,
      )
      continue
    }
    if (manifest['name'] !== name) {
      problems.push(
        `${dir}/package.json: name is ${JSON.stringify(manifest['name'])}, expected ${name}`,
      )
    }
    if (manifest['license'] !== license) {
      problems.push(
        `${name}: license is ${JSON.stringify(manifest['license'])}, expected ${license}`,
      )
    }
    for (const v of findInternalDeps(name, manifest)) {
      problems.push(
        `${name}: ${v.field} has ${v.dep}@${v.spec}, which the public registry cannot resolve`,
      )
    }
  }
  problems.push(...unpublishedNotPrivate(root, packages))
  let yaml: string
  try {
    yaml = readFileSync(join(root, WORKFLOW), 'utf8')
  } catch {
    return [...problems, `${WORKFLOW}: cannot read it`]
  }
  const dirs = publishedDirs(yaml)
  const expectedDirs = Object.values(packages).map((p) => p.dir)
  if (!sameSet(dirs, expectedDirs)) {
    problems.push(
      `${WORKFLOW}: the publish loop (\`for dir in …; do\`) walks [${dirs.join(', ')}], expected [${expectedDirs.join(', ')}]`,
    )
  }
  const filters = buildFilters(yaml)
  const names = Object.keys(packages)
  if (!sameSet(filters, names)) {
    problems.push(
      `${WORKFLOW}: "Build packages" builds [${filters.join(', ')}], expected [${names.join(', ')}]`,
    )
  }
  return problems
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const problems = checkPublishedPackages()
  if (problems.length === 0) {
    console.log(
      `✓ ${Object.keys(PUBLISHED_PACKAGES).length} published packages install from the registry alone, carry their license, and match ${WORKFLOW}; every other workspace package is private.`,
    )
    return
  }
  for (const p of problems) console.error(`✖ ${p}`)
  console.error(
    `\n${problems.length} problem(s). See the header of scripts/check-published-packages.ts.`,
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
