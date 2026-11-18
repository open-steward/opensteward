/**
 * DocuSign list paging: 1-based `page` + caller's `limit` → what DocuSign's
 * eSignature v2.1 API actually pages by.
 *
 * Source: DocuSign's official OpenAPI spec,
 * https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json
 *
 * Offset lists (`count` + zero-based `start_position`):
 *   GET /envelopes (Envelopes_GetEnvelopes / listStatusChanges)
 *     count:          "The maximum value is 1000. To get the next or previous set
 *                      of envelopes, use `nextUri` or `previousUri` from the response."
 *     start_position: "The zero-based index of the result from which to start
 *                      returning results."
 *     nextUri:        "It is `null` if this is the last set of results for the search."
 *     from_date:      "This parameter is required unless `envelopeIds` or
 *                      `transactionIds` are set."
 *     order_by/order: documented values include `created` and `asc`; no default.
 *   GET /templates (Templates_GetTemplates)
 *     count:          "Use `start_position` to specify the number of results to skip."
 *                     No maximum is documented; omitted, it defaults to 2,000.
 *     from_date:      "Only returns templates created on or after this date/time."
 *     modified_from_date: "Lists templates modified on or after this date."
 *
 * Whole-collection lists (no paging parameter at all), sliced locally:
 *   GET /envelopes/{id}/recipients    "Retrieves the status of all recipients in
 *                                      a single envelope ..."
 *   GET /envelopes/{id}/documents     "Retrieves a list of documents associated
 *                                      with the specified envelope."
 *   GET /envelopes/{id}/audit_events  "Gets the envelope audit events for the
 *                                      specified envelope."
 *
 * The fake below honours ONLY those documented parameters, at the seam the
 * adapter's client uses (`axios.create(...).get(path, { params })`). Any other
 * key the adapter sends (`page`, `limit`, `offset`, ...) is ignored, exactly as
 * DocuSign would ignore it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { DocuSignAdapter } from '../../../../../src/verticals/docsign/adapters/docusign/index'
import { DocuSignClient } from '../../../../../src/verticals/docsign/adapters/docusign/client'

const CREDS = {
  accessToken: 'ds_test',
  extra: { accountId: 'acc_1', baseUri: 'https://na3.docusign.net' },
}
const ENV = 'env_1'
/** listStatusChanges `count`: "The maximum value is 1000." */
const ENVELOPES_MAX = 1000
/** listTemplates without `count`: "a default limit of 2,000 templates". */
const TEMPLATES_DEFAULT = 2000
/**
 * No case here needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of spinning: each fake call
 * resolves as a microtask, so vitest's timeout never fires on a runaway loop.
 */
const CALL_BUDGET = 20

interface Req {
  path: string
  params: Record<string, unknown>
}

type Counts = {
  envelopes?: number
  templates?: number
  recipients?: number
  documents?: number
  auditEvents?: number
}

/** A non-negative integer from a query value, or a thrown 400 like DocuSign's. */
function intParam(name: string, raw: unknown, fallback: number, min: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`400 INVALID_REQUEST_PARAMETER: ${name}=${String(raw)}`)
  }
  return n
}

/**
 * How the fake shapes an offset set's end signals. The spec's own words are
 * the defaults (`nextUri` null on the last set, a string `totalSetSize` that
 * counts the whole result); the others are what a live response could do
 * instead, so the adapter's reading of each is pinned.
 */
interface FakeOptions {
  /**
   * `nextUri` on the last set: `null`, `omitted` (no key) or `empty` (""), with
   * a URI on every earlier set. `never` leaves it off every set; `always` puts
   * one on every set, the last and any empty one included, against the spec.
   */
  nextUri?: 'null' | 'omitted' | 'empty' | 'never' | 'always'
  /**
   * `totalSetSize`: the whole result as a `string` (the spec's type) or as a
   * JSON number (`numeric`), `omitted`, `garbage` (not a count), only this
   * `set`'s size, or a fixed number sent as a string however many rows the
   * result holds.
   */
  total?: 'string' | 'numeric' | 'omitted' | 'garbage' | 'set' | number
  /** After the Nth /envelopes request, this envelope changes status (now). */
  touch?: { afterCall: number; envelopeId: string }
  /** `lastModified` overrides for templates, by templateId. */
  templateModified?: Record<string, string>
  /**
   * Serve at most this many rows a set, whatever `count` asks: a set cut short
   * in the middle of a read. Undocumented, so not the default; `nextUri` and
   * `totalSetSize` still describe the whole result.
   */
  setCap?: number
  /** Serve this many rows past `count` a set, against the spec. */
  overServe?: number
}

