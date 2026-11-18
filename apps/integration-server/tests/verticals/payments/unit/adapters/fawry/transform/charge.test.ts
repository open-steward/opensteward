import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFawryCharge,
} from '../../../../../../../src/verticals/payments/adapters/fawry/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('fawry transformCharge', () => {
  it('maps a PAID order to status "succeeded" and converts amount to minor units', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-001',
      merchantRefNumber: 'MREF-001',
      orderAmount: 25.5,
      paymentAmount: 25.5,
      orderStatus: 'PAID',
      paymentTime: 1709251200000,
      customerProfileId: 'cust-42',
      customerMail: 'john@example.com',
      paymentMethod: 'CARD',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('REF-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2550)
    expect(result.currency).toBe('EGP')
    expect(result.customerId).toBe('cust-42')
    expect(result.receiptEmail).toBe('john@example.com')
    expect(result.gateway).toBe('fawry')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a NEW order to status "pending"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-002',
      orderAmount: 10.0,
      orderStatus: 'NEW',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED order to status "cancelled"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-003',
      orderAmount: 5.0,
      orderStatus: 'CANCELED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps EXPIRED order to status "cancelled"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-004',
      orderAmount: 5.0,
      orderStatus: 'EXPIRED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED order to status "failed" with error info', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-005',
      orderAmount: 15.0,
      orderStatus: 'FAILED',
      failureErrorCode: 'ERR001',
      failureReason: 'Insufficient funds',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('ERR001')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PARTIAL_REFUNDED order to status "partially_refunded"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-006',
      orderAmount: 20.0,
      orderStatus: 'PARTIAL_REFUNDED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps REFUNDED order to status "refunded"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-007',
      orderAmount: 30.0,
      orderStatus: 'REFUNDED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps DELIVERED order to status "succeeded"', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-008',
      orderAmount: 50.0,
      paymentAmount: 50.0,
      orderStatus: 'DELIVERED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amountCaptured).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to merchantRefNumber when referenceNumber is absent', () => {
    const raw: RawFawryCharge = {
      merchantRefNumber: 'MREF-999',
      orderAmount: 8.0,
      orderStatus: 'NEW',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('MREF-999')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('stores paymentMethod and customerMobile in metadata', () => {
    const raw: RawFawryCharge = {
      referenceNumber: 'REF-009',
      orderAmount: 12.0,
      orderStatus: 'PAID',
      paymentAmount: 12.0,
      paymentMethod: 'WALLET',
      customerMobile: '+201234567890',
    }
    const result = transformCharge(raw)
    expect(result.metadata['paymentMethod']).toBe('WALLET')
    expect(result.metadata['customerMobile']).toBe('+201234567890')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
