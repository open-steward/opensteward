/**
 * Tink adapter against a fake of the documented Tink API.
 *
 * The fake honours only documented parameters (https://docs.tink.com/api):
 *   POST /api/v1/oauth/token (form): client_id, client_secret, grant_type
 *     (authorization_code | client_credentials | urn:ietf:params:oauth:grant-type:jwt-bearer), scope
 *   GET /payment/v1/merchants/{merchantId}/accounts/{accountId}: appIdEq
 *   GET .../transactions: pageSize, pageToken, timestampLte, timestampGte,
 *     referenceEq, paymentRequestIdEq, typeEq, queryString, appIdEq
 *   GET .../transactions/{transactionId}: appIdEq
 *   GET .../refunds: pageSize, pageToken, createdTimeLte, createdTimeGte,
 *     referenceEq, transactionIdEq
 *   GET .../refunds/{refundId}
 * and answers { nextPageToken, prevPageToken, totalSize, transactions|refunds }.
 * In `quirk` mode the last page still carries a non-empty nextPageToken, as
 * the documented example's only page carries `"nextPageToken" : "MA="`, so
 * totalSize (or, without it, an empty page) ends the walk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { TinkAdapter } from '../../../../../../src/verticals/payments/adapters/tink'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { BalanceTransactionSchema } from '../../../../../../src/verticals/payments/schema/balance-transaction'
import {
  ACCOUNT,
  CLIENT_TOKEN,
  LIST_REFUNDS,
  LIST_TRANSACTIONS,
  REFUND,
  TRANSACTION,
} from './fixtures'

const M = 'bef35277-ec45-4445-a153-05dbb42390df'
const A = '744cf927-29cd-475e-9ef2-2b11951d3cc9'
const BASE = `/payment/v1/merchants/${M}/accounts/${A}`
const TOKEN_URL = 'https://api.tink.com/api/v1/oauth/token'

const CONN = { clientId: 'conn-client', clientSecret: 'conn-secret', merchantId: M, accountId: A }

const CREDS: Credentials = {
  accessToken: 'client-access-token',
  expiresAt: new Date('2099-01-01T00:00:00Z'),
  extra: { ...CONN },
}

const TX_PARAMS = new Set([
  'pageSize',
  'pageToken',
  'timestampLte',
  'timestampGte',
  'referenceEq',
  'paymentRequestIdEq',
  'typeEq',
  'queryString',
  'appIdEq',
])
const REFUND_PARAMS = new Set([
  'pageSize',
  'pageToken',
  'createdTimeLte',
  'createdTimeGte',
  'referenceEq',
  'transactionIdEq',
])
const TOKEN_FIELDS = new Set(['client_id', 'client_secret', 'grant_type', 'scope', 'code'])
const GRANTS = new Set([
  'authorization_code',
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:jwt-bearer',
])

interface Req {
  method: string
  url: URL
  headers: Record<string, string>
  body?: URLSearchParams
}

interface FakeOpts {
  transactions?: Array<Record<string, unknown>>
  refunds?: Array<Record<string, unknown>>
  /** Keep a non-empty nextPageToken on the last page (one past the end), as the documented example keeps "MA=". */
  quirk?: boolean
  /** Serve at most this many rows per page, whatever pageSize asks (an undocumented cap). */
  cap?: number
  /** Omit totalSize (it is not required). */
  noTotal?: boolean
  /** On the last page, answer a token that points back at this offset, or at the page itself. */
  loopTo?: number | 'self'
  /** Report totalSize as this, whatever the filter (a total that ignores typeEq). */
  total?: number
  accountStatus?: number
  tokenStatus?: number
}

