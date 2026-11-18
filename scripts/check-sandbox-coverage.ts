/**
 * CI guard: every adapter method a sandbox manifest names must actually exist
 * on that vertical's adapter interface.
 *
 * The sandbox adapter is a Proxy keyed by method name. A name that matches
 * nothing simply never gets called — the router finds `undefined` and answers
 * its ordinary `501 Not Implemented`. So a typo in a manifest does not throw,
 * does not fail a type check (the manifest holds strings), and does not show up
 * in a test that only exercises the resources someone remembered to cover. It
 * just means that route is quietly dead in test mode, forever.
 *
 * This check is the join between the manifest's strings and the interface's
 * declarations. It also reports coverage per vertical, so the gap while the
 * remaining verticals are being filled in is visible rather than assumed.
 *
 * Run: `pnpm tsx scripts/check-sandbox-coverage.ts` (add `--soft` to report
 * without failing). Exit 0 when every named method exists, 1 otherwise.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')

const VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

/**
 * Methods declared on a vertical's adapter interface, split by kind.
 *
 * `resource` are the CRUD-shaped ones — the `list|get|create|update|delete`
 * prefixes — and they are the coverage denominator.
 *
 * `action` is everything else a resource router can call: `voidEnvelope`,
 * `captureCharge`, `detachPaymentMethod`, `submitDisputeEvidence`. Action
 * methods are validated too — matching only the five CRUD prefixes here and
 * in the manifest scan below would leave a misspelled action name unchecked,
 * exactly the hole this file's docblock warns about: it matches nothing, the
 * Proxy returns undefined, and the route 501s forever. Payments declares
 * seven such methods, docsign one.
 *
 * `parseWebhookEvents` is excluded — it is on every one of the nine
 * interfaces, is not reachable from a resource route, and has nothing to do
 * with the sandbox.
 */
const NOT_A_RESOURCE_METHOD = new Set(['parseWebhookEvents'])

function interfaceMethods(vertical: string): { resource: string[]; action: string[] } {
  const file = join(VERTICALS_DIR, vertical, 'adapter/interface.ts')
  if (!existsSync(file)) return { resource: [], action: [] }
  const source = readFileSync(file, 'utf8')
  // `  listInvoices?(credentials: …` — the leading whitespace and the `?(` are
  // what distinguish a member declaration from a mention in a comment.
  const re = /^\s{2}([a-z]\w*)\??\s*\(/gm
  const resource = new Set<string>()
  const action = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const name = m[1]!
    if (NOT_A_RESOURCE_METHOD.has(name)) continue
    if (/^(?:list|get|create|update|delete)[A-Z]/.test(name)) resource.add(name)
    else action.add(name)
  }
  return { resource: [...resource].sort(), action: [...action].sort() }
}

/**
 * Vertical slugs the sandbox manifest registry is keyed by.
 *
 * The registry uses literal strings rather than each vertical's exported
 * `VERTICAL` constant, because importing that constant pulls in
 * `verticals/<v>/index.ts` and with it 283 adapter clients — which would end
 * the sandbox's no-egress property. The cost of that trade is a key that could
 * be misspelled and would then silently mount nothing, so check it here.
 */
function manifestRegistryKeys(): string[] {
  const file = join(VERTICALS_DIR, '..', 'sandbox', 'manifest.ts')
  if (!existsSync(file)) return []
  const source = readFileSync(file, 'utf8')
  const block = /SANDBOX_MANIFESTS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(source)
  if (!block) return []
  const out: string[] = []
  const re = /^\s{2}'?([a-z][a-z-]*)'?\s*:/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(block[1]!)) !== null) out.push(m[1]!)
  return out
}

/**
 * Method names a vertical's sandbox manifest refers to, from both places one
 * can appear: a CRUD slot (`list: 'listInvoices'`) and an action's `method`
 * (`capture: { method: 'captureCharge', … }`).
 *
 * Note the two are not partitioned by which key they sit under. Payments puts
 * `detachPaymentMethod` in the `delete` slot, because the live route is
 * `DELETE /payment_methods/:id` — the route's verb decides the slot, not the
 * method's name. So both sets are validated against the union of the
 * interface's resource and action methods rather than each against its own.
 */
