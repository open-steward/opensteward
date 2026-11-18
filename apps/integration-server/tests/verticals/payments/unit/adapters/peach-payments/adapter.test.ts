/**
 * Peach Payments list/get methods against a fake GET /v3/query.
 *
 * https://developer.peachpayments.com/docs/oppwa-integrations-reporting:
 *   "The request must include either `merchantTransactionId` or
 *    `date.to`/`date.from` parameters."
 *   "For large result sets, use pagination by specifying the page number with
 *    `pageNo`. The system sets the page size to 100 and ignores the `limit`
 *    parameter." The paged sample response ends with "pages":"8".
 * https://developer.peachpayments.com/docs/oppwa-references-api:
 *   "Live: `https://card.peachpayments.com/`", bearer access token, and
 *   `entityId` ("The entity required to authorise the request"); `paymentTypes`
 *   ("Example: `paymentTypes=PA,DB`").
 *
 * The fake honours only those documented parameters: entityId, date.from,
 * date.to, paymentTypes and pageNo. It pages 100 rows at a time.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PeachPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/peach-payments/index'
import { DOC_DEBIT, DOC_REFUND } from './fixtures'

const ENTITY = '8a8294174b7ecb28014b9699220015ca'
const CREDS: Credentials = {
  accessToken: 'OGE4Mjk0MTc0YjdlY2IyODAxNGI5Njk5MjIwMDE1Y2N8c3k2S0pzVDg=',
  extra: { entityId: ENTITY },
}
const NOW = new Date('2026-03-15T12:00:00Z')
const AFTER = new Date('2026-01-10T08:00:00Z')
const PAGE = 100
const DOCUMENTED = new Set(['entityId', 'date.from', 'date.to', 'paymentTypes', 'pageNo'])

interface Row {
  id: string
  paymentType: string
  timestamp: string
}
interface Req {
  path: string
  params: Record<string, unknown>
}

/** "yyyy-MM-dd HH:mm:ss" (UTC) → epoch ms. */
function parseQueryTime(s: unknown): number {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s))
    throw new Error(`bad date ${String(s)}`)
  return Date.parse(s.replace(' ', 'T') + 'Z')
}
/** The record timestamp format of the samples: "2023-01-01 00:58:08.442+0000". */
function ts(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '+0000')
}

/** Rows newest-first, `perMonth[i]` of them in the i-th month back from March 2026. */
function makeRows(perMonth: number[], paymentType: string): Row[] {
  const rows: Row[] = []
  perMonth.forEach((n, m) => {
    for (let i = 0; i < n; i++) {
      // Spread across the 20th..1st of the month, newest first; after AFTER in January.
      const at = new Date(Date.UTC(2026, 2 - m, 20, 23, 0, 0) - i * 60_000)
      rows.push({
        id: `${paymentType}_${m}_${String(i).padStart(4, '0')}`,
        paymentType,
        timestamp: ts(at),
      })
    }
  })
  return rows
}

function fakePeach(
  rows: Row[],
  opts: {
    omitPagesOnSinglePage?: boolean
    omitPages?: boolean
    byIdRecords?: Array<Record<string, unknown>>
  } = {},
) {
  const requests: Req[] = []
  let created: { baseURL?: string; headers?: Record<string, string> } = {}
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    requests.push({ path, params })
    if (params['entityId'] !== ENTITY)
      throw Object.assign(new Error('no entity'), { response: { status: 401 } })
    const q = /^\/v3\/query\/([^/]+)$/.exec(path)
    if (q) {
      if (opts.byIdRecords)
        return { data: { result: { code: '000.000.100' }, records: opts.byIdRecords } }
      const rec = [DOC_DEBIT, DOC_REFUND].find((r) => r.id === decodeURIComponent(q[1]!))
      return { data: { result: { code: '000.000.100' }, records: rec ? [rec] : [] } }
    }
    if (path !== '/v3/query') throw new Error(`unexpected path ${path}`)
    const from = parseQueryTime(params['date.from'])
    const to = parseQueryTime(params['date.to'])
    const types = String(params['paymentTypes'] ?? '')
      .split(',')
      .filter(Boolean)
    const pageNo = params['pageNo'] === undefined ? 1 : Number(params['pageNo'])
    const hits = rows.filter((r) => {
      const t = Date.parse(r.timestamp.replace(' ', 'T').replace('+0000', 'Z'))
      return t >= from && t < to && (types.length === 0 || types.includes(r.paymentType))
    })
    const pages = Math.ceil(hits.length / PAGE)
    const slice = hits.slice((pageNo - 1) * PAGE, pageNo * PAGE)
    const base = r0(slice)
    const body: Record<string, unknown> = { result: { code: '000.000.100' }, records: base }
    if (!opts.omitPages && !(opts.omitPagesOnSinglePage && pages <= 1))
      body['pages'] = String(pages)
    return { data: body }
  })
  function r0(slice: Row[]) {
    return slice.map((r) => ({
      ...(r.paymentType === 'RF' ? DOC_REFUND : DOC_DEBIT),
      id: r.id,
      paymentType: r.paymentType,
      timestamp: r.timestamp,
    }))
  }
  vi.spyOn(axios, 'create').mockImplementation(((cfg: typeof created) => {
    created = cfg
    return { get, post: vi.fn(), defaults: {} }
  }) as never)
  return { requests, get, config: () => created }
}

