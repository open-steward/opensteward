/**
 * Bridge list paging, request shape and auth.
 *
 * https://docs.bridgeapi.io/docs/basics.md:
 *   headers on every endpoint: `Client-Id`, `Client-Secret`, `Bridge-Version` - `2025-01-15`
 *   "Bridge uses a cursor-based pagination via the `after` parameter."
 *   `limit`: "Number of results per call. Accepted values: 1 - 500. Default 50."
 *   `next_uri`: "the API will build the next call into `next_uri` together
 *    with all the current pagination parameters. Can be `null` if there are
 *    no more results in the list."
 *
 * Paths: GET /v3/payment/payment-requests (reference/getpaymentrequests.md),
 * GET /v3/payment/payment-requests/{id} (reference/getpaymentrequest.md),
 * GET /v3/payment/payment-account/payouts (reference/listpayouts.md),
 * GET /v3/payment/payment-account/payouts/{id} (reference/getpayout.md).
 *
 * The fake honours only `limit` and `after`, rejects any other query
 * parameter, a limit outside 1-500, a missing or wrong auth header, and a
 * cursor minted under another limit or for another application. Payment requests carry an uneven number
 * of transactions (0-3), so one upstream page is not one caller page.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { BridgeOpenBankingAdapter } from '../../../../../../src/verticals/payments/adapters/bridge-open-banking/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'

const ORIGIN = 'https://api.bridgeapi.io'
const PR_PATH = '/v3/payment/payment-requests'
const PO_PATH = '/v3/payment/payment-account/payouts'
const DOCUMENTED = new Set(['limit', 'after'])

const adapter = new BridgeOpenBankingAdapter()
const CREDS = { accessToken: 'SECRET_A', extra: { clientId: 'CLIENT_A' } }

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

/** Transactions per payment request: uneven, including empty requests. */
const SHAPE = [1, 2, 0, 3, 1, 1, 2]

function paymentRequests(txCount: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  let made = 0
  for (let r = 0; made < txCount; r++) {
    const k = Math.min(SHAPE[r % SHAPE.length]!, txCount - made)
    out.push({
      id: `pr${String(r).padStart(3, '0')}`,
      status: 'ACSC',
      created_at: '2024-12-23T15:35:06.558Z',
      updated_at: '2024-12-23T16:36:03.152Z',
      transactions: Array.from({ length: k }, (_, j) => ({
        id: `tx${String(made + j).padStart(3, '0')}`,
        status: 'ACSC',
        amount: 200,
        currency: 'EUR',
        label: 'payment label',
      })),
    })
    made += k
  }
  return out
}

function payouts(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `po${String(i).padStart(3, '0')}`,
    status: 'paid',
    label: 'Payout Bridge',
    amount: 20,
    currency: 'EUR',
    type: 'manual',
    created_at: '2024-12-04T16:16:41.287Z',
    updated_at: '2024-12-04T16:16:41.446Z',
  }))
}

type Collections = Record<string, Record<string, unknown>[]>

/**
 * `collections` belong to CLIENT_A/SECRET_A; `others` adds further
 * applications, keyed by client id, each with its own secret and data.
 */
