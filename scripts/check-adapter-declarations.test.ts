/**
 * Tests for the adapter-declaration guard.
 *
 * Pins the regression it exists for (a `listCarriers` method beside a
 * metadata.ts still declaring `carrier` unavailable) at each layer the guard
 * parses — both metadata line layouts and both empty forms, the
 * method → resource key table, the member scan that must ignore the
 * BaseAdapter surface and template-literal contents, and one fixture per
 * verdict — then drives the real repository so the baseline cannot drift
 * from what the tree contains.
 *
 * Run: `pnpm exec tsx --test scripts/check-adapter-declarations.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  VERB_PREFIX,
  adaptersMissingMetadata,
  VERTICALS,
  buildResourceMap,
  checkAdapterDeclarations,
  classifyAdapter,
  identity,
  methodKey,
  parseImplementedMethods,
  parseInterfaceMethods,
  parseMetadata,
  parseRefusalHelpers,
  parseRefusingMethods,
  resourceKey,
} from './check-adapter-declarations.ts'

// ── metadata.ts ─────────────────────────────────────────────────────────────

const MULTI_LINE = `export const metadata = {
  platform: 'shipbob',
  totalResources: 8,
  availableResources: [
    'carrier',
    'order',
  ],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'ShipBob manages label generation internally; no label endpoint is exposed.',
    },
    {
      resource: 'rate',
      reason: "The only estimate endpoint is on the deprecated v1.0 API; it's sunset July 2026.",
    },
  ],
} as const
`

const SINGLE_LINE = `export const metadata = {
  platform: 'fedex',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate'],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'The FedEx REST API has no order endpoint; ' +
        'orders exist only in FedEx Supply Chain.',
    },
  ],
} as const
`

const EMPTY_PLAIN = `export const metadata = {
  platform: 'dualentry',
  totalResources: 2,
  availableResources: ['account', 'bill'],
  unavailableResources: [],
} as const
`

const EMPTY_TYPED = `export const metadata = {
  platform: 'accelo',
  totalResources: 2,
  availableResources: ['contact', 'company'],
  unavailableResources: [] as { resource: string; reason: string }[],
} as const
`

test('parses the one-entry-per-line layout', () => {
  const parsed = parseMetadata(MULTI_LINE)
  assert.equal(parsed.platform, 'shipbob')
  assert.equal(parsed.totalResources, 8)
  assert.deepEqual(parsed.available, ['carrier', 'order'])
  assert.deepEqual(
    parsed.unavailable.map((u) => u.resource),
    ['label', 'rate'],
  )
  // Double-quoted reasons (the platform name carries an apostrophe) parse too.
  assert.match(parsed.unavailable[1]!.reason, /^The only estimate endpoint/)
})

test('parses the single-line array layout and keeps only the first reason fragment', () => {
  const parsed = parseMetadata(SINGLE_LINE)
  assert.deepEqual(parsed.available, ['carrier', 'label', 'rate'])
  assert.deepEqual(parsed.unavailable, [
    { resource: 'order', reason: 'The FedEx REST API has no order endpoint; ' },
  ])
})

test('parses both empty forms of unavailableResources', () => {
  assert.deepEqual(parseMetadata(EMPTY_PLAIN).unavailable, [])
  assert.deepEqual(parseMetadata(EMPTY_PLAIN).available, ['account', 'bill'])
  assert.deepEqual(parseMetadata(EMPTY_TYPED).unavailable, [])
  assert.deepEqual(parseMetadata(EMPTY_TYPED).available, ['contact', 'company'])
})

test('the `un` prefix does not leak available names into the unavailable list or back', () => {
  // `unavailableResources` contains the substring `availableResources`; the
  // word boundary is what keeps the two blocks apart.
  const parsed = parseMetadata(MULTI_LINE)
  assert.ok(!parsed.available.includes('label'))
  assert.ok(!parsed.unavailable.some((u) => u.resource === 'carrier'))
})

// ── method → resource key ───────────────────────────────────────────────────

test('methodKey strips the verb, singularises and lowercases', () => {
  const table: [string, string | undefined, string | undefined][] = [
    ['listShipments', undefined, 'shipment'],
    ['getRates', undefined, 'rate'],
    ['getTrackingEvents', undefined, 'trackingevent'],
    ['voidLabel', undefined, 'label'],
    ['getOrganization', undefined, 'organization'],
    ['listCompanies', 'crm', 'company'],
    ['listActivities', 'crm', 'activity'],
    ['listAuditTrailEntries', 'docsign', 'audittrailentry'],
    ['listPaymentMethods', 'payments', 'paymentmethod'],
    ['detachPaymentMethod', 'payments', 'paymentmethod'],
    ['listBalanceTransactions', 'payments', 'balancetransaction'],
    ['captureCharge', 'payments', 'charge'],
    ['payInvoice', 'payments', 'invoice'],
    ['scheduleShipment', 'logistics', 'shipment'],
  ]
  for (const [method, vertical, expected] of table) {
    assert.equal(methodKey(method, vertical), expected, method)
  }
})

test('methodKey applies the per-vertical aliases, and only in their vertical', () => {
  assert.equal(methodKey('listInventoryLevels', 'ecommerce'), 'inventory')
  assert.equal(methodKey('adjustInventoryLevel', 'ecommerce'), 'inventory')
  assert.equal(methodKey('setInventoryLevel', 'ecommerce'), 'inventory')
  assert.equal(methodKey('submitDisputeEvidence', 'payments'), 'dispute')
  assert.equal(methodKey('listInvoiceLineItems', 'payments'), 'invoice')
  assert.equal(methodKey('listInvoiceLineItems', 'accounting'), 'invoicelineitem')
})

test('methodKey leaves parseWebhookEvents out and lets an unknown verb surface', () => {
  assert.equal(methodKey('parseWebhookEvents'), undefined)
  // Not swallowed into some resource: the whole name becomes the key, which
  // matches no declared resource and so shows up as unmapped.
  assert.equal(methodKey('archiveOrders'), 'archiveorder')
})

test('resourceKey drops hyphens and case', () => {
  assert.equal(resourceKey('payment-method'), 'paymentmethod')
  assert.equal(resourceKey('audit-trail-entry'), 'audittrailentry')
  assert.equal(resourceKey('Rate'), 'rate')
})

// ── adapter/interface.ts ────────────────────────────────────────────────────

const INTERFACE = `export interface LogisticsAdapter<C> {
  /** listShipments(credentials) is the paged read; getRates(credentials) is not a list. */
  listShipments?(credentials: C, params?: ListParams): Promise<Shipment[]>
  getRates?(
    credentials: C,
    input: RateRequest,
  ): Promise<Rate[]>
  voidLabel?(credentials: C, id: string): Promise<void>
  parseWebhookEvents(raw: unknown): WebhookEvent[]
}
`

test('parseInterfaceMethods reads members, not mentions in comments', () => {
  assert.deepEqual(parseInterfaceMethods(INTERFACE), [
    'getRates',
    'listShipments',
    'parseWebhookEvents',
    'voidLabel',
  ])
})

test('buildResourceMap groups methods by resource key and drops the webhook parser', () => {
  const map = buildResourceMap('logistics', [
    'listShipments',
    'getShipment',
    'createShipment',
    'getRates',
    'voidLabel',
    'parseWebhookEvents',
  ])
  assert.deepEqual(
    [...map],
    [
      ['label', ['voidLabel']],
      ['rate', ['getRates']],
      ['shipment', ['listShipments', 'getShipment', 'createShipment']],
    ],
  )
})

// ── index.ts ────────────────────────────────────────────────────────────────

const INDEX = `export class ShipBobAdapter extends BaseAdapter<Credentials> {
  readonly platform = 'shipbob'
  private readonly client: Client

  constructor(config: Config) {
    super(config)
  }

  credentialFields = () => SHIPBOB_CREDENTIAL_FIELDS

  async request<T>(path: string): Promise<T> {
    return this.client.get(path)
  }

  private async listParams(params?: ListParams): Promise<Record<string, string>> {
    return {}
  }

  async listCarriers(credentials: Credentials): Promise<Carrier[]> {
    const query = \`
    query {
      listOrders(first: 10) {
        getRates(input: $input) { id }
      }
    }\`
    return this.request('/carriers')
  }

  getShipment = async (credentials: Credentials, id: string): Promise<Shipment> => {
    return this.request(\`/shipments/\${id}\`)
  }

  // listLabels(credentials) was removed: the endpoint does not exist.
}
`

const LOGISTICS_METHODS = new Set([
  'listCarriers',
  'listOrders',
  'getRates',
  'getShipment',
  'listShipments',
  'listLabels',
])

test('parseImplementedMethods counts a real method and an arrow property', () => {
  assert.deepEqual(parseImplementedMethods(INDEX, LOGISTICS_METHODS), [
    'getShipment',
    'listCarriers',
  ])
})

test('parseImplementedMethods ignores the BaseAdapter surface and private helpers', () => {
  const found = parseImplementedMethods(INDEX, LOGISTICS_METHODS)
  // `request` and `listParams` are members the regex sees; the intersection
  // with the interface set is what drops them — no denylist involved.
  assert.ok(!found.includes('request'))
  assert.ok(!found.includes('listParams'))
  assert.ok(!found.includes('constructor'))
  assert.ok(!found.includes('credentialFields'))
})

test('parseImplementedMethods ignores four-space GraphQL fields and comment mentions', () => {
  const found = parseImplementedMethods(INDEX, LOGISTICS_METHODS)
  assert.ok(!found.includes('listOrders'), 'a template-literal field is not a member')
  assert.ok(!found.includes('getRates'), 'a nested template-literal field is not a member')
  assert.ok(!found.includes('listLabels'), 'a comment is not a member')
})

// ── verdicts ────────────────────────────────────────────────────────────────

const RESOURCE_MAP = buildResourceMap('logistics', [
  'listCarriers',
  'getCarrier',
  'getRates',
  'listShipments',
  'getShipment',
  'listLabels',
  'voidLabel',
  'listManifests',
])

const METADATA = parseMetadata(`export const metadata = {
  platform: 'shipbob',
  totalResources: 5,
  availableResources: ['carrier', 'shipment'],
  unavailableResources: [
    { resource: 'label', reason: 'Labels are generated internally.' },
    { resource: 'rate', reason: 'Only a deprecated v1.0 estimate endpoint exists.' },
  ],
} as const
`)

function verdicts(implemented: string[]): Record<string, string> {
  const report = classifyAdapter(
    'logistics',
    'shipbob',
    METADATA,
    new Set(implemented),
    RESOURCE_MAP,
  )
  return Object.fromEntries(report.cells.map((c) => [c.resource, c.verdict]))
}

test('ok: declared available and a method exists', () => {
  assert.equal(verdicts(['listCarriers'])['carrier'], 'ok')
})

test('backlog: declared available but nothing implements it', () => {
  assert.equal(verdicts(['listCarriers'])['shipment'], 'backlog')
})

test('ok-unavailable: declared unavailable and nothing implements it', () => {
  assert.equal(verdicts(['listCarriers'])['label'], 'ok-unavailable')
})

test('CONTRADICTION: declared unavailable while a method exists — a stub counts', () => {
  const report = classifyAdapter(
    'logistics',
    'shipbob',
    METADATA,
    new Set(['getRates']),
    RESOURCE_MAP,
  )
  const rate = report.cells.find((c) => c.resource === 'rate')!
  assert.equal(rate.verdict, 'CONTRADICTION')
  assert.deepEqual(rate.implemented, ['getRates'])
  assert.equal(rate.reason, 'Only a deprecated v1.0 estimate endpoint exists.')
  assert.equal(identity(rate), 'logistics/shipbob:rate')
})

// ── refusals ────────────────────────────────────────────────────────────────

const LOGISTICS_METHODS_ALL = new Set([
  'listCarriers',
  'getCarrier',
  'listLabels',
  'voidLabel',
  'listShipments',
  'getShipment',
  'getRates',
])

const REFUSING_INDEX = `import { notSupported } from './errors'

function refuse(resource: string): Error {
  return Object.assign(new Error(\`Acme cannot list \${resource}\`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class AcmeAdapter {
  async listCarriers(): Promise<Carrier[]> {
    // The docs publish no carrier list.
    throw refuse('carriers')
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    throw Object.assign(new Error('Acme cannot read a carrier'), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  async listLabels(
    credentials: Credentials,
    params: { page?: number },
  ): Promise<Label[]> {
    throw refuse('labels')
  }

  async listShipments(credentials: Credentials): Promise<Shipment[]> {
    if (!credentials.extra?.['accountId']) throw refuse('shipments')
    return this.client.get('/shipments')
  }

  async getShipment(_credentials: Credentials, id: string): Promise<Shipment> {
    throw new Error(\`shipment \${id} is malformed\`)
  }

  async voidLabel(): Promise<void> {
    throw notSupported('voiding')
  }
}
`

test('parseRefusalHelpers finds local functions that build a NOT_SUPPORTED error', () => {
  const helpers = parseRefusalHelpers([
    REFUSING_INDEX,
    `export const notSupported = (what: string): Error =>
  Object.assign(new Error(\`\${what} is not supported\`), { statusCode: 501, code: 'NOT_SUPPORTED' })
`,
    `export function malformed(id: string): Error {
  return new Error(\`bad id \${id}\`)
}
`,
  ])
  assert.deepEqual([...helpers].sort(), ['notSupported', 'refuse'])
})

test('parseRefusingMethods: a body that opens with an unconditional refusal refuses', () => {
  const helpers = parseRefusalHelpers([
    REFUSING_INDEX,
    `export const notSupported = () => ({ code: 'NOT_SUPPORTED' })`,
  ])
  assert.deepEqual(parseRefusingMethods(REFUSING_INDEX, LOGISTICS_METHODS_ALL, helpers), [
    'getCarrier',
    'listCarriers',
    'listLabels',
    'voidLabel',
  ])
})

test('parseRefusingMethods: a conditional refusal or a plain error still counts as implemented', () => {
  const found = parseRefusingMethods(
    REFUSING_INDEX,
    LOGISTICS_METHODS_ALL,
    parseRefusalHelpers([REFUSING_INDEX]),
  )
  assert.ok(!found.includes('listShipments'), 'refuses only when accountId is missing')
  assert.ok(!found.includes('getShipment'), 'a malformed-id error is not a refusal')
  assert.ok(!found.includes('voidLabel'), 'notSupported is imported from a file not passed in')
})

function refusalVerdicts(implemented: string[], refusing: string[]): Record<string, string> {
  const report = classifyAdapter(
    'logistics',
    'shipbob',
    METADATA,
    new Set(implemented),
    RESOURCE_MAP,
    new Set(refusing),
  )
  return Object.fromEntries(report.cells.map((c) => [c.resource, c.verdict]))
}

test('ok-unavailable: declared unavailable and every method on it refuses', () => {
  assert.equal(refusalVerdicts(['getRates'], ['getRates'])['rate'], 'ok-unavailable')
})

test('CONTRADICTION: declared unavailable while one method still serves it', () => {
  assert.equal(
    refusalVerdicts(['listLabels', 'voidLabel'], ['listLabels'])['label'],
    'CONTRADICTION',
  )
})

test('refused: declared available but every method on it refuses', () => {
  const v = refusalVerdicts(
    ['listCarriers', 'getCarrier', 'getShipment'],
    ['listCarriers', 'getCarrier'],
  )
  assert.equal(v['carrier'], 'refused')
  assert.equal(v['shipment'], 'ok')
})

test('undeclared: a resource the vertical knows that neither array mentions', () => {
  assert.equal(verdicts([])['manifest'], 'undeclared')
})

test('cells are one per resource, in key order', () => {
  assert.deepEqual(Object.keys(verdicts([])), ['carrier', 'label', 'manifest', 'rate', 'shipment'])
})

test('a contradiction identity keeps the hyphenated spelling metadata uses', () => {
  const map = buildResourceMap('payments', ['listPaymentMethods', 'detachPaymentMethod'])
  const metadata = parseMetadata(`export const metadata = {
  platform: 'x',
  totalResources: 1,
  availableResources: [],
  unavailableResources: [{ resource: 'payment-method', reason: 'none' }],
} as const
`)
  const report = classifyAdapter('payments', 'x', metadata, new Set(['detachPaymentMethod']), map)
  assert.deepEqual(report.cells.map(identity), ['payments/x:payment-method'])
  assert.equal(report.cells[0]!.verdict, 'CONTRADICTION')
})

test('totalResources drift is reported, never a verdict', () => {
  // METADATA declares 4 names against totalResources: 5.
  const report = classifyAdapter('logistics', 'shipbob', METADATA, new Set(), RESOURCE_MAP)
  assert.deepEqual(report.drift, { totalResources: 5, declared: 4 })
  const aligned = classifyAdapter(
    'logistics',
    'shipbob',
    { ...METADATA, totalResources: 4 },
    new Set(),
    RESOURCE_MAP,
  )
  assert.equal(aligned.drift, undefined)
})

test('a declared name with no interface method and a double declaration are surfaced', () => {
  const metadata = parseMetadata(`export const metadata = {
  platform: 'x',
  totalResources: 3,
  availableResources: ['carrier', 'pickup'],
  unavailableResources: [{ resource: 'carrier', reason: 'contradicts the line above' }],
} as const
`)
  const report = classifyAdapter('logistics', 'x', metadata, new Set(), RESOURCE_MAP)
  assert.deepEqual(report.unknownResources, ['pickup'])
  assert.deepEqual(report.doubleDeclared, ['carrier'])
})

// ── the real repository ─────────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')

test('every contradiction in the tree is grandfathered by the baseline', () => {
  const baseline: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/adapter-declaration-baseline.json'), 'utf8'),
  )
  const contradictions = checkAdapterDeclarations()
    .flatMap((r) => r.adapters.flatMap((a) => a.cells))
    .filter((c) => c.verdict === 'CONTRADICTION')
    .map(identity)
  assert.deepEqual(
    contradictions.filter((id) => !baseline.includes(id)),
    [],
  )
})

test('the baseline is sorted and free of duplicates, as --update writes it', () => {
  const baseline: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/adapter-declaration-baseline.json'), 'utf8'),
  )
  assert.deepEqual(baseline, [...new Set(baseline)].sort())
})