/** One set of an offset list, shaped like envelopesInformation / envelopeTemplateResults. */
function offsetSet<T>(
  all: T[],
  params: Record<string, unknown>,
  path: string,
  maxCount: number | undefined,
  defaultCount: number,
  opts: FakeOptions,
) {
  const asked = intParam('count', params['count'], defaultCount, 1)
  const size = Math.min(
    asked + (opts.overServe ?? 0),
    maxCount ?? Infinity,
    opts.setCap ?? Infinity,
  )
  const start = intParam('start_position', params['start_position'], 0, 0)
  const slice = all.slice(start, start + size)
  const end = start + slice.length
  const set: Record<string, unknown> = {
    resultSetSize: String(slice.length),
    startPosition: String(start),
    endPosition: String(Math.max(end - 1, start)),
    previousUri: start > 0 ? `${path}?start_position=${Math.max(start - size, 0)}` : null,
  }
  const nextUri = opts.nextUri ?? 'null'
  if (end < all.length || nextUri === 'always') {
    if (nextUri !== 'never') set.nextUri = `${path}?start_position=${end}&count=${size}`
  } else if (nextUri === 'null') set.nextUri = null
  else if (nextUri === 'empty') set.nextUri = ''
  const total = opts.total ?? 'string'
  if (total === 'string') set.totalSetSize = String(all.length)
  else if (total === 'numeric') set.totalSetSize = all.length
  else if (total === 'garbage') set.totalSetSize = 'n/a'
  else if (total === 'set') set.totalSetSize = String(slice.length)
  else if (typeof total === 'number') set.totalSetSize = String(total)
  return { items: slice, set }
}

/** Midnight UTC, `n` days after 2012-01-01: older than DocuSign's two-year default window. */
const day = (n: number) => new Date(Date.UTC(2012, 0, 1 + n)).toISOString()
/** When envelope e<i> last changed status (i is 1-based). */
const envelopeChanged = (i: number) => day(400 + i)

