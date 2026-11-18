/**
 * Instamojo refunds.
 *
 * listRefunds refuses with 501 NOT_SUPPORTED before sending anything. The v2
 * reference index (https://docs.instamojo.com/llms.txt) documents only
 * "Create a Refund" (POST /v2/payments/{payment_id}/refund/) and "Get details
 * of a refund" (GET /v2/resolutioncenter/cases/{id}/); no refunds list. The
 * GET /v2/refunds/ path the method used to call is not routed in production.
 *
 * getRefund reads GET /v2/resolutioncenter/cases/{id}/, whose response is the
 * case itself (https://docs.instamojo.com/reference/get-details-of-a-refund-1),
 * then GET /v2/payments/{id}/ for the payment the case names, whose
 * payment_request link carries the order id
 * (https://docs.instamojo.com/reference/get-payment-details-1).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { InstamojoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/instamojo/index'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'
import { documentedPaymentDetail, documentedRefundCase } from './fixtures'

const CREDS = { accessToken: 'instamojo-token' }

function adapter(): InstamojoAdapter {
  return new InstamojoAdapter({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://x/cb',
  })
}

interface Sent {
  method: string
  path: string
  params?: unknown
}

/**
 * Replaces axios.create. Only GET resolutioncenter/cases/{id}/ and
 * GET payments/{id}/ are answered, with the documented examples (the case body
 * can be overridden); every other request is recorded and fails.
 */
function fakeInstamojo(
  opts: { caseBody?: (id: string) => unknown; paymentBody?: (id: string) => unknown } = {},
): { sent: Sent[]; baseURL: () => unknown } {
  const sent: Sent[] = []
  let baseURL: unknown
  const verb =
    (method: string) =>
    async (path: string, a?: unknown, b?: unknown): Promise<unknown> => {
      const cfg = (method === 'GET' ? a : b) as { params?: unknown } | undefined
      sent.push({ method, path, params: cfg?.params })
      const m = /^resolutioncenter\/cases\/([^/]+)\/$/.exec(path)
      if (method === 'GET' && m) {
        const id = decodeURIComponent(m[1]!)
        return { data: opts.caseBody ? opts.caseBody(id) : { ...documentedRefundCase(), id } }
      }
      const p = /^payments\/([^/]+)\/$/.exec(path)
      if (method === 'GET' && p) {
        const id = decodeURIComponent(p[1]!)
        return {
          data: opts.paymentBody ? opts.paymentBody(id) : { ...documentedPaymentDetail(), id },
        }
      }
      throw new Error(`fake instamojo: undocumented ${method} ${path}`)
    }
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { baseURL?: string }) => {
    baseURL = cfg.baseURL
    return {
      get: verb('GET'),
      post: verb('POST'),
      put: verb('PUT'),
      patch: verb('PATCH'),
      delete: verb('DELETE'),
    }
  }) as unknown as typeof axios.create)
  return { sent, baseURL: () => baseURL }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('InstamojoAdapter.listRefunds', () => {
  it.each<[Record<string, string>]>([
    [{}],
    [{ page: '2', limit: '10' }],
    [{ page: '1', limit: '500' }],
  ])('refuses with 501 NOT_SUPPORTED and sends no request (query %o)', async (q) => {
    const { sent } = fakeInstamojo()
    const params: QueryParams = parseListQuery(q)
    const err = await adapter()
      .listRefunds(CREDS, params)
      .then(
        () => null,
        (e: unknown) => e as { statusCode?: number; code?: string; message: string },
      )
    expect(err).not.toBeNull()
    expect(err!.statusCode).toBe(501)
    expect(err!.code).toBe('NOT_SUPPORTED')
    expect(err!.message).toMatch(/^Instamojo cannot list refunds: /)
    expect(sent).toEqual([])
  })

  it('refuses inside a page sink too, without reporting a page', async () => {
    const { sent } = fakeInstamojo()
    const params = withPageSink(parseListQuery({ page: '1', limit: '5' }))
    await expect(adapter().listRefunds(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(sent).toEqual([])
  })
})

describe('InstamojoAdapter.getRefund', () => {
  it('reads GET /v2/resolutioncenter/cases/{id}/ on the production host with no query', async () => {
    const fake = fakeInstamojo()
    const refund = await adapter().getRefund(CREDS, 'C5c0751272')
    expect(fake.baseURL()).toBe('https://api.instamojo.com/v2')
    expect(fake.sent).toEqual([
      { method: 'GET', path: 'resolutioncenter/cases/C5c0751272/', params: undefined },
      { method: 'GET', path: 'payments/MOJO5a06005J21512197/', params: undefined },
    ])
    expect(RefundSchema.parse(refund).id).toBe('C5c0751272')
    expect(refund.orderId).toBe('b318750f06e3491484acef4cb4ff7966')
    expect(refund.transactionIds).toEqual(['MOJO5a06005J21512197'])
  })

  it('returns an orderId that getOrder reads back as a payment request', async () => {
    const fake = fakeInstamojo()
    const refund = await adapter().getRefund(CREDS, 'C5c0751272')
    await adapter()
      .getOrder(CREDS, refund.orderId)
      .catch(() => undefined)
    expect(fake.sent.at(-1)!.path).toBe('payment_requests/b318750f06e3491484acef4cb4ff7966/')
  })

  it('reads the case from the top-level body, not a { refund } envelope', async () => {
    const { sent } = fakeInstamojo({
      caseBody: (id) => ({ refund: { ...documentedRefundCase(), id } }),
    })
    await expect(adapter().getRefund(CREDS, 'C5c0751272')).rejects.toThrow(/no v2 payment link/)
    expect(sent).toHaveLength(1)
  })

  it('throws, after reading the payment, when the payment has no payment request', async () => {
    const { sent } = fakeInstamojo({
      paymentBody: (id) => ({ ...documentedPaymentDetail(), id, payment_request: null }),
    })
    await expect(adapter().getRefund(CREDS, 'C5c0751272')).rejects.toThrow(
      /not made against a payment request/,
    )
    expect(sent.map((r) => r.path)).toEqual([
      'resolutioncenter/cases/C5c0751272/',
      'payments/MOJO5a06005J21512197/',
    ])
  })

  it('encodes the id into the path', async () => {
    const { sent } = fakeInstamojo()
    await adapter().getRefund(CREDS, 'C5/../x')
    expect(sent[0]!.path).toBe('resolutioncenter/cases/C5%2F..%2Fx/')
  })
})
