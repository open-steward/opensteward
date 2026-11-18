/**
 * Pins the actual HTTP requests the Pinduoduo adapter sends — not just the
 * transforms — for two fixes: the cancelOrder no-op removed, and
 * refund listing implemented via pdd.refund.list.increment.get /
 * pdd.refund.information.get. PDD POSTs a single router endpoint with a
 * URL-encoded body keyed by `type`; this mocks `axios.create` the same way
 * `order-scoped-lists.test.ts` mocks Shopify's client, and decodes the body
 * back into params to assert on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { QueryParams } from '@opensteward/shared'
import { PinduoduoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pinduoduo/index'
import { REFUND_LIST_WINDOW_SECONDS } from '../../../../../../src/verticals/ecommerce/adapters/pinduoduo/constants'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS = { accessToken: 'client-id-1', extra: { clientSecret: 'shh' } }

interface Call {
  path: string
  body: URLSearchParams
}

function fakeHttp(answer: (body: URLSearchParams) => unknown) {
  const calls: Call[] = []
  const post = vi.fn(async (path: string, body: string) => {
    const parsed = new URLSearchParams(body)
    calls.push({ path, body: parsed })
    return { data: answer(parsed) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post, calls }
}

afterEach(() => vi.restoreAllMocks())

describe('Pinduoduo listRefunds — request shape', () => {
  it('calls pdd.refund.list.increment.get with a bounded start/end update-time window', async () => {
    const { calls } = fakeHttp(() => ({
      refund_list_increment_get_response: { refund_list: [] },
    }))
    const adapter = new PinduoduoAdapter()
    const updatedAfter = new Date('2026-09-13T00:00:00Z')

    await adapter.listRefunds!(CREDS, { updatedAfter, limit: 50 } as QueryParams)

    expect(calls).toHaveLength(1)
    const body = calls[0]!.body
    expect(body.get('type')).toBe('pdd.refund.list.increment.get')
    const start = Math.floor(updatedAfter.getTime() / 1000)
    expect(body.get('start_updated_at')).toBe(String(start))
    expect(body.get('end_updated_at')).toBe(String(start + REFUND_LIST_WINDOW_SECONDS))
    expect(body.get('page_size')).toBe('50')
    expect(body.get('page_num')).toBe('1')
  })

  it('defaults the window to the last REFUND_LIST_WINDOW_SECONDS when no updatedAfter is given', async () => {
    const { calls } = fakeHttp(() => ({
      refund_list_increment_get_response: { refund_list: [] },
    }))
    const adapter = new PinduoduoAdapter()
    const before = Math.floor(Date.now() / 1000)

    await adapter.listRefunds!(CREDS, {} as QueryParams)

    const after = Math.floor(Date.now() / 1000)
    const body = calls[0]!.body
    const start = Number(body.get('start_updated_at'))
    const end = Number(body.get('end_updated_at'))
    expect(end - start).toBe(REFUND_LIST_WINDOW_SECONDS)
    expect(start).toBeGreaterThanOrEqual(before - REFUND_LIST_WINDOW_SECONDS)
    expect(start).toBeLessThanOrEqual(after - REFUND_LIST_WINDOW_SECONDS)
  })

  it('maps refund_list entries through transformRefund', async () => {
    fakeHttp(() => ({
      refund_list_increment_get_response: {
        refund_list: [{ refund_id: 'RF1', order_sn: 'PDD1', refund_amount: 100 }],
      },
    }))
    const adapter = new PinduoduoAdapter()
    const out = await adapter.listRefunds!(CREDS, {} as QueryParams)
    expect(out.map((r) => r.id)).toEqual(['RF1'])
    expect(out.map((r) => r.orderId)).toEqual(['PDD1'])
  })
})

describe('Pinduoduo getRefund — request shape', () => {
  it('calls pdd.refund.information.get with refund_id and unwraps refund_info', async () => {
    const { calls } = fakeHttp(() => ({
      refund_information_get_response: {
        refund_info: { refund_id: 'RF1', order_sn: 'PDD1', refund_amount: 500 },
      },
    }))
    const adapter = new PinduoduoAdapter()

    const refund = await adapter.getRefund!(CREDS, 'RF1')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.body.get('type')).toBe('pdd.refund.information.get')
    expect(calls[0]!.body.get('refund_id')).toBe('RF1')
    expect(refund.id).toBe('RF1')
    expect(refund.orderId).toBe('PDD1')
  })

  it('throws when the PDD response carries no refund_info', async () => {
    fakeHttp(() => ({ refund_information_get_response: {} }))
    const adapter = new PinduoduoAdapter()

    await expect(adapter.getRefund!(CREDS, 'missing')).rejects.toThrow(/no refund found/)
  })
})

describe('Pinduoduo cancelOrder', () => {
  it('is not implemented, so the registry/router 501s instead of faking a cancel', () => {
    // Typed via the interface, not the concrete class: PinduoduoAdapter no
    // longer declares `cancelOrder` at all (it was deleted, not stubbed), so
    // accessing it on the concrete class type is a compile error
    // (`Property 'cancelOrder' does not exist`). Typed as `EcommerceAdapter`,
    // `cancelOrder` is a declared-optional method and the access type-checks
    // as `(...) => Promise<Order> | undefined`, matching the runtime check.
    const adapter: EcommerceAdapter = new PinduoduoAdapter()
    expect(adapter.cancelOrder).toBeUndefined()
  })
})

// PDD's public API catalog (POST https://open-api.pinduoduo.com/pop/doc/info/list/byCat,
// all 28 categories, 292 method ids) has no buyer/customer method, and the
// order FAQ (idStr=3155CCB725082A31) says the receiver fields are encrypted.
// listCustomers/getCustomer used to project buyers out of pdd.order.list.get;
// they now refuse before any request is sent.
describe('Pinduoduo customers — refused (no documented buyer API)', () => {
  it('listCustomers throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { post } = fakeHttp(() => ({ order_list_get_response: { order_list: [] } }))
    const adapter = new PinduoduoAdapter()

    await expect(
      adapter.listCustomers!(CREDS, { page: 1, limit: 10 } as QueryParams),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('getCustomer throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { post } = fakeHttp(() => ({ order_list_get_response: { order_list: [] } }))
    const adapter = new PinduoduoAdapter()

    await expect(adapter.getCustomer!(CREDS, 'buyer-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(post).not.toHaveBeenCalled()
  })
})
