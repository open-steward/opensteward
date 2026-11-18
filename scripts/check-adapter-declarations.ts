/**
 * Ratchet: an adapter's `metadata.ts` must not contradict its `index.ts`.
 *
 * Every adapter directory carries a `metadata.ts` declaring, per canonical
 * resource, whether the *platform* offers it (`availableResources`) or not
 * (`unavailableResources`, each with a reason). Nothing reads those
 * declarations at runtime, so nothing notices when one goes stale. The
 * shape this guard exists to stop: ShipBob gained a `listCarriers`
 * method while its declaration still said `carrier` was unavailable — a
 * method against a resource the file next to it swears does not exist, and
 * nobody could tell which of the two to believe.
 *
 * Note the semantics: `availableResources` means the platform *has* it, not
 * that we implemented it. Available-but-unimplemented is the backlog, and is
 * reported as information, never as failure — so a declaration flip and the
 * implementation that follows it can land in either order. Only the reverse
 * (declared unavailable, yet a method exists) is a contradiction, because
 * exactly one of the two files is wrong and this guard cannot say which.
 *
 * Everything here is static parsing. The adapter graph is never imported:
 * `verticals/<v>/index.ts` pulls in every adapter client, and importing it
 * from a script is exactly what scripts/check-sandbox-egress.ts forbids.
 *
 * Resource ↔ method mapping is derived, not hand-written. Each vertical's
 * `adapter/interface.ts` declares its methods (`listShipments`, `getRates`,
 * `voidLabel`, …); stripping the verb, singularising and lowercasing gives a
 * key that matches the resource vocabulary `metadata.ts` uses once hyphens
 * are dropped (`payment-method` ↔ `listPaymentMethods`). Three method stems
 * name their resource under a different word and are aliased explicitly.
 * Anything left over — a method with no resource, a resource with no method
 * — is reported once per vertical so a vocabulary gap is visible rather than
 * silently classified as nothing.
 *
 * "Implemented" is a two-space-indented member of `index.ts` whose name is on
 * the interface. The intersection is what excludes the BaseAdapter surface
 * and the ~437 private `listParams` helpers without a denylist; the indent is
 * what excludes a four-space GraphQL field inside a template literal. A stub
 * that returns `[]` counts as implemented — it answers 200 where 501 was the
 * honest answer, and that is a contradiction worth seeing.
 *
 * A method that *does* give the honest answer — its first statement throws
 * the 501 `NOT_SUPPORTED` refusal — serves nothing, so it may sit beside an
 * `unavailable` declaration. Beside an `available` one it is reported as
 * `refused`: information, like the backlog, meaning the declaration is stale.
 *
 * Baseline shape matches scripts/check-transform-schema-assertions.ts: a
 * sorted JSON array of `"<vertical>/<slug>:<resource>"` identities the gate
 * tolerates, enforced asymmetrically. A contradiction not in the baseline
 * fails the build; a baseline entry that has since been resolved is only
 * reported (see `fixed`) until someone runs --update to bank it. Each
 * grandfathered entry needs either a method deleted or a live check against
 * the platform, and neither belongs in the commit that adds the guard.
 *
 * Run: `pnpm check:adapter-declarations` (`--soft` reports without failing,
 * `--update` rewrites the baseline, `--report` also lists the backlog).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const BASELINE_PATH = join(REPO_ROOT, 'scripts/adapter-declaration-baseline.json')
/** Adapters with no `metadata.ts` at all — see `adaptersMissingMetadata`. */
const MISSING_BASELINE_PATH = join(REPO_ROOT, 'scripts/adapter-metadata-missing-baseline.json')

