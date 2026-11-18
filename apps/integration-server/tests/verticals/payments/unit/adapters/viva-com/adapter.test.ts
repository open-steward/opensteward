/**
 * Viva.com reads, against a fake that honours only what the Payment API spec
 * (https://developer.viva.com/downloads/payment-api.yaml) documents for
 * "Transactions from Data Service":
 *   POST /dataservices/v2/transactions/Search?PageSize={PageSize}&Page={PageNumber}&OrderBy={Descending}
 *   PageSize — "If not specified, the default value is 10"
 *   Page     — "If not specified, the default value is 1"
 *   body     — filters incl. TransactionTypeIds, TransactionIds
 *   response — currentPage, pageSize, data[], links[] (self / next / previous);
 *              "204 No Content" once past the end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { VivaComAdapter } from '../../../../../../src/verticals/payments/adapters/viva-com'
import {
  CHARGE_TYPE_IDS,
  REFUND_TYPE_IDS,
  type RawVivaComTransaction,
} from '../../../../../../src/verticals/payments/adapters/viva-com/transform/transaction'
import { documentedTransaction } from './fixture'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'

const { searchMock, postMock } = vi.hoisted(() => ({ searchMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/viva-com/client', () => ({
  VivaComClient: class {
    search = searchMock
  },
}))

vi.mock('axios', () => ({ default: { post: postMock } }))

const adapter = new VivaComAdapter()
const CREDS: Credentials = { accessToken: 'tok_viva' }
const PATH = '/dataservices/v2/transactions/Search'
const DOCUMENTED_QUERY = new Set(['PageSize', 'Page', 'OrderBy'])
const PARENT = 'fa248e3b-7fdb-43bb-9441-d88812f8fce5'

interface Call {
  path: string
  query: Record<string, unknown>
  body: Record<string, unknown>
}

/** Rows of every type: charges (5), refunds (4) and a pre-auth (1) the lists must not see. */
function store(n: number): RawVivaComTransaction[] {
  const rows: RawVivaComTransaction[] = []
  for (let i = 1; i <= n; i++) {
    rows.push(documentedTransaction({ TransactionId: `ch-${i}`, TransactionTypeId: 5 }))
    rows.push(
      documentedTransaction({
        TransactionId: `rf-${i}`,
        TransactionTypeId: 4,
        Amount: -0.27,
        ParentId: PARENT,
      }),
    )
    rows.push(documentedTransaction({ TransactionId: `pa-${i}`, TransactionTypeId: 1 }))
  }
  return rows
}

function serve(rows: RawVivaComTransaction[]): Call[] {
  const calls: Call[] = []
  searchMock.mockImplementation(
    async (path: string, query: Record<string, unknown>, body: Record<string, unknown>) => {
      calls.push({ path, query: { ...query }, body: { ...body } })
      if (path !== PATH) throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(query)) {
        if (!DOCUMENTED_QUERY.has(k)) throw new Error(`undocumented query param ${k}`)
      }
      const size = query.PageSize === undefined ? 10 : Number(query.PageSize)
      const page = query.Page === undefined ? 1 : Number(query.Page)
      const types = body.TransactionTypeIds as number[] | undefined
      const ids = body.TransactionIds as string[] | undefined
      const matched = rows.filter(
        (r) =>
          (!types || types.length === 0 || types.includes(r.TransactionTypeId as number)) &&
          (!ids || ids.length === 0 || ids.includes(r.TransactionId)),
      )
      const slice = matched.slice((page - 1) * size, page * size)
      if (slice.length === 0) return { status: 204, data: undefined }
      const more = page * size < matched.length
      const link = (p: number) => `/api/Transaction/Search?PageSize=${size}&Page=${p}`
      return {
        status: 200,
        data: {
          currentPage: page,
          pageSize: size,
          totalPages: 0,
          totalDataCount: -1,
          data: slice,
          links: [{ self: link(page), ...(more ? { next: link(page + 1) } : {}) }],
        },
      }
    },
  )
  return calls
}

beforeEach(() => {
  searchMock.mockReset()
  postMock.mockReset()
})

