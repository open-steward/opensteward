import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCieloVoid,
  type CieloRefundContext,
} from '../../../../../../../src/verticals/payments/adapters/cielo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const baseVoid: RawCieloVoid = {
  Status: 10, // Voided → succeeded
  ReturnCode: '0',
  ReturnMessage: 'Successful',
  Tid: 'TID-001',
  ProofOfSale: 'POS-001',
  AuthorizationCode: 'AUTH-001',
  ReasonCode: 0,
  ReasonMessage: 'Successful',
}

const baseCtx: CieloRefundContext = {
  chargeId: 'PAY-UUID-001',
  amount: 9900,
  currency: 'BRL',
}

describe('cielo transformRefund', () => {
  it('maps Status 10 (Voided) to "succeeded"', () => {
    const result = transformRefund(baseVoid, baseCtx)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cielo')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Status 11 (Refunded) to "succeeded"', () => {
    const result = transformRefund({ ...baseVoid, Status: 11 }, baseCtx)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('threads chargeId, amount, and currency from context', () => {
    const result = transformRefund(baseVoid, baseCtx)
    expect(result.chargeId).toBe('PAY-UUID-001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Status 3 (Denied) to "failed"', () => {
    const result = transformRefund({ ...baseVoid, Status: 3, ReturnMessage: 'Denied' }, baseCtx)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Denied')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Status 13 (Aborted) to "failed"', () => {
    const result = transformRefund({ ...baseVoid, Status: 13 }, baseCtx)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an unexpected Status to "pending"', () => {
    const result = transformRefund({ ...baseVoid, Status: 99 }, baseCtx)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
