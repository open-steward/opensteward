/**
 * Ratchet: a non-reference adapter must not call a *reference* adapter's
 * vendor-specific paths.
 *
 * Found by the September 2026 nine-vertical API audit: a "clone"
 * adapter — one scaffolded from a reference adapter's file and never
 * rewired to its own vendor's real API — keeps the reference adapter's
 * literal request paths. Its unit tests only check the transform layer
 * (mock data in, canonical shape out), never the request itself, so nothing
 * fails: the adapter counts as "implemented" while every request it sends
 * 404s against the real platform. The audit entry: 86 such copies,
 * including Jira, ClickUp, Tidio, Salesforce Service and Odoo, each with a
 * documented real API (e.g. developer.clickup.com/openapi/…,
 * cloudapi.inflowinventory.com/docs/api/swagger.json) that the adapter
 * ignores wholesale.
 *
 * Three reference adapters, each contributing one or two path *signatures*
 * — literal substrings distinctive enough that no other vendor's real API
 * would plausibly reproduce them verbatim:
 *
 *   - projects/asana:           /tasks/{id}/stories, /stories/{id}
 *   - customer-support/zendesk: /tickets.json, /users.json
 *   - inventory/cin7-core:      /productList, /ref/stockonhand
 *
 * A signature is deliberately more than "a resource named 'stories'" — the
 * first cut of this guard matched the bare word `stories` in `projects/`
 * and caught 44 non-reference adapters, several more than the audit's
 * baseline, two of them genuine false positives. `pivotal-tracker` and
 * `shortcut` are real "user story" tools, but reading their `index.ts`
 * shows they *also* carry the exact literal `/tasks/${id}/stories` —
 * Asana's nesting, not their own (Pivotal Tracker's real API nests stories
 * under `/projects/{id}`, not `/tasks/{id}`) — so they are true offenders,
 * not false positives, and the signature correctly keeps them. What the
 * refined signature correctly drops: `taiga`'s real endpoint is
 * `/userstories` (one word, un-nested — matches neither pattern at all),
 * and `kantata`'s real endpoint is `` `/stories/${id}.json` `` — it
 * contains the `/stories/${id}` substring, but with a `.json` suffix before
 * the closing backtick, so both signatures below require the closing
 * quote/backtick to follow immediately (`(?=['"\`])`) rather than matching
 * the substring anywhere. Without that anchor, Kantata's own real,
 * Rails-style `.json` endpoint would false-positive. Refine the signature
 * rather than allowlisting; see the file-by-file comparison in the test
 * file for the asana/pivotal-tracker/taiga/kantata set.
 *
 * `payments`' adapters carrying a literal `/charges` path are a **sweep
 * list, not a signature**: `/charges` is generic REST-resource naming that
 * real processors legitimately expose too, so it is collected under
 * `--report` only and never fails the build or feeds the baseline — see
 * `reportOnly` on the payments rule below. The sweep's regex still anchors
 * `/charges` to the *start* of the path (`'/charges'`,
 * `` `/charges/${id}` `` — Stripe's own shape, since its client's base URL
 * already ends in `/v1`) rather than matching the bare substring anywhere.
 * That is what the issue's own example needs: Affirm's real charge
 * endpoint is `/api/v1/charges/{id}` and Fiserv's is `/payments/v1/charges`
 * — both genuinely end in `/charges`, neither is Stripe's literal path, and
 * the anchored regex leaves both out of the sweep (along with Unzer's
 * `/payments/charges`) without needing an allowlist. A bare-substring first
 * cut over-reported 73 files where 64 adapters actually carry Stripe's own
 * root-level shape.
 *
 * Everything here is static parsing over exactly
 * `adapters/<slug>/{index,client,constants}.ts`. The adapter graph is never
 * imported: `verticals/<v>/index.ts` pulls in every adapter client, and
 * importing it from a script is exactly what scripts/check-sandbox-egress.ts
 * forbids.
 *
 * Baseline shape matches scripts/check-adapter-declarations.ts: a sorted
 * JSON array of `"<vertical>/<slug>"` identities the gate tolerates,
 * enforced asymmetrically and as a one-way ratchet — a new offender not in
 * the baseline fails the build; a baseline entry that no longer matches is
 * only reported (see `fixed`) until someone runs `--update` to bank the
 * shrinkage. The count this ratchets is the failure ceiling, not a floor:
 * `--update` never has to grow it, and ambient drift can't grow it either,
 * only a human explicitly re-running `--update` after adding a clone can.
 *
 * Run: `pnpm check:clone-signatures` (`--soft` reports without failing,
 * `--update` rewrites the baseline, `--report` also lists every offender's
 * matched signatures and the payments sweep).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const BASELINE_PATH = join(REPO_ROOT, 'scripts/clone-signature-baseline.json')

/** The only files a clone signature is allowed to be found in — per the audit. */
export const SCAN_FILES = ['index.ts', 'client.ts', 'constants.ts'] as const

