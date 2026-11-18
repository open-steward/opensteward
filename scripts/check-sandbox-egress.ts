/**
 * CI guard: nothing reachable from the sandbox can make an outbound request.
 *
 * The sandbox's real guarantee is structural — its middleware never decrypts a
 * credential and never constructs a real adapter, so there is nothing to call
 * an upstream platform WITH. That property is invisible in any single file
 * though, and one careless import would end it: pulling in a vertical's
 * `client.ts` for a type, or reaching for `fetch` to "just proxy this one
 * resource".
 *
 * This is the join. Walk the relative-import graph from the sandbox roots and
 * fail on anything that could reach the network. It is a genuinely provable
 * property rather than a heuristic, because the sandbox subtree is small and
 * self-contained — this is not whole-program analysis, it is a cleanliness rule
 * over a handful of files.
 *
 * Run: `pnpm tsx scripts/check-sandbox-egress.ts` (add `--soft` to report
 * without failing). Exit 0 when the subtree is clean, 1 otherwise.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Entry points. Everything reachable from these must stay network-free. */
const ROOTS = [
  'packages/shared/src/sandbox/fixtures.ts',
  'packages/shared/src/sandbox/ids.ts',
  'packages/shared/src/sandbox/sandbox-store.ts',
  'packages/shared/src/control-plane/sandbox-auth-middleware.ts',
  'packages/shared/src/control-plane/sandbox-meta-router.ts',
  'packages/shared/src/control-plane/sandbox-sync-router.ts',
  'packages/shared/src/control-plane/sandbox-keys-router.ts',
  'packages/shared/src/control-plane/sandbox-control-plane-router.ts',
  'packages/shared/src/control-plane/sandbox-auth-router.ts',
  'packages/shared/src/control-plane/sandbox-link-token.ts',
  'packages/shared/src/control-plane/sandbox-oidc-router.ts',
  'packages/shared/src/control-plane/sandbox-credential.ts',
  'apps/integration-server/src/sandbox/adapter.ts',
]

/**
 * Bare specifiers that mean "this file can talk to the network". `node:http`
 * and `node:https` cover axios too — every adapter client sits on one of them.
 */
const FORBIDDEN_MODULES = [
  'axios',
  'undici',
  'node-fetch',
  'got',
  'superagent',
  'request',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:dgram',
  'node:tls',
  'http',
  'https',
  'net',
  'dgram',
  'tls',
]

/**
 * Relative imports that must never appear. `adapters/` is where every upstream
 * HTTP client lives — that directory is the one thing in this repo that
 * definitely does egress.
 *
 * Reaching into a vertical is otherwise fine and necessary: the sandbox adapter
 * imports its manifest from `verticals/<v>/sandbox/`, which in turn imports the
 * canonical Zod schemas from `verticals/<v>/schema/`. Both are pure data. Those
 * two are named explicitly rather than allowing `verticals/` wholesale, so a
 * future import of, say, `verticals/accounting/sync/` is still caught.
 */
const FORBIDDEN_PATH_FRAGMENTS = ['/adapters/']
const ALLOWED_VERTICAL_SUBPATHS = ['/sandbox/', '/schema/', '/schema']

/** Global calls that reach the network without importing anything. */
const FORBIDDEN_GLOBALS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /(?<![\w.])fetch\s*\(/, what: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, what: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, what: 'WebSocket' },
  { pattern: /\bnavigator\.sendBeacon\b/, what: 'navigator.sendBeacon' },
]

interface Finding {
  file: string
  detail: string
}

/**
 * Every `import ... from '<spec>'` / `require('<spec>')` in a source file,
 * EXCLUDING `import type`.
 *
 * A type-only import emits nothing — TypeScript erases the statement, so no
 * module is loaded and no code can run. Following one would report the sandbox
 * as reaching `safe-fetch` through a `RateLimitConfigSource` type, which is
 * not a reach at all. The runtime edge is what this guard is about, and
 * `import { thing, type T } from 'm'` still has one (it is left alone below);
 * only the wholly type-only form is skipped.
 */
function importsOf(source: string): string[] {
  const out: string[] = []
  const patterns = [
    /\bimport\s+(?!type\s)[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) out.push(m[1]!)
  }
  return out
}

/** Strip comments so a specifier named in prose is not treated as an import. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    `${base}.js`,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function walk(): Finding[] {
  const findings: Finding[] = []
  const seen = new Set<string>()
  const queue = ROOTS.map((r) => join(REPO_ROOT, r))

  for (const root of queue) {
    if (!existsSync(root)) {
      findings.push({ file: root, detail: 'sandbox root not found — update ROOTS in this script' })
    }
  }

  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)

    const rel = file.slice(REPO_ROOT.length + 1)
    const raw = readFileSync(file, 'utf8')
    const source = stripComments(raw)

    for (const { pattern, what } of FORBIDDEN_GLOBALS) {
      if (pattern.test(source)) findings.push({ file: rel, detail: `calls ${what}` })
    }

    for (const spec of importsOf(source)) {
      if (spec.startsWith('.')) {
        if (FORBIDDEN_PATH_FRAGMENTS.some((f) => spec.includes(f))) {
          findings.push({ file: rel, detail: `imports '${spec}' — adapters can reach upstream` })
          continue
        }
        if (
          spec.includes('verticals/') &&
          !ALLOWED_VERTICAL_SUBPATHS.some((allowed) => spec.includes(allowed))
        ) {
          findings.push({
            file: rel,
            detail: `imports '${spec}' — only a vertical's sandbox/ and schema/ are pure data`,
          })
          continue
        }
        const resolved = resolveRelative(file, spec)
        // An unresolvable relative import is a type-only path or a build
        // artifact; tsc already guards those, so it is not this check's job.
        if (resolved) queue.push(resolved)
        continue
      }
      const bare = spec.split('/')[0]!
      const normalised = spec.startsWith('node:') ? spec : bare
      if (FORBIDDEN_MODULES.includes(normalised) || FORBIDDEN_MODULES.includes(spec)) {
        findings.push({ file: rel, detail: `imports '${spec}'` })
      }
      // Other bare specifiers (zod, fastify, kysely) are not followed: they are
      // dependencies of the whole service, not of the sandbox in particular.
    }
  }

  return findings
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const findings = walk()

  if (findings.length === 0) {
    console.log(`✓ sandbox egress: ${ROOTS.length} root(s), nothing reachable can make a request.`)
    return
  }

  console.error(`✗ sandbox egress: ${findings.length} problem(s).`)
  for (const f of findings) console.error(`    ${f.file}: ${f.detail}`)
  console.error(
    '\nThe sandbox must not be able to reach the network. If one of these is a ' +
      'false positive, narrow the rule rather than widening the allowance.',
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()

export { walk as findSandboxEgress }