export const VERTICALS = [
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
 * Verb prefixes an interface method name can start with. Stripping one
 * leaves the resource stem: `listShipments` → `Shipments`, `voidLabel` →
 * `Label`, `submitDisputeEvidence` → `DisputeEvidence`. A name that starts
 * with none of these keeps its full name as its key, so a future
 * `archiveOrder` surfaces as an unmapped method instead of vanishing.
 */
export const VERB_PREFIX =
  /^(?:list|get|create|update|delete|cancel|void|capture|pay|detach|submit|adjust|set|schedule)(?=[A-Z])/

/**
 * Method stems that name their resource under a different word than
 * `metadata.ts` does, keyed by vertical. Ecommerce declares `inventory` and
 * the interface says `listInventoryLevels`; payments declares `dispute` and
 * `invoice` where the interface has `submitDisputeEvidence` and
 * `listInvoiceLineItems`.
 */
const METHOD_KEY_ALIASES: Record<string, Record<string, string>> = {
  ecommerce: { inventorylevel: 'inventory' },
  payments: { disputeevidence: 'dispute', invoicelineitem: 'invoice' },
}

/**
 * On every one of the nine interfaces, reachable from no resource route,
 * and about no resource. Same exclusion scripts/check-sandbox-coverage.ts
 * makes.
 */
const NOT_A_RESOURCE_METHOD = new Set(['parseWebhookEvents'])

/** `Companies` → `Company`, `Shipments` → `Shipment`; a trailing `ss` is left alone. */
function singularise(stem: string): string {
  if (/ies$/.test(stem)) return stem.replace(/ies$/, 'y')
  if (/[^s]s$/.test(stem)) return stem.slice(0, -1)
  return stem
}

/**
 * The resource key an interface method addresses, or `undefined` for a
 * method that is about no resource at all.
 */
export function methodKey(method: string, vertical = ''): string | undefined {
  if (NOT_A_RESOURCE_METHOD.has(method)) return undefined
  const key = singularise(method.replace(VERB_PREFIX, '')).toLowerCase()
  return METHOD_KEY_ALIASES[vertical]?.[key] ?? key
}

/** The key a `metadata.ts` resource name compares under: hyphens dropped, lowercased. */
export function resourceKey(resource: string): string {
  return resource.replace(/-/g, '').toLowerCase()
}

/**
 * Method names an `adapter/interface.ts` declares. `  listInvoices?(…` — the
 * literal two-space indent and the optional `?` are what distinguish a member
 * declaration from a mention in a comment.
 */
export function parseInterfaceMethods(source: string): string[] {
  const out = new Set<string>()
  const re = /^ {2}([a-z]\w*)\??\s*\(/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.add(m[1]!)
  return [...out].sort()
}

/** Interface methods grouped by the resource key they address, alphabetically. */
export function buildResourceMap(
  vertical: string,
  interfaceMethods: readonly string[],
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const method of interfaceMethods) {
    const key = methodKey(method, vertical)
    if (key === undefined) continue
    const methods = map.get(key) ?? []
    methods.push(method)
    map.set(key, methods)
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export interface AdapterMetadata {
  platform: string
  totalResources: number | undefined
  available: string[]
  unavailable: { resource: string; reason: string }[]
}

/**
 * The declaration in a `metadata.ts`. Two line layouts (`['a', 'b']` on one
 * line, or one entry per line) and two empty forms (`[]`, or `[] as { … }[]`
 * so the literal still has an element type) are all in use; none needs
 * special-casing because only the quoted names are read.
 *
 * The `reason` is best-effort — the first string literal after the key.
 * Some reasons are concatenated across lines; only the opening fragment is
 * kept, and it is used for nothing but the failure message.
 */
export function parseMetadata(source: string): AdapterMetadata {
  const platform = /\bplatform:\s*'([^']+)'/.exec(source)?.[1] ?? ''
  const total = /\btotalResources:\s*(\d+)/.exec(source)?.[1]
  // `\b` before `availableResources` rejects the `un…` prefix: `n` → `a` is
  // not a word boundary.
  const availableBlock = /\bavailableResources:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? ''
  const available = [...availableBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  const unavailable: { resource: string; reason: string }[] = []
  const unavailableStart = source.search(/\bunavailableResources:\s*\[/)
  if (unavailableStart !== -1) {
    const block = source.slice(unavailableStart)
    const entry =
      /\bresource:\s*'([^']+)'\s*,\s*reason:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")?/g
    let m: RegExpExecArray | null
    while ((m = entry.exec(block)) !== null) {
      unavailable.push({ resource: m[1]!, reason: m[2] ?? m[3] ?? '' })
    }
  }
  return {
    platform,
    totalResources: total === undefined ? undefined : Number(total),
    available,
    unavailable,
  }
}

/**
 * Interface methods an adapter's `index.ts` defines. A member is a
 * two-space-indented name followed by `(` — optionally behind `async` or a
 * modifier — or an arrow property (`credentialFields = () =>`). The
 * intersection with the interface's method set is what drops everything
 * else the same regex would match: `constructor`, the BaseAdapter surface,
 * private helpers.
 */
export function parseImplementedMethods(
  source: string,
  interfaceMethods: ReadonlySet<string>,
): string[] {
  const out = new Set<string>()
  const re =
    /^ {2}(?:(?:public|private|protected|override|static|readonly)\s+)*(?:async\s+)?([a-z]\w*)\s*(?:\(|=\s*(?:async\s*)?\()/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (interfaceMethods.has(m[1]!)) out.add(m[1]!)
  }
  return [...out].sort()
}

/**
 * Local functions, across an adapter's own files, that build the 501
 * `NOT_SUPPORTED` refusal: a top-level `function name(` or
 * `const name = (…) =>` whose text, up to the next top-level declaration,
 * mentions `NOT_SUPPORTED`. Every refusal helper in the tree is defined
 * inside its adapter directory, so no shared module needs scanning.
 */
export function parseRefusalHelpers(sources: readonly string[]): Set<string> {
  const out = new Set<string>()
  const re =
    /^(?:export\s+)?(?:(?:async\s+)?function\s+(\w+)\s*[(<]|const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::\s*[^=\n]+)?=>)/gm
  for (const source of sources) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const lines = source.slice(m.index).split('\n')
      const end = lines.findIndex((l, i) => i > 0 && /^\S/.test(l) && !/^[)}\]]/.test(l))
      const text = (end < 0 ? lines : lines.slice(0, end)).join('\n')
      if (text.includes('NOT_SUPPORTED')) out.add((m[1] ?? m[2])!)
    }
  }
  return out
}