function fakeBridge(
  collectionsA: Collections,
  others: Record<string, { secret: string; collections: Collections }> = {},
): void {
  seen = []
  const tenants: Record<string, { secret: string; collections: Collections }> = {
    CLIENT_A: { secret: 'SECRET_A', collections: collectionsA },
    ...others,
  }
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const h = (name: string) => String(config.headers?.get?.(name) ?? config.headers?.[name] ?? '')
    if (url.origin !== ORIGIN) throw httpError(404, `no such host ${url.origin}`)
    const tenant = tenants[h('Client-Id')]
    if (!tenant || h('Client-Secret') !== tenant.secret)
      throw httpError(401, 'client_id and client_secret are invalid')
    const collections = tenant.collections
    if (h('Bridge-Version') !== '2025-01-15') throw httpError(400, 'Bridge-Version required')
    if (h('Authorization') !== '') throw httpError(400, 'unexpected Authorization header')

    const single = /^(.*)\/([^/]+)$/.exec(url.pathname)
    if (!collections[url.pathname] && single && collections[single[1]!]) {
      const row = collections[single[1]!]!.find((r) => r.id === single[2])
      if (!row) throw httpError(404, 'not found')
      return { data: row, status: 200, statusText: 'OK', headers: {}, config, request: {} }
    }
    const rows = collections[url.pathname]
    if (!rows) throw httpError(404, `no route ${url.pathname}`)
    for (const k of url.searchParams.keys())
      if (!DOCUMENTED.has(k)) throw httpError(400, `unknown parameter ${k}`)
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw httpError(400, 'limit must be 1-500')
    let first = 0
    const after = url.searchParams.get('after')
    if (after !== null) {
      const c = JSON.parse(Buffer.from(after, 'base64').toString('utf8')) as {
        o: number
        l: number
        t: string
      }
      if (c.l !== limit) throw httpError(400, 'cursor minted under another limit')
      if (c.t !== h('Client-Id')) throw httpError(400, 'cursor minted for another application')
      first = c.o
    }
    const end = first + limit
    const next =
      end < rows.length
        ? `${url.pathname}?limit=${limit}&after=${Buffer.from(JSON.stringify({ o: end, l: limit, t: h('Client-Id') })).toString('base64')}`
        : null
    return {
      data: {
        resources: rows.slice(first, end),
        generated_at: '2024-12-04T16:24:11.404Z',
        pagination: { next_uri: next },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listCharges' | 'listPayouts'

async function syncPage(method: Method, page: number, limit: number) {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await adapter[method](CREDS, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore, rows }
}

const chargeIds = (n: number) => {
  const ids: string[] = []
  for (const pr of paymentRequests(n))
    for (const tx of pr.transactions as { id: string }[]) ids.push(`${pr.id as string}:${tx.id}`)
  return ids
}
const payoutIds = (n: number) => payouts(n).map((p) => p.id as string)

const CASES = [
  ['listCharges', PR_PATH, (n: number) => ({ [PR_PATH]: paymentRequests(n) }), chargeIds],
  ['listPayouts', PO_PATH, (n: number) => ({ [PO_PATH]: payouts(n) }), payoutIds],
] as const

describe.each(CASES)('bridge-open-banking %s', (method, path, data, ids) => {
  const L = 5

  it('serves 2L+1 rows over pages 1, 2, 3, each once, hasMore exact', async () => {
    fakeBridge(data(2 * L + 1))
    const all = ids(2 * L + 1)
    expect(all).toHaveLength(2 * L + 1)
    const p1 = await syncPage(method, 1, L)
    const p2 = await syncPage(method, 2, L)
    const p3 = await syncPage(method, 3, L)
    expect([p1.ids, p1.hasMore]).toEqual([all.slice(0, L), true])
    expect([p2.ids, p2.hasMore]).toEqual([all.slice(L, 2 * L), true])
    expect([p3.ids, p3.hasMore]).toEqual([all.slice(2 * L), false])
    expect(new Set([...p1.ids, ...p2.ids, ...p3.ids]).size).toBe(2 * L + 1)
    const schema = method === 'listCharges' ? ChargeSchema : PayoutSchema
    for (const r of [...p1.rows, ...p2.rows, ...p3.rows]) schema.parse(r)
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeBridge(data(2 * L))
    const all = ids(2 * L)
    await syncPage(method, 1, L)
    const p2 = await syncPage(method, 2, L)
    expect([p2.ids, p2.hasMore]).toEqual([all.slice(L), false])
  })

  it('calls the documented path with limit, and the after cursor from next_uri', async () => {
    fakeBridge(data(2 * L + 1))
    await syncPage(method, 2, L)
    for (const u of seen) expect(u.pathname).toBe(path)
    expect(seen[0]!.searchParams.get('limit')).toBe(String(L))
    expect(seen[0]!.searchParams.has('after')).toBe(false)
    expect(seen.some((u) => u.searchParams.has('after'))).toBe(true)
  })

  it('keeps each connection on its own walk', async () => {
    const CREDS_B = { accessToken: 'SECRET_B', extra: { clientId: 'CLIENT_B' } }
    const n = 2 * L + 1
    const rowsB = (data(n) as Collections)[path]!.map((r) => ({ ...r, id: `b${r.id as string}` }))
    fakeBridge(data(n), { CLIENT_B: { secret: 'SECRET_B', collections: { [path]: rowsB } } })
    const all = ids(n)
    // Interleaved, so each page 2 follows the other connection's page 1.
    const a1 = await syncPage(method, 1, L)
    const b1 = await adapter[method](CREDS_B, withPageSink({ page: 1, limit: L }))
    const a2 = await syncPage(method, 2, L)
    const b2 = await adapter[method](CREDS_B, withPageSink({ page: 2, limit: L }))
    expect(a1.ids).toEqual(all.slice(0, L))
    expect(a2.ids).toEqual(all.slice(L, 2 * L))
    const bIds = [...b1, ...b2].map((r) => r.id)
    expect(bIds).toHaveLength(2 * L)
    for (const id of bIds) expect(id.startsWith('b')).toBe(true)
  })

  it('does not reuse a cursor minted under another limit', async () => {
    fakeBridge(data(4 * L))
    const all = ids(4 * L)
    const small = L - 2
    await syncPage(method, 1, L)
    // Rows [3*small, 4*small) lie past the page peeked under limit L.
    const p4 = await syncPage(method, 4, small)
    expect(p4.ids).toEqual(all.slice(3 * small, 4 * small))
  })

  it('clamps a limit above the documented 500 and still serves every row', async () => {
    fakeBridge(data(700))
    const all = ids(700)
    const p1 = await syncPage(method, 1, 600)
    const p2 = await syncPage(method, 2, 600)
    expect(p1.ids).toEqual(all.slice(0, 600))
    expect([p2.ids, p2.hasMore]).toEqual([all.slice(600), false])
    for (const u of seen) expect(Number(u.searchParams.get('limit'))).toBeLessThanOrEqual(500)
  })
})

describe('bridge-open-banking reads by id', () => {
  it('getCharge reads the payment request and returns the named transaction', async () => {
    fakeBridge({ [PR_PATH]: paymentRequests(6) })
    const c = await adapter.getCharge(CREDS, 'pr001:tx002')
    expect(ChargeSchema.parse(c).id).toBe('pr001:tx002')
    expect(seen.map((u) => u.pathname)).toEqual([`${PR_PATH}/pr001`])
  })

  it('getCharge rejects a malformed id with 404 and sends nothing', async () => {
    fakeBridge({ [PR_PATH]: paymentRequests(6) })
    await expect(adapter.getCharge(CREDS, 'tx002')).rejects.toMatchObject({ statusCode: 404 })
    expect(seen).toHaveLength(0)
  })

  it('getCharge answers 404 when the request has no such transaction', async () => {
    fakeBridge({ [PR_PATH]: paymentRequests(6) })
    await expect(adapter.getCharge(CREDS, 'pr001:tx999')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getPayout reads /v3/payment/payment-account/payouts/{id}', async () => {
    fakeBridge({ [PO_PATH]: payouts(3) })
    const p = await adapter.getPayout(CREDS, 'po001')
    expect(PayoutSchema.parse(p).id).toBe('po001')
    expect(seen.map((u) => u.pathname)).toEqual([`${PO_PATH}/po001`])
  })
})

describe('bridge-open-banking credentials', () => {
  it('exchangeCredentials stores the secret as accessToken and the client id in extra', async () => {
    expect(
      await adapter.exchangeCredentials({ clientId: ' CLIENT_A ', clientSecret: 'SECRET_A' }),
    ).toEqual(CREDS)
    await expect(adapter.exchangeCredentials({ clientId: '', clientSecret: 'x' })).rejects.toThrow(
      /client id/,
    )
    await expect(adapter.exchangeCredentials({ clientId: 'x', clientSecret: '' })).rejects.toThrow(
      /client secret/,
    )
  })

  it('refuses a connection without a client id before sending anything', async () => {
    fakeBridge({ [PO_PATH]: payouts(3) })
    await expect(
      adapter.listPayouts({ accessToken: 'SECRET_A' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(seen).toHaveLength(0)
  })

  it('declares the documented page maximum of 500', () => {
    expect(adapter.capabilities.maxPageSize).toBe(500)
  })

  it('has no OAuth flow', async () => {
    expect(() => adapter.getAuthUrl()).toThrow(/Client-Id/)
    await expect(adapter.exchangeCode()).rejects.toThrow(/exchangeCredentials/)
  })
})
