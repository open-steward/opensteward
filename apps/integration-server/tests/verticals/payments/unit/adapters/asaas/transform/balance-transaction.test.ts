import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawAsaasFinancialTransaction,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('asaas transformBalanceTransaction', () => {
  it('maps a PAYMENT entry to type=charge', () => {
    const raw: RawAsaasFinancialTransaction = {
      id: 'FT-001',
      type: 'PAYMENT',
      value: 129.9,
      balance: 300.0,
      date: '2024-03-01T00:00:00Z',
      description: 'Payment received',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.id).toBe('FT-001')
    expect(result.type).toBe('charge')
    // 129.9 reais → 12990 centavos
    expect(result.amount).toBe(12990)
    expect(result.currency).toBe('BRL')
    expect(result.net).toBe(30000)
    expect(result.description).toBe('Payment received')
    expect(result.gateway).toBe('asaas')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a TRANSFER entry to type=payout', () => {
    const raw: RawAsaasFinancialTransaction = {
      id: 'FT-002',
      type: 'TRANSFER',
      value: -500.0,
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('payout')
    expect(result.amount).toBe(-50000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a CHARGEBACK entry to type=dispute', () => {
    const raw: RawAsaasFinancialTransaction = {
      id: 'FT-003',
      type: 'CHARGEBACK',
      value: -99.9,
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUND entry to type=refund', () => {
    const raw: RawAsaasFinancialTransaction = {
      id: 'FT-004',
      type: 'REFUND',
      value: -50.0,
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a FEE entry to type=fee', () => {
    const raw: RawAsaasFinancialTransaction = {
      id: 'FT-005',
      type: 'FEE',
      value: -1.5,
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('fee')
    expect(result.amount).toBe(-150)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
