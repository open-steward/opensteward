import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { TyroAdapter } from '../../../../../../src/verticals/payments/adapters/tyro'
import { _resetTyroTokenCache } from '../../../../../../src/verticals/payments/adapters/tyro/auth'
import { TyroClient } from '../../../../../../src/verticals/payments/adapters/tyro/client'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { DOC_REFUND_TRANSACTION, DOC_SETTLEMENT, DOC_TRANSACTION } from './fixtures/reporting'

const NOW = new Date('2026-09-27T05:00:00Z')
const BASE = 'https://api.tyro.com/connect'
const creds: Credentials = {
  accessToken: 'jwt-1',
  extra: { clientId: 'cid', clientSecret: 'csec', mid: '122', currency: 'AUD' },
}

interface Seen {
  path: string
  query: Record<string, string>
  auth: string | null
}

/**
 * A fake Tyro Connect that honours only the documented Reporting parameters:
 * transactions take exactly transactionDate, limit (1..2000) and page (>= 1);
 * settlements take exactly settlementDate. Anything else is a 400.
 */
function fakeTyro(opts: {
  transactions?: Record<string, { rows: unknown[]; total?: number }[]>
  settlements?: Record<string, unknown[]>
}) {
  const seen: Seen[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const query = Object.fromEntries(url.searchParams)
    const headers = new Headers(init?.headers)
    const path = url.pathname.replace(/^\/connect/, '')
    seen.push({ path, query, auth: headers.get('authorization') })
    expect(url.origin + '/connect').toBe(BASE)
    const bad = () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })
    if (path === '/reporting/merchants/122/transactions') {
      const keys = Object.keys(query).sort().join(',')
      if (keys !== 'limit,page,transactionDate') return bad()
      const limit = Number(query.limit)
      const page = Number(query.page)
      if (!(limit >= 1 && limit <= 2000) || !(page >= 1)) return bad()
      const day = opts.transactions?.[query.transactionDate!] ?? []
      const p = day[page - 1] ?? { rows: [] }
      const total = day.reduce((n, x) => n + x.rows.length, 0)
      return Response.json({
        terminalBusinessDay: query.transactionDate,
        merchantDetails: { mid: '122', tradingName: 'Test Merchant' },
        transactions: p.rows,
        pagination: { page, size: p.rows.length, limit, total: p.total ?? total },
      })
    }
    if (path === '/reporting/merchants/122/settlements') {
      if (Object.keys(query).join(',') !== 'settlementDate') return bad()
      return Response.json({
        mid: '122',
        settlementDate: query.settlementDate,
        settlements: opts.settlements?.[query.settlementDate!] ?? [],
      })
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchFn)
  return { seen, fetchFn }
}

const tx = (id: string, extra: Record<string, unknown> = {}) => ({
  ...DOC_TRANSACTION,
  transactionId: id,
  ...extra,
})
const st = (id: string) => ({ ...DOC_SETTLEMENT, clearingPaymentId: id })

