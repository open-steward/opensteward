/**
 * Captures the set of tests that actually execute, as sorted
 * `<file>::<fullName>` lines, and diffs two such captures.
 *
 * This exists to make the coverage invariant enforceable: restructuring
 * tests may change how many FILES there are, but must never change the set
 * of assertions that run. `--compare` is the proof.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const args = process.argv.slice(2)

function inventoryFrom(jsonPath: string): string[] {
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'))
  return report.testResults
    .flatMap((f: { name: string; assertionResults: { fullName: string }[] }) =>
      f.assertionResults.map(
        (a) => `${relative(REPO_ROOT, f.name).replace(/\\/g, '/')}::${a.fullName}`,
      ),
    )
    .sort()
}

/**
 * Strip the `<file>::` prefix, keeping only the `fullName`.
 *
 * The key is `<file>::<fullName>`, not `fullName` alone, on purpose: a
 * `fullName` colliding across two different adapters (a real risk at 1,541
 * platforms) must not let deleting one masquerade as merely "moving" the
 * other. `--ignore-file-paths` opts out of that protection for a deliberate
 * reorganisation.
 *
 * Split on the FIRST `::` only — file paths never contain `::`, but a
 * `fullName` can (e.g. a describe/it name that itself mentions a type like
 * `Foo::Bar`), and a naive last-`::` split would chop such a name in half.
 */
function stripFilePath(line: string): string {
  const i = line.indexOf('::')
  return i === -1 ? line : line.slice(i + 2)
}

/**
 * Compare as MULTISETS, not sets.
 *
 * Test names are not unique. `unicommerce/stock-adjustment.test.ts` runs 10
 * parameterised cases that all report the identical fullName
 * ("...reason mapping maps remarks/inventoryType to reason correctly"),
 * because the name does not interpolate the parameter. Deduplicating would
 * collapse those 10 to 1, and deleting 9 of them would show as "lost: 0" —
 * silently defeating the whole point of this tool. Counts must match.
 */
function tally(lines: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1)
  return m
}

if (args[0] === '--compare') {
  const ignoreFilePaths = args.includes('--ignore-file-paths')
  const [a, b] = args.slice(1).filter((arg) => arg !== '--ignore-file-paths')
  if (!a || !b)
    throw new Error('usage: test:inventory --compare <before> <after> [--ignore-file-paths]')
  const beforeLines = readFileSync(a, 'utf8').split('\n').filter(Boolean)
  const afterLines = readFileSync(b, 'utf8').split('\n').filter(Boolean)
  const normalize = ignoreFilePaths ? stripFilePath : (l: string) => l
  const before = tally(beforeLines.map(normalize))
  const after = tally(afterLines.map(normalize))

  const lost: string[] = []
  let lostCount = 0
  for (const [name, n] of before) {
    const m = after.get(name) ?? 0
    if (m < n) {
      lostCount += n - m
      lost.push(`${name}  (${n} -> ${m})`)
    }
  }
  const gained: string[] = []
  let gainedCount = 0
  for (const [name, n] of after) {
    const m = before.get(name) ?? 0
    if (n > m) {
      gainedCount += n - m
      gained.push(`${name}  (${m} -> ${n})`)
    }
  }

  console.log(`before: ${beforeLines.length}  after: ${afterLines.length}`)
  console.log(`lost: ${lostCount}  gained: ${gainedCount}`)
  for (const t of lost.slice(0, 20)) console.error(`  LOST   ${t}`)
  for (const t of gained.slice(0, 20)) console.log(`  GAINED ${t}`)
  if (lostCount > 0) {
    console.error(`\nCOVERAGE REGRESSION: ${lostCount} test execution(s) no longer run.`)
    process.exit(1)
  }
  console.log('\nOK — no test lost. Coverage invariant holds.')
  process.exit(0)
}

const shard = args.find((a) => a.startsWith('--shard='))
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1]
if (!out) throw new Error('usage: test:inventory [--shard=i/N] --out=<path>')

const tmpDir = mkdtempSync(join(tmpdir(), 'ost-inv-'))
const tmp = join(tmpDir, 'report.json')
const vitestArgs = [
  '--filter',
  'integration-server',
  'exec',
  'vitest',
  'run',
  '--reporter=json',
  `--outputFile=${tmp}`,
]
if (shard) vitestArgs.push(shard)

try {
  execFileSync('pnpm', vitestArgs, { cwd: REPO_ROOT, stdio: 'ignore' })
  const inv = inventoryFrom(tmp)
  writeFileSync(out, inv.join('\n') + '\n')
  console.log(`${inv.length} tests -> ${out}`)
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}
