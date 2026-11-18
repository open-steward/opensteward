import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawNuveiPayout,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('nuvei transformPayout', () => {
  it('maps an APPROVED payout to canonical Payout with status paid', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_001',
      transactionStatus: 'APPROVED',
      amount: '100.00',
      currency: 'usd',
      userTokenId: 'user_tok_1',
      userPaymentOptionId: 'upo_10',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T02:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('po_001')
    expect(result.externalId).toBe('po_001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.method).toBe('standard')
    expect(result.gateway).toBe('nuvei')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps DECLINED transactionStatus to failed and captures failure info', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_002',
      transactionStatus: 'DECLINED',
      amount: '50.00',
      currency: 'EUR',
      errCode: 2001,
      reason: 'Account closed',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Account closed')
    expect(result.failureCode).toBe('2001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps ERROR transactionStatus to failed', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_003',
      transactionStatus: 'ERROR',
      amount: '25.00',
      currency: 'GBP',
      reason: 'System error',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('System error')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING transactionStatus to pending', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_004',
      transactionStatus: 'PENDING',
      amount: '75.00',
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.failureMessage).toBeUndefined()
    expect(result.failureCode).toBeUndefined()
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to clientUniqueId then internalRequestId for id when transactionId is absent', () => {
    const raw: RawNuveiPayout = {
      clientUniqueId: 'client_po_abc',
      internalRequestId: 'internal_001',
      transactionStatus: 'APPROVED',
      amount: '10.00',
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('client_po_abc')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('uses request-level status=SUCCESS when transactionStatus is absent', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_005',
      status: 'SUCCESS',
      amount: '30.00',
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('picks destinationLast4 from cardData', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_006',
      transactionStatus: 'APPROVED',
      amount: '20.00',
      currency: 'USD',
      cardData: { last4Digits: '9876' },
    }
    const result = transformPayout(raw)
    expect(result.destinationLast4).toBe('9876')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when currency is absent', () => {
    const raw: RawNuveiPayout = {
      transactionId: 'po_007',
      transactionStatus: 'APPROVED',
      amount: '5.00',
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('USD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
