import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawGeideaOrder,
} from '../../../../../../../src/verticals/payments/adapters/geidea/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('geidea transformCharge', () => {
  it('maps a Paid order to status "succeeded" with minor-unit amount', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-001',
      amount: 100.5,
      currency: 'EGP',
      status: 'Success',
      detailedStatus: 'Paid',
      customerEmail: 'buyer@example.com',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10050)
    expect(result.currency).toBe('EGP')
    expect(result.gateway).toBe('geidea')
    expect(result.captured).toBe(true)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Refunded order to status "refunded" and captured=true', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-002',
      amount: 50.0,
      currency: 'SAR',
      status: 'Success',
      detailedStatus: 'Refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.captured).toBe(true)
    expect(result.currency).toBe('SAR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Failed order and includes failure code/message', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-003',
      amount: 20.0,
      currency: 'AED',
      status: 'Failed',
      detailedStatus: 'Failed',
      detailedResponseCode: 'ERR-001',
      detailedResponseMessage: 'Card declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('ERR-001')
    expect(result.failureMessage).toBe('Card declined')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an InProgress order to status "pending" via detailedStatus', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-004',
      amount: 75.0,
      currency: 'EGP',
      detailedStatus: 'InProgress',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.id).toBe('ord-004')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('picks paymentMethodId from pay-type transaction', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-005',
      amount: 30.0,
      currency: 'EGP',
      detailedStatus: 'Authorized',
      transactions: [
        { transactionId: 'txn-pay-001', type: 'pay', status: 'Success', amount: 30.0 },
        { transactionId: 'txn-auth-001', type: 'auth', status: 'Success', amount: 30.0 },
      ],
    }
    const result = transformCharge(raw)
    expect(result.paymentMethodId).toBe('txn-pay-001')
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to coarse status when detailedStatus is absent', () => {
    const raw: RawGeideaOrder = {
      orderId: 'ord-006',
      amount: 10.0,
      currency: 'EGP',
      status: 'Failed',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
