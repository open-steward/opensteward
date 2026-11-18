import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawMolliePayout,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('mollie transformPayout', () => {
  it('maps a paid_out payout with decimal amount to paid status in minor units', () => {
    const raw: RawMolliePayout = {
      id: 'po_1',
      status: 'paid_out',
      amount: { value: '250.00', currency: 'EUR' },
      reference: 'BANK-REF-001',
      createdAt: '2023-11-01T00:00:00+00:00',
      paidAt: '2023-11-03T00:00:00+00:00',
    }
    const result = transformPayout(raw)

    expect(result.id).toBe('po_1')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('paid')
    expect(result.arrivalDate).toBe('2023-11-03T00:00:00+00:00')
    expect(result.gateway).toBe('mollie')
    expect(result.metadata.reference).toBe('BANK-REF-001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps open status to pending', () => {
    const raw: RawMolliePayout = {
      id: 'po_2',
      status: 'open',
      amount: { value: '100.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps in_transit status correctly', () => {
    const raw: RawMolliePayout = {
      id: 'po_3',
      status: 'in_transit',
      amount: { value: '75.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
