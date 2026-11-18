/**
 * Marketplacer Invoice → Order transform.
 * Docs: https://api.marketplacer.com/docs/seller-api/examples/orders/invoices/
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawMarketplacerInvoice,
} from '../../../../../../../src/verticals/ecommerce/adapters/marketplacer/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeInvoice(overrides: Partial<RawMarketplacerInvoice> = {}): RawMarketplacerInvoice {
  return {
    id: 'SW52b2ljZS0xMDExMg==',
    legacyId: 10112,
    createdAt: '2020-11-11T14:49:13+11:00',
    updatedAt: '2021-10-08T12:59:25+11:00',
    paidAt: '2020-11-13T11:52:25+11:00',
    totalCents: 10000,
    statusFlags: ['PAID', 'SENT', 'REMITTED'],
    ...overrides,
  }
}

describe('transformOrder (Marketplacer invoice)', () => {
  it('maps id/orderNumber/name/totalPrice', () => {
    const result = transformOrder(makeInvoice(), 'AUD')
    expect(result.id).toBe('SW52b2ljZS0xMDExMg==')
    expect(result.orderNumber).toBe('10112')
    expect(result.name).toBe('#10112')
    expect(result.totalPrice).toEqual({ amount: 10000, currency: 'AUD' })
    expect(result.currency).toBe('AUD')
  })

  it.each([
    [['PAID', 'SENT'], 'PAID', 'FULFILLED'],
    [['PAID'], 'PAID', 'UNFULFILLED'],
    [['PAID', 'PARTIALLY_SENT'], 'PAID', 'PARTIAL'],
    [['REFUNDED'], 'REFUNDED', 'UNFULFILLED'],
    [[], 'PENDING', 'UNFULFILLED'],
  ] as const)('maps statusFlags %j to financial %s / fulfillment %s', (flags, financial, fulfillment) => {
    const result = transformOrder(makeInvoice({ statusFlags: [...flags] }), 'AUD')
    expect(result.financialStatus).toBe(financial)
    expect(result.fulfillmentStatus).toBe(fulfillment)
  })

  it('throws rather than defaulting currency', () => {
    // @ts-expect-error — currency is required
    expect(() => transformOrder(makeInvoice())).toThrow(/requires a currency/)
  })

  it('omits totalPrice when totalCents is not reported', () => {
    expect(transformOrder(makeInvoice({ totalCents: null }), 'AUD').totalPrice).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeInvoice()
    expect(transformOrder(raw, 'AUD').metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => OrderSchema.parse(transformOrder(makeInvoice(), 'AUD'))).not.toThrow()
  })
})
