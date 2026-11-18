import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawCirclePayout,
} from '../../../../../../../src/verticals/payments/adapters/circle/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('circle transformPayout', () => {
  it('maps a "complete" payout to status "paid"', () => {
    const raw: RawCirclePayout = {
      id: 'po-001',
      status: 'complete',
      amount: { amount: '250.00', currency: 'USD' },
      destination: { type: 'wire', id: 'bank-001' },
      createDate: '2024-03-01T00:00:00Z',
      updateDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('po-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('circle')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" payout to status "pending"', () => {
    const raw: RawCirclePayout = {
      id: 'po-002',
      status: 'pending',
      amount: { amount: '100.00', currency: 'EUR' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" payout to status "failed"', () => {
    const raw: RawCirclePayout = {
      id: 'po-003',
      status: 'failed',
      amount: { amount: '75.00', currency: 'USD' },
      errorCode: 'insufficient_funds',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('insufficient_funds')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('includes fee and sourceWalletId in metadata', () => {
    const raw: RawCirclePayout = {
      id: 'po-004',
      status: 'complete',
      amount: { amount: '500.00', currency: 'USD' },
      sourceWalletId: 'wallet-abc',
      fees: { amount: '1.00', currency: 'USD' },
      createDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.metadata['sourceWalletId']).toBe('wallet-abc')
    expect(result.metadata['fee']).toBe('1.00')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
