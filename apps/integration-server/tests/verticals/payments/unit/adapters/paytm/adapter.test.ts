/**
 * PaytmAdapter.listCharges / listRefunds.
 *
 * `./client` is mocked so these pin the REQUEST the adapter builds — path,
 * body, and head override — not just the transform. `merchantPassbookUrl`
 * is mocked to identity so assertions compare against the bare path
 * constants; the host resolution itself is pinned separately in
 * `client.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postMock, merchantPassbookUrlMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  merchantPassbookUrlMock: vi.fn((path: string) => path),
}))

vi.mock('../../../../../../src/verticals/payments/adapters/paytm/client', () => ({
  PaytmClient: class {
    post = postMock
    merchantPassbookUrl = merchantPassbookUrlMock
  },
}))

import {
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
} from '@opensteward/shared'
import { PaytmAdapter } from '../../../../../../src/verticals/payments/adapters/paytm'
import {
  ORDER_LIST_PATH,
  REFUND_LIST_PATH,
} from '../../../../../../src/verticals/payments/adapters/paytm/constants'

const adapter = new PaytmAdapter()
const creds = { accessToken: 'key', extra: { mid: 'MID123', environment: 'staging' } }

type PostCall = [string, Record<string, unknown>, { head?: Record<string, unknown>; raw?: boolean }?]

describe('PaytmAdapter.listCharges', () => {
  beforeEach(() => {
    postMock.mockReset()
    merchantPassbookUrlMock.mockClear()
  })

  it('fans out one CHECKSUM-signed POST per orderSearchStatus, to the Order List path, with a 30-day default window', async () => {
    postMock.mockResolvedValue({ orders: [], resultInfo: { resultStatus: 'SUCCESS' } })

    await adapter.listCharges(creds, { limit: 25 })

    expect(postMock).toHaveBeenCalledTimes(3)
    const calls = postMock.mock.calls as PostCall[]
    const statuses = calls.map(([, body]) => body.orderSearchStatus)
    expect(new Set(statuses)).toEqual(new Set(['SUCCESS', 'FAILURE', 'PENDING']))

    for (const [path, body, options] of calls) {
      expect(path).toBe(ORDER_LIST_PATH)
      expect(body).toMatchObject({
        mid: 'MID123',
        orderSearchType: 'TRANSACTION',
        pageNumber: 1,
        pageSize: 25,
      })
      expect(body.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/)
      expect(body.toDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/)
      // 30-day default window (allow a little slack for test execution time).
      const from = new Date(body.fromDate as string).getTime()
      const to = new Date(body.toDate as string).getTime()
      expect(to - from).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
      expect(to - from).toBeLessThan(31 * 24 * 60 * 60 * 1000)
      expect(options).toEqual({ head: { tokenType: 'CHECKSUM' } })
    }
  })

  it('uses params.updatedAfter as fromDate instead of the 30-day default', async () => {
    postMock.mockResolvedValue({ orders: [] })
    const updatedAfter = new Date('2026-01-01T00:00:00Z')

    await adapter.listCharges(creds, { updatedAfter })

    const [, body] = (postMock.mock.calls as PostCall[])[0]
    // 2026-01-01T00:00:00Z is 2026-01-01T05:30:00 IST.
    expect(body.fromDate).toBe('2026-01-01T05:30:00+05:30')
  })

  it('merges rows from all three statuses and maps them through transformChargeListItem, tolerating a null orders array on one status', async () => {
    postMock.mockImplementation(async (_path: string, body: Record<string, unknown>) => {
      if (body.orderSearchStatus === 'SUCCESS') {
        return {
          orders: [
            {
              merchantOrderId: 'ORDER_S1',
              orderCreatedTime: '2026-01-05 10:00:00',
              orderSearchStatus: 'SUCCESS',
              amount: '250.00',
            },
          ],
        }
      }
      if (body.orderSearchStatus === 'FAILURE') {
        return {
          orders: [
            {
              merchantOrderId: 'ORDER_F1',
              orderCreatedTime: '2026-01-06 11:00:00',
              orderSearchStatus: 'FAILURE',
              amount: '50.00',
            },
          ],
        }
      }
      // PENDING: vendor returns `orders: null` on a status with no matches.
      return { orders: null }
    })

    const result = await adapter.listCharges(creds, {})

    expect(result).toHaveLength(2)
    const byId = Object.fromEntries(result.map((c) => [c.id, c]))
    expect(byId.ORDER_S1).toMatchObject({ status: 'succeeded', amount: 25000, captured: true })
    expect(byId.ORDER_F1).toMatchObject({ status: 'failed', amount: 5000 })
  })
})

describe('PaytmAdapter.listRefunds', () => {
  beforeEach(() => {
    postMock.mockReset()
    merchantPassbookUrlMock.mockClear()
  })

  it('POSTs the flat refundList body, CHECKSUM-signed, in raw-response mode, to the Refund List path', async () => {
    postMock.mockResolvedValue({ status: 'SUCCESS', count: 0, orders: [] })

    await adapter.listRefunds(creds, { limit: 10 })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, options] = (postMock.mock.calls as PostCall[])[0]
    expect(path).toBe(REFUND_LIST_PATH)
    expect(body).toMatchObject({ mid: 'MID123', pageNum: 1, pageSize: 10 })
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/)
    expect(body.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/)
    expect(options).toEqual({ head: { tokenType: 'CHECKSUM' }, raw: true })
  })

  it('caps pageSize at the vendor-documented 50-per-page limit', async () => {
    postMock.mockResolvedValue({ status: 'SUCCESS', count: 0, orders: [] })

    await adapter.listRefunds(creds, { limit: 500 })

    const [, body] = (postMock.mock.calls as PostCall[])[0]
    expect(body.pageSize).toBe(50)
  })

  it('reports the 50 it sends, so the router does not read a full page as the last', async () => {
    // The router asks for 100 by default. Judged against that, 50 refunds —
    // a full page at the vendor maximum — read as the end of the list, and
    // the cache stored them as every refund.
    postMock.mockResolvedValue({ status: 'SUCCESS', count: 0, orders: [] })
    const params = parseListQuery({})
    await adapter.listRefunds(creds, params)
    expect(readUpstreamPage(params)?.pageSize).toBe(50)
    const fifty = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }))
    expect(listPage(fifty, params, 'paytm').meta).toMatchObject({ limit: 50, hasMore: null })
    expect(collectionIsComplete(params, fifty)).toBe(false)
  })

  it('includes head.clientId only when credentials.extra.clientId is configured', async () => {
    postMock.mockResolvedValue({ status: 'SUCCESS', count: 0, orders: [] })

    await adapter.listRefunds(creds, {})
    expect((postMock.mock.calls as PostCall[])[0][2]).toEqual({ head: { tokenType: 'CHECKSUM' }, raw: true })

    postMock.mockClear()
    const credsWithClientId = { ...creds, extra: { ...creds.extra, clientId: 'C11' } }
    await adapter.listRefunds(credsWithClientId, {})
    expect((postMock.mock.calls as PostCall[])[0][2]).toEqual({
      head: { tokenType: 'CHECKSUM', clientId: 'C11' },
      raw: true,
    })
  })

  it('maps rows through transformRefundListItem, and the id round-trips into getRefund', async () => {
    postMock.mockResolvedValueOnce({
      status: 'SUCCESS',
      count: 1,
      orders: [
        {
          orderId: 'PARCEL213321',
          refId: 'REF_PARCEL213321',
          refundId: '200602870171336224',
          acceptRefundStatus: 'SUCCESS',
          acceptRefundTimeStamp: '2020-06-02 14:40:07',
          refundAmount: '1.00',
        },
      ],
    })

    const [refund] = await adapter.listRefunds(creds, {})
    expect(refund.id).toBe('PARCEL213321:REF_PARCEL213321')
    expect(refund.chargeId).toBe('PARCEL213321')
    expect(refund.status).toBe('succeeded')
    expect(refund.amount).toBe(100)

    // Round-trip: getRefund(refund.id) must split back into the same
    // orderId/refId the Refund Status API needs.
    postMock.mockReset()
    postMock.mockResolvedValueOnce({ resultInfo: { resultStatus: 'TXN_SUCCESS' } })
    await adapter.getRefund(creds, refund.id)
    const [path, body] = (postMock.mock.calls as PostCall[])[0]
    expect(path).toBe('/v2/refund/status')
    expect(body).toMatchObject({ orderId: 'PARCEL213321', refId: 'REF_PARCEL213321' })
  })

  it('tolerates a null orders array (no matches for the window) rather than throwing', async () => {
    postMock.mockResolvedValue({ status: 'SUCCESS', count: 0, resultCode: '00000000', orders: null })

    const result = await adapter.listRefunds(creds, {})

    expect(result).toEqual([])
  })
})