describe('VivaComAdapter.listCharges', () => {
  it('walks 2L+1 charges over three pages, each once, with an exact hasMore', async () => {
    const L = 4
    const calls = serve(store(2 * L + 1))
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listCharges(CREDS, params)
      for (const r of rows) ChargeSchema.parse(r)
      ids.push(...rows.map((c) => c.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `ch-${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.query)).toEqual([
      { PageSize: L, Page: 1, OrderBy: 'Ascending' },
      { PageSize: L, Page: 2, OrderBy: 'Ascending' },
      { PageSize: L, Page: 3, OrderBy: 'Ascending' },
    ])
  })

  it('sends only the charge TransactionTypeIds filter, and never updatedAfter', async () => {
    const calls = serve(store(2))
    await adapter.listCharges(
      CREDS,
      withPageSink({ page: 1, limit: 50, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(PATH)
    expect(calls[0]!.body).toEqual({ TransactionTypeIds: [...CHARGE_TYPE_IDS] })
    expect(calls[0]!.body.TransactionTypeIds).not.toContain(1)
    expect(calls[0]!.body.TransactionTypeIds).not.toContain(4)
  })

  it('sends the documented default page size when no limit is given', async () => {
    const calls = serve(store(1))
    await adapter.listCharges(CREDS, withPageSink({}))
    expect(calls[0]!.query).toEqual({ PageSize: 10, Page: 1, OrderBy: 'Ascending' })
  })

  it('treats a 204 past the end as an empty last page', async () => {
    serve(store(2))
    const params = withPageSink({ page: 5, limit: 10 })
    expect(await adapter.listCharges(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('ends on a full last page whose links carry no next', async () => {
    serve(store(4))
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await adapter.listCharges(CREDS, params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('VivaComAdapter.listRefunds', () => {
  it('walks 2L+1 refunds over three pages with the refund type filter', async () => {
    const L = 3
    const calls = serve(store(2 * L + 1))
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listRefunds(CREDS, params)
      for (const r of rows) expect(RefundSchema.parse(r).chargeId).toBe(PARENT)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `rf-${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
    for (const c of calls) expect(c.body).toEqual({ TransactionTypeIds: [...REFUND_TYPE_IDS] })
  })
})

describe('VivaComAdapter get by id', () => {
  it('getCharge looks the id up with the TransactionIds filter', async () => {
    const calls = serve(store(3))
    const charge = await adapter.getCharge(CREDS, 'ch-2')
    expect(charge.id).toBe('ch-2')
    expect(calls[0]!.body).toEqual({
      TransactionIds: ['ch-2'],
      TransactionTypeIds: [...CHARGE_TYPE_IDS],
    })
  })

  it('getRefund reads back an id listRefunds returned', async () => {
    serve(store(3))
    const refund = await adapter.getRefund(CREDS, 'rf-3')
    expect(refund.id).toBe('rf-3')
    expect(refund.chargeId).toBe(PARENT)
  })

  it('a charge id that is not there (or is a refund) is a 404', async () => {
    serve(store(2))
    await expect(adapter.getCharge(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getCharge(CREDS, 'rf-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('VivaComAdapter unsupported resources', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listCustomers', () => adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getCustomer', () => adapter.getCustomer(CREDS, 'c1')],
    ['getPayout', () => adapter.getPayout(CREDS, 'p1')],
  ]
  for (const [name, call] of cases) {
    it(`${name} refuses with 501 NOT_SUPPORTED and sends no request`, async () => {
      serve(store(1))
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(searchMock).not.toHaveBeenCalled()
      expect(postMock).not.toHaveBeenCalled()
    })
  }
})

describe('VivaComAdapter auth (client credentials)', () => {
  it('exchangeCredentials posts grant_type=client_credentials with Basic client auth', async () => {
    postMock.mockResolvedValue({
      data: {
        access_token: 'eyJ',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'urn:viva:payments:biservices:publicapi',
      },
    })
    const creds = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' })
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('https://accounts.vivapayments.com/connect/token')
    expect(body).toBe('grant_type=client_credentials')
    expect(config).toMatchObject({
      auth: { username: 'cid', password: 'sec' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(creds.accessToken).toBe('eyJ')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec' })
  })

  it('refreshCredentials mints a new token from the stored client credentials', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' },
    })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'cid', clientSecret: 'sec' },
    })
    expect(creds.accessToken).toBe('new')
    expect(postMock.mock.calls[0]![2]).toMatchObject({ auth: { username: 'cid', password: 'sec' } })
  })

  it('refuses to request a token without client credentials', async () => {
    await expect(adapter.refreshCredentials({ accessToken: 'old' })).rejects.toThrow(/Client ID/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('expiresAt is expires_in seconds from now ("Each token lasts for 3600 seconds")', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'eyJ', expires_in: 3600, token_type: 'Bearer' },
    })
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' })
    const after = Date.now()
    const at = new Date(creds.expiresAt as Date | string).getTime()
    expect(at).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(at).toBeLessThanOrEqual(after + 3_600_000)
  })

  it('refuses to request a token when only the Client Secret is missing', async () => {
    await expect(
      adapter.refreshCredentials({ accessToken: 'old', extra: { clientId: 'cid' } }),
    ).rejects.toThrow(/Client Secret/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('has no authorization-code flow', () => {
    expect(() => adapter.getAuthUrl()).toThrow(/client credentials/)
  })
})