function fakeDocuSign(counts: Counts, opts: FakeOptions = {}) {
  const envelopes = Array.from({ length: counts.envelopes ?? 0 }, (_, i) => ({
    envelopeId: `e${i + 1}`,
    status: 'sent',
    createdDateTime: day(i + 1),
    lastModifiedDateTime: envelopeChanged(i + 1),
    statusChangedDateTime: envelopeChanged(i + 1),
  }))
  const templates = Array.from({ length: counts.templates ?? 0 }, (_, i) => ({
    templateId: `t${i + 1}`,
    name: `Template ${i + 1}`,
    created: day(i + 1),
    lastModified: opts.templateModified?.[`t${i + 1}`] ?? day(i + 2),
  }))
  // Split across two recipient types so a page boundary crosses the flattening.
  const nRecipients = counts.recipients ?? 0
  const nSigners = Math.ceil(nRecipients / 2)
  const recipient = (i: number) => ({ recipientId: `r${i + 1}`, routingOrder: '1' })
  const recipients = {
    signers: Array.from({ length: nSigners }, (_, i) => recipient(i)),
    carbonCopies: Array.from({ length: nRecipients - nSigners }, (_, i) => recipient(nSigners + i)),
    recipientCount: String(nRecipients),
    currentRoutingOrder: '1',
  }
  const documents = Array.from({ length: counts.documents ?? 0 }, (_, i) => ({
    documentId: `d${i + 1}`,
    name: `doc${i + 1}.pdf`,
    type: 'pdf',
    order: String(i + 1),
  }))
  const auditEvents = Array.from({ length: counts.auditEvents ?? 0 }, (_, i) => ({
    eventFields: [
      { name: 'logTime', value: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString() },
      { name: 'action', value: 'Sent' },
      { name: 'eventId', value: `ev${i + 1}` },
    ],
  }))

  const requests: Req[] = []
  let calls = 0
  let envelopeCalls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    const params = { ...(cfg?.params ?? {}) }
    requests.push({ path, params })
    if (path === '/envelopes') {
      // "Your request must include one or more of the following parameters:
      // from_date, envelope_ids, transaction_ids"; from_date: "Specifies the
      // date and time to start looking for status changes."
      const from = params['from_date']
      if (from === undefined && !params['envelope_ids'] && !params['transaction_ids']) {
        throw new Error('400 INVALID_REQUEST_PARAMETER: from_date, envelope_ids or transaction_ids')
      }
      const since = from === undefined ? -Infinity : Date.parse(String(from))
      if (Number.isNaN(since))
        throw new Error(`400 INVALID_REQUEST_PARAMETER: from_date=${String(from)}`)
      // The spec names no default order for this list. With none sent, the fake
      // sorts most recently changed first: an order a change made between two
      // requests reshuffles, so a test sees what leaving it unpinned costs.
      const key = params['order_by'] === 'created' ? 'createdDateTime' : 'lastModifiedDateTime'
      const dir = params['order'] === 'asc' ? 1 : -1
      const matching = envelopes
        .filter((e) => Date.parse(e.statusChangedDateTime) >= since)
        .sort((a, b) => dir * a[key].localeCompare(b[key]))
      const { items, set } = offsetSet(matching, params, path, ENVELOPES_MAX, ENVELOPES_MAX, opts)
      const data = { envelopes: items.map((e) => ({ ...e })), ...set }
      if (opts.touch && ++envelopeCalls === opts.touch.afterCall) {
        const changed = envelopes.find((e) => e.envelopeId === opts.touch?.envelopeId)
        if (!changed) throw new Error(`no envelope ${opts.touch.envelopeId} to touch`)
        changed.lastModifiedDateTime = changed.statusChangedDateTime = '2026-09-01T00:00:00.000Z'
      }
      return { data }
    }
    if (path === '/templates') {
      // from_date: "Only returns templates created on or after this
      // date/time."; modified_from_date: "Lists templates modified on or after
      // this date."
      const created =
        params['from_date'] === undefined ? -Infinity : Date.parse(String(params['from_date']))
      const modified =
        params['modified_from_date'] === undefined
          ? -Infinity
          : Date.parse(String(params['modified_from_date']))
      const matching = templates.filter(
        (t) => Date.parse(t.created) >= created && Date.parse(t.lastModified) >= modified,
      )
      const { items, set } = offsetSet(matching, params, path, undefined, TEMPLATES_DEFAULT, opts)
      return { data: { envelopeTemplates: items, ...set } }
    }
    if (path === `/envelopes/${ENV}/recipients`) return { data: recipients }
    if (path === `/envelopes/${ENV}/documents`) {
      return { data: { envelopeId: ENV, envelopeDocuments: documents } }
    }
    if (path === `/envelopes/${ENV}/audit_events`) return { data: { auditEvents } }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { requests }
}