function fakeTink(opts: FakeOpts = {}) {
  const requests: Req[] = []
  let minted = 0
  const page = (
    rows: Array<Record<string, unknown>>,
    q: URLSearchParams,
    key: 'transactions' | 'refunds',
  ) => {
    const size = q.has('pageSize') ? Number(q.get('pageSize')) : 25
    if (!Number.isInteger(size) || size < 1) throw new Error(`bad pageSize ${q.get('pageSize')}`)
    const served = Math.min(size, opts.cap ?? size)
    const start = q.has('pageToken')
      ? Number(Buffer.from(q.get('pageToken')!, 'base64').toString())
      : 0
    const data = rows.slice(start, start + served)
    const end = start + data.length
    const b64 = (n: number) => Buffer.from(String(n)).toString('base64')
    const next = end < rows.length ? b64(end) : ''
    const loop = opts.loopTo === undefined ? '' : b64(opts.loopTo === 'self' ? start : opts.loopTo)
    return {
      nextPageToken: next || loop || (opts.quirk ? b64(rows.length) : ''),
      prevPageToken: 'MA==',
      ...(opts.noTotal ? {} : { totalSize: String(opts.total ?? rows.length) }),
      [key]: data,
    }
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.origin !== 'https://api.tink.com') throw new Error(`unexpected host ${url.origin}`)

    if (method === 'POST' && url.href === TOKEN_URL) {
      const body = new URLSearchParams(String(init?.body ?? ''))
      requests.push({ method, url, headers, body })
      for (const k of body.keys()) if (!TOKEN_FIELDS.has(k)) throw new Error(`undocumented ${k}`)
      if (!GRANTS.has(body.get('grant_type') ?? '')) throw new Error('undocumented grant_type')
      if (opts.tokenStatus) return json(opts.tokenStatus, { errorMessage: 'Invalid client secret' })
      minted++
      return json(200, { ...CLIENT_TOKEN, access_token: `client-access-token-${minted}` })
    }

    requests.push({ method, url, headers })
    if (method !== 'GET') throw new Error(`unexpected ${method}`)
    if (!/^Bearer .+/.test(headers['authorization'] ?? '')) return json(401, {})
    const q = url.searchParams
    const p = url.pathname
    if (p === BASE) {
      for (const k of q.keys()) if (k !== 'appIdEq') throw new Error(`undocumented ${k}`)
      return opts.accountStatus ? json(opts.accountStatus, {}) : json(200, ACCOUNT)
    }
    if (p === `${BASE}/transactions`) {
      for (const k of q.keys()) if (!TX_PARAMS.has(k)) throw new Error(`undocumented ${k}`)
      const typeEq = q.get('typeEq')
      const rows = (opts.transactions ?? []).filter((t) => !typeEq || t.type === typeEq)
      return json(200, page(rows, q, 'transactions'))
    }
    if (p.startsWith(`${BASE}/transactions/`)) {
      for (const k of q.keys()) if (k !== 'appIdEq') throw new Error(`undocumented ${k}`)
      const id = decodeURIComponent(p.slice(`${BASE}/transactions/`.length))
      const hit = (opts.transactions ?? []).find((t) => t.id === id)
      return hit ? json(200, hit) : json(404, {})
    }
    if (p === `${BASE}/refunds`) {
      for (const k of q.keys()) if (!REFUND_PARAMS.has(k)) throw new Error(`undocumented ${k}`)
      return json(200, page(opts.refunds ?? [], q, 'refunds'))
    }
    if (p.startsWith(`${BASE}/refunds/`)) {
      if ([...q.keys()].length) throw new Error('undocumented query on get refund')
      const id = decodeURIComponent(p.slice(`${BASE}/refunds/`.length))
      const hit = (opts.refunds ?? []).find((r) => r.id === id)
      return hit ? json(200, hit) : json(404, {})
    }
    return json(404, {})
  })
  vi.stubGlobal('fetch', fetchImpl)
  return { fetchImpl, requests }
}

const txs = (n: number, type: string) =>
  Array.from({ length: n }, (_, i) => ({ ...TRANSACTION, id: `${type}-${i}`, type }))
const refunds = (n: number) => Array.from({ length: n }, (_, i) => ({ ...REFUND, id: `rf-${i}` }))

/** A mixed ledger: every type interleaved, so typeEq filtering matters. */
function ledger(nPayin: number, nSweep: number, nOther: number) {
  const out = [...txs(nPayin, 'PAYIN'), ...txs(nSweep, 'SWEEP'), ...txs(nOther, 'REFUND')]
  return out.sort((a, b) => (a.id.split('-')[1]! < b.id.split('-')[1]! ? -1 : 1))
}

type ListFn = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>

async function walk(call: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= 20; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(params)
    ids.push(...rows.map((r) => r.id))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (!more) break
  }
  return { ids, hasMore }
}