/**
 * Interface methods whose body opens with an unconditional refusal: its
 * first statement is `throw` of an error carrying `NOT_SUPPORTED`, written
 * inline or built by one of `helpers`. Such a method is honest about the
 * platform, not an implementation of the resource, so a resource declared
 * unavailable may carry one. A refusal behind a condition (a missing
 * connection field) is not counted: the method serves the resource otherwise.
 */
export function parseRefusingMethods(
  source: string,
  interfaceMethods: ReadonlySet<string>,
  helpers: ReadonlySet<string>,
): string[] {
  const out = new Set<string>()
  const re =
    /^ {2}(?:(?:public|private|protected|override|static|readonly)\s+)*(?:async\s+)?([a-z]\w*)\s*(?:\(|=\s*(?:async\s*)?\()/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (!interfaceMethods.has(m[1]!)) continue
    const lines = source.slice(m.index).split('\n')
    // The signature ends on its first line, or on the `  ): T {` that closes a
    // multi-line parameter list.
    const open = lines.findIndex((l, i) => /\{\s*$/.test(l) && (i === 0 || /^ {2}\)/.test(l)))
    if (open < 0) continue
    const close = lines.findIndex((l, i) => i > open && /^ {2}\}/.test(l))
    const body = lines
      .slice(open + 1, close < 0 ? undefined : close)
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .trim()
    const thrown = /^throw\s+(?:new\s+)?(\w+)/.exec(body)
    if (thrown && (helpers.has(thrown[1]!) || body.includes('NOT_SUPPORTED'))) out.add(m[1]!)
  }
  return [...out].sort()
}

export type Verdict =
  'ok' | 'backlog' | 'refused' | 'ok-unavailable' | 'CONTRADICTION' | 'undeclared'

export interface Cell {
  vertical: string
  slug: string
  /** As spelled in `metadata.ts` when declared; the resource key otherwise. */
  resource: string
  verdict: Verdict
  /** Interface methods for this resource that `index.ts` defines. */
  implemented: string[]
  /** The declared `unavailable` reason, when there is one. */
  reason?: string
}

export interface AdapterReport {
  vertical: string
  slug: string
  cells: Cell[]
  /** Declared names that map to no interface method — a typo or a vocabulary gap. */
  unknownResources: string[]
  /** Declared in both arrays at once. */
  doubleDeclared: string[]
  /** `totalResources` disagrees with the number of names actually declared. */
  drift: { totalResources: number | undefined; declared: number } | undefined
}

export function identity(cell: Pick<Cell, 'vertical' | 'slug' | 'resource'>): string {
  return `${cell.vertical}/${cell.slug}:${cell.resource}`
}

