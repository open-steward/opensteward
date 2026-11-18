import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFastspringOrder,
} from '../../../../../../../src/verticals/payments/adapters/fastspring/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('fastspring transformCharge', () => {
  it('maps a completed order to status "succeeded"', () => {
    const raw: RawFastspringOrder = {
      id: 'ORDER-001',
      order: 'ORD-001',
      reference: 'FS-REF-001',
      completed: true,
      currency: 'usd',
      total: 49.99,
      account: { id: 'ACCT-001', account: 'ACCT-001' },
      customer: {
        first: 'Jane',
        last: 'Doe',
        email: 'jane.doe@example.com',
        company: 'Acme Corp',
      },
      invoiceUrl: 'https://fastspring.com/invoices/FS-REF-001',
      payment: { type: 'visa', cardEnding: '1111' },
      changed: 1709251200000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    // fastspring pickCurrency uppercases: 'usd' → 'USD'
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('fastspring')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('ACCT-001')
    expect(result.receiptEmail).toBe('jane.doe@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an incomplete (pending) order to status "pending"', () => {
    const raw: RawFastspringOrder = {
      id: 'ORDER-002',
      completed: false,
      currency: 'USD',
      total: 29.99,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(result.amount).toBe(2999)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('resolves account id from a string account field', () => {
    const raw: RawFastspringOrder = {
      id: 'ORDER-003',
      completed: true,
      currency: 'USD',
      total: 10,
      account: 'ACCT-STRING-001',
    }
    const result = transformCharge(raw)
    expect(result.customerId).toBe('ACCT-STRING-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