function adapter(): TinkAdapter {
  return new TinkAdapter()
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const L = 3

describe.each([
  ['listCharges', 'PAYIN', ChargeSchema],
  ['listPayouts', 'SWEEP', PayoutSchema],
  ['listBalanceTransactions', undefined, BalanceTransactionSchema],
  ['listRefunds', undefined, RefundSchema],
] as const)('%s', (method, typeEq, schema) => {
  const isRefunds = method === 'listRefunds'
  const path = isRefunds ? `${BASE}/refunds` : `${BASE}/transactions`
  /** 2L+1 matching rows, plus rows of other types the typeEq filter must drop. */
  const setup = (o: FakeOpts = {}) => {
    const rows: Array<Record<string, unknown> & { id: string }> = isRefunds
      ? refunds(2 * L + 1)
      : typeEq === 'PAYIN'
        ? ledger(2 * L + 1, 4, 2)
        : typeEq === 'SWEEP'
          ? ledger(4, 2 * L + 1, 2)
          : ledger(3, 2, 2)
    const want = isRefunds ? rows : rows.filter((r) => !typeEq || r.type === typeEq)
    const fake = fakeTink(isRefunds ? { ...o, refunds: rows } : { ...o, transactions: rows })
    return { want: want.map((r) => r.id), fake }
  }
  const call = (p: QueryParams) => {
    const a = adapter()
    return (a[method] as ListFn).call(a, CREDS, p)
  }

  it.each([
    ['empty token on the last page', {}],
    ['documented "MA=" token on the last page, ended by totalSize', { quirk: true }],
  ])('walks N = 2L+1 rows by pageToken (%s): every id once, hasMore exact', async (_n, o) => {
    const { want, fake } = setup(o)
    expect(want).toHaveLength(isRefunds || typeEq ? 2 * L + 1 : 7)
    const { ids, hasMore } = await walk(call, L)
    expect(ids).toEqual(want)
    expect(new Set(ids).size).toBe(ids.length)
    const pages = Math.ceil(want.length / L)
    expect(hasMore).toEqual([...Array(pages - 1).fill(true), false])
    // One request per page on a sequential walk, at the caller's exact limit.
    const gets = fake.requests.filter((r) => r.url.pathname === path)
    expect(gets).toHaveLength(pages)
    for (const r of gets) {
      expect(r.url.searchParams.get('pageSize')).toBe(String(L))
      expect(r.url.searchParams.get('typeEq')).toBe(typeEq ?? null)
      expect(r.headers['authorization']).toBe('Bearer client-access-token')
    }
    expect(gets[0]!.url.searchParams.has('pageToken')).toBe(false)
    expect(gets[1]!.url.searchParams.get('pageToken')).toBeTruthy()
  })

  it('ends on an empty page when no totalSize is sent and the token never empties', async () => {
    const { want } = setup({ quirk: true, noTotal: true })
    const { ids, hasMore } = await walk(call, L)
    expect(ids).toEqual(want)
    expect(hasMore.at(-1)).toBe(false)
  })

  it.each([
    ['back to the start, no totalSize', { loopTo: 0, noTotal: true }],
    ['back to the start, totalSize ignoring the filter', { loopTo: 0, total: 50 }],
    ['to the page itself, no totalSize', { loopTo: 'self' as const, noTotal: true }],
    ['to the page itself, totalSize ignoring the filter', { loopTo: 'self' as const, total: 50 }],
  ])('a last-page token that loops (%s) ends the walk: every id once', async (_n, o) => {
    const { want, fake } = setup(o)
    const { ids, hasMore } = await walk(call, L)
    expect(ids).toEqual(want)
    expect(hasMore.at(-1)).toBe(false)
    const pages = Math.ceil(want.length / L)
    expect(fake.requests.filter((r) => r.url.pathname === path).length).toBeLessThanOrEqual(
      pages + 1,
    )
  })

  it('never reuses a cursor minted at another page size', async () => {
    const { want } = setup()
    await call(withPageSink({ page: 1, limit: L }))
    const out = await call(withPageSink({ page: 2, limit: 2 }))
    expect(out.map((r) => r.id)).toEqual(want.slice(2, 4))
  })

  it('ends on an empty nextPageToken without totalSize, asking for no page past it', async () => {
    const { want, fake } = setup({ noTotal: true })
    const { ids, hasMore } = await walk(call, L)
    expect(ids).toEqual(want)
    const pages = Math.ceil(want.length / L)
    expect(hasMore).toEqual([...Array(pages - 1).fill(true), false])
    expect(fake.requests.filter((r) => r.url.pathname === path)).toHaveLength(pages)
  })

  it('serves page 2 on a cold cache by walking from page 1', async () => {
    const { want, fake } = setup()
    const out = await call(withPageSink({ page: 2, limit: L }))
    expect(out.map((r) => r.id)).toEqual(want.slice(L, 2 * L))
    expect(fake.requests.filter((r) => r.url.pathname === path)).toHaveLength(2)
  })

  it('parses every row with the canonical schema', async () => {
    setup()
    const out = await call(withPageSink({ page: 1, limit: 50 }))
    expect(out.length).toBeGreaterThan(0)
    for (const row of out) expect(() => schema.parse(row)).not.toThrow()
  })

  it('sends the router ceiling (500) unclamped: no maximum pageSize is documented', async () => {
    const { fake } = setup()
    await call(withPageSink({ page: 1, limit: 500 }))
    expect(
      fake.requests.find((r) => r.url.pathname === path)!.url.searchParams.get('pageSize'),
    ).toBe('500')
  })

  it('reports the size the platform served when it caps a page that is not the last', async () => {
    setup({ cap: 2 })
    const params = withPageSink({ page: 1, limit: L })
    const out = await call(params)
    expect(out).toHaveLength(2)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 2 })
  })

  it('reports no pageSize for a full page or a short last page', async () => {
    setup()
    const full = withPageSink({ page: 1, limit: L })
    expect(await call(full)).toHaveLength(L)
    expect(readUpstreamPage(full)).toMatchObject({ hasMore: true })
    expect(readUpstreamPage(full)?.pageSize).toBeUndefined()
    const last = withPageSink({ page: 3, limit: L })
    expect(await call(last)).toHaveLength(1)
    expect(readUpstreamPage(last)).toMatchObject({ hasMore: false })
    expect(readUpstreamPage(last)?.pageSize).toBeUndefined()
  })

  it('sends no date filter for updatedAfter (both date filters would drop rows)', async () => {
    const { fake } = setup()
    await call({ page: 1, limit: L, updatedAfter: new Date('2024-01-01T00:00:00Z') })
    const q = fake.requests.find((r) => r.url.pathname === path)!.url.searchParams
    expect([...q.keys()].sort()).toEqual(typeEq ? ['pageSize', 'typeEq'] : ['pageSize'])
  })

  it('refuses with 501 before any request when the connection has no settlement ids', async () => {
    const { fetchImpl } = fakeTink()
    for (const extra of [
      undefined,
      { merchantId: M },
      { accountId: A },
      { merchantId: ' ', accountId: A },
    ]) {
      await expect(
        (adapter()[method] as ListFn).call(
          adapter(),
          { accessToken: 'user-token', extra },
          { limit: 5 },
        ),
      ).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Tink cannot list .*merchantId\/accountId.*reconnect/),
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a body without the required rows array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: 'x' }), { status: 200 })),
    )
    await expect(call({ page: 1, limit: L })).rejects.toThrow(/array/)
  })
})