beforeEach(() => {
  _resetRowPager()
  _resetTyroTokenCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('tyro listCharges (Reporting transactions)', () => {
  it('sends only documented parameters, the bearer JWT, newest day first', async () => {
    const { seen } = fakeTyro({ transactions: { '2026-09-26': [{ rows: [tx('a')] }] } })
    const out = await new TyroAdapter().listCharges(creds, {
      page: 1,
      limit: 5,
      updatedAfter: new Date('2026-09-25T10:00:00Z'),
    })
    expect(out.map((c) => c.id)).toEqual(['a'])
    for (const c of out) ChargeSchema.parse(c)
    expect(seen.map((s) => s.query)).toEqual([
      { transactionDate: '2026-09-26', limit: '2000', page: '1' },
      { transactionDate: '2026-09-25', limit: '2000', page: '1' },
    ])
    expect(seen[0]!.auth).toBe('Bearer jwt-1')
  })

  it('walks N = 2L+1 rows exactly once across uneven days, with exact hasMore', async () => {
    const L = 3
    fakeTyro({
      transactions: {
        // uneven upstream: 4 rows (one a refund, filtered), 0 rows, a day that
        // needs a second upstream page, then 2 rows
        '2026-09-26': [{ rows: [tx('c1'), tx('c2'), DOC_REFUND_TRANSACTION, tx('c3')] }],
        '2026-09-25': [],
        '2026-09-24': [
          { rows: [tx('c4')], total: 2001 },
          { rows: [tx('c5')], total: 2001 },
        ],
        '2026-09-23': [{ rows: [tx('c6'), tx('c7')] }],
      },
    })
    const adapter = new TyroAdapter()
    const ids: string[] = []
    const more: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({
        page,
        limit: L,
        updatedAfter: new Date('2026-09-23T00:00:00Z'),
      } as QueryParams)
      const rows = await adapter.listCharges(creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore === true)
    }
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
    expect(new Set(ids).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
  })

  it('requests page 2 of a day while pagination.total says there is more', async () => {
    const { seen } = fakeTyro({
      transactions: {
        '2026-09-26': [
          { rows: [tx('p1')], total: 2001 },
          { rows: [tx('p2')], total: 2001 },
        ],
      },
    })
    await new TyroAdapter().listCharges(creds, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-26T00:00:00Z'),
    })
    expect(seen.map((s) => `${s.query.transactionDate}#${s.query.page}`)).toEqual([
      '2026-09-26#1',
      '2026-09-26#2',
    ])
  })

  it('refuses an unfiltered list with 501 naming updated_after, and sends nothing', async () => {
    // One request per day back to the 3-year retention was 1,094 requests for
    // page 1 of an empty merchant, on every call (page 1 is always read afresh).
    const { fetchFn } = fakeTyro({})
    const err = await new TyroAdapter().listCharges(creds, { page: 1, limit: 10 }).catch((e) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String(err.message)).toMatch(/updated_after/)
    expect(String(err.message)).toMatch(/3 years/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses an Invalid Date updated_after with 501 like an absent one, and sends nothing', async () => {
    // parseListQuery rejects a malformed updated_after on REST; MCP and direct
    // callers can still hand the adapter an Invalid Date.
    const { fetchFn } = fakeTyro({})
    const err = await new TyroAdapter()
      .listCharges(creds, { page: 1, limit: 10, updatedAfter: new Date('x') })
      .catch((e) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('pins the page-1 request count: one request per day of the window, and no more', async () => {
    // Empty merchant, updated_after six days back: 2026-09-26 .. 2026-09-20.
    const { seen } = fakeTyro({})
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-20T12:00:00Z'),
    } as QueryParams)
    expect(await new TyroAdapter().listCharges(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen.map((s) => s.query.transactionDate)).toEqual([
      '2026-09-26',
      '2026-09-25',
      '2026-09-24',
      '2026-09-23',
      '2026-09-22',
      '2026-09-21',
      '2026-09-20',
    ])
  })

  it('pins the page-1 request count when the newest day fills the page: one request', async () => {
    const { seen } = fakeTyro({
      transactions: { '2026-09-26': [{ rows: [tx('a'), tx('b'), tx('c')] }] },
    })
    const params = withPageSink({
      page: 1,
      limit: 2,
      updatedAfter: new Date('2023-01-01T00:00:00Z'),
    } as QueryParams)
    const out = await new TyroAdapter().listCharges(creds, params)
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(seen).toHaveLength(1)
  })

  it('clamps an updated_after older than the retention to 3 years, with a 2-day margin at every hour', async () => {
    // At 23:00Z the Australian business day is already 2026-09-28, so the day
    // exactly 3 years back from it (2023-09-28) is outside the window.
    vi.setSystemTime(new Date('2026-09-27T23:00:00Z'))
    const { seen } = fakeTyro({})
    await new TyroAdapter().listCharges(creds, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2020-01-01T00:00:00Z'),
    })
    const dates = seen.map((s) => s.query.transactionDate)
    expect(dates[0]).toBe('2026-09-26')
    expect(dates.at(-1)).toBe('2023-09-29')
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('keys the walk by its date window, so walks over different windows never share rows', async () => {
    fakeTyro({
      transactions: { '2026-09-26': [{ rows: [tx('a')] }], '2026-09-25': [{ rows: [tx('b')] }] },
    })
    const adapter = new TyroAdapter()
    expect(
      (
        await adapter.listCharges(creds, {
          page: 1,
          limit: 1,
          updatedAfter: new Date('2026-09-25T00:00:00Z'),
        })
      ).map((c) => c.id),
    ).toEqual(['a'])
    const params = withPageSink({
      page: 2,
      limit: 1,
      updatedAfter: new Date('2026-09-26T00:00:00Z'),
    } as QueryParams)
    expect(await adapter.listCharges(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('keeps its paging cache across a token refresh (the key follows the client credentials)', async () => {
    const { seen } = fakeTyro({
      transactions: { '2026-09-26': [{ rows: [tx('a'), tx('b')] }] },
    })
    const adapter = new TyroAdapter()
    const ua = new Date('2026-09-26T00:00:00Z')
    await adapter.listCharges(creds, { page: 1, limit: 1, updatedAfter: ua })
    const before = seen.length
    const refreshed = { ...creds, accessToken: 'jwt-2' }
    const out = await adapter.listCharges(refreshed, { page: 2, limit: 1, updatedAfter: ua })
    expect(out.map((c) => c.id)).toEqual(['b'])
    expect(seen.length).toBe(before)
  })

  it('throws on a transactions response missing a required field instead of reading it as empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ terminalBusinessDay: '2026-09-26', transactions: [] })),
    )
    await expect(
      new TyroAdapter().listCharges(creds, {
        page: 1,
        limit: 1,
        updatedAfter: new Date('2026-09-26T00:00:00Z'),
      }),
    ).rejects.toThrow(/missing a required field/)
  })

  it('refuses with 501 and sends nothing when the connection has no mid', async () => {
    const { fetchFn } = fakeTyro({})
    const noMid = { ...creds, extra: { clientId: 'cid', clientSecret: 'csec', currency: 'AUD' } }
    await expect(
      new TyroAdapter().listCharges(noMid, {
        page: 1,
        updatedAfter: new Date('2026-09-26T00:00:00Z'),
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses with 501 and sends nothing when the connection has no currency', async () => {
    const { fetchFn } = fakeTyro({})
    const noCur = { ...creds, extra: { clientId: 'cid', clientSecret: 'csec', mid: '122' } }
    await expect(
      new TyroAdapter().listCharges(noCur, {
        page: 1,
        updatedAfter: new Date('2026-09-26T00:00:00Z'),
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('getCharge refuses with 501 and sends nothing (no lookup by id is documented)', async () => {
    const { fetchFn } = fakeTyro({})
    await expect(new TyroAdapter().getCharge()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('tyro listPayouts (Reporting settlements)', () => {
  it('sends only settlementDate and walks N = 2L+1 settlements across uneven days', async () => {
    const L = 2
    const { seen } = fakeTyro({
      settlements: {
        '2026-09-26': [st('s1'), st('s2'), st('s3')],
        '2026-09-25': [],
        '2026-09-24': [st('s4'), st('s5')],
      },
    })
    const adapter = new TyroAdapter()
    const ids: string[] = []
    const more: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({
        page,
        limit: L,
        updatedAfter: new Date('2026-09-24T08:00:00Z'),
      } as QueryParams)
      const rows = await adapter.listPayouts(creds, params)
      for (const r of rows) PayoutSchema.parse(r)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore === true)
    }
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(more).toEqual([true, true, false])
    expect(new Set(seen.map((s) => JSON.stringify(s.query)))).toEqual(
      new Set([
        '{"settlementDate":"2026-09-26"}',
        '{"settlementDate":"2026-09-25"}',
        '{"settlementDate":"2026-09-24"}',
      ]),
    )
  })

  it('refuses an unfiltered list with 501 naming updated_after, and sends nothing', async () => {
    const { fetchFn } = fakeTyro({})
    const err = await new TyroAdapter().listPayouts(creds, { page: 1, limit: 10 }).catch((e) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String(err.message)).toMatch(/updated_after/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses an Invalid Date updated_after with 501, and sends nothing', async () => {
    const { fetchFn } = fakeTyro({})
    const err = await new TyroAdapter()
      .listPayouts(creds, { page: 1, limit: 10, updatedAfter: new Date('x') })
      .catch((e) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('pins the page-1 request count: one settlementDate per day of the window', async () => {
    const { seen } = fakeTyro({})
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-24T00:00:00Z'),
    } as QueryParams)
    expect(await new TyroAdapter().listPayouts(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen.map((s) => s.query.settlementDate)).toEqual([
      '2026-09-26',
      '2026-09-25',
      '2026-09-24',
    ])
  })

  it('clamps an updated_after older than the retention to the 3-year bound', async () => {
    const { seen } = fakeTyro({})
    await new TyroAdapter().listPayouts(creds, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2019-06-01T00:00:00Z'),
    })
    expect(seen[0]!.query.settlementDate).toBe('2026-09-26')
    expect(seen.at(-1)!.query.settlementDate).toBe('2023-09-29')
  })

  it('refuses with 501 and sends nothing when the connection has no mid', async () => {
    const { fetchFn } = fakeTyro({})
    const noMid = { ...creds, extra: { clientId: 'cid', clientSecret: 'csec', currency: 'AUD' } }
    await expect(
      new TyroAdapter().listPayouts(noMid, {
        page: 1,
        updatedAfter: new Date('2026-09-26T00:00:00Z'),
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('throws on a settlements response missing a required field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ mid: '122', settlementDate: '2026-09-26' })),
    )
    await expect(
      new TyroAdapter().listPayouts(creds, {
        page: 1,
        limit: 1,
        updatedAfter: new Date('2026-09-26T00:00:00Z'),
      }),
    ).rejects.toThrow(/missing a required field/)
  })

  it('getPayout refuses with 501 and sends nothing', async () => {
    const { fetchFn } = fakeTyro({})
    await expect(new TyroAdapter().getPayout()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('tyro client-credentials auth', () => {
  it('mints a JWT with the documented form fields and App audience', async () => {
    const calls: { url: string; body: string; ct: string | null }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: String(init?.body),
          ct: new Headers(init?.headers).get('content-type'),
        })
        return Response.json({ access_token: 'jwt-new', expires_in: 43200, token_type: 'Bearer' })
      }),
    )
    const c = await new TyroAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'csec',
      mid: '122',
      currency: 'aud',
    })
    expect(calls[0]!.url).toBe('https://auth.connect.tyro.com/oauth/token')
    expect(calls[0]!.ct).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.body))).toEqual({
      client_id: 'cid',
      client_secret: 'csec',
      grant_type: 'client_credentials',
      audience: 'https://app.connect.tyro',
    })
    expect(c.accessToken).toBe('jwt-new')
    expect(c.expiresAt?.getTime()).toBe(NOW.getTime() + 43200 * 1000)
    expect(c.extra).toEqual({ clientId: 'cid', clientSecret: 'csec', mid: '122', currency: 'AUD' })

    expect(calls).toHaveLength(1)
  })

  it('caches the JWT per client credentials: connections sharing a client_id mint once', async () => {
    let n = 0
    const fetchFn = vi.fn(async () =>
      Response.json({ access_token: `jwt-${++n}`, expires_in: 43200, token_type: 'Bearer' }),
    )
    vi.stubGlobal('fetch', fetchFn)
    const adapter = new TyroAdapter()
    const a = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'csec', mid: '1' })
    const b = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'csec', mid: '2' })
    const r1 = await adapter.refreshCredentials(a)
    expect([a.accessToken, b.accessToken, r1.accessToken]).toEqual(['jwt-1', 'jwt-1', 'jwt-1'])
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // A different client_id is a different partner credential: its own token.
    await adapter.exchangeCredentials({ clientId: 'other', clientSecret: 'csec' })
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // A rotated client_secret is a new credential too: it never reuses the old token.
    const rotated = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'rotated' })
    expect(rotated.accessToken).toBe('jwt-3')
    expect(fetchFn).toHaveBeenCalledTimes(3)

    // Near expiry the refresh mints again, keeping the connection's own extra.
    vi.setSystemTime(new Date(NOW.getTime() + 43200 * 1000 - 60_000))
    const r2 = await adapter.refreshCredentials(b)
    expect(r2.accessToken).toBe('jwt-4')
    expect(r2.extra).toEqual(b.extra)
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('rejects a token response with an empty access_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ access_token: '', expires_in: 43200 })),
    )
    await expect(
      new TyroAdapter().exchangeCredentials({ clientId: 'cid', clientSecret: 'csec' }),
    ).rejects.toThrow(/no access_token/)
  })

  it('retries a 429 and a 5xx with backoff, then returns the body', async () => {
    const statuses = [429, 503]
    const fetchFn = vi.fn(async () => {
      const st = statuses.shift()
      return st ? new Response('', { status: st }) : Response.json({ ok: 1 })
    })
    const sleeps: number[] = []
    const client = new TyroClient(creds, fetchFn as unknown as typeof fetch, async (ms) => {
      sleeps.push(ms)
    })
    await expect(client.get('/x', {})).resolves.toEqual({ ok: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1000, 2000])
  })

  it('getAuthUrl refuses: there is no authorization-code flow for App integrations', () => {
    expect(() => new TyroAdapter().getAuthUrl()).toThrow(/client-credentials/)
  })
})