const adapter = () =>
  new DocuSignAdapter({ clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://cb' })

/** A query value as it reaches the wire: axios serialises every param to text. */
const q = (req: Req | undefined, key: string): string | undefined =>
  req?.params[key] === undefined ? undefined : String(req.params[key])

/** Drive a method the way the sync worker does: withPageSink({ page, limit }). */
async function drive(
  call: (a: DocuSignAdapter, p: QueryParams) => Promise<Array<{ id: string }>>,
  limit: number,
  pages: number,
) {
  const a = adapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const reports: Array<ReturnType<typeof readUpstreamPage>> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    ids.push(...(await call(a, params)).map((r) => r.id))
    const report = readUpstreamPage(params)
    reports.push(report)
    hasMore.push(report?.hasMore)
  }
  return { ids, hasMore, reports }
}

afterEach(() => vi.restoreAllMocks())

describe('docusign capabilities', () => {
  it('declares the documented envelope maximum (1000) as its page ceiling', () => {
    expect(adapter().capabilities).toEqual(expect.objectContaining({ maxPageSize: 1000 }))
  })
})

// ── offset lists: count + start_position ──────────────────────────────────

const OFFSET_METHODS = [
  {
    name: 'listEnvelopes',
    path: '/envelopes',
    counts: (n: number): Counts => ({ envelopes: n }),
    id: (i: number) => `e${i}`,
    call: (a: DocuSignAdapter, p: QueryParams) => a.listEnvelopes(CREDS, p),
  },
  {
    name: 'listTemplates',
    path: '/templates',
    counts: (n: number): Counts => ({ templates: n }),
    id: (i: number) => `t${i}`,
    call: (a: DocuSignAdapter, p: QueryParams) => a.listTemplates(CREDS, p),
  },
] as const

const range = (from: number, to: number, id: (i: number) => string) =>
  Array.from({ length: to - from + 1 }, (_, i) => id(from + i))

describe.each(OFFSET_METHODS)('docusign $name offset paging', ({ path, counts, id, call }) => {
  const L = 5

  it('serves all 2L + 1 rows once across pages 1-3, reporting hasMore [true, true, false]', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1))
    const { ids, hasMore, reports } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([11, 11, 11])
    expect(requests.map((r) => r.path)).toEqual([path, path, path])
  })

  it('page 2 asks for count=L at start_position=L (zero-based)', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1))
    await drive(call, L, 3)
    expect(requests.map((r) => [q(r, 'count'), q(r, 'start_position')])).toEqual([
      ['5', '0'],
      ['5', '5'],
      ['5', '10'],
    ])
  })

  it('an exact multiple (2L rows) ends on page 2 from nextUri, with no page-3 guess', async () => {
    fakeDocuSign(counts(2 * L))
    const { ids, hasMore } = await drive(call, L, 2)
    expect(ids).toEqual(range(1, 2 * L, id))
    expect(hasMore).toEqual([true, false])
  })

  it('page wins over a stray raw `cursor`', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1))
    const params = withPageSink({ page: 2, limit: L, cursor: '0' })
    const rows = await call(adapter(), params)
    expect(rows.map((r) => r.id)).toEqual(range(L + 1, 2 * L, id))
    expect(q(requests[0], 'start_position')).toBe('5')
  })

  it('limit as delivered by parseListQuery (capped at 500) serves every row', async () => {
    const { requests } = fakeDocuSign(counts(2 * 500 + 1))
    const a = adapter()
    const ids: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '5000' }, a)
      expect(params.limit).toBe(500)
      const rows: Array<{ id: string }> = await call(a, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, a.platform).meta.hasMore)
    }
    expect(ids).toEqual(range(1, 1001, id))
    expect(hasMore).toEqual([true, true, false])
    expect(requests.map((r) => q(r, 'count'))).toEqual(['500', '500', '500'])
    expect(requests.map((r) => q(r, 'start_position'))).toEqual(['0', '500', '1000'])
  })

  it('API path: parseListQuery + listPage reports meta.hasMore and the total', async () => {
    fakeDocuSign(counts(2 * L + 1))
    const a = adapter()
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: String(L) }, a)
      const rows: Array<{ id: string }> = await call(a, params)
      const env = listPage(rows, params, a.platform)
      metas.push({ n: env.data.length, hasMore: env.meta.hasMore, total: env.meta.totalCount })
    }
    expect(metas).toEqual([
      { n: 5, hasMore: true, total: 11 },
      { n: 5, hasMore: true, total: 11 },
      { n: 1, hasMore: false, total: 11 },
    ])
  })
})

describe('docusign listEnvelopes above the documented count maximum', () => {
  it('clamps count to 1000, strides by 1000, reports pageSize, and serves every row', async () => {
    const { requests } = fakeDocuSign({ envelopes: 2 * ENVELOPES_MAX + 1 })
    const { ids, hasMore, reports } = await drive((a, p) => a.listEnvelopes(CREDS, p), 2500, 3)
    expect(ids).toEqual(range(1, 2001, (i) => `e${i}`))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.pageSize)).toEqual([1000, 1000, 1000])
    expect(requests.map((r) => [q(r, 'count'), q(r, 'start_position')])).toEqual([
      ['1000', '0'],
      ['1000', '1000'],
      ['1000', '2000'],
    ])
  })

  it('reports no pageSize when the limit is within the maximum', async () => {
    fakeDocuSign({ envelopes: 3 })
    const params = withPageSink({ page: 1, limit: 1000 })
    await adapter().listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('docusign listTemplates has no documented count maximum', () => {
  it('forwards a limit above 1000 unclamped and still serves every row', async () => {
    const { requests } = fakeDocuSign({ templates: 2 * 2500 + 1 })
    const { ids, hasMore, reports } = await drive((a, p) => a.listTemplates(CREDS, p), 2500, 3)
    expect(ids).toEqual(range(1, 5001, (i) => `t${i}`))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.pageSize)).toEqual([undefined, undefined, undefined])
    expect(requests.map((r) => q(r, 'start_position'))).toEqual(['0', '2500', '5000'])
  })
})