describe('totalCount', () => {
  it('publishes totalSize for an unfiltered list', async () => {
    fakeTink({ transactions: ledger(3, 2, 2) })
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listBalanceTransactions(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(7)
  })

  it('does not publish it for a typeEq-filtered list (not documented as filtered)', async () => {
    fakeTink({ transactions: ledger(3, 2, 2) })
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listCharges(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })
})

describe('get by id', () => {
  const rows = [
    { ...TRANSACTION, id: 'tx-payin', type: 'PAYIN' },
    { ...TRANSACTION, id: 'tx-sweep', type: 'SWEEP' },
    { ...TRANSACTION, id: 'tx-refund', type: 'REFUND' },
  ]

  it('getCharge reads GET .../transactions/{transactionId} and returns a PAYIN', async () => {
    const { requests } = fakeTink({ transactions: rows })
    const c = await adapter().getCharge(CREDS, 'tx-payin')
    expect(ChargeSchema.parse(c).id).toBe('tx-payin')
    expect(requests.map((r) => r.url.pathname)).toEqual([`${BASE}/transactions/tx-payin`])
  })

  it.each([
    ['getCharge', 'tx-sweep'],
    ['getPayout', 'tx-payin'],
  ] as const)('%s answers 404 for a settlement transaction of another type', async (m, id) => {
    fakeTink({ transactions: rows })
    await expect(adapter()[m](CREDS, id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getPayout returns a SWEEP', async () => {
    fakeTink({ transactions: rows })
    expect(PayoutSchema.parse(await adapter().getPayout(CREDS, 'tx-sweep')).status).toBe('paid')
  })

  it('getBalanceTransaction returns any type', async () => {
    fakeTink({ transactions: rows })
    const b = await adapter().getBalanceTransaction(CREDS, 'tx-refund')
    expect(BalanceTransactionSchema.parse(b).type).toBe('refund')
  })

  it('getRefund reads GET .../refunds/{refundId}', async () => {
    const { requests } = fakeTink({ refunds: [REFUND] })
    const r = await adapter().getRefund(CREDS, REFUND.id)
    expect(RefundSchema.parse(r).id).toBe(REFUND.id)
    expect(requests.map((x) => x.url.pathname)).toEqual([`${BASE}/refunds/${REFUND.id}`])
  })

  it('encodes the id into the path', async () => {
    const { requests } = fakeTink({ transactions: rows })
    await expect(adapter().getBalanceTransaction(CREDS, 'a/b')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(requests[0]!.url.pathname).toBe(`${BASE}/transactions/a%2Fb`)
  })

  it('encodes the refund id into the path', async () => {
    const { requests } = fakeTink({ refunds: [REFUND] })
    await expect(adapter().getRefund(CREDS, 'a/b?c')).rejects.toMatchObject({ statusCode: 404 })
    expect(requests[0]!.url.pathname).toBe(`${BASE}/refunds/a%2Fb%3Fc`)
    expect(requests[0]!.url.search).toBe('')
  })

  it('encodes the merchant and account ids into the path', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ transactions: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchImpl)
    await adapter().listBalanceTransactions(
      { accessToken: 't', extra: { ...CONN, merchantId: 'm/1?x', accountId: 'a/2#y' } },
      { page: 1, limit: L },
    )
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]))
    expect(url.pathname).toBe('/payment/v1/merchants/m%2F1%3Fx/accounts/a%2F2%23y/transactions')
    expect(url.searchParams.get('x')).toBeNull()
  })

  it.each(['getCharge', 'getPayout', 'getRefund', 'getBalanceTransaction'] as const)(
    '%s refuses with 501 before any request without settlement ids',
    async (m) => {
      const { fetchImpl } = fakeTink({ transactions: rows })
      await expect(adapter()[m]({ accessToken: 'user-token' }, 'x')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Tink cannot read /),
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )
})

describe('the documented example envelopes', () => {
  it('reads the documented list-transactions example as one page, no more', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(LIST_TRANSACTIONS), { status: 200 })),
    )
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await adapter().listCharges(CREDS, params)
    expect(out.map((c) => c.id)).toEqual([TRANSACTION.id])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reads the documented list-refunds example as one page, no more', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(LIST_REFUNDS), { status: 200 })),
    )
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await adapter().listRefunds(CREDS, params)
    expect(out.map((r) => r.id)).toEqual([REFUND.id])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 1 })
  })
})