async function drive(method: 'listCharges' | 'listRefunds', L: number, pages: number) {
  const adapter = new PeachPaymentsAdapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L, updatedAfter: AFTER } as QueryParams)
    const out = await adapter[method](CREDS, params)
    sizes.push(out.length)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _resetRowPager()
})

const CASES = [
  { method: 'listCharges' as const, type: 'DB', types: 'DB,PA' },
  { method: 'listRefunds' as const, type: 'RF', types: 'RF' },
]

describe.each(CASES)('Peach Payments $method', (c) => {
  it('serves 2L+1 rows once each across uneven month windows, hasMore exact', async () => {
    const L = 60
    // March: 101 rows (upstream pages of 100 and 1), February: none, January: 20.
    const rows = makeRows([101, 0, 20], c.type)
    const { requests } = fakePeach(rows)
    const { ids, hasMore, sizes } = await drive(c.method, L, 3)
    expect(ids).toEqual(rows.map((r) => r.id))
    expect(new Set(ids).size).toBe(2 * L + 1)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
    // Newest-first windows, each paged by pageNo.
    const walk = requests.map(
      (r) => `${String(r.params['date.from'])}|${String(r.params['pageNo'])}`,
    )
    expect([...new Set(walk)]).toEqual([
      '2026-03-01 00:00:00|1',
      '2026-03-01 00:00:00|2',
      '2026-02-01 00:00:00|1',
      '2026-01-10 08:00:00|1',
    ])
  })

  it('serves a small page across windows', async () => {
    const L = 4
    const rows = makeRows([4, 0, 5], c.type)
    fakePeach(rows)
    const { ids, hasMore, sizes } = await drive(c.method, L, 3)
    expect(ids).toEqual(rows.map((r) => r.id))
    expect(sizes).toEqual([4, 4, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends only documented parameters, UTC month windows, on the live host with bearer auth', async () => {
    const { requests, config } = fakePeach(makeRows([1, 0, 0], c.type))
    await drive(c.method, 10, 1)
    expect(config().baseURL).toBe('https://card.peachpayments.com')
    expect(config().headers?.['Authorization']).toBe(`Bearer ${CREDS.accessToken}`)
    expect(requests[0]).toEqual({
      path: '/v3/query',
      params: {
        entityId: ENTITY,
        'date.from': '2026-03-01 00:00:00',
        'date.to': '2026-04-01 00:00:00',
        paymentTypes: c.types,
        pageNo: 1,
      },
    })
    for (const r of requests)
      for (const k of Object.keys(r.params)) expect(DOCUMENTED.has(k)).toBe(true)
    expect(requests.at(-1)!.params['date.from']).toBe('2026-01-10 08:00:00')
    expect(requests.at(-1)!.params['date.to']).toBe('2026-02-01 00:00:00')
  })

  it('treats a response without pages as one page for that window', async () => {
    const rows = makeRows([3, 2, 1], c.type)
    fakePeach(rows, { omitPagesOnSinglePage: true })
    const { ids, hasMore } = await drive(c.method, 10, 1)
    expect(ids).toEqual(rows.map((r) => r.id))
    expect(hasMore).toEqual([false])
  })

  it('probes the next pageNo when a full page comes back without pages', async () => {
    // "pages" appears only in the paginated sample; a full 100-row page with
    // no "pages" must not end the window.
    const L = 60
    const rows = makeRows([101, 0, 20], c.type)
    const { requests } = fakePeach(rows, { omitPages: true })
    const { ids, hasMore } = await drive(c.method, L, 3)
    expect(ids).toEqual(rows.map((r) => r.id))
    expect(hasMore).toEqual([true, true, false])
    expect(
      requests.some(
        (r) => r.params['date.from'] === '2026-03-01 00:00:00' && r.params['pageNo'] === 2,
      ),
    ).toBe(true)
  })

  it('keys the pager on updatedAfter, so a different floor never resumes another walk', async () => {
    const L = 60
    const rows = makeRows([101, 0, 20], c.type)
    fakePeach(rows)
    const adapter = new PeachPaymentsAdapter()
    await adapter[c.method](CREDS, withPageSink({ page: 1, limit: L, updatedAfter: AFTER }))
    // A floor inside the March window the first walk has buffered: only the
    // 61 March rows at or after 22:00 on the 20th qualify, so page 2 is the
    // single row at 22:00. A key without the floor would serve the first
    // walk's buffered rows 60..99 instead.
    const late = new Date('2026-03-20T22:00:00Z')
    const params = withPageSink({ page: 2, limit: L, updatedAfter: late } as QueryParams)
    const out = await adapter[c.method](CREDS, params)
    expect(out.map((r) => r.id)).toEqual(rows.slice(L, L + 1).map((r) => r.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses an unfiltered call with 501 and sends nothing', async () => {
    const { get } = fakePeach([])
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    await expect(new PeachPaymentsAdapter()[c.method](CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses a connection without an entityId with 501 and sends nothing', async () => {
    const { get } = fakePeach([])
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: AFTER } as QueryParams)
    await expect(
      new PeachPaymentsAdapter()[c.method]({ accessToken: 't' }, params),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('Peach Payments customers', () => {
  it.each(['listCustomers', 'getCustomer'] as const)(
    '%s refuses with 501 and sends nothing',
    async (m) => {
      const { get } = fakePeach([])
      const adapter = new PeachPaymentsAdapter()
      const call =
        m === 'listCustomers'
          ? adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams))
          : adapter.getCustomer(CREDS, 'x')
      await expect(call).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(get).not.toHaveBeenCalled()
    },
  )
})

describe('Peach Payments getCharge', () => {
  it('reads GET /v3/query/{id} with entityId', async () => {
    const { requests } = fakePeach([])
    const charge = await new PeachPaymentsAdapter().getCharge(CREDS, DOC_DEBIT.id)
    expect(charge.id).toBe(DOC_DEBIT.id)
    expect(requests).toEqual([{ path: `/v3/query/${DOC_DEBIT.id}`, params: { entityId: ENTITY } }])
  })

  it('returns the record whose id matches, not the first one', async () => {
    const other = { ...DOC_DEBIT, id: '8ac7a4a0856290ba01856ad6026c0000' }
    fakePeach([], { byIdRecords: [other, DOC_DEBIT] })
    const charge = await new PeachPaymentsAdapter().getCharge(CREDS, DOC_DEBIT.id)
    expect(charge.id).toBe(DOC_DEBIT.id)
  })

  it('404s when no record carries the requested id', async () => {
    const other = { ...DOC_DEBIT, id: '8ac7a4a0856290ba01856ad6026c0000' }
    fakePeach([], { byIdRecords: [other] })
    await expect(new PeachPaymentsAdapter().getCharge(CREDS, DOC_DEBIT.id)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('404s on an id that is not a DB/PA transaction', async () => {
    fakePeach([])
    await expect(new PeachPaymentsAdapter().getCharge(CREDS, DOC_REFUND.id)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('Peach Payments credentials', () => {
  it('asks for the access token and entity ID separately', async () => {
    const adapter = new PeachPaymentsAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['accessToken', 'entityId'])
    expect(await adapter.exchangeCredentials({ accessToken: 'tok', entityId: ENTITY })).toEqual({
      accessToken: 'tok',
      extra: { entityId: ENTITY },
    })
    await expect(adapter.exchangeCredentials({ accessToken: 'tok' })).rejects.toThrow(/entityId/)
  })
})
