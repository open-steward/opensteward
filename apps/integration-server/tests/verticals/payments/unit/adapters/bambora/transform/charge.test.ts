import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBamboraPayment,
} from '../../../../../../../src/verticals/payments/adapters/bambora/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('bambora transformCharge', () => {
  it('maps an approved purchase to status "succeeded"', () => {
    const raw: RawBamboraPayment = {
      id: 10000001,
      approved: '1',
      type: 'P',
      amount: '49.99',
      currency: 'CAD',
      created: '2024-03-01T00:00:00',
      order_number: 'ORD-001',
      auth_code: 'AUTH123',
      card: { card_type: 'VI', last_four: '1234' },
      payment_method: 'card',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('CAD')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(4999)
    expect(result.gateway).toBe('bambora')
    expect(result.paymentMethodId).toBe('card_1234')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined transaction to status "failed"', () => {
    const raw: RawBamboraPayment = {
      id: 10000002,
      approved: '0',
      type: 'P',
      amount: '10.00',
      currency: 'CAD',
      message_id: 7,
      message: 'DECLINED',
      created: '2024-03-01T00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBe(false)
    expect(result.failureCode).toBe('7')
    expect(result.failureMessage).toBe('DECLINED')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pre-auth (PA) to status "pending" even when approved', () => {
    const raw: RawBamboraPayment = {
      id: 10000003,
      approved: '1',
      type: 'PA',
      amount: '100.00',
      currency: 'USD',
      created: '2024-03-01T00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(result.amountCaptured).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a void (VP) transaction to status "cancelled"', () => {
    const raw: RawBamboraPayment = {
      id: 10000004,
      approved: '1',
      type: 'VP',
      amount: '25.00',
      currency: 'CAD',
      created: '2024-03-01T00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a return (R) transaction to status "refunded"', () => {
    const raw: RawBamboraPayment = {
      id: 10000005,
      approved: '1',
      type: 'R',
      amount: '20.00',
      currency: 'CAD',
      created: '2024-03-01T00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses trn_id as id when id is absent', () => {
    const raw: RawBamboraPayment = {
      trn_id: 99999,
      approved: '1',
      type: 'P',
      amount: '5.00',
      currency: 'CAD',
      created: '2024-03-01T00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('99999')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