describe("auth (oauth2_cc: the connection's own Tink app and settlement account)", () => {
  it('has no redirect flow', async () => {
    expect(() => adapter().getAuthUrl()).toThrow(/oauth2_cc/)
    await expect(adapter().exchangeCode()).rejects.toThrow(/exchangeCredentials/)
  })

  it('asks the connection for its own app credentials and settlement account ids', () => {
    expect(
      adapter()
        .credentialFields()
        .map((f) => [f.name, f.type, f.required]),
    ).toEqual([
      ['clientId', 'text', true],
      ['clientSecret', 'password', true],
      ['merchantId', 'text', true],
      ['accountId', 'text', true],
    ])
  })

  it('exchangeCredentials mints a client token with the connection app and proves the settlement account', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'))
    const { requests } = fakeTink()
    const creds = await adapter().exchangeCredentials({
      clientId: ' conn-client ',
      clientSecret: ' conn-secret ',
      merchantId: ` ${M} `,
      accountId: ` ${A} `,
    })

    expect(requests).toHaveLength(2)
    const [mint, probe] = requests
    expect(mint!.url.href).toBe(TOKEN_URL)
    expect(mint!.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(mint!.body!)).toEqual({
      client_id: 'conn-client',
      client_secret: 'conn-secret',
      grant_type: 'client_credentials',
      scope: 'settlement-accounts:readonly',
    })
    expect(probe!.url.pathname).toBe(BASE)
    expect(probe!.headers['authorization']).toBe('Bearer client-access-token-1')

    expect(creds).toEqual({
      accessToken: 'client-access-token-1',
      expiresAt: new Date('2026-09-27T12:30:00Z'),
      scope: 'settlement-accounts:readonly',
      extra: CONN,
    })
    expect(creds.refreshToken).toBeUndefined()
  })

  it('ignores the platform config: an operator app never mints a connection token', async () => {
    const { requests } = fakeTink()
    await new TinkAdapter({ clientId: 'op-client', clientSecret: 'op-secret' }).exchangeCredentials(
      CONN,
    )
    expect(requests[0]!.body!.get('client_id')).toBe('conn-client')
    expect(requests[0]!.body!.get('client_secret')).toBe('conn-secret')
  })

  it.each([403, 404])(
    'exchangeCredentials rejects a settlement account the app cannot reach (%i) as a 400',
    async (status) => {
      fakeTink({ accountStatus: status })
      await expect(adapter().exchangeCredentials(CONN)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/not reachable.*Merchant ID and Settlement account ID/),
      })
    },
  )

  it('exchangeCredentials surfaces a token-endpoint failure', async () => {
    fakeTink({ tokenStatus: 401 })
    await expect(adapter().exchangeCredentials(CONN)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/token endpoint returned 401/),
    })
  })

  it.each([
    [{ ...CONN, clientId: '' }, /Client ID is required/],
    [{ ...CONN, clientSecret: ' ' }, /Client secret is required/],
    [{ ...CONN, merchantId: '  ' }, /Merchant ID is required/],
    [{ ...CONN, accountId: '' }, /Settlement account ID is required/],
  ])('exchangeCredentials refuses a missing field before any request (%#)', async (fields, msg) => {
    const { fetchImpl } = fakeTink()
    await expect(adapter().exchangeCredentials(fields)).rejects.toThrow(msg)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('constructs with no config at all', () => {
    expect(new TinkAdapter().platform).toBe('tink')
  })

  it("refreshCredentials runs a new client_credentials grant with the connection's app and keeps its extra", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T13:00:00Z'))
    const { requests } = fakeTink()
    const expired: Credentials = {
      accessToken: 'old-token',
      expiresAt: new Date('2026-09-27T12:59:30Z'),
      extra: { ...CONN },
    }
    const fresh = await adapter().refreshCredentials(expired)
    expect(requests).toHaveLength(1)
    expect(Object.fromEntries(requests[0]!.body!)).toEqual({
      client_id: 'conn-client',
      client_secret: 'conn-secret',
      grant_type: 'client_credentials',
      scope: 'settlement-accounts:readonly',
    })
    expect(fresh).toEqual({
      accessToken: 'client-access-token-1',
      expiresAt: new Date('2026-09-27T13:30:00Z'),
      scope: 'settlement-accounts:readonly',
      extra: CONN,
    })
  })

  it.each([
    ['a legacy Tink Link connection', { accessToken: 'user-token', refreshToken: 'rt' }],
    ['no client id', { accessToken: 't', extra: { ...CONN, clientId: undefined } }],
    ['no client secret', { accessToken: 't', extra: { ...CONN, clientSecret: '' } }],
    ['no merchant id', { accessToken: 't', extra: { ...CONN, merchantId: undefined } }],
    ['no account id', { accessToken: 't', extra: { ...CONN, accountId: ' ' } }],
  ])('refreshCredentials refuses %s, sending nothing', async (_n, creds) => {
    const { fetchImpl } = fakeTink()
    await expect(adapter().refreshCredentials(creds as Credentials)).rejects.toThrow(/reconnect/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a token response without access_token is an error, not a connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ token_type: 'bearer' }), { status: 200 })),
    )
    await expect(adapter().refreshCredentials(CREDS)).rejects.toThrow(/no access_token/)
  })
})
