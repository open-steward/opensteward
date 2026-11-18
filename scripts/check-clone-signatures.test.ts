/**
 * Tests for the clone-signature guard.
 *
 * Pins the guard at each layer: the signature regexes against inline
 * source-string fixtures for both the Asana/Zendesk/Cin7-Core clones and
 * the four confirmed false positives (`taiga`, `kantata`, `affirm`,
 * `fiserv`/`unzer`) that a naive substring match would have wrongly
 * flagged, the reference-adapter exclusion, the payments sweep's
 * report-only status, and a real-repository assertion that every current
 * offender is grandfathered by the baseline.
 *
 * Run: `pnpm exec tsx --test scripts/check-clone-signatures.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLONE_RULES,
  SCAN_FILES,
  checkCloneSignatures,
  classifyAdapterSource,
  identity,
  matchSignatures,
  scanRule,
  type CloneRule,
} from './check-clone-signatures.ts'

// ── rule shape ───────────────────────────────────────────────────────────

test('every enforced rule has exactly the vertical, reference and vendor the audit specifies', () => {
  const enforced = Object.fromEntries(
    CLONE_RULES.filter((r) => !r.reportOnly).map((r) => [r.vertical, r]),
  )
  assert.equal(enforced['projects']!.reference, 'asana')
  assert.equal(enforced['customer-support']!.reference, 'zendesk')
  assert.equal(enforced['inventory']!.reference, 'cin7-core')
  assert.deepEqual(
    enforced['projects']!.signatures.map((s) => s.label),
    ['/tasks/{id}/stories', '/stories/{id}'],
  )
  assert.deepEqual(
    enforced['customer-support']!.signatures.map((s) => s.label),
    ['/tickets.json', '/users.json'],
  )
  assert.deepEqual(
    enforced['inventory']!.signatures.map((s) => s.label),
    ['/productList', '/ref/stockonhand'],
  )
})

test('the payments/Stripe rule is report-only and carries the /charges sweep', () => {
  const payments = CLONE_RULES.find((r) => r.vertical === 'payments')!
  assert.equal(payments.reference, 'stripe')
  assert.equal(payments.reportOnly, true)
  assert.deepEqual(
    payments.signatures.map((s) => s.label),
    ['/charges'],
  )
})

test('no signature pattern carries the global flag (a stateful lastIndex would break repeated .test() calls)', () => {
  for (const rule of CLONE_RULES) {
    for (const sig of rule.signatures) assert.equal(sig.pattern.global, false, sig.label)
  }
})

// ── projects / Asana ────────────────────────────────────────────────────

const PROJECTS_RULE = CLONE_RULES.find((r) => r.vertical === 'projects')!

const ASANA_CLONE_SOURCE = `
  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<ListResponse<RawClickUpStory>>(
      \`/tasks/\${taskId}/stories\`,
      { ...this.listParams(params), opt_fields: 'gid,text' },
    )
    return (res.data ?? []).map((s) => transformComment(s, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawClickUpStory>>(\`/stories/\${id}\`)
    if (!res.data) throw new Error(\`ClickUp story \${id} not found\`)
    return transformComment(res.data)
  }
`

test('an Asana-cloned index.ts matches both projects signatures', () => {
  assert.deepEqual(matchSignatures(ASANA_CLONE_SOURCE, PROJECTS_RULE.signatures), [
    '/tasks/{id}/stories',
    '/stories/{id}',
  ])
  const offender = classifyAdapterSource(PROJECTS_RULE, 'clickup', ASANA_CLONE_SOURCE)
  assert.deepEqual(offender, {
    vertical: 'projects',
    slug: 'clickup',
    vendor: 'Asana',
    matches: ['/tasks/{id}/stories', '/stories/{id}'],
  })
})

// False positive #1: Pivotal Tracker and Shortcut are real "user story"
// tools, but the audit found their index.ts carries Asana's exact
// nesting anyway — a true offender, confirmed against pivotal-tracker's
// real API (stories nest under /projects/{id}, never /tasks/{id}).
test('a real "story" tool that still nests under /tasks/{id} is a true offender, not a false positive', () => {
  const pivotalTrackerSource = 'get(`/tasks/${taskId}/stories`, params)'
  assert.deepEqual(matchSignatures(pivotalTrackerSource, PROJECTS_RULE.signatures), [
    '/tasks/{id}/stories',
  ])
})

// False positive #2: Taiga's real endpoint is /userstories — one word,
// never nested under /tasks/{id}, and not /stories/{id} either.
test("Taiga's real /userstories endpoint matches neither projects signature", () => {
  const taigaSource = "client.getPage<RawTaigaTask>('/userstories', page, pageSize, projectParam)"
  assert.deepEqual(matchSignatures(taigaSource, PROJECTS_RULE.signatures), [])
})

// False positive #3 (the one this guard's first cut actually got wrong):
// Kantata's real endpoint is /stories/${id}.json — it contains the
// /stories/${id} substring, but with a .json suffix before the closing
// backtick. The signature must require the closing quote/backtick to
// follow immediately, or this real, unrelated endpoint false-positives.
test("Kantata's real .json-suffixed /stories/{id} endpoint does not match /stories/{id}", () => {
  const kantataSource = "this.client(credentials).get(`/stories/${id}.json`, { fields: 'title' })"
  assert.deepEqual(matchSignatures(kantataSource, PROJECTS_RULE.signatures), [])
})

test("Kantata's list endpoint (/stories.json, no interpolation) does not match /tasks/{id}/stories either", () => {
  const kantataListSource = "this.client(credentials).get('/stories.json', { per_page: 100 })"
  assert.deepEqual(matchSignatures(kantataListSource, PROJECTS_RULE.signatures), [])
})

// ── customer-support / Zendesk ──────────────────────────────────────────

const SUPPORT_RULE = CLONE_RULES.find((r) => r.vertical === 'customer-support')!

const ZENDESK_CLONE_SOURCE = `
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsResponse>('/tickets.json', this.listParams(params))
    return (res.tickets ?? []).map(transformTicket)
  }
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users.json', this.listParams(params))
    return (res.users ?? []).map(transformUser)
  }
`

test('a Zendesk-cloned index.ts matches both customer-support signatures', () => {
  assert.deepEqual(matchSignatures(ZENDESK_CLONE_SOURCE, SUPPORT_RULE.signatures), [
    '/tickets.json',
    '/users.json',
  ])
})

test('an asymmetric clone (only one literal endpoint kept) still flags on the one it has', () => {
  const onlyUsers = "this.client(credentials).get<UsersResponse>('/users.json', params)"
  assert.deepEqual(matchSignatures(onlyUsers, SUPPORT_RULE.signatures), ['/users.json'])
})

test('/tickets/${id}.json (get-by-id, not the literal list path) does not match /tickets.json', () => {
  // Confirms the signature is the exact literal string, not a substring —
  // a per-id path that merely ends in .json is not what the signature names.
  const source = 'this.client(credentials).get(`/tickets/${id}.json`)'
  assert.deepEqual(matchSignatures(source, SUPPORT_RULE.signatures), [])
})

// ── inventory / Cin7 Core ───────────────────────────────────────────────

const INVENTORY_RULE = CLONE_RULES.find((r) => r.vertical === 'inventory')!

const CIN7_CLONE_SOURCE = `
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListResponse<RawProduct>>('/productList', this.listParams(params))
    return (res.data ?? []).map(transformProduct)
  }
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListResponse<RawStockLevel>>('/ref/stockonhand', this.listParams(params))
    return (res.data ?? []).map(transformStockLevel)
  }
`

test('a Cin7-Core-cloned index.ts matches both inventory signatures', () => {
  assert.deepEqual(matchSignatures(CIN7_CLONE_SOURCE, INVENTORY_RULE.signatures), [
    '/productList',
    '/ref/stockonhand',
  ])
})

test('a real inventory endpoint that merely contains "product" does not match /productList', () => {
  const source = "this.client(credentials).get('/products', this.listParams(params))"
  assert.deepEqual(matchSignatures(source, INVENTORY_RULE.signatures), [])
})

// ── payments / Stripe sweep ─────────────────────────────────────────────

const PAYMENTS_RULE = CLONE_RULES.find((r) => r.vertical === 'payments')!

test("Stripe's own root-level /charges shape matches the sweep signature", () => {
  assert.deepEqual(
    matchSignatures(
      "this.listPage<RawCharge>(credentials, '/charges', params)",
      PAYMENTS_RULE.signatures,
    ),
    ['/charges'],
  )
  assert.deepEqual(
    matchSignatures('this.client(credentials).get(`/charges/${id}`)', PAYMENTS_RULE.signatures),
    ['/charges'],
  )
})

// False positive #4: Affirm and Fiserv both have a real, documented charge
// endpoint that happens to end in /charges, but nested under their own
// longer real path — not Stripe's literal root-level shape. The issue
// itself names Affirm as a platform that "legitimately exposes /charges".
test("Affirm's real /api/v1/charges/{id} endpoint does not match the anchored /charges sweep", () => {
  const affirmSource = 'this.client(credentials).get<RawAffirmCharge>(`/api/v1/charges/${id}`)'
  assert.deepEqual(matchSignatures(affirmSource, PAYMENTS_RULE.signatures), [])
})

test("Fiserv's and Unzer's real, prefixed /…/charges paths do not match either", () => {
  assert.deepEqual(
    matchSignatures("export const CHARGES_PATH = '/payments/v1/charges'", PAYMENTS_RULE.signatures),
    [],
  )
  assert.deepEqual(
    matchSignatures("export const CHARGES_PATH = '/payments/charges'", PAYMENTS_RULE.signatures),
    [],
  )
})

// ── the real repository ─────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dirname, '..')

/** Concatenated real SCAN_FILES source for one adapter in this checkout — for pinning a specific real adapter's classification, not an inline fixture. */
function readAdapterFixture(vertical: string, slug: string): string {
  const dir = join(REPO_ROOT, 'apps/integration-server/src/verticals', vertical, 'adapters', slug)
  return SCAN_FILES.map((file) => {
    const path = join(dir, file)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }).join('\n')
}

