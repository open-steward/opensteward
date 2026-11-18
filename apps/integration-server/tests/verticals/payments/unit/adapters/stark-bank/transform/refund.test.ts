import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawStarkBankRefund,
} from '../../../../../../../src/verticals/payments/adapters/stark-bank/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('stark-bank transformRefund', () => {
  it('maps a succeeded reversal', () => {
    const raw: RawStarkBankRefund = {
      id: 're_sb_1',
      paymentId: 'ch_sb_1',
      amount: 5000,
      currency: 'BRL',
      status: 'success',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_sb_1')
    expect(result.chargeId).toBe('ch_sb_1')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('stark-bank')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawStarkBankRefund = {
      id: 're_sb_2',
      paymentId: 'ch_sb_2',
      amount: 3000,
      currency: 'BRL',
      status: 'created',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawStarkBankRefund = {
      id: 're_sb_3',
      paymentId: 'ch_sb_3',
      amount: 1000,
      currency: 'BRL',
      status: 'failed',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to BRL when absent', () => {
    const raw: RawStarkBankRefund = {
      id: 're_sb_4',
      paymentId: 'ch_sb_4',
      amount: 2000,
      status: 'succeeded',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('BRL')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