// ── end signals the spec does not spell out ──────────────────────────────
// The sync worker stops on the reported hasMore alone; the router ranks the
// reported totalCount above it. Each case below pins both readings.

/** The API path for pages 1..`pages` at limit 5: rows, meta.hasMore and meta.totalCount. */
async function apiPages(
  call: (a: DocuSignAdapter, p: QueryParams) => Promise<Array<{ id: string }>>,
  pages = 3,
) {
  const a = adapter()
  const metas = []
  for (let page = 1; page <= pages; page++) {
    const params = parseListQuery({ page: String(page), limit: '5' }, a)
    const rows = await call(a, params)
    const env = listPage(rows, params, a.platform)
    metas.push({ n: env.data.length, hasMore: env.meta.hasMore, total: env.meta.totalCount })
  }
  return metas
}

describe.each(OFFSET_METHODS)('docusign $name end signals', ({ counts, id, call }) => {
  const L = 5

  it.each(['null', 'omitted', 'empty'] as const)(
    'a last set whose nextUri is %s ends the read at 2L + 1 rows',
    async (nextUri) => {
      fakeDocuSign(counts(2 * L + 1), { nextUri })
      const { ids, hasMore } = await drive(call, L, 3)
      expect(ids).toEqual(range(1, 2 * L + 1, id))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it.each(['null', 'omitted', 'empty'] as const)(
    'a last set whose nextUri is %s ends the read at 2L rows',
    async (nextUri) => {
      fakeDocuSign(counts(2 * L), { nextUri })
      const { ids, hasMore } = await drive(call, L, 2)
      expect(ids).toEqual(range(1, 2 * L, id))
      expect(hasMore).toEqual([true, false])
    },
  )

  it('sets that never carry nextUri still page to the end on totalSetSize', async () => {
    fakeDocuSign(counts(2 * L + 1), { nextUri: 'never' })
    const { ids, hasMore, reports } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([11, 11, 11])
    expect(await apiPages(call)).toEqual([
      { n: 5, hasMore: true, total: 11 },
      { n: 5, hasMore: true, total: 11 },
      { n: 1, hasMore: false, total: 11 },
    ])
  })

  it('a totalSetSize of only the set is not reported as the total, and nextUri decides', async () => {
    fakeDocuSign(counts(2 * L + 1), { total: 'set' })
    const { ids, hasMore, reports } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([undefined, undefined, undefined])
    expect(await apiPages(call)).toEqual([
      { n: 5, hasMore: true, total: null },
      { n: 5, hasMore: true, total: null },
      { n: 1, hasMore: false, total: null },
    ])
    // Page 1 must not be cached as the whole collection.
    const params = parseListQuery({ limit: String(L) }, adapter())
    expect(collectionIsComplete(params, await call(adapter(), params))).toBe(false)
  })

  it('a totalSetSize just above the rows keeps both readings in step, then ends on the empty set', async () => {
    // 11 rows, total 13. Page 3 serves the 11th: the total says more, and a
    // total the router would read as "no more" (15 < 13) is not reported.
    fakeDocuSign(counts(2 * L + 1), { total: 13 })
    const { ids, hasMore } = await drive(call, L, 4)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, true, false])
    expect(await apiPages(call, 4)).toEqual([
      { n: 5, hasMore: true, total: 13 },
      { n: 5, hasMore: true, total: 13 },
      { n: 1, hasMore: true, total: null },
      { n: 0, hasMore: false, total: null },
    ])
  })

  it('a totalSetSize far above the rows stops at the first empty set', async () => {
    fakeDocuSign(counts(2 * L + 1), { total: 30 })
    const { ids, hasMore } = await drive(call, L, 4)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, true, false])
  })

  it.each([
    { name: 'omitted', total: 'omitted' },
    { name: 'not a count ("n/a")', total: 'garbage' },
    { name: 'not a whole number ("11.5")', total: 11.5 },
  ] as const)(
    'a totalSetSize that is $name gives no total, and nextUri decides',
    async ({ total }) => {
      fakeDocuSign(counts(2 * L + 1), { total })
      const { ids, hasMore, reports } = await drive(call, L, 3)
      expect(ids).toEqual(range(1, 2 * L + 1, id))
      expect(hasMore).toEqual([true, true, false])
      expect(reports.map((r) => r?.totalCount)).toEqual([undefined, undefined, undefined])
      expect(await apiPages(call)).toEqual([
        { n: 5, hasMore: true, total: null },
        { n: 5, hasMore: true, total: null },
        { n: 1, hasMore: false, total: null },
      ])
    },
  )

  it('a numeric totalSetSize is read as the total too', async () => {
    fakeDocuSign(counts(2 * L + 1), { total: 'numeric' })
    const { reports } = await drive(call, L, 3)
    expect(reports.map((r) => r?.totalCount)).toEqual([11, 11, 11])
  })
})