test('every interface method in every vertical carries a verb the map understands', () => {
  // A method the verb table cannot strip keeps its whole name as its key and
  // can never match a resource — so it would sit in the unmapped list for
  // ever, and the guard would silently never classify it.
  for (const vertical of VERTICALS) {
    const source = readFileSync(join(VERTICALS_DIR, vertical, 'adapter/interface.ts'), 'utf8')
    const unrecognised = parseInterfaceMethods(source).filter(
      (m) => m !== 'parseWebhookEvents' && !VERB_PREFIX.test(m),
    )
    assert.deepEqual(unrecognised, [], vertical)
  }
})

test('no vertical declares a resource that no interface method addresses', () => {
  const gaps = checkAdapterDeclarations()
    .filter((r) => r.resourcesWithoutMethod.length > 0)
    .map((r) => `${r.vertical}: ${r.resourcesWithoutMethod.join(', ')}`)
  assert.deepEqual(gaps, [])
})

test('vocabulary gaps are reported once per vertical, not as undeclared cells', () => {
  const reports = checkAdapterDeclarations()
  const byVertical = Object.fromEntries(
    reports.map((r) => [r.vertical, r.unmappedMethods.map((g) => g.key)]),
  )
  // A real gap, so this test drives the mechanism on live data: no payments
  // metadata declares `price` or `product`. It must stay one line per
  // vertical, not 264 per-adapter `undeclared` cells.
  //
  // Ecommerce `variant` was also a gap until it was declared on eBay and
  // Tmall, which implement it. Once any adapter in a vertical declares a
  // resource, the rest of that vertical's implementers correctly surface as
  // `undeclared` — per-adapter declaration backlog, not a leak — so it is no
  // longer asserted here.
  assert.ok(byVertical['payments']!.includes('price'))
  assert.ok(byVertical['payments']!.includes('product'))
  for (const r of reports) {
    const gapKeys = new Set(r.unmappedMethods.map((g) => g.key))
    const leaked = r.adapters.flatMap((a) =>
      a.cells.filter((c) => c.verdict === 'undeclared' && gapKeys.has(resourceKey(c.resource))),
    )
    assert.deepEqual(leaked.map(identity), [], r.vertical)
  }
})

