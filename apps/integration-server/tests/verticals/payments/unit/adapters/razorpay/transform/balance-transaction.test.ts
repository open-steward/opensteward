import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawRazorpaySettlement,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('razorpay transformBalanceTransaction', () => {
  it('maps a settlement entity to payout type with INR currency', () => {
    const raw: RawRazorpaySettlement = {
      id: 'setl_1',
      entity: 'settlement',
      amount: 50000,
      status: 'processed',
      fees: 300,
      tax: 54,
      utr: 'UTR123456',
      created_at: 1_700_000_000,
    }
    const result = transformBalanceTransaction(raw)

    expect(result.id).toBe('setl_1')
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('INR')
    expect(result.fee).toBe(300)
    expect(result.gateway).toBe('razorpay')
    expect(result.metadata.utr).toBe('UTR123456')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund entity to refund type', () => {
    const raw: RawRazorpaySettlement = {
      id: 'setl_2',
      entity: 'refund',
      amount: 1000,
      created_at: 1_700_000_000,
    }
    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