test('every enforced-rule offender in the tree is grandfathered by the baseline', () => {
  const baseline: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/clone-signature-baseline.json'), 'utf8'),
  )
  const offenderIds = checkCloneSignatures()
    .filter(({ rule }) => !rule.reportOnly)
    .flatMap(({ offenders }) => offenders)
    .map(identity)
  assert.deepEqual(
    offenderIds.filter((id) => !baseline.includes(id)),
    [],
  )
})

test('the baseline is sorted and free of duplicates, as --update writes it', () => {
  const baseline: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/clone-signature-baseline.json'), 'utf8'),
  )
  assert.deepEqual(baseline, [...new Set(baseline)].sort())
})

// The counts here (39/25/24) land one below the issue's "roughly 40/26/24"
// because two real, independently-implemented adapters legitimately carry
// a raw substring of a signature and the anchoring correctly drops them —
// sampled while investigating that gap, not allowlisted:
//
//   - projects/tapd: TAPD is a real story-tracking tool (Tencent) whose
//     actual endpoint is the bare `/stories` — no `${id}` interpolation, no
//     `/tasks/` nesting. It contains the word "stories" (a naive
//     bare-substring match would flag it) but neither anchored signature.
//   - customer-support/teamsupport: TeamSupport's own real, documented API
//     lives at `/api/json/tickets.json` / `/api/json/users.json` — genuine
//     endpoints that happen to *end* with Zendesk's literal path. Its own
//     auth (Basic, OrganizationID+APIToken), envelope (`{ Tickets: [...] }`,
//     capitalised, not Zendesk's lowercase), and pagination scheme
//     (pageNumber/pageSize) are all independent of Zendesk. The signature's
//     leading-quote anchor requires the literal to be the *whole* path, so
//     the `/api/json/` prefix correctly keeps it out.
test('projects/tapd (real bare /stories, no interpolation) is not flagged', () => {
  const source = readAdapterFixture('projects', 'tapd')
  assert.deepEqual(matchSignatures(source, PROJECTS_RULE.signatures), [])
})