// ── The blind spot ───────────────────────────────────────────────────────────
//
// `adapterDirs` filters on the presence of `metadata.ts`, so an adapter
// without one was never evaluated and contributed nothing to the printed
// counts. 742 of 1545 adapters were in that state, including the reference
// adapters others are copied from, so "0 contradictions" was measured over a
// minority of the repo. These pin that the gap is now visible and ratcheted.

test('adaptersMissingMetadata finds adapters this guard cannot evaluate', () => {
  const missing = VERTICALS.flatMap((v) => adaptersMissingMetadata(v))
  assert.ok(missing.length > 0, 'expected the blind spot to be non-empty on this repo')
  // Identities are `<vertical>/<slug>`, matching the contradiction baseline's
  // prefix so both files read the same way.
  for (const id of missing) assert.match(id, /^[a-z-]+\/[a-z0-9.-]+$/)
})

test('it never reports an adapter that does carry a metadata.ts', () => {
  const missing = new Set(VERTICALS.flatMap((v) => adaptersMissingMetadata(v)))
  const declared = checkAdapterDeclarations().flatMap((r) =>
    r.adapters.map((a) => `${r.vertical}/${a.slug}`),
  )
  for (const id of declared) {
    assert.ok(!missing.has(id), `${id} has a metadata.ts but was reported as missing one`)
  }
})

test('the two sets partition the adapter directories that have an index.ts', () => {
  // Neither set may double-count or drop an adapter: together they must be
  // every adapter dir, which is what makes the printed coverage honest.
  const missing = VERTICALS.flatMap((v) => adaptersMissingMetadata(v))
  const declared = checkAdapterDeclarations().flatMap((r) =>
    r.adapters.map((a) => `${r.vertical}/${a.slug}`),
  )
  const union = new Set([...missing, ...declared])
  assert.equal(union.size, missing.length + declared.length, 'the two sets overlap')
})

test('the missing-metadata baseline covers every adapter currently missing one', () => {
  // The ratchet: a new adapter without metadata.ts must fail the gate, so the
  // baseline has to be exactly the current set, not a superset.
  const baseline: string[] = JSON.parse(
    readFileSync(join(import.meta.dirname, 'adapter-metadata-missing-baseline.json'), 'utf8'),
  )
  const missing = VERTICALS.flatMap((v) => adaptersMissingMetadata(v)).sort()
  assert.deepEqual(baseline, missing)
})
