/**
 * `PaytmClient` — the per-call head override and raw-response mode
 * added, plus the merchant-passbook host resolution those two new list
 * endpoints need. `axios` is mocked so these pin the actual envelope/host
 * `PaytmClient.post` builds, not just the transform.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { httpPostMock, createMock } = vi.hoisted(() => ({
  httpPostMock: vi.fn(),
  createMock: vi.fn(),
}))

vi.mock('axios', () => ({
  default: { create: createMock },
}))

createMock.mockReturnValue({ post: httpPostMock })

import { PaytmClient } from '../../../../../../src/verticals/payments/adapters/paytm/client'
import {
  MERCHANT_PASSBOOK_HOSTS,
  ORDER_LIST_PATH,
  REFUND_LIST_PATH,
} from '../../../../../../src/verticals/payments/adapters/paytm/constants'

// AES-128-CBC requires a 16-byte key — real merchant keys are this length.
const MERCHANT_KEY = '1234567890123456'

function credentials(environment: 'staging' | 'production' = 'staging') {
  return { accessToken: MERCHANT_KEY, extra: { mid: 'MID1', environment } }
}

describe('PaytmClient.merchantPassbookUrl', () => {
  it('resolves the documented secure.paytmpayments.com host per environment — not the legacy securegw.paytm.in host', () => {
    const staging = new PaytmClient(credentials('staging'))
    expect(staging.merchantPassbookUrl(ORDER_LIST_PATH)).toBe(
      `${MERCHANT_PASSBOOK_HOSTS.staging}${ORDER_LIST_PATH}`,
    )
    expect(staging.merchantPassbookUrl(ORDER_LIST_PATH)).toBe(
      'https://securestage.paytmpayments.com/merchant-passbook/search/list/order/v2',
    )

    const production = new PaytmClient(credentials('production'))
    expect(production.merchantPassbookUrl(REFUND_LIST_PATH)).toBe(
      `${MERCHANT_PASSBOOK_HOSTS.production}${REFUND_LIST_PATH}`,
    )
    expect(production.merchantPassbookUrl(REFUND_LIST_PATH)).toBe(
      'https://secure.paytmpayments.com/merchant-passbook/api/v1/refundList',
    )
  })
})

describe('PaytmClient.post', () => {
  beforeEach(() => {
    httpPostMock.mockReset()
  })

  it('merges a per-call head override on top of the default head, still signing only the body', async () => {
    httpPostMock.mockResolvedValue({ data: { head: {}, body: { ok: true } } })
    const client = new PaytmClient(credentials())

    await client.post('/x', { mid: 'MID1' }, { head: { tokenType: 'CHECKSUM', clientId: 'C11' } })

    expect(httpPostMock).toHaveBeenCalledTimes(1)
    const [path, envelope] = httpPostMock.mock.calls[0] as [string, { head: Record<string, unknown>; body: unknown }]
    expect(path).toBe('/x')
    expect(envelope.head).toMatchObject({
      version: 'v1',
      channelId: 'WEB',
      tokenType: 'CHECKSUM',
      clientId: 'C11',
    })
    expect(typeof envelope.head.signature).toBe('string')
    expect(envelope.body).toEqual({ mid: 'MID1' })
  })

  it('returns the raw response body verbatim when options.raw is set, skipping the {head,body} unwrap', async () => {
    const flat = { status: 'SUCCESS', count: 2, resultCode: '00000000', orders: [{ orderId: 'o1' }] }
    httpPostMock.mockResolvedValue({ data: flat })
    const client = new PaytmClient(credentials())

    const result = await client.post('/x', { mid: 'MID1' }, { raw: true })

    expect(result).toEqual(flat)
  })

  it('unwraps {head,body}.body by default (non-raw) — the same behaviour existing single-lookup calls rely on', async () => {
    httpPostMock.mockResolvedValue({ data: { head: { version: 'v1' }, body: { orders: [1, 2] } } })
    const client = new PaytmClient(credentials())

    const result = await client.post('/x', { mid: 'MID1' })

    expect(result).toEqual({ orders: [1, 2] })
  })

  it('defaults options.raw response body to {} when the envelope has no body — matching the pre-#441 fallback', async () => {
    httpPostMock.mockResolvedValue({ data: { head: {} } })
    const client = new PaytmClient(credentials())

    const result = await client.post('/x', { mid: 'MID1' })

    expect(result).toEqual({})
  })
})