// ── sets cut short mid-read ──────────────────────────────────────────────
// Undocumented either way, and not ruled out (/envelopes takes a
// `query_budget`, "The time in seconds that the query should run before
// returning data."). `start_position` is "The zero-based index of the result
// from which to start returning results.", so a short set that still reports
// more is continued at the row after its last one.

/** A request's params without its window: the filters it carries. */
const filtersOf = (req: Req) =>
  Object.fromEntries(
    Object.entries(req.params).filter(([k]) => k !== 'count' && k !== 'start_position'),
  )

describe.each(OFFSET_METHODS)('docusign $name sets cut short mid-read', ({ path, counts, id, call }) => {
  const L = 5

  it('fills each page from where the short set ended, so no row is skipped', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1), { setCap: 2 })
    const { ids, hasMore, reports } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([11, 11, 11])
    // Each fill asks for the rows still missing, at the row after the last one
    // served; the next caller page still starts at (page - 1) × L.
    expect(requests.map((r) => [r.path, q(r, 'count'), q(r, 'start_position')])).toEqual([
      [path, '5', '0'],
      [path, '3', '2'],
      [path, '1', '4'],
      [path, '5', '5'],
      [path, '3', '7'],
      [path, '1', '9'],
      [path, '5', '10'],
    ])
  })

  it('API path: parseListQuery + listPage sees full pages and the total', async () => {
    fakeDocuSign(counts(2 * L + 1), { setCap: 2 })
    expect(await apiPages(call)).toEqual([
      { n: 5, hasMore: true, total: 11 },
      { n: 5, hasMore: true, total: 11 },
      { n: 1, hasMore: false, total: 11 },
    ])
  })

  it('with no nextUri on any set, totalSetSize alone drives the fill', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1), { setCap: 2, nextUri: 'never' })
    const { ids, hasMore } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(hasMore).toEqual([true, true, false])
    expect(requests).toHaveLength(7)
  })

  it('every fill carries the filters of the set it continues', async () => {
    const { requests } = fakeDocuSign(counts(2 * L + 1), { setCap: 2 })
    const a = adapter()
    const ids: string[] = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery(
        { page, limit: String(L), updated_after: '2001-01-01T00:00:00Z' },
        a,
      )
      ids.push(...(await call(a, params)).map((r) => r.id))
    }
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(requests).toHaveLength(7)
    const [head] = requests
    if (!head) throw new Error('no request was sent')
    expect(Object.values(filtersOf(head))).toContain('2001-01-01T00:00:00.000Z')
    for (const r of requests) expect(filtersOf(r)).toEqual(filtersOf(head))
  })

  it('a total above the rows continues the last page once, and the empty set ends it', async () => {
    // 11 rows, total 13: page 3 serves the 11th while the total still says
    // more, so it asks at 11 for the other 4 and gets none.
    const { requests } = fakeDocuSign(counts(2 * L + 1), { total: 13 })
    const { ids } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(requests.map((r) => [q(r, 'count'), q(r, 'start_position')])).toEqual([
      ['5', '0'],
      ['5', '5'],
      ['5', '10'],
      ['4', '11'],
    ])
  })

  it('a set that serves more than it asked for is kept whole: rows repeat, none is lost', async () => {
    // Against the spec (`count`: "The maximum number of results to return."),
    // and with no total to fall back on. Page 2's set holds rows 6-11 and
    // reports itself the last; cut to 5 rows it would drop the 11th for good.
    fakeDocuSign(counts(2 * L + 1), { overServe: 2, total: 'omitted' })
    const { ids, hasMore } = await drive(call, L, 2)
    expect(ids).toEqual([...range(1, 7, id), ...range(6, 11, id)])
    expect(hasMore).toEqual([true, false])
  })

  it('an empty set ends the fill even when it carries a nextUri', async () => {
    // Against the spec ("It is `null` if this is the last set"): a URI on every
    // set. Asking again at the same index would get the same empty set.
    const { requests } = fakeDocuSign(counts(2 * L + 1), { nextUri: 'always' })
    const { ids } = await drive(call, L, 3)
    expect(ids).toEqual(range(1, 2 * L + 1, id))
    expect(requests.map((r) => [q(r, 'count'), q(r, 'start_position')])).toEqual([
      ['5', '0'],
      ['5', '5'],
      ['5', '10'],
      ['4', '11'],
    ])
  })
})

