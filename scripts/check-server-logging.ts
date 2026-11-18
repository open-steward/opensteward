/**
 * CI guard: no service may build a Fastify instance whose logger skips the
 * shared redaction.
 *
 * `LOG_REDACT_PATHS` (packages/shared/src/server/create-server.ts) is what
 * keeps auth headers, session cookies and credential-bearing upstream errors
 * out of stdout. It only applies to loggers built by `buildLoggerConfig`,
 * which is what `createBaseServer` uses. An app that builds its own instance
 * with a bare `logger: true` silently sits outside that protection, and
 * nothing says so — hence this check.
 *
 * Rule: in application source (`apps/*` and `packages/*`, tests excluded),
 * every `Fastify({ ... })` call must either live inside the shared factory
 * itself or pass `logger: buildLoggerConfig(...)`. Apps that construct nothing
 * — i.e. call `createBaseServer` — trivially pass.
 *
 * Run: `pnpm tsx scripts/check-server-logging.ts` (add `--soft` to report only).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const SCAN_ROOTS = ['apps', 'packages']
/** The shared factory is the one legitimate place a raw Fastify() is built. */
const FACTORY = 'packages/shared/src/server/create-server.ts'

export interface LoggerViolation {
  file: string
  line: number
  snippet: string
}

/**
 * Find `Fastify({...})` calls whose options object does not take its logger
 * from `buildLoggerConfig`. Scans the 400 characters after the call opening,
 * which comfortably covers every options literal in this repo.
 */
export function findLoggerViolations(file: string, source: string): LoggerViolation[] {
  const violations: LoggerViolation[] = []
  for (const match of source.matchAll(/\bFastify\(\{/g)) {
    const start = match.index
    const window = source.slice(start, start + 400)
    if (window.includes('buildLoggerConfig')) continue
    const line = source.slice(0, start).split('\n').length
    violations.push({
      file,
      line,
      snippet: window.split('\n')[0]?.trim() ?? '',
    })
  }
  return violations
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'tests') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const violations: LoggerViolation[] = []
  let scanned = 0

  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file)
      if (rel === FACTORY) continue
      const source = readFileSync(file, 'utf8')
      if (!source.includes('Fastify(')) continue
      scanned++
      violations.push(...findLoggerViolations(rel, source))
    }
  }

  console.log(`Checked ${scanned} file(s) that construct a Fastify instance.`)
  if (violations.length > 0) {
    console.error(`\n✖ ${violations.length} Fastify instance(s) log without the shared redaction:`)
    for (const v of violations) console.error(`  - ${v.file}:${v.line}  ${v.snippet}`)
    console.error(
      '\nUse `createBaseServer()` from @opensteward/shared, or pass\n' +
        '`logger: buildLoggerConfig(true)` so LOG_REDACT_PATHS applies.',
    )
    if (!soft) process.exitCode = 1
    return
  }
  console.log('✓ Every Fastify instance logs through the shared redaction config.')
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
