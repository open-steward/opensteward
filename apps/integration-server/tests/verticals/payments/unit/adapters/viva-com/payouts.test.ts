/**
 * Viva.com payouts, against a fake that honours only what the Payment API spec
 * (https://developer.viva.com/downloads/payment-api.yaml) documents for
 * "Account Transactions":
 *   POST /dataservices/v2/accounttransactions/Search?PageSize=500&Page=1&OrderBy=Descending
 *   PageSize — "Maximum value = 500"
 *   Page     — "Should be set to `1` and increased by one until a "204 (No content)" message is received"
 *   OrderBy  — "Order the results by either ascending or descending"
 *   body     — account_transactions_request: required [DateFrom, DateTo];
 *              WalletId, SubTypeIds, AmountFrom, AmountTo;
 *              DateFrom example "2018-01-20 13:45:03.5200000 +02:00"
 *   response — rows shaped like account_transactions_200; "204 No Content" past the end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { VivaComAdapter } from '../../../../../../src/verticals/payments/adapters/viva-com'
import type { RawVivaComAccountTransaction } from '../../../../../../src/verticals/payments/adapters/viva-com/transform/payout'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { documentedAccountTransaction } from './fixture'

const { searchMock, postMock } = vi.hoisted(() => ({ searchMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/viva-com/client', () => ({
  VivaComClient: class {
    search = searchMock
  },
}))

vi.mock('axios', () => ({ default: { post: postMock } }))

const adapter = new VivaComAdapter()
const CREDS: Credentials = {
  accessToken: 'tok_viva',
  extra: { clientId: 'cid', clientSecret: 's' },
}
const PATH = '/dataservices/v2/accounttransactions/Search'
const DOCUMENTED_QUERY = new Set(['PageSize', 'Page', 'OrderBy'])
const DOCUMENTED_BODY = new Set([
  'DateFrom',
  'DateTo',
  'WalletId',
  'SubTypeIds',
  'AmountFrom',
  'AmountTo',
])
/** The spec's DateFrom example: "2018-01-20 13:45:03.5200000 +02:00". */
const VIVA_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{7} [+-]\d{2}:\d{2}$/
const NOW = new Date('2026-09-27T12:00:00.000Z')
const DAY = 86_400_000
/** A DateFrom well before every row the default store holds. */
const AFTER = new Date(NOW.getTime() - 60 * DAY)

interface Call {
  path: string
  query: Record<string, unknown>
  body: Record<string, unknown>
}

function parseVivaDate(s: string): number {
  const m = VIVA_DATE.exec(s)
  if (!m) throw new Error(`undocumented date format ${s}`)
  const [d, t, off] = s.split(' ')
  return new Date(`${d}T${t!.slice(0, 12)}${off}`).getTime()
}

/** `n` payouts (alternating IBAN / card), one an hour back from NOW, interleaved with pay-ins. */
function store(n: number, start = NOW.getTime() - 3_600_000): RawVivaComAccountTransaction[] {
  const rows: RawVivaComAccountTransaction[] = []
  for (let i = 1; i <= n; i++) {
    const at = new Date(start - (i - 1) * 3_600_000).toISOString()
    rows.push(
      documentedAccountTransaction({
        accountTransactionId: `po-${i}`,
        subTypeId: i % 2 ? 30 : 31,
        amount: -(i + 0.25),
        created: at,
      }),
    )
    rows.push(
      documentedAccountTransaction({ accountTransactionId: `in-${i}`, subTypeId: 22, created: at }),
    )
  }
  return rows
}

function serve(rows: RawVivaComAccountTransaction[]): Call[] {
  const calls: Call[] = []
  searchMock.mockImplementation(
    async (path: string, query: Record<string, unknown>, body: Record<string, unknown>) => {
      calls.push({ path, query: { ...query }, body: { ...body } })
      if (path !== PATH) throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(query))
        if (!DOCUMENTED_QUERY.has(k)) throw new Error(`undocumented query param ${k}`)
      for (const k of Object.keys(body))
        if (!DOCUMENTED_BODY.has(k)) throw new Error(`undocumented body field ${k}`)
      if (typeof body.DateFrom !== 'string' || typeof body.DateTo !== 'string')
        throw Object.assign(new Error('DateFrom and DateTo are required'), { status: 400 })
      const size = Number(query.PageSize)
      if (!(size >= 1 && size <= 500)) throw new Error(`PageSize ${size} outside 1..500`)
      const page = Number(query.Page)
      const from = parseVivaDate(body.DateFrom)
      const to = parseVivaDate(body.DateTo)
      const subs = body.SubTypeIds as number[] | undefined
      const matched = rows
        .filter((r) => {
          const t = new Date(r.created as string).getTime()
          return t >= from && t <= to && (!subs || subs.includes(r.subTypeId as number))
        })
        .sort((a, b) => {
          const d =
            new Date(a.created as string).getTime() - new Date(b.created as string).getTime()
          return query.OrderBy === 'Descending' ? -d : d
        })
      const slice = matched.slice((page - 1) * size, page * size)
      if (slice.length === 0) return { status: 204, data: undefined }
      return { status: 200, data: slice }
    },
  )
  return calls
}