// ── request filters ───────────────────────────────────────────────────────

describe('docusign listEnvelopes request filters', () => {
  const list = (a: DocuSignAdapter, p: QueryParams) => a.listEnvelopes(CREDS, p)
  const e = (i: number) => `e${i}`

  it('the fake refuses /envelopes without from_date, envelope_ids or transaction_ids', async () => {
    fakeDocuSign({ envelopes: 3 })
    await expect(new DocuSignClient(CREDS).get('/envelopes', { count: 5 })).rejects.toThrow(
      /400 INVALID_REQUEST_PARAMETER/,
    )
  })

  it('a full read sends a from_date floor on every page, so envelopes from 2012 are served', async () => {
    const { requests } = fakeDocuSign({ envelopes: 11 })
    const { ids, hasMore } = await drive(list, 5, 3)
    expect(ids).toEqual(range(1, 11, e))
    expect(hasMore).toEqual([true, true, false])
    expect(requests.map((r) => q(r, 'from_date'))).toEqual([
      '2000-01-01T00:00:00Z',
      '2000-01-01T00:00:00Z',
      '2000-01-01T00:00:00Z',
    ])
  })

  it('updated_after is sent as from_date on every page, beside the moving start_position', async () => {
    const { requests } = fakeDocuSign({ envelopes: 11 })
    const a = adapter()
    const ids: string[] = []
    const metas = []
    for (const page of ['1', '2']) {
      const params = parseListQuery({ page, limit: '5', updated_after: envelopeChanged(6) }, a)
      const rows = await a.listEnvelopes(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      metas.push(listPage(rows, params, a.platform).meta.hasMore)
    }
    expect(ids).toEqual(range(6, 11, e))
    expect(metas).toEqual([true, false])
    expect(requests.map((r) => [q(r, 'from_date'), q(r, 'start_position')])).toEqual([
      ['2013-02-10T00:00:00.000Z', '0'],
      ['2013-02-10T00:00:00.000Z', '5'],
    ])
  })

  it('pins the order to created, ascending, so an envelope changed mid-read is served once', async () => {
    // e9 changes status after page 1 is served. In a last-changed order it
    // would jump to the front, already read, and page 2 would repeat a row.
    const { requests } = fakeDocuSign(
      { envelopes: 11 },
      { touch: { afterCall: 1, envelopeId: 'e9' } },
    )
    const { ids, hasMore } = await drive(list, 5, 3)
    expect(ids).toEqual(range(1, 11, e))
    expect(hasMore).toEqual([true, true, false])
    expect(requests.map((r) => [q(r, 'order_by'), q(r, 'order')])).toEqual([
      ['created', 'asc'],
      ['created', 'asc'],
      ['created', 'asc'],
    ])
  })

  it('forwards a caller status', async () => {
    const { requests } = fakeDocuSign({ envelopes: 3 })
    await adapter().listEnvelopes(CREDS, withPageSink({ page: 1, limit: 5, status: 'completed' }))
    expect(q(requests[0], 'status')).toBe('completed')
  })
})

describe('docusign listTemplates request filters', () => {
  it('updated_after is sent as modified_from_date, so a template edited since is served', async () => {
    // t2 was created in 2012 and edited after the watermark; from_date would
    // filter by creation and drop it.
    const { requests } = fakeDocuSign(
      { templates: 3 },
      { templateModified: { t2: '2026-02-01T00:00:00.000Z' } },
    )
    const a = adapter()
    const params = parseListQuery({ limit: '5', updated_after: '2026-01-01T00:00:00Z' }, a)
    const rows = await a.listTemplates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['t2'])
    expect(q(requests[0], 'modified_from_date')).toBe('2026-01-01T00:00:00.000Z')
    expect(q(requests[0], 'from_date')).toBeUndefined()
  })

  it('sends no status, which /templates does not take', async () => {
    const { requests } = fakeDocuSign({ templates: 3 })
    await adapter().listTemplates(CREDS, withPageSink({ page: 1, limit: 5, status: 'completed' }))
    expect(requests[0]?.params).not.toHaveProperty('status')
  })
})

