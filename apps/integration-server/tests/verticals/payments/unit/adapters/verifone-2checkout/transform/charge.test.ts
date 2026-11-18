import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawVerifone2checkoutOrder,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('verifone-2checkout transformCharge', () => {
  it('maps COMPLETE status to "succeeded" with correct amount and currency', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-001',
      Status: 'COMPLETE',
      Currency: 'USD',
      GrossPrice: '49.99',
      OrderDate: '2024-01-15T10:30:00Z',
      CustomerReference: 'CUST-123',
      BillingDetails: {
        FirstName: 'Jane',
        LastName: 'Doe',
        Email: 'jane.doe@example.com',
        Phone: '+14155550123',
        CountryCode: 'US',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('REF-001')
    expect(result.customerId).toBe('CUST-123')
    expect(result.receiptEmail).toBe('jane.doe@example.com')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps AUTHRECEIVED status to "succeeded"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-002',
      Status: 'AUTHRECEIVED',
      Currency: 'EUR',
      GrossPrice: '20.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING status to "pending"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-003',
      Status: 'PENDING',
      Currency: 'GBP',
      GrossPrice: '15.50',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1550)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDINGAPPROVAL status to "pending"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-004',
      Status: 'PENDINGAPPROVAL',
      Currency: 'USD',
      GrossPrice: '100.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps REFUND status to "refunded"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-005',
      Status: 'REFUND',
      Currency: 'USD',
      GrossPrice: '30.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PARTIAL_REFUND status to "partially_refunded"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-006',
      Status: 'PARTIAL_REFUND',
      Currency: 'USD',
      GrossPrice: '50.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED status to "cancelled"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-007',
      Status: 'CANCELED',
      Currency: 'USD',
      GrossPrice: '75.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "cancelled"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-008',
      Status: 'CANCELLED',
      Currency: 'USD',
      GrossPrice: '75.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps INVALID status to "failed"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-009',
      Status: 'INVALID',
      Currency: 'USD',
      GrossPrice: '10.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps REVERSED status to "failed"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-010',
      Status: 'REVERSED',
      Currency: 'USD',
      GrossPrice: '10.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps CHARGEBACK status to "disputed"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-011',
      Status: 'CHARGEBACK',
      Currency: 'USD',
      GrossPrice: '25.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to OrderNo when RefNo is absent', () => {
    const raw: RawVerifone2checkoutOrder = {
      OrderNo: 'ORD-999',
      Status: 'COMPLETE',
      Currency: 'USD',
      GrossPrice: '9.99',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORD-999')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to NetPrice when GrossPrice is absent', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-012',
      Status: 'COMPLETE',
      Currency: 'USD',
      NetPrice: '12.00',
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(1200)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to PaymentDetails.Currency when Currency is absent', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-013',
      Status: 'COMPLETE',
      GrossPrice: '5.00',
      PaymentDetails: { Type: 'CARD', Currency: 'CAD' },
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('CAD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD and 0 amount when currency and price are absent', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-014',
      Status: 'COMPLETE',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles zero-decimal JPY currency correctly', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-015',
      Status: 'COMPLETE',
      Currency: 'JPY',
      GrossPrice: '1000',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('JPY')
    expect(result.amount).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown status to "pending"', () => {
    const raw: RawVerifone2checkoutOrder = {
      RefNo: 'REF-016',
      Status: 'UNKNOWN_STATUS',
      Currency: 'USD',
      GrossPrice: '1.00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
