import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawMollieSettlement,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('mollie transformBalanceTransaction', () => {
  it('maps a payment type to charge with minor unit conversion', () => {
    const raw: RawMollieSettlement = {
      id: 'stl_1',
      reference: 'REF-001',
      type: 'payment',
      resultAmount: { value: '100.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.id).toBe('stl_1')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('mollie')
    expect(result.metadata.reference).toBe('REF-001')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback type to dispute', () => {
    const raw: RawMollieSettlement = {
      id: 'stl_2',
      type: 'chargeback',
      resultAmount: { value: '-25.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout type correctly', () => {
    const raw: RawMollieSettlement = {
      id: 'stl_3',
      type: 'payout',
      resultAmount: { value: '500.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('payout')
    expect(result.amount).toBe(50000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
