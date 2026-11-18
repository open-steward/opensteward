import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ShipbubbleShipmentWithPayment,
} from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(
  overrides: Partial<ShipbubbleShipmentWithPayment> = {},
): ShipbubbleShipmentWithPayment {
  return {
    order_id: 'SB-ORD-001',
    status: 'confirmed',
    courier: {
      name: 'GIG Logistics',
      tracking_code: 'GIGL1234567890',
    },
    payment: {
      amount: 150000,
      currency: 'NGN',
      payment_method: 'wallet',
      status: 'paid',
    },
    date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (shipbubble)', () => {
  it('maps id and shipmentId from order_id', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('SB-ORD-001')
    expect(result.shipmentId).toBe('SB-ORD-001')
  })

  it('maps trackingNumber from courier.tracking_code', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('GIGL1234567890')
  })

  it('maps carrierId from courier.name', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('GIG Logistics')
  })

  it('status is always CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps cost amount from payment.amount', () => {
    const result = transformLabel(makeLabel())
    expect(result.cost?.amount).toBe(150000)
    expect(result.cost?.currency).toBe('NGN')
  })

  it('maps createdAt as Date from date field', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('omits cost when payment is absent', () => {
    const result = transformLabel(makeLabel({ payment: null }))
    expect(result.cost).toBeUndefined()
  })

  it('omits cost when payment.amount is null', () => {
    const result = transformLabel(makeLabel({ payment: { amount: null, currency: 'NGN' } }))
    expect(result.cost).toBeUndefined()
  })

  it('defaults currency to NGN when not provided', () => {
    const result = transformLabel(makeLabel({ payment: { amount: 500, currency: null } }))
    expect(result.cost?.currency).toBe('NGN')
  })

  it('maps url from waybill_document', () => {
    const result = transformLabel(
      makeLabel({ waybill_document: 'https://shipbubble.com/labels/SB-ORD-001.pdf' }),
    )
    expect(result.url).toBe('https://shipbubble.com/labels/SB-ORD-001.pdf')
  })

  it(// LabelSchema.url uses z.url() — only passes when waybill_document is a valid URL
  // cost.amount uses MoneySchema which requires integer (Amount = z.number().int())
  // transformLabel passes payment.amount directly via parseDecimal, which preserves integers
  'passes LabelSchema.parse without throwing for integer payment amount', () => {
    const result = transformLabel(
      makeLabel({ waybill_document: 'https://shipbubble.com/labels/SB-ORD-001.pdf' }),
    )
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