beforeEach(() => {
  searchMock.mockReset()
  postMock.mockReset()
  _resetRowPager()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('VivaComAdapter.listPayouts', () => {
  it('walks 2L+1 payouts newest-first over three pages, each upstream page once, with an exact hasMore', async () => {
    const L = 4
    const calls = serve(store(2 * L + 1))
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      // Time moves between caller pages; the window must not.
      vi.setSystemTime(NOW.getTime() + (page - 1) * 1000)
      const params = withPageSink({ page, limit: L, updatedAfter: AFTER })
      const rows = await adapter.listPayouts(CREDS, params)
      for (const r of rows) PayoutSchema.parse(r)
      ids.push(...rows.map((p) => p.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `po-${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.query)).toEqual([
      { PageSize: L, Page: 1, OrderBy: 'Descending' },
      { PageSize: L, Page: 2, OrderBy: 'Descending' },
      { PageSize: L, Page: 3, OrderBy: 'Descending' },
      { PageSize: L, Page: 4, OrderBy: 'Descending' },
    ])
    // One window for the whole walk, frozen at the first request.
    expect(new Set(calls.map((c) => JSON.stringify(c.body))).size).toBe(1)
  })

  it('sends the payout SubTypeIds and a DateFrom/DateTo window in the documented format', async () => {
    const calls = serve(store(2))
    const rows = await adapter.listPayouts(
      CREDS,
      withPageSink({ page: 1, limit: 50, updatedAfter: AFTER }),
    )
    expect(rows.map((r) => r.id)).toEqual(['po-1', 'po-2'])
    expect(calls[0]!.path).toBe(PATH)
    expect(Object.keys(calls[0]!.body).sort()).toEqual(['DateFrom', 'DateTo', 'SubTypeIds'])
    expect(calls[0]!.body.SubTypeIds).toEqual([30, 31])
    expect(calls[0]!.body.DateFrom).toMatch(VIVA_DATE)
    expect(calls[0]!.body.DateTo).toMatch(VIVA_DATE)
  })

  it('without updatedAfter, refuses with 501 NOT_SUPPORTED before any request', async () => {
    serve(store(1))
    await expect(
      adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/without updated_after/),
    })
    expect(searchMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('without a Client ID on the connection, asks for a reconnect before any request', async () => {
    serve(store(1))
    await expect(
      adapter.listPayouts(
        { accessToken: 'tok_viva', extra: { clientSecret: 's' } },
        withPageSink({ page: 1, limit: 10, updatedAfter: AFTER }),
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'RECONNECT_REQUIRED' })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('DateTo is now, and DateFrom is updatedAfter in the documented format', async () => {
    const calls = serve(store(1))
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10, updatedAfter: AFTER }))
    expect(calls[0]!.body.DateFrom).toBe('2026-07-29 12:00:00.0000000 +00:00')
    expect(calls[0]!.body.DateTo).toBe('2026-09-27 12:00:00.0000000 +00:00')
  })

  it('without limit, PageSize is the default page limit (100)', async () => {
    const calls = serve(store(3))
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, updatedAfter: AFTER }))
    expect(calls[0]!.query.PageSize).toBe(100)
  })

  it('with updatedAfter, the window starts there, however far back', async () => {
    const after = new Date('2025-01-01T00:00:00.000Z')
    const calls = serve([
      ...store(1),
      documentedAccountTransaction({
        accountTransactionId: 'po-old',
        subTypeId: 30,
        created: '2025-06-01T00:00:00.000Z',
      }),
      documentedAccountTransaction({
        accountTransactionId: 'po-older',
        subTypeId: 30,
        created: '2024-12-31T00:00:00.000Z',
      }),
    ])
    const rows = await adapter.listPayouts(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: after }),
    )
    expect(rows.map((r) => r.id)).toEqual(['po-1', 'po-old'])
    expect(calls[0]!.body.DateFrom).toBe('2025-01-01 00:00:00.0000000 +00:00')
  })

  it('clamps PageSize to the documented maximum of 500 and still serves the exact limit', async () => {
    const calls = serve(
      store(700, NOW.getTime() - 60_000).map((r, i) => ({
        ...r,
        created: new Date(NOW.getTime() - 60_000 - i * 1000).toISOString(),
      })),
    )
    const params = withPageSink({ page: 1, limit: 600, updatedAfter: AFTER })
    const rows = await adapter.listPayouts(CREDS, params)
    expect(rows).toHaveLength(600)
    expect(rows[0]!.id).toBe('po-1')
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(calls.map((c) => c.query.PageSize)).toEqual([500, 500])
    expect(calls.map((c) => c.query.Page)).toEqual([1, 2])
  })

  it('an empty 200 page ends the walk too', async () => {
    searchMock.mockResolvedValue({ status: 200, data: [] })
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: AFTER })
    expect(await adapter.listPayouts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(searchMock).toHaveBeenCalledTimes(1)
  })

  it('a walk under one updatedAfter is not continued by a walk under another', async () => {
    const calls = serve(store(6))
    await adapter.listPayouts(
      CREDS,
      withPageSink({ page: 1, limit: 2, updatedAfter: new Date('2026-09-01T00:00:00.000Z') }),
    )
    await adapter.listPayouts(CREDS, withPageSink({ page: 2, limit: 2, updatedAfter: AFTER }))
    const last = calls[calls.length - 1]!
    expect(last.body.DateFrom).toBe('2026-07-29 12:00:00.0000000 +00:00')
  })

  it.each([
    [
      'another Client ID',
      { accessToken: 'tok_viva', extra: { clientId: 'cid-2', clientSecret: 's' } },
    ],
    ['another token', { accessToken: 'tok_other', extra: { clientId: 'cid', clientSecret: 's' } }],
  ] as const)('a walk on one connection is not continued by %s', async (_label, other) => {
    const calls = serve(store(6))
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 2, updatedAfter: AFTER }))
    const before = calls.length
    const rows = await adapter.listPayouts(
      other as Credentials,
      withPageSink({ page: 2, limit: 2, updatedAfter: AFTER }),
    )
    expect(rows.map((r) => r.id)).toEqual(['po-3', 'po-4'])
    // The other connection starts its own walk at upstream Page 1.
    expect(calls[before]!.query.Page).toBe(1)
  })

  it('a walk at one limit is not continued by a walk at another', async () => {
    const calls = serve(store(12))
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 4, updatedAfter: AFTER }))
    const before = calls.length
    const rows = await adapter.listPayouts(
      CREDS,
      withPageSink({ page: 2, limit: 5, updatedAfter: AFTER }),
    )
    expect(rows.map((r) => r.id)).toEqual(['po-6', 'po-7', 'po-8', 'po-9', 'po-10'])
    // Its own walk: upstream pages of 5 from Page 1, none of the limit-4 walk's marks reused.
    expect(
      calls
        .slice(before)
        .map((c) => c.query)
        .slice(0, 2),
    ).toEqual([
      { PageSize: 5, Page: 1, OrderBy: 'Descending' },
      { PageSize: 5, Page: 2, OrderBy: 'Descending' },
    ])
    expect(calls.slice(before).every((c) => c.query.PageSize === 5)).toBe(true)
  })

  it('an empty window is one request, a 204, and hasMore false', async () => {
    const calls = serve([])
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: AFTER })
    expect(await adapter.listPayouts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('refuses an updatedAfter that is not a date, before any request', async () => {
    serve(store(1))
    await expect(
      adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10, updatedAfter: new Date('x') })),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('fails loudly on a 200 body that is not a list of rows', async () => {
    searchMock.mockResolvedValue({ status: 200, data: { data: [] } })
    await expect(
      adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10, updatedAfter: AFTER })),
    ).rejects.toThrow(/not an array/)
  })
})

describe('VivaComAdapter.getPayout', () => {
  it('refuses with 501 NOT_SUPPORTED, naming the missing id filter, and sends no request', async () => {
    serve(store(1))
    await expect(adapter.getPayout(CREDS, 'po-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/no id filter/),
    })
    expect(searchMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})
