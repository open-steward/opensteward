/**
 * Ozon FBS posting → canonical Order.
 *
 * Sources: `POST /v3/posting/fbs/list` (`result.postings[]`) and
 * `POST /v3/posting/fbs/get` (`result`) — FBS tag of the Ozon Seller API.
 * Field names (`posting_number`, `order_id`, `order_number`, `status`,
 * `in_process_at`, `products[].{sku, offer_id, name, quantity, price,
 * currency_code}`, `cancellation.cancel_reason`) and the posting status list
 * are from Ozon's official OpenAPI spec:
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 * Both paths confirmed live 2026-09-13.
 *
 * An Ozon order can split into several postings; the posting — not the
 * order — is what Ozon lets a seller list, fetch and cancel, so it is the
 * canonical Order here.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawOzonPosting,
} from '../../../../../../../src/verticals/ecommerce/adapters/ozon/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makePosting(overrides: Partial<RawOzonPosting> = {}): RawOzonPosting {
  return {
    posting_number: '05708065-0029-1',
    order_id: 680420041,
    order_number: '05708065-0029',
    status: 'awaiting_packaging',
    substatus: 'posting_created',
    in_process_at: '2024-05-20T09:12:30.123Z',
    shipment_date: '2024-05-21T10:00:00Z',
    tracking_number: '',
    products: [
      {
        sku: 1076001,
        offer_id: 'KB-01',
        name: 'Клавиатура',
        quantity: 2,
        price: '1390.000000',
        currency_code: 'RUB',
        mandatory_mark: [],
      },
    ],
    cancellation: {
      cancel_reason: '',
      cancel_reason_id: 0,
      cancellation_initiator: '',
      cancellation_type: '',
      cancelled_after_ship: false,
      affect_cancellation_rating: false,
    },
    customer: null,
    addressee: null,
    ...overrides,
  }
}

describe('ozon transformOrder', () => {
  it('uses the posting number as the id and keeps the parent order number', () => {
    const order = transformOrder(makePosting())
    expect(order.id).toBe('05708065-0029-1')
    expect(order.name).toBe('05708065-0029-1')
    expect(order.orderNumber).toBe('05708065-0029')
  })

  it('maps products to line items with minor-unit prices in the posting currency', () => {
    const order = transformOrder(makePosting())
    expect(order.currency).toBe('RUB')
    expect(order.lineItems).toEqual([
      {
        id: '05708065-0029-1:1076001',
        variantId: 'KB-01',
        sku: 'KB-01',
        title: 'Клавиатура',
        quantity: 2,
        price: { amount: 139000, currency: 'RUB' },
        metadata: makePosting().products![0],
      },
    ])
  })

  // A partial or empty list would assert the posting holds fewer products than
  // it does; when any product cannot be mapped without inventing data, the
  // whole field is omitted and the raw products stay in metadata.
  it('never invents a currency: omits lineItems when a product has no currency_code', () => {
    const order = transformOrder(
      makePosting({
        products: [
          makePosting().products![0]!,
          { sku: 1, offer_id: 'A', name: 'A', quantity: 1, price: '10.00' },
        ],
      }),
    )
    expect(order.currency).toBeUndefined()
    expect(order.lineItems).toBeUndefined()
  })

  it('omits lineItems when a product price is not a number', () => {
    const order = transformOrder(
      makePosting({
        products: [{ sku: 1, offer_id: 'A', name: 'A', quantity: 1, price: '', currency_code: 'RUB' }],
      }),
    )
    expect(order.lineItems).toBeUndefined()
  })

  it('reports an explicitly empty products array as no line items', () => {
    expect(transformOrder(makePosting({ products: [] })).lineItems).toEqual([])
  })

  it('reports lineItems as absent (not empty) when the payload has no products key', () => {
    const raw = makePosting()
    delete raw.products
    expect(transformOrder(raw).lineItems).toBeUndefined()
  })

  it('maps documented posting statuses onto the canonical fulfilment status', () => {
    const cases: Array<[string, string]> = [
      ['awaiting_registration', 'UNFULFILLED'],
      ['acceptance_in_progress', 'UNFULFILLED'],
      ['awaiting_approve', 'UNFULFILLED'],
      ['awaiting_packaging', 'UNFULFILLED'],
      ['awaiting_deliver', 'UNFULFILLED'],
      ['sent_by_seller', 'FULFILLED'],
      ['driver_pickup', 'FULFILLED'],
      ['delivering', 'FULFILLED'],
      ['delivered', 'FULFILLED'],
      ['arbitration', 'unknown'],
      ['cancelled', 'unknown'],
      ['a_status_ozon_adds_later', 'unknown'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makePosting({ status })).fulfillmentStatus).toBe(expected)
    }
  })

  it('carries Ozon’s cancellation reason on cancelled postings only', () => {
    const cancelled = transformOrder(
      makePosting({
        status: 'cancelled',
        cancellation: { ...makePosting().cancellation!, cancel_reason: 'Покупатель отменил заказ', cancel_reason_id: 506 },
      }),
    )
    expect(cancelled.cancelReason).toBe('Покупатель отменил заказ')
    expect(transformOrder(makePosting()).cancelReason).toBeUndefined()
  })

  it('takes createdAt from in_process_at when it carries a zone', () => {
    expect(transformOrder(makePosting()).createdAt).toBe('2024-05-20T09:12:30.123Z')
  })

  it('does not guess a zone for a timestamp without one', () => {
    expect(transformOrder(makePosting({ in_process_at: '2024-05-20 09:12:30' })).createdAt).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makePosting()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const parsed = OrderSchema.parse(transformOrder(makePosting()))
    expect(parsed.lineItems).toHaveLength(1)
  })
})
