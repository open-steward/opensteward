/**
 * Ratchet: money must not be scaled by a hardcoded 100.
 *
 * Canonical `Amount` fields are integer minor units, and almost every vendor
 * API speaks major-unit decimals, so every adapter converts. 157 call sites
 * across 122 files did it with a literal `* 100` or `/ 100`.
 *
 * That is correct for the ~95% of ISO-4217 currencies with two fractional
 * digits and silently wrong for the rest. JPY and KRW have none, so ¥1000 is
 * 1000 minor units and `* 100` reports ¥100,000; BHD, KWD and OMR have three,
 * so `* 100` reports a tenth of the real amount. `Iso4217Currency` is
 * regex-based — nothing stops those codes reaching any adapter, and accounting
 * already maps JPY in invoice-ninja's currency table.
 *
 * The fix is `majorToMinor` / `minorToMajor` from `@opensteward/shared`, which
 * take the currency and carry the exponent table. This guard exists because
 * the wrong version is shorter to type and reads as obviously correct.
 *
 * Read paths report a bad number; WRITE paths persist one on the customer's
 * own records, so a hit inside an `untransform*` function is reported
 * separately and first.
 *
 * Baseline shape matches the other ratchets: a sorted JSON array of
 * `"<path>:<line>"` identities the gate tolerates, enforced asymmetrically. A
 * new hit fails the build; a baseline entry that has since been fixed is only
 * reported until someone runs --update to bank it. The 122 pre-existing files
 * are grandfathered rather than rewritten here — each needs the currency
 * threaded to its call site, which is per-adapter work, not a codemod.
 *
 * Run: `pnpm check:money-scaling` (`--soft` reports without failing,
 * `--update` rewrites the baseline).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const BASELINE_PATH = join(REPO_ROOT, 'scripts/money-scaling-baseline.json')

export interface Hit {
  file: string
  line: number
  text: string
  /** Inside an `untransform*` function — the write direction. */
  write: boolean
}

/** Every `.ts` under a directory, recursively. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

/**
 * Line ranges of `untransform*` function bodies, so a hit can be attributed to
 * the write direction. Brace-matched rather than regexed to the next blank
 * line, because these bodies contain object literals.
 */
export function untransformRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const re = /function (untransform\w*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const open = source.indexOf('{', m.index)
    if (open < 0) continue
    let depth = 0
    let i = open
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const startLine = source.slice(0, open).split('\n').length
    const endLine = source.slice(0, i).split('\n').length
    ranges.push([startLine, endLine])
  }
  return ranges
}

/**
 * A literal 100 scaling applied to money.
 *
 * Anchored on a money-ish identifier so unrelated arithmetic (percentages,
 * rate limits, progress bars) does not trip it. `* 1000` and `/ 1000` are not
 * flagged: those are already the three-digit currencies' correct factor, and a
 * bare 1000 is far more often milliseconds.
 */
const SCALE_RE =
  /\b(?:amount|price|total|subtotal|unit_price|unitPrice|cost|fee|value|balance|paid|tax)\w*\b[^\n]*?[*/]\s*100\b|\b[*/]\s*100\b[^\n]*?\b(?:amount|price|total|subtotal|cost|fee|balance)\w*/i

/** Lines that are comments or already using the currency-aware helpers. */
function ignorable(line: string): boolean {
  const t = line.trim()
  return (
    t.startsWith('//') ||
    t.startsWith('*') ||
    t.startsWith('/*') ||
    /majorToMinor|minorToMajor|minorUnitExponent/.test(t)
  )
}

export function findMoneyScaling(roots: string[] = [VERTICALS_DIR]): Hit[] {
  const hits: Hit[] = []
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      if (!/100/.test(src)) continue
      const ranges = untransformRanges(src)
      src.split('\n').forEach((text, i) => {
        if (ignorable(text)) return
        if (!SCALE_RE.test(text)) return
        const line = i + 1
        hits.push({
          file: relative(REPO_ROOT, file),
          line,
          text: text.trim().slice(0, 140),
          write: ranges.some(([a, b]) => line >= a && line <= b),
        })
      })
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

export const identity = (h: Hit): string => `${h.file}:${h.line}`

function main(): void {
  const soft = process.argv.includes('--soft')
  const update = process.argv.includes('--update')

  const hits = findMoneyScaling()
  const ids = hits.map(identity).sort()

  if (update) {
    writeFileSync(BASELINE_PATH, JSON.stringify(ids, null, 2) + '\n')
    console.log(`\nBaseline updated: ${ids.length} hardcoded money scaling(s) grandfathered.`)
    return
  }

  const baseline: string[] = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : []
  const baselineSet = new Set(baseline)
  const regressions = hits.filter((h) => !baselineSet.has(identity(h)))
  const fixed = baseline.filter((id) => !ids.includes(id))
  const writes = hits.filter((h) => h.write).length

  console.log(
    `\nMoney scaling: ${hits.length} hardcoded 100 conversion(s) ` +
      `(${writes} on write paths) (baseline allows ${baseline.length}).`,
  )

  if (fixed.length > 0) {
    console.log(
      `${fixed.length} baseline entr${fixed.length === 1 ? 'y' : 'ies'} no longer hardcode 100. ` +
        'Run `pnpm check:money-scaling --update` to bank the progress.',
    )
  }

  if (regressions.length === 0) {
    console.log('OK — no new hardcoded money scaling.')
    return
  }

  // Write paths first: those persist a wrong number upstream.
  const ordered = [...regressions].sort((a, b) => Number(b.write) - Number(a.write))
  console.error(
    `\n${regressions.length} new hardcoded money scaling(s). ` +
      'Use majorToMinor/minorToMajor from @opensteward/shared and pass the currency:\n',
  )
  for (const h of ordered.slice(0, 25)) {
    console.error(`  ${h.write ? '[WRITE] ' : '        '}${identity(h)}`)
    console.error(`          ${h.text}`)
  }
  if (ordered.length > 25) console.error(`  ... and ${ordered.length - 25} more`)
  if (!soft) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