function manifestMethods(vertical: string): { present: boolean; methods: string[] } {
  const file = join(VERTICALS_DIR, vertical, 'sandbox/resources.ts')
  if (!existsSync(file)) return { present: false, methods: [] }
  const source = readFileSync(file, 'utf8')
  const out = new Set<string>()
  let m: RegExpExecArray | null
  // `list: 'listInvoices',` — the verb key, then the adapter method name.
  const slots = /\b(?:list|get|create|update|delete)\s*:\s*'([A-Za-z_]\w*)'/g
  while ((m = slots.exec(source)) !== null) out.add(m[1]!)
  // `{ method: 'captureCharge', sets: … }`
  const actions = /\bmethod\s*:\s*'([A-Za-z_]\w*)'/g
  while ((m = actions.exec(source)) !== null) out.add(m[1]!)
  return { present: true, methods: [...out].sort() }
}

export interface CoverageReport {
  vertical: string
  hasManifest: boolean
  /** Named in the manifest but absent from the interface — always an error. */
  unknown: string[]
  /** On the interface but not yet in the manifest — informational. */
  uncovered: string[]
  covered: number
  total: number
  /** Action verbs, counted separately so the CRUD denominator stays stable. */
  actionsCovered: number
  actionsTotal: number
  /** Action verbs the interface declares that no manifest entry names. */
  actionsUncovered: string[]
}

export function checkSandboxCoverage(): CoverageReport[] {
  return VERTICALS.map((vertical) => {
    const { resource, action } = interfaceMethods(vertical)
    const { present, methods } = manifestMethods(vertical)
    // The union: a manifest name is valid if the interface declares it at
    // all, whichever slot it was written in.
    const declaredSet = new Set([...resource, ...action])
    const manifestSet = new Set(methods)
    return {
      vertical,
      hasManifest: present,
      unknown: methods.filter((m) => !declaredSet.has(m)),
      uncovered: resource.filter((m) => !manifestSet.has(m)),
      covered: resource.filter((m) => manifestSet.has(m)).length,
      total: resource.length,
      actionsCovered: action.filter((m) => manifestSet.has(m)).length,
      actionsTotal: action.length,
      actionsUncovered: action.filter((m) => !manifestSet.has(m)),
    }
  })
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const reports = checkSandboxCoverage()
  const broken = reports.filter((r) => r.unknown.length > 0)

  // A registry key that names no vertical mounts nothing, silently.
  const keys = manifestRegistryKeys()
  const strayKeys = keys.filter((k) => !VERTICALS.includes(k))
  // And a manifest file with no registry entry is written but never mounted.
  const unregistered = reports
    .filter((r) => r.hasManifest && !keys.includes(r.vertical))
    .map((r) => r.vertical)

  for (const r of reports) {
    if (!r.hasManifest) {
      console.log(`  ${r.vertical.padEnd(18)} no sandbox manifest yet (${r.total} methods)`)
      continue
    }
    const pct = r.total === 0 ? 0 : Math.round((r.covered / r.total) * 100)
    const actions = r.actionsTotal === 0 ? '' : ` · ${r.actionsCovered}/${r.actionsTotal} actions`
    console.log(`  ${r.vertical.padEnd(18)} ${r.covered}/${r.total} methods (${pct}%)${actions}`)
    if (r.uncovered.length > 0) {
      console.log(`${' '.repeat(22)}not in sandbox: ${r.uncovered.join(', ')}`)
    }
    if (r.actionsUncovered.length > 0) {
      console.log(`${' '.repeat(22)}actions not in sandbox: ${r.actionsUncovered.join(', ')}`)
    }
  }

  if (keys.length > 0) {
    console.log(`\n  registry: ${keys.join(', ')}`)
  }
  if (strayKeys.length > 0) {
    console.error(
      `\n✗ SANDBOX_MANIFESTS names a vertical that does not exist: ${strayKeys.join(', ')}`,
    )
    if (!soft) process.exitCode = 1
  }
  if (unregistered.length > 0) {
    console.error(
      `\n✗ a sandbox manifest exists but is not in SANDBOX_MANIFESTS, so it is never mounted: ${unregistered.join(', ')}`,
    )
    if (!soft) process.exitCode = 1
  }

  if (broken.length === 0) {
    if (strayKeys.length === 0 && unregistered.length === 0) {
      console.log('\n✓ sandbox coverage: every method named in a manifest exists on its interface.')
    }
    return
  }

  console.error('\n✗ sandbox coverage: manifest names a method the interface does not declare.')
  for (const r of broken) {
    console.error(`    ${r.vertical}: ${r.unknown.join(', ')}`)
  }
  console.error(
    '\nA name that matches nothing is silently dead — the Proxy returns undefined ' +
      'and the route 501s forever. Fix the spelling, or remove the entry.',
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