/**
 * One verdict per resource the vertical's interface knows about:
 *
 *   declared available   + method → ok
 *   declared available   + only refusing methods → refused  (information: the declaration is stale)
 *   declared available   + none   → backlog        (the platform has it; we don't yet)
 *   declared unavailable + none or only refusing methods → ok-unavailable
 *   declared unavailable + method → CONTRADICTION  (one of the two files is wrong)
 *   declared nowhere              → undeclared
 *
 * `refusing` holds the methods `parseRefusingMethods` found; they stay in
 * `implemented` (and in each cell's list) but serve nothing.
 */
export function classifyAdapter(
  vertical: string,
  slug: string,
  metadata: AdapterMetadata,
  implemented: ReadonlySet<string>,
  resourceMap: ReadonlyMap<string, readonly string[]>,
  refusing: ReadonlySet<string> = new Set(),
): AdapterReport {
  const available = new Map(metadata.available.map((r) => [resourceKey(r), r]))
  const unavailable = new Map(metadata.unavailable.map((u) => [resourceKey(u.resource), u]))
  const cells: Cell[] = []
  for (const [key, methods] of resourceMap) {
    const defined = methods.filter((m) => implemented.has(m))
    const serving = defined.filter((m) => !refusing.has(m))
    const declaredAvailable = available.get(key)
    const declaredUnavailable = unavailable.get(key)
    if (declaredAvailable !== undefined) {
      cells.push({
        vertical,
        slug,
        resource: declaredAvailable,
        verdict: serving.length > 0 ? 'ok' : defined.length > 0 ? 'refused' : 'backlog',
        implemented: defined,
      })
    } else if (declaredUnavailable !== undefined) {
      cells.push({
        vertical,
        slug,
        resource: declaredUnavailable.resource,
        verdict: serving.length > 0 ? 'CONTRADICTION' : 'ok-unavailable',
        implemented: defined,
        reason: declaredUnavailable.reason,
      })
    } else {
      cells.push({ vertical, slug, resource: key, verdict: 'undeclared', implemented: defined })
    }
  }
  const declaredKeys = [...available.keys(), ...unavailable.keys()]
  const declared = metadata.available.length + metadata.unavailable.length
  return {
    vertical,
    slug,
    cells,
    unknownResources: declaredKeys.filter((k) => !resourceMap.has(k)).sort(),
    doubleDeclared: [...available.keys()].filter((k) => unavailable.has(k)).sort(),
    drift:
      metadata.totalResources === declared
        ? undefined
        : { totalResources: metadata.totalResources, declared },
  }
}

export interface VocabularyGap {
  /** The resource key the interface methods address. */
  key: string
  methods: string[]
  /** How many adapters in the vertical define at least one of those methods. */
  implementers: number
}

export interface VerticalReport {
  vertical: string
  adapters: AdapterReport[]
  /**
   * Interface methods whose key matches no declared resource anywhere in the
   * vertical — the resource is missing from the vocabulary, not from one
   * file, so it is reported here once rather than as an `undeclared` cell on
   * every adapter.
   */
  unmappedMethods: VocabularyGap[]
  /** Declared resource names that no interface method addresses. */
  resourcesWithoutMethod: string[]
}

/**
 * Adapter directories under a vertical that have an `index.ts` but NO
 * `metadata.ts`, as `<vertical>/<slug>` identities, sorted.
 *
 * These are this guard's blind spot, and it was a large one. `adapterDirs`
 * below filters on the presence of `metadata.ts`, so an adapter without one is
 * never evaluated and contributes nothing to the counts this script prints.
 * 742 of 1545 adapters were in that state — including shopify, bigcommerce,
 * vtex and commercetools, the reference adapters others are copied from — so a
 * green "0 contradictions" was measured over less than half the repo.
 *
 * An adapter with no declaration cannot contradict one, so this is not itself
 * a contradiction and does not join that baseline. It is ratcheted separately:
 * the count may only go down.
 */
export function adaptersMissingMetadata(vertical: string): string[] {
  const root = join(VERTICALS_DIR, vertical, 'adapters')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((slug) => {
      const dir = join(root, slug)
      return (
        statSync(dir).isDirectory() &&
        existsSync(join(dir, 'index.ts')) &&
        !existsSync(join(dir, 'metadata.ts'))
      )
    })
    .map((slug) => `${vertical}/${slug}`)
    .sort()
}

/** Adapter directories under a vertical that carry a `metadata.ts`, sorted. */
function adapterDirs(vertical: string): string[] {
  const root = join(VERTICALS_DIR, vertical, 'adapters')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .map((slug) => join(root, slug))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'metadata.ts')))
    .sort()
}

