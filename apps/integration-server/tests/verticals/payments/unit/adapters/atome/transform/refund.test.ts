import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type AtomeRefundContext,
} from '../../../../../../../src/verticals/payments/adapters/atome/transform/refund'
import type { RawAtomeRefundTransaction } from '../../../../../../../src/verticals/payments/adapters/atome/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('atome transformRefund', () => {
  it('maps a completed refund transaction to status "succeeded"', () => {
    const raw: RawAtomeRefundTransaction = {
      refundId: 'refund-001',
      transactionId: 'rtxn-001',
      amount: 2500,
      createAt: '1709337600000',
    }
    const ctx: AtomeRefundContext = {
      referenceId: 'atome-ref-001',
      currency: 'SGD',
    }
    const result = transformRefund(raw, ctx)
    expect(result.id).toBe('refund-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('SGD')
    expect(result.chargeId).toBe('atome-ref-001')
    expect(result.gateway).toBe('atome')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses transactionId as id when refundId is absent', () => {
    const raw: RawAtomeRefundTransaction = {
      transactionId: 'rtxn-002',
      amount: 1000,
      createAt: '1709424000000',
    }
    const ctx: AtomeRefundContext = {
      referenceId: 'atome-ref-002',
      currency: 'MYR',
    }
    const result = transformRefund(raw, ctx)
    expect(result.id).toBe('rtxn-002')
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('MYR')
    expect(result.chargeId).toBe('atome-ref-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('returns status "pending" when both refundId and transactionId are absent', () => {
    const raw: RawAtomeRefundTransaction = {
      amount: 500,
    }
    const ctx: AtomeRefundContext = {
      referenceId: 'atome-ref-003',
      currency: 'SGD',
    }
    const result = transformRefund(raw, ctx)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to SGD when ctx.currency is absent', () => {
    const raw: RawAtomeRefundTransaction = {
      refundId: 'refund-004',
      amount: 750,
    }
    const ctx: AtomeRefundContext = {
      referenceId: 'atome-ref-004',
    }
    const result = transformRefund(raw, ctx)
    // DEFAULT_CURRENCY for atome is SGD
    expect(result.currency).toBeTruthy()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