// ── whole-collection lists, sliced locally ────────────────────────────────

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    path: `/envelopes/${ENV}/recipients`,
    counts: (n: number): Counts => ({ recipients: n }),
    id: (i: number) => `${ENV}:r${i}`,
    call: (a: DocuSignAdapter, p: QueryParams) => a.listSigners(CREDS, ENV, p),
    getLast: (a: DocuSignAdapter, n: number) => a.getSigner(CREDS, `${ENV}:r${n}`),
  },
  {
    name: 'listDocuments',
    path: `/envelopes/${ENV}/documents`,
    counts: (n: number): Counts => ({ documents: n }),
    id: (i: number) => `${ENV}:d${i}`,
    call: (a: DocuSignAdapter, p: QueryParams) => a.listDocuments(CREDS, ENV, p),
    getLast: (a: DocuSignAdapter, n: number) => a.getDocument(CREDS, `${ENV}:d${n}`),
  },
  {
    name: 'listAuditTrailEntries',
    path: `/envelopes/${ENV}/audit_events`,
    counts: (n: number): Counts => ({ auditEvents: n }),
    // Ids are the event's position in the WHOLE list ("<envelopeId>:<index>"),
    // so page 2 must continue the numbering, not restart it.
    id: (i: number) => `${ENV}:${i - 1}`,
    call: (a: DocuSignAdapter, p: QueryParams) => a.listAuditTrailEntries(CREDS, ENV, p),
    getLast: (a: DocuSignAdapter, n: number) => a.getAuditTrailEntry(CREDS, `${ENV}:${n - 1}`),
  },
] as const

describe.each(LOCAL_METHODS)(
  'docusign $name local paging',
  ({ path, counts, id, call, getLast }) => {
    const L = 5

    it('serves all 2L + 1 rows once across pages 1-3, reporting hasMore [true, true, false]', async () => {
      const { requests } = fakeDocuSign(counts(2 * L + 1))
      const { ids, hasMore, reports } = await drive(call, L, 3)
      expect(ids).toEqual(range(1, 2 * L + 1, id))
      expect(hasMore).toEqual([true, true, false])
      expect(reports.map((r) => r?.totalCount)).toEqual([11, 11, 11])
      expect(reports.map((r) => r?.pagedLocally)).toEqual([true, true, true])
      // No paging parameter exists, so every page re-reads the whole list.
      expect(requests.map((r) => r.path)).toEqual([path, path, path])
    })

    it('an exact multiple (2L rows) ends on page 2', async () => {
      fakeDocuSign(counts(2 * L))
      const { ids, hasMore } = await drive(call, L, 2)
      expect(ids).toEqual(range(1, 2 * L, id))
      expect(hasMore).toEqual([true, false])
    })

    it('a limit above the collection serves it whole on page 1', async () => {
      fakeDocuSign(counts(2 * L + 1))
      const { ids, hasMore } = await drive(call, 500, 1)
      expect(ids).toEqual(range(1, 2 * L + 1, id))
      expect(hasMore).toEqual([false])
    })

    it('API path: parseListQuery + listPage reports meta.hasMore and the total', async () => {
      fakeDocuSign(counts(2 * L + 1))
      const a = adapter()
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parseListQuery({ page, limit: String(L) }, a)
        const rows: Array<{ id: string }> = await call(a, params)
        const env = listPage(rows, params, a.platform)
        metas.push({ n: env.data.length, hasMore: env.meta.hasMore, total: env.meta.totalCount })
      }
      expect(metas).toEqual([
        { n: 5, hasMore: true, total: 11 },
        { n: 5, hasMore: true, total: 11 },
        { n: 1, hasMore: false, total: 11 },
      ])
    })

    it('the single-record lookup finds the last of more rows than any page size (1001)', async () => {
      // Past the declared maximum (1000) and every limit the router or the
      // sync worker sends, so a lookup that pages at any size misses it.
      const n = 1001
      fakeDocuSign(counts(n))
      expect((await getLast(adapter(), n)).id).toBe(id(n))
    })
  },
)