export function checkAdapterDeclarations(
  verticals: readonly string[] = VERTICALS,
): VerticalReport[] {
  return verticals.map((vertical) => {
    const interfaceFile = join(VERTICALS_DIR, vertical, 'adapter/interface.ts')
    const interfaceMethods = existsSync(interfaceFile)
      ? parseInterfaceMethods(readFileSync(interfaceFile, 'utf8'))
      : []
    const interfaceSet = new Set(interfaceMethods)
    const resourceMap = buildResourceMap(vertical, interfaceMethods)

    // Read every adapter first: the vocabulary is the union of what the
    // vertical's metadata files declare, and classification is against that.
    const parsed = adapterDirs(vertical).map((dir) => {
      const indexFile = join(dir, 'index.ts')
      const index = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : ''
      const helpers = parseRefusalHelpers(
        readdirSync(dir)
          .filter((f) => f.endsWith('.ts'))
          .map((f) => readFileSync(join(dir, f), 'utf8')),
      )
      return {
        slug: dir.slice(dir.lastIndexOf('/') + 1),
        metadata: parseMetadata(readFileSync(join(dir, 'metadata.ts'), 'utf8')),
        implemented: new Set(parseImplementedMethods(index, interfaceSet)),
        refusing: new Set(parseRefusingMethods(index, interfaceSet, helpers)),
      }
    })
    const vocabulary = new Set<string>()
    for (const { metadata } of parsed) {
      for (const r of metadata.available) vocabulary.add(resourceKey(r))
      for (const u of metadata.unavailable) vocabulary.add(resourceKey(u.resource))
    }
    const known = new Map([...resourceMap].filter(([key]) => vocabulary.has(key)))
    const adapters = parsed.map(({ slug, metadata, implemented, refusing }) =>
      classifyAdapter(vertical, slug, metadata, implemented, known, refusing),
    )
    const unmappedMethods = [...resourceMap]
      .filter(([key]) => !vocabulary.has(key))
      .map(([key, methods]) => ({
        key,
        methods,
        implementers: parsed.filter((a) => methods.some((m) => a.implemented.has(m))).length,
      }))
    const resourcesWithoutMethod = [...vocabulary].filter((k) => !resourceMap.has(k)).sort()
    return { vertical, adapters, unmappedMethods, resourcesWithoutMethod }
  })
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const update = process.argv.includes('--update')
  const report = process.argv.includes('--report')

  const reports = checkAdapterDeclarations()
  const cells = reports.flatMap((r) => r.adapters.flatMap((a) => a.cells))
  const contradictions = cells.filter((c) => c.verdict === 'CONTRADICTION')
  const ids = contradictions.map(identity).sort()
  const adapterCount = reports.reduce((n, r) => n + r.adapters.length, 0)

  for (const r of reports) {
    const count = (verdict: Verdict): number =>
      r.adapters.reduce((n, a) => n + a.cells.filter((c) => c.verdict === verdict).length, 0)
    const drift = r.adapters.filter((a) => a.drift !== undefined).length
    console.log(
      `  ${r.vertical.padEnd(18)} ${String(r.adapters.length).padStart(3)} adapters: ` +
        `${count('ok')} ok · ${count('backlog')} backlog · ${count('refused')} refused · ${count('ok-unavailable')} unavailable · ` +
        `${count('CONTRADICTION')} contradiction(s) · ${count('undeclared')} undeclared` +
        (drift > 0 ? ` · totalResources drift in ${drift}` : ''),
    )
    const pad = ' '.repeat(22)
    if (r.unmappedMethods.length > 0) {
      console.log(
        `${pad}methods with no declared resource: ` +
          r.unmappedMethods
            .map((g) => `${g.key} (${g.methods.join(', ')}; ${g.implementers} implementers)`)
            .join(', '),
      )
    }
    if (r.resourcesWithoutMethod.length > 0) {
      console.log(`${pad}declared resources with no method: ${r.resourcesWithoutMethod.join(', ')}`)
    }
    const doubled = r.adapters.filter((a) => a.doubleDeclared.length > 0)
    if (doubled.length > 0) {
      console.log(
        `${pad}declared both available and unavailable: ` +
          doubled.map((a) => `${a.slug} (${a.doubleDeclared.join(', ')})`).join(', '),
      )
    }
    const unknown = r.adapters.filter((a) => a.unknownResources.length > 0)
    if (unknown.length > 0) {
      console.log(
        `${pad}declared names the interface has no method for: ` +
          unknown.map((a) => `${a.slug} (${a.unknownResources.join(', ')})`).join(', '),
      )
    }
    if (report) {
      const backlog = r.adapters.flatMap((a) => a.cells.filter((c) => c.verdict === 'backlog'))
      if (backlog.length > 0) {
        console.log(`${pad}backlog: ${backlog.map(identity).join(', ')}`)
      }
    }
  }

  // The blind spot: adapters this guard cannot evaluate at all, because they
  // carry no declaration to compare against. Counted separately from
  // contradictions — an adapter with no metadata.ts cannot contradict one —
  // but ratcheted the same way, so the number can only fall.
  const missing = VERTICALS.flatMap((v) => adaptersMissingMetadata(v)).sort()

  if (update) {
    writeFileSync(BASELINE_PATH, JSON.stringify(ids, null, 2) + '\n')
    writeFileSync(MISSING_BASELINE_PATH, JSON.stringify(missing, null, 2) + '\n')
    console.log(
      `\nBaseline updated: ${ids.length} contradiction(s) grandfathered, ` +
        `${missing.length} adapter(s) without metadata.ts.`,
    )
    return
  }

  const missingBaseline: string[] = JSON.parse(readFileSync(MISSING_BASELINE_PATH, 'utf8'))
  const missingSet = new Set(missingBaseline)
  const newlyMissing = missing.filter((id) => !missingSet.has(id))
  const nowDeclared = missingBaseline.filter((id) => !missing.includes(id))

  const baseline: string[] = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const baselineSet = new Set(baseline)
  const regressions = contradictions.filter((c) => !baselineSet.has(identity(c)))
  const fixed = baseline.filter((id) => !ids.includes(id))

  console.log(
    `\nAdapter declarations: ${adapterCount} adapters, ${contradictions.length} contradiction(s) ` +
      `(baseline allows ${baseline.length}).`,
  )
  // Stated next to the adapter count on purpose. Without it, "803 adapters,
  // 0 contradictions" reads as full coverage when it is a minority of them.
  console.log(
    `Coverage: ${adapterCount} of ${adapterCount + missing.length} adapters carry a metadata.ts; ` +
      `${missing.length} have none and are not evaluated (baseline allows ${missingBaseline.length}).`,
  )

  if (nowDeclared.length > 0) {
    console.log(
      `${nowDeclared.length} adapter(s) gained a metadata.ts. ` +
        `Run \`pnpm check:adapter-declarations --update\` to bank the progress.`,
    )
  }

  if (fixed.length > 0) {
    console.log(
      `${fixed.length} baseline entr${fixed.length === 1 ? 'y' : 'ies'} no longer contradict. ` +
        `Run \`pnpm check:adapter-declarations --update\` to bank the progress.`,
    )
  }

  if (newlyMissing.length > 0) {
    console.error(
      `\n${newlyMissing.length} new adapter(s) added without a metadata.ts, so this guard cannot ` +
        `evaluate them:\n`,
    )
    for (const id of newlyMissing.slice(0, 25)) console.error(`  ${id}`)
    if (newlyMissing.length > 25) console.error(`  ... and ${newlyMissing.length - 25} more`)
    console.error(
      `\nAdd a metadata.ts declaring which canonical resources the platform offers. ` +
        `The count of adapters without one may only go down.`,
    )
    if (!soft) process.exitCode = 1
  }

  if (regressions.length === 0) {
    if (newlyMissing.length === 0) {
      console.log('OK — no adapter declares a resource unavailable while implementing it.')
    }
    return
  }

  console.error(
    `\n${regressions.length} adapter resource(s) declared unavailable in metadata.ts but implemented in index.ts:\n`,
  )
  for (const c of regressions.slice(0, 25)) {
    console.error(`  ${identity(c)}  (${c.implemented.join(', ')})`)
    if (c.reason)
      console.error(`      reason: ${c.reason.slice(0, 120)}${c.reason.length > 120 ? '…' : ''}`)
  }
  if (regressions.length > 25) console.error(`  ... and ${regressions.length - 25} more`)
  console.error(
    `\nOne of the two files is wrong. Either the platform has the resource — move it to\n` +
      `\`availableResources\` in adapters/<slug>/metadata.ts — or it does not, and the method\n` +
      `must go (a stub that returns [] answers 200 where 501 was honest).\n`,
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
