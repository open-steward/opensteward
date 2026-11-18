import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBelvoTransaction,
} from '../../../../../../../src/verticals/payments/adapters/belvo/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('belvo transformCharge', () => {
  it('maps a PROCESSED OUTFLOW transaction to status "succeeded"', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-001',
      account: {
        id: 'acct-001',
        currency: 'BRL',
        name: 'Checking Account',
      },
      amount: 150.75,
      currency: 'BRL',
      description: 'Supermarket purchase',
      type: 'OUTFLOW',
      status: 'PROCESSED',
      value_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('belvo-txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(15075)
    expect(result.currency).toBe('BRL')
    expect(result.customerId).toBe('acct-001')
    expect(result.gateway).toBe('belvo')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transaction to status "pending"', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-002',
      currency: 'MXN',
      amount: 200.0,
      type: 'INFLOW',
      status: 'PENDING',
      value_date: '2024-03-01',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(20000)
    expect(result.currency).toBe('MXN')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps account as a bare string to customerId', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-003',
      account: 'acct-string-id',
      currency: 'BRL',
      amount: 50.0,
      status: 'PROCESSED',
    }
    const result = transformCharge(raw)
    expect(result.customerId).toBe('acct-string-id')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to account currency when transaction currency is absent', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-004',
      account: {
        id: 'acct-002',
        currency: 'COP',
      },
      amount: 100.0,
      status: 'PROCESSED',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('COP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses merchant_name as description when description is absent', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-005',
      currency: 'BRL',
      amount: 30.0,
      status: 'PROCESSED',
      merchant: { merchant_name: 'Coffee Shop' },
    }
    const result = transformCharge(raw)
    expect(result.description).toBe('Coffee Shop')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
