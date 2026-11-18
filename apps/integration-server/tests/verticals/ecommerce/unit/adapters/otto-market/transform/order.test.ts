/**
 * OTTO Market Order → canonical Order.
 *
 * Source: the real OpenAPI spec (schema + worked examples) embedded in
 * https://api.otto.market/docs/assets/js/main.04c7dc1d.js — the Orders v4
 * page itself shows no JSON, but the docs site's own JS bundle carries the
 * full spec verbatim. `makeOrder`'s default position item is the actual
 * "Deal der Woche 52" / Red T-Shirt example from that bundle:
 *   { "positionItemId": "41d73c45-…", "fulfillmentStatus": "ANNOUNCED",
 *     "itemValueGrossPrice": { "amount": 13.37, "currency": "EUR" },
 *     "product": { "sku": "P4567", "productTitle": "Red T-Shirt", … } }
 * with no `quantity` key anywhere on it or on the `PositionItem__Orders-V4`
 * schema definition in that same bundle.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawOttoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/otto-market/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOttoOrder> = {}): RawOttoOrder {
  return {
    salesOrderId: '8bd8a7cb-1ce1-4024-bdec-1c60de3c8006',
    orderNumber: 'bwvdp9gcyk',
    orderDate: '2021-03-31T09:45:52.313+0000',
    lastModifiedDate: '2021-03-31T10:30:52.434+0000',
    orderLifecycleInformation: { lifecycleChangeDate: '2021-03-31T10:30:52.433+0000' },
    positionItems: [
      {
        positionItemId: '41d73c45-6177-4230-8907-4ffafd09064e',
        fulfillmentStatus: 'ANNOUNCED',
        itemValueGrossPrice: { amount: 13.37, currency: 'EUR' },
        product: {
          sku: 'P4567',
          productTitle: 'Red T-Shirt',
          articleNumber: 'X2G1D12FT8',
          ean: '4606938545083',
          vatRate: 19,
        },
      },
    ],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps confirmed top-level fields, including lastModifiedDate (NOT lifecycleChangeDate) as updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('8bd8a7cb-1ce1-4024-bdec-1c60de3c8006')
    expect(result.orderNumber).toBe('bwvdp9gcyk')
    expect(result.createdAt).toBe('2021-03-31T09:45:52.313+00:00')
    expect(result.updatedAt).toBe('2021-03-31T10:30:52.434+00:00')
  })

  it('normalises the bare +HHMM offset the spec\'s own examples use to the colon form IsoDatetime requires', () => {
    expect(transformOrder(makeOrder({ orderDate: '2021-04-16T05:59:01.255+0000' })).createdAt).toBe(
      '2021-04-16T05:59:01.255+00:00',
    )
  })

  it('converts the documented itemValueGrossPrice major-unit amount to minor units: 13.37 EUR -> 1337', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.price).toEqual({ amount: 1337, currency: 'EUR' })
  })

  it('maps sku/title from the nested product object, not a top-level sku field', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    expect(li.sku).toBe('P4567')
    expect(li.title).toBe('Red T-Shirt')
  })

  it('sets quantity to 1 — PositionItem has no quantity field in the real schema', () => {
    expect(transformOrder(makeOrder()).lineItems![0]!.quantity).toBe(1)
  })

  it('uses the gross price as the unit price and reports the discount separately, so it is never subtracted twice', () => {
    const result = transformOrder(
      makeOrder({
        positionItems: [
          {
            positionItemId: 'pi-1',
            itemValueGrossPrice: { amount: 20, currency: 'EUR' },
            itemValueReducedGrossPrice: { amount: 15, currency: 'EUR' },
            itemValueDiscount: { amount: 5, currency: 'EUR' },
            product: { sku: 'SKU-1', productTitle: 'Discounted item' },
          },
        ],
      }),
    )
    expect(result.lineItems![0]!.price).toEqual({ amount: 2000, currency: 'EUR' })
    expect(result.lineItems![0]!.totalDiscount).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('falls back to the reduced price only without a gross price, and then reports no discount', () => {
    const result = transformOrder(
      makeOrder({
        positionItems: [
          {
            positionItemId: 'pi-1',
            itemValueReducedGrossPrice: { amount: 15, currency: 'EUR' },
            itemValueDiscount: { amount: 5, currency: 'EUR' },
            product: { sku: 'SKU-1', productTitle: 'Discounted item' },
          },
        ],
      }),
    )
    expect(result.lineItems![0]!.price).toEqual({ amount: 1500, currency: 'EUR' })
    expect(result.lineItems![0]!.totalDiscount).toBeUndefined()
  })

  it('maps itemValueDiscount to totalDiscount when present', () => {
    const result = transformOrder(
      makeOrder({
        positionItems: [
          {
            positionItemId: 'pi-1',
            itemValueGrossPrice: { amount: 20, currency: 'EUR' },
            itemValueDiscount: { amount: 5, currency: 'EUR' },
            product: { sku: 'SKU-1', productTitle: 'Discounted item' },
          },
        ],
      }),
    )
    expect(result.lineItems![0]!.totalDiscount).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('drops a position item with neither price field — never invents a price', () => {
    const result = transformOrder(
      makeOrder({
        positionItems: [
          { positionItemId: 'pi-1', product: { sku: 'SKU-1', productTitle: 'No price' } },
        ],
      }),
    )
    expect(result.lineItems).toBeUndefined()
  })

  it('derives order currency from a real line-item currency — never hardcoded', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
    expect(
      transformOrder(
        makeOrder({
          positionItems: [
            { positionItemId: 'pi-1', product: { sku: 'S', productTitle: 'T' } },
          ],
        }),
      ).currency,
    ).toBeUndefined()
  })

  it('derives order fulfillmentStatus from position items — there is no order-level field', () => {
    const allSent = transformOrder(
      makeOrder({
        positionItems: [
          { positionItemId: 'a', fulfillmentStatus: 'SENT', itemValueGrossPrice: { amount: 1, currency: 'EUR' }, product: {} },
          { positionItemId: 'b', fulfillmentStatus: 'SENT', itemValueGrossPrice: { amount: 1, currency: 'EUR' }, product: {} },
        ],
      }),
    )
    expect(allSent.fulfillmentStatus).toBe('FULFILLED')

    const partial = transformOrder(
      makeOrder({
        positionItems: [
          { positionItemId: 'a', fulfillmentStatus: 'SENT', itemValueGrossPrice: { amount: 1, currency: 'EUR' }, product: {} },
          { positionItemId: 'b', fulfillmentStatus: 'ANNOUNCED', itemValueGrossPrice: { amount: 1, currency: 'EUR' }, product: {} },
        ],
      }),
    )
    expect(partial.fulfillmentStatus).toBe('PARTIAL')

    expect(transformOrder(makeOrder({ positionItems: [] })).fulfillmentStatus).toBeUndefined()
  })

  it('reads cancelledAt/cancelReason from the real per-item cancellationDate/cancellationReason fields', () => {
    const result = transformOrder(
      makeOrder({
        positionItems: [
          {
            positionItemId: 'pi-1',
            fulfillmentStatus: 'CANCELLED_BY_PARTNER',
            cancellationDate: '2021-04-16T06:44:02.249+0000',
            cancellationReason: 'CANCELLED_ON_PARTNER_WISH',
            itemValueGrossPrice: { amount: 99.2, currency: 'EUR' },
            product: { sku: 'A7567', productTitle: 'Black Jeans' },
          },
        ],
      }),
    )
    expect(result.cancelledAt).toBe('2021-04-16T06:44:02.249+00:00')
    expect(result.cancelReason).toBe('CANCELLED_ON_PARTNER_WISH')

    expect(transformOrder(makeOrder()).cancelledAt).toBeUndefined()
  })

  it('maps deliveryAddress/invoiceAddress using the real Address schema, converting Alpha-3 to Alpha-2', () => {
    const result = transformOrder(
      makeOrder({
        deliveryAddress: {
          firstName: 'Max',
          lastName: 'Mustermann',
          salutation: 'MR',
          street: 'Musterstraße',
          houseNumber: '17',
          zipCode: '12345',
          city: 'Musterstadt',
          countryCode: 'DEU',
          email: 'test@example.com',
          phoneNumber: '0491234567890',
        },
      }),
    )
    expect(result.shippingAddress).toEqual({
      line1: 'Musterstraße 17',
      line2: undefined,
      city: 'Musterstadt',
      postalCode: '12345',
      country: 'DE',
    })
    expect(result.email).toBe('test@example.com')
    expect(result.phone).toBe('0491234567890')
  })

  it('leaves country undefined for an Alpha-3 code with no known Alpha-2 mapping, rather than guess', () => {
    const result = transformOrder(makeOrder({ deliveryAddress: { countryCode: 'ZZZ', city: 'Nowhere' } }))
    expect(result.shippingAddress?.country).toBeUndefined()
    expect(result.shippingAddress?.city).toBe('Nowhere')
  })

  it('preserves the raw payload in metadata at both order and line-item level', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(result.lineItems![0]!.metadata).toBe(raw.positionItems![0])
  })

  it('produces a payload that satisfies OrderSchema, with or without priced line items', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
    expect(() => OrderSchema.parse(transformOrder(makeOrder({ positionItems: [] })))).not.toThrow()
  })
})