export interface Signature {
  /** Human-readable label for messages, e.g. `/tasks/{id}/stories`. */
  label: string
  /** Tested against the concatenated source of SCAN_FILES. Never global. */
  pattern: RegExp
}

export interface CloneRule {
  vertical: string
  /** Slug of the reference adapter this vertical copies from — excluded from the sweep. */
  reference: string
  /** Display name of the reference platform, e.g. 'Asana'. */
  vendor: string
  signatures: readonly Signature[]
  /**
   * When true, matches are collected and printed only under `--report`, and
   * never fail the build or enter the baseline — see the payments/Stripe
   * `/charges` doc comment above.
   */
  reportOnly?: boolean
}

export const CLONE_RULES: readonly CloneRule[] = [
  {
    vertical: 'projects',
    reference: 'asana',
    vendor: 'Asana',
    signatures: [
      {
        label: '/tasks/{id}/stories',
        pattern: /\/tasks\/\$\{[A-Za-z0-9_]+\}\/stories(?=['"`])/,
      },
      { label: '/stories/{id}', pattern: /\/stories\/\$\{[A-Za-z0-9_]+\}(?=['"`])/ },
    ],
  },
  {
    vertical: 'customer-support',
    reference: 'zendesk',
    vendor: 'Zendesk',
    signatures: [
      { label: '/tickets.json', pattern: /['"`]\/tickets\.json['"`]/ },
      { label: '/users.json', pattern: /['"`]\/users\.json['"`]/ },
    ],
  },
  {
    vertical: 'inventory',
    reference: 'cin7-core',
    vendor: 'Cin7 Core',
    signatures: [
      { label: '/productList', pattern: /['"`]\/productList['"`]/ },
      { label: '/ref/stockonhand', pattern: /['"`]\/ref\/stockonhand['"`]/ },
    ],
  },
  {
    vertical: 'payments',
    reference: 'stripe',
    vendor: 'Stripe',
    reportOnly: true,
    signatures: [{ label: '/charges', pattern: /['"`]\/charges(?=['"`/?])/ }],
  },
]

/** Signature labels that match somewhere in `source`, in declared order. */
export function matchSignatures(source: string, signatures: readonly Signature[]): string[] {
  return signatures.filter((s) => s.pattern.test(source)).map((s) => s.label)
}

export interface Offender {
  vertical: string
  slug: string
  vendor: string
  /** Signature labels this adapter's source matched. */
  matches: string[]
}

export function identity(o: Pick<Offender, 'vertical' | 'slug'>): string {
  return `${o.vertical}/${o.slug}`
}

/**
 * Pure classification: given the concatenated SCAN_FILES source for one
 * non-reference adapter, decide whether it is an offender under `rule`.
 */
export function classifyAdapterSource(
  rule: Pick<CloneRule, 'vertical' | 'vendor' | 'signatures'>,
  slug: string,
  source: string,
): Offender | undefined {
  const matches = matchSignatures(source, rule.signatures)
  if (matches.length === 0) return undefined
  return { vertical: rule.vertical, slug, vendor: rule.vendor, matches }
}

/** Adapter slugs under a vertical, sorted. Directories only, metadata.ts not required. */
function adapterSlugs(vertical: string): string[] {
  const root = join(VERTICALS_DIR, vertical, 'adapters')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((slug) => statSync(join(root, slug)).isDirectory())
    .sort()
}

/** `index.ts` + `client.ts` + `constants.ts` concatenated; a missing file contributes nothing. */
function readAdapterSource(vertical: string, slug: string): string {
  const dir = join(VERTICALS_DIR, vertical, 'adapters', slug)
  return SCAN_FILES.map((file) => {
    const path = join(dir, file)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }).join('\n')
}

/** Offenders for one rule, reference adapter excluded, sorted by identity. */
export function scanRule(rule: CloneRule): Offender[] {
  return adapterSlugs(rule.vertical)
    .filter((slug) => slug !== rule.reference)
    .map((slug) => classifyAdapterSource(rule, slug, readAdapterSource(rule.vertical, slug)))
    .filter((o): o is Offender => o !== undefined)
    .sort((a, b) => identity(a).localeCompare(identity(b)))
}

export function checkCloneSignatures(
  rules: readonly CloneRule[] = CLONE_RULES,
): { rule: CloneRule; offenders: Offender[] }[] {
  return rules.map((rule) => ({ rule, offenders: scanRule(rule) }))
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const update = process.argv.includes('--update')
  const report = process.argv.includes('--report')

  const results = checkCloneSignatures()
  const enforced = results.filter((r) => !r.rule.reportOnly)
  const sweeps = results.filter((r) => r.rule.reportOnly)

  const ids = enforced
    .flatMap((r) => r.offenders)
    .map(identity)
    .sort()

  for (const { rule, offenders } of enforced) {
    const scanned = adapterSlugs(rule.vertical).length - 1 // reference excluded
    console.log(
      `  ${rule.vertical.padEnd(18)} ${String(scanned).padStart(3)} adapters (excl. ${rule.vendor}): ` +
        `${offenders.length} carrying a ${rule.vendor}-shaped path`,
    )
    if (report && offenders.length > 0) {
      const pad = ' '.repeat(22)
      for (const o of offenders) console.log(`${pad}${identity(o)}  (${o.matches.join(', ')})`)
    }
  }

  if (report) {
    for (const { rule, offenders } of sweeps) {
      console.log(
        `\n  ${rule.vertical.padEnd(18)} sweep, never fails: ${offenders.length} adapter(s) carry ` +
          `a literal ${rule.signatures[0]!.label} path (some ${rule.vendor}-shaped, some a real vendor endpoint) —`,
      )
      console.log(`  ${offenders.map(identity).join(', ')}`)
    }
  }

  if (update) {
    writeFileSync(BASELINE_PATH, JSON.stringify(ids, null, 2) + '\n')
    console.log(`\nBaseline updated: ${ids.length} clone-signature offender(s) grandfathered.`)
    return
  }

  const baseline: string[] = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const baselineSet = new Set(baseline)
  const regressions = ids.filter((id) => !baselineSet.has(id))
  const fixed = baseline.filter((id) => !ids.includes(id))

  console.log(
    `\nClone signatures: ${ids.length} offender(s) across ${enforced.length} verticals ` +
      `(baseline allows ${baseline.length}).`,
  )

  if (fixed.length > 0) {
    console.log(
      `${fixed.length} baseline entr${fixed.length === 1 ? 'y' : 'ies'} no longer match a signature. ` +
        `Run \`pnpm check:clone-signatures --update\` to bank the progress.`,
    )
  }

  if (regressions.length === 0) {
    console.log("OK — no new adapter carries a reference adapter's vendor-specific path.")
    return
  }

  console.error(
    `\n${regressions.length} adapter(s) newly carry a reference adapter's vendor-specific path:\n`,
  )
  for (const id of regressions.slice(0, 25)) {
    const o = enforced.flatMap((r) => r.offenders).find((x) => identity(x) === id)!
    console.error(`  ${id}  (${o.matches.join(', ')})`)
  }
  if (regressions.length > 25) console.error(`  ... and ${regressions.length - 25} more`)
  console.error(
    `\nEither this adapter genuinely shares that path with its reference vendor (rare — refine\n` +
      `the signature rather than allowlisting), or it was scaffolded from the reference adapter\n` +
      `and never rewired to its own vendor's real API. Point it at the real endpoint.\n`,
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
