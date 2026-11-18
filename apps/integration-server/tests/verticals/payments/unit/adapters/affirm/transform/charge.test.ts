import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAffirmCharge,
} from '../../../../../../../src/verticals/payments/adapters/affirm/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('affirm transformCharge', () => {
  it('maps status "captured" to "succeeded" and passes amount through as-is (minor units)', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-001',
      status: 'captured',
      amount: 4999,
      amount_refunded: 0,
      user: { email: 'buyer@example.com', first_name: 'Jane', last_name: 'Doe' },
      details: { order_id: 'ord-42' },
      created: '2024-03-01T12:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('affirm')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "authorized" to "pending"', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-002',
      status: 'authorized',
      amount: 2000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "voided" to "cancelled"', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-003',
      status: 'voided',
      amount: 1500,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "refunded" to "refunded"', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-004',
      status: 'refunded',
      amount: 1000,
      amount_refunded: 1000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "partially_refunded" to "partially_refunded"', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-005',
      status: 'partially_refunded',
      amount: 3000,
      amount_refunded: 500,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('builds description from user name and falls back to order_id', () => {
    const rawWithName: RawAffirmCharge = {
      id: 'affirm-charge-006',
      status: 'captured',
      amount: 100,
      user: { first_name: 'Alice', last_name: 'Smith' },
      details: { order_id: 'ord-99' },
    }
    const resultWithName = transformCharge(rawWithName)
    expect(resultWithName.description).toBe('Alice Smith')

    const rawNoName: RawAffirmCharge = {
      id: 'affirm-charge-007',
      status: 'captured',
      amount: 100,
      details: { order_id: 'ord-100' },
    }
    const resultNoName = transformCharge(rawNoName)
    expect(resultNoName.description).toBe('ord-100')
    expect(() => ChargeSchema.parse(resultNoName)).not.toThrow()
  })

  it('maps status "failed" to "failed"', () => {
    const raw: RawAffirmCharge = {
      id: 'affirm-charge-008',
      status: 'failed',
      amount: 500,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
