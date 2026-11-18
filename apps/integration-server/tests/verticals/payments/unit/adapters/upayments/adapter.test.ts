/**
 * UPayments list/get contract.
 *
 * listCharges → GET /reports/sales
 * (https://developers.upayments.com/reference/sales-report.md): "page": "Page
 * number for pagination (default: 1).", "perPage": "Number of records per page
 * (default: 10)."; response data.pagination { current_page, last_page,
 * per_page, total } and data.report[]. No maximum is documented.
 * getCharge → GET /get-payment-status/{track_id}.
 * Every request carries Authorization: Bearer <API Key>, X-Timestamp and an
 * X-Signature = Base64(HMAC_SHA256(timestamp + METHOD + path + body, secret))
 * (https://developers.upayments.com/reference/hmac-authentication.md).
 *
 * The fake honours only `page` and `perPage`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { createHmac } from 'node:crypto'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { UpaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/upayments/index'
import { UpaymentsClient } from '../../../../../../src/verticals/payments/adapters/upayments/client'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { SALES_ROW, TRANSACTION } from './fixtures'

const CREDS = { accessToken: 'key_abc', extra: { apiSecret: 'sk_test_secret' } }
const DOC_DEFAULT_PER_PAGE = 10

interface Req {
  method: string
  path: string
  params?: Record<string, unknown>
  headers?: Record<string, string>
  body?: unknown
}

function fake(total: number, opts: { serverMax?: number } = {}) {
  const reqs: Req[] = []
  const create = vi.spyOn(axios, 'create')
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      reqs.push({ method: 'GET', path, params: config?.params, headers: config?.headers })
      if (path.startsWith('/get-payment-status/')) {
        return { data: { status: true, data: { transaction: TRANSACTION } } }
      }
      if (path !== '/reports/sales') throw new Error(`unexpected path ${path}`)
      const p = config?.params ?? {}
      const page = Number(p['page'] ?? 1)
      const asked = Number(p['perPage'] ?? DOC_DEFAULT_PER_PAGE)
      const size = opts.serverMax ? Math.min(asked, opts.serverMax) : asked
      const from = (page - 1) * size
      const n = Math.max(0, Math.min(size, total - from))
      const lastPage = Math.max(1, Math.ceil(total / size))
      return {
        data: {
          status: true,
          message: 'Response received successfully',
          data: {
            pagination: {
              current_page: page,
              last_page: lastPage,
              per_page: size,
              from: from + 1,
              to: from + n,
              total,
            },
            report: Array.from({ length: n }, (_, i) => ({
              ...SALES_ROW,
              track_id: `trk_${from + i}`,
            })),
          },
        },
      }
    },
  )
  const post = vi.fn(async () => ({ data: {} }))
  create.mockReturnValue({ get, post, defaults: {} } as never)
  return { reqs, get, post, create }
}

afterEach(() => vi.restoreAllMocks())

describe('UPayments client', () => {
  it('uses the documented production host and Bearer API key', async () => {
    const { create } = fake(1)
    await new UpaymentsAdapter().listCharges(CREDS, { page: 1, limit: 5 } as QueryParams)
    const cfg = create.mock.calls[0]?.[0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://uapi.upayments.com/api/v1')
    expect(cfg.headers.Authorization).toBe('Bearer key_abc')
  })

  it('signs GET requests over timestamp + GET + path-after-/api/v1/ + empty body', async () => {
    const { reqs } = fake(1)
    await new UpaymentsAdapter().listCharges(CREDS, { page: 1, limit: 5 } as QueryParams)
    const h = reqs[0]!.headers!
    expect(h['X-Timestamp']).toMatch(/^\d{10}$/)
    const expected = createHmac('sha256', 'sk_test_secret')
      .update(`${h['X-Timestamp']}GETreports/sales`)
      .digest('base64')
    expect(h['X-Signature']).toBe(expected)
  })

  it('refuses a connection with no API Secret Key before sending anything', async () => {
    const { get } = fake(1)
    await expect(
      new UpaymentsAdapter().listCharges({ accessToken: 'key_abc' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses an empty-string API Secret Key before sending anything', async () => {
    const { get } = fake(1)
    await expect(
      new UpaymentsAdapter().listCharges(
        { accessToken: 'key_abc', extra: { apiSecret: '' } },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(get).not.toHaveBeenCalled()
  })

  it('signs a retried request again with a fresh timestamp (signatures last 1 minute)', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    try {
      const { reqs, get } = fake(1)
      const real = get.getMockImplementation()!
      let n = 0
      get.mockImplementation(async (path, config) => {
        if (n++ === 0) {
          reqs.push({ method: 'GET', path, headers: config?.headers })
          throw Object.assign(new Error('rate limited'), { response: { status: 429 } })
        }
        return real(path, config)
      })
      const pending = new UpaymentsAdapter().listCharges(CREDS, { page: 1, limit: 5 })
      await vi.advanceTimersByTimeAsync(2_000)
      await pending
      expect(reqs).toHaveLength(2)
      const [a, b] = reqs.map((r) => r.headers!)
      expect(Number(b!['X-Timestamp'])).toBeGreaterThan(Number(a!['X-Timestamp']))
      expect(b!['X-Signature']).toBe(
        createHmac('sha256', 'sk_test_secret')
          .update(`${b!['X-Timestamp']}GETreports/sales`)
          .digest('base64'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('signs a POST over the exact JSON body it sends', async () => {
    const { post } = fake(1)
    await new UpaymentsClient(CREDS).post('create-refund', { order_id: 'o1', total_price: 1 })
    const [path, sent, config] = post.mock.calls[0] as unknown as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(path).toBe('/create-refund')
    expect(sent).toBe('{"order_id":"o1","total_price":1}')
    expect(config.headers['X-Signature']).toBe(
      createHmac('sha256', 'sk_test_secret')
        .update(`${config.headers['X-Timestamp']}POSTcreate-refund${sent}`)
        .digest('base64'),
    )
  })

  it('exchangeCredentials keeps the secret in extra and requires both fields', async () => {
    const a = new UpaymentsAdapter()
    await expect(a.exchangeCredentials({ apiKey: 'k', apiSecret: 's' })).resolves.toEqual({
      accessToken: 'k',
      extra: { apiSecret: 's' },
    })
    await expect(a.exchangeCredentials({ apiKey: 'k' })).rejects.toThrow(/Secret/)
    expect(a.credentialFields().map((f) => f.name)).toEqual(['apiKey', 'apiSecret'])
  })
})

describe('UPayments listCharges paging (GET /reports/sales, page + perPage)', () => {
  it('serves 2L+1 rows once each across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { reqs } = fake(2 * L + 1)
    const adapter = new UpaymentsAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listCharges(CREDS, params)
      got.push(...rows.map((r) => r.id))
      const up = readUpstreamPage(params)
      more.push(up?.hasMore)
      expect(up?.totalCount).toBe(2 * L + 1)
      expect(up?.pageSize).toBeUndefined()
    }
    expect(got).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `trk_${i}`))
    expect(new Set(got).size).toBe(got.length)
    expect(more).toEqual([true, true, false])
    expect(reqs.map((r) => r.params)).toEqual([
      { page: 1, perPage: L },
      { page: 2, perPage: L },
      { page: 3, perPage: L },
    ])
  })

  it('treats a missing page as page 1', async () => {
    const { reqs } = fake(3)
    await new UpaymentsAdapter().listCharges(CREDS, { limit: 2 } as QueryParams)
    expect(reqs[0]!.params).toEqual({ page: 1, perPage: 2 })
  })

  it('reports the smaller size the server paged at as pageSize and still serves every row', async () => {
    const { reqs } = fake(5, { serverMax: 2 })
    const adapter = new UpaymentsAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 4 } as QueryParams)
      got.push(...(await adapter.listCharges(CREDS, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(2)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(got).toEqual(['trk_0', 'trk_1', 'trk_2', 'trk_3', 'trk_4'])
    expect(more).toEqual([true, true, false])
    expect(reqs).toHaveLength(3)
  })
})

describe('UPayments getCharge (GET /get-payment-status/{track_id})', () => {
  it('reads the track_id a listed charge carries', async () => {
    const { reqs } = fake(1)
    const c = await new UpaymentsAdapter().getCharge(CREDS, '9bf8387bd32d45dda56f6c1c009eca4f')
    expect(reqs[0]!.path).toBe('/get-payment-status/9bf8387bd32d45dda56f6c1c009eca4f')
    const h = reqs[0]!.headers!
    expect(h['X-Signature']).toBe(
      createHmac('sha256', 'sk_test_secret')
        .update(`${h['X-Timestamp']}GETget-payment-status/9bf8387bd32d45dda56f6c1c009eca4f`)
        .digest('base64'),
    )
    expect(c.id).toBe('9bf8387bd32d45dda56f6c1c009eca4f')
    expect(c.status).toBe('succeeded')
  })

  it('percent-encodes the id so it stays one path segment', async () => {
    const { reqs } = fake(1)
    await new UpaymentsAdapter().getCharge(CREDS, 'a/b?c')
    expect(reqs[0]!.path).toBe('/get-payment-status/a%2Fb%3Fc')
  })
})

describe('UPayments refusals (no documented list/read endpoint)', () => {
  it.each(['listCustomers', 'listRefunds'] as const)(
    '%s throws 501 NOT_SUPPORTED and sends no request',
    async (m) => {
      const { get, post, create } = fake(1)
      await expect(
        (new UpaymentsAdapter() as PaymentsAdapter)[m]!(CREDS, {
          page: 1,
          limit: 5,
        } as QueryParams),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('getCustomer throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, create } = fake(1)
    await expect(
      (new UpaymentsAdapter() as PaymentsAdapter).getCustomer!(CREDS, 'x'),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
