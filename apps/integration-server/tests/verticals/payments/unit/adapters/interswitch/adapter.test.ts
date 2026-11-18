/**
 * Interswitch adapter: auth, the rebuilt listCharges, and the refused methods.
 *
 * Docs (https://docs.interswitchgroup.com):
 * - docs/authentication.md — client-credentials token with
 *   "Authorization: Basic <base64(clientId:secretKey)>" and
 *   `grant_type=client_credentials`; the response carries `merchant_code`.
 * - reference/get-transactions.md — GET /paymentgateway/api/v1/transactions,
 *   required merchantCode, startDate, endDate ("Format: MM/dd/yyyy"),
 *   pageSize, pageNum; response `{ count, content }`.
 *
 * The fake server honours only the documented query parameters and rejects
 * any other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('axios', () => {
  const instance = { get: getMock }
  const axios = { create: vi.fn(() => instance), post: postMock }
  return { default: axios, ...axios }
})

import axios from 'axios'
import { InterswitchAdapter } from '../../../../../../src/verticals/payments/adapters/interswitch'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'

const adapter = new InterswitchAdapter()
const CREDS: Credentials = {
  accessToken: 'tok',
  expiresAt: new Date('2099-01-01T00:00:00Z'),
  extra: { clientId: 'IKIA1', secretKey: 'sec', merchantCode: 'MX6072' },
}
const DOCUMENTED = new Set(['merchantCode', 'startDate', 'endDate', 'pageSize', 'pageNum'])

function row(i: number) {
  return {
    id: 1000 + i,
    amount: 5000 + i,
    transactionReference: `pay${i}`,
    responseCode: '00',
    merchantCode: 'MX6072',
    currencyCode: '566',
    paymentCancelled: false,
    merchantCustomerId: null,
    channel: 'WEB',
    dateOfPayment: '1685460429590',
    status: 'SUCCESS',
    responseDescription: 'Approved',
  }
}

function serveTransactions(n: number) {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(async (path: string, cfg: { params: Record<string, unknown> }) => {
    const p = cfg.params
    calls.push(p)
    expect(path).toBe('/paymentgateway/api/v1/transactions')
    for (const k of Object.keys(p)) {
      if (!DOCUMENTED.has(k)) throw new Error(`undocumented param ${k}`)
    }
    for (const k of DOCUMENTED) if (p[k] === undefined) throw new Error(`missing required ${k}`)
    const size = Number(p.pageSize)
    const num = Number(p.pageNum)
    const all = Array.from({ length: n }, (_, i) => row(i + 1))
    return { data: { count: n, content: all.slice((num - 1) * size, num * size) } }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('interswitch auth (client credentials)', () => {
  it('mints a token with Basic auth and keeps merchant_code', async () => {
    postMock.mockResolvedValue({
      data: {
        access_token: 'AT',
        token_type: 'bearer',
        expires_in: 86400,
        scope: 'profile',
        merchant_code: 'MX18227',
      },
    })
    const creds = await adapter.exchangeCredentials({ clientId: 'IKIA1', secretKey: 'sec' })
    const [url, body, cfg] = postMock.mock.calls[0]!
    expect(url).toBe('https://passport.interswitchng.com/passport/oauth/token')
    expect(body).toBe('grant_type=client_credentials')
    expect(cfg.headers.Authorization).toBe(`Basic ${Buffer.from('IKIA1:sec').toString('base64')}`)
    expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(creds.accessToken).toBe('AT')
    expect(creds.extra).toEqual({ clientId: 'IKIA1', secretKey: 'sec', merchantCode: 'MX18227' })
    expect(new Date(creds.expiresAt!).getTime()).toBe(Date.now() + 86400 * 1000)
  })

  it('rejects a token response without merchant_code', async () => {
    postMock.mockResolvedValue({ data: { access_token: 'AT', expires_in: 10 } })
    await expect(adapter.exchangeCredentials({ clientId: 'a', secretKey: 'b' })).rejects.toThrow(
      /merchant_code/,
    )
  })

  it('re-mints an expired token before listing and sends it as Bearer', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'FRESH', expires_in: 60, merchant_code: 'MX6072' },
    })
    serveTransactions(1)
    await adapter.listCharges(
      { ...CREDS, accessToken: 'OLD', expiresAt: new Date('2020-01-01T00:00:00Z') },
      { page: 1, limit: 10, updatedAfter: new Date('2026-09-01T00:00:00Z') },
    )
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer FRESH')
  })

  it('has no redirect flow', () => {
    expect(() => adapter.getAuthUrl()).toThrow(/client-credentials/)
  })
})

describe('interswitch listCharges', () => {
  it('refuses an unfiltered call with 501 and sends nothing', async () => {
    await expect(adapter.listCharges(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('refuses with 501 when the connection carries no merchantCode', async () => {
    await expect(
      adapter.listCharges(
        { ...CREDS, extra: { clientId: 'a', secretKey: 'b' } },
        { page: 1, limit: 10, updatedAfter: new Date('2026-09-01T00:00:00Z') },
      ),
    ).rejects.toMatchObject({ statusCode: 501 })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('sends the documented request for an updatedAfter window', async () => {
    const calls = serveTransactions(3)
    const out = await adapter.listCharges(CREDS, {
      page: 2,
      limit: 2,
      updatedAfter: new Date('2026-08-31T23:30:00Z'),
    })
    expect(calls[0]).toEqual({
      merchantCode: 'MX6072',
      startDate: '08/31/2026',
      endDate: '09/27/2026',
      pageNum: 2,
      pageSize: 2,
    })
    expect(getMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer tok')
    expect(out.map((c) => c.id)).toEqual(['1003'])
    for (const c of out) ChargeSchema.parse(c)
  })

  it('sends to the webpay host', async () => {
    serveTransactions(1)
    await adapter.listCharges(CREDS, {
      page: 1,
      limit: 2,
      updatedAfter: new Date('2026-09-01T00:00:00Z'),
    })
    const createMock = vi.mocked(axios.create)
    expect(createMock.mock.calls.at(-1)![0]).toMatchObject({
      baseURL: 'https://webpay.interswitchng.com',
    })
  })

  it('defaults to page 1 when the caller sends no page', async () => {
    const calls = serveTransactions(3)
    await adapter.listCharges(CREDS, { limit: 2, updatedAfter: new Date('2026-09-01T00:00:00Z') })
    expect(calls[0]!.pageNum).toBe(1)
  })

  it('builds the window on the UTC calendar even when the process TZ is not UTC', async () => {
    const prev = process.env.TZ
    process.env.TZ = 'Pacific/Kiritimati' // UTC+14: local day differs from UTC day
    try {
      const calls = serveTransactions(1)
      await adapter.listCharges(CREDS, {
        page: 1,
        limit: 2,
        updatedAfter: new Date('2026-08-31T23:30:00Z'),
      })
      expect(calls[0]).toMatchObject({ startDate: '08/31/2026', endDate: '09/27/2026' })
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  })

  it('walks every row once with an exact hasMore (N = 2L + 1)', async () => {
    const L = 4
    const N = 2 * L + 1
    serveTransactions(N)
    const seen: string[] = []
    const flags: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({
        page,
        limit: L,
        updatedAfter: new Date('2026-01-01T00:00:00Z'),
      })
      const rows = await adapter.listCharges(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      expect(meta?.totalCount).toBe(N)
      flags.push(meta?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(1001 + i)))
    expect(new Set(seen).size).toBe(N)
    expect(flags).toEqual([true, true, false])
  })

  it('reports hasMore false when the total is an exact multiple of the page size', async () => {
    serveTransactions(4)
    const params = withPageSink({
      page: 2,
      limit: 2,
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    })
    const rows = await adapter.listCharges(CREDS, params)
    expect(rows).toHaveLength(2)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws when the documented envelope is missing', async () => {
    getMock.mockResolvedValue({ data: { data: [] } })
    await expect(
      adapter.listCharges(CREDS, {
        page: 1,
        limit: 2,
        updatedAfter: new Date('2026-01-01T00:00:00Z'),
      }),
    ).rejects.toThrow(/count, content/)
  })
})

describe('interswitch refused methods', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['listCustomers', () => adapter.listCustomers()],
    ['getCustomer', () => adapter.getCustomer()],
    ['getCharge', () => adapter.getCharge()],
    ['listRefunds', () => adapter.listRefunds()],
    ['getRefund', () => adapter.getRefund()],
    ['listPayouts', () => adapter.listPayouts()],
    ['getPayout', () => adapter.getPayout()],
  ]
  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(getMock).not.toHaveBeenCalled()
      expect(postMock).not.toHaveBeenCalled()
    })
  }
})
