import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawIxopayPayout,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('ixopay transformPayout', () => {
  it('maps transactionStatus FINISHED to "paid" and converts amount', () => {
    const raw: RawIxopayPayout = {
      uuid: 'pay-uuid-001',
      transactionStatus: 'FINISHED',
      amount: '100.00',
      currency: 'EUR',
      returnData: { createdAt: '2024-03-01T00:00:00Z' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('ixopay')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus PENDING to "in_transit"', () => {
    const raw: RawIxopayPayout = {
      uuid: 'pay-uuid-002',
      transactionStatus: 'PENDING',
      amount: '50.00',
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus ERROR to "failed" and captures failure', () => {
    const raw: RawIxopayPayout = {
      uuid: 'pay-uuid-003',
      transactionStatus: 'ERROR',
      amount: '20.00',
      currency: 'GBP',
      errors: [{ code: 'P001', adapterMessage: 'Payout blocked' }],
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('P001')
    expect(result.failureMessage).toBe('Payout blocked')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to returnType REDIRECT as "in_transit"', () => {
    const raw: RawIxopayPayout = {
      uuid: 'pay-uuid-004',
      returnType: 'REDIRECT',
      amount: '30.00',
      currency: 'EUR',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