test('customer-support/teamsupport (real /api/json/-prefixed endpoints) is not flagged', () => {
  const source = readAdapterFixture('customer-support', 'teamsupport')
  assert.deepEqual(matchSignatures(source, SUPPORT_RULE.signatures), [])
})

test("reference adapters never appear as their own rule's offender, even though their source is the signature's origin", () => {
  for (const { rule, offenders } of checkCloneSignatures()) {
    assert.ok(
      !offenders.some((o) => o.slug === rule.reference),
      `${rule.vertical}/${rule.reference} (the reference adapter) must be excluded from its own rule`,
    )
  }
})

test('the payments sweep never contributes to any offender list, report-only or not', () => {
  const results = checkCloneSignatures()
  const payments = results.find(({ rule }) => rule.vertical === 'payments')!
  assert.equal(payments.rule.reportOnly, true)
  // Sanity: the sweep still finds real matches (it's just excluded above by
  // filtering on reportOnly, not because the rule itself returns nothing).
  assert.ok(payments.offenders.length > 0)
})

test('scanRule sorts offenders by "<vertical>/<slug>" and excludes the reference adapter by slug', () => {
  const offenders = scanRule(PROJECTS_RULE)
  assert.ok(!offenders.some((o) => o.slug === 'asana'))
  const ids = offenders.map(identity)
  assert.deepEqual(ids, [...ids].sort())
})

test('identity joins vertical and slug with a single slash', () => {
  assert.equal(identity({ vertical: 'projects', slug: 'clickup' }), 'projects/clickup')
})

// ── defensive: an unknown vertical (e.g. a future rule with a typo) ────

test('a rule pointed at a vertical with no adapters/ directory yields no offenders, not a crash', () => {
  const bogusRule: CloneRule = {
    vertical: 'no-such-vertical',
    reference: 'reference',
    vendor: 'Nobody',
    signatures: [{ label: '/x', pattern: /\/x/ }],
  }
  assert.deepEqual(scanRule(bogusRule), [])
})
