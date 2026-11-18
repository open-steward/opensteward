import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawVerifone2checkoutPayout,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('verifone-2checkout transformPayout', () => {
  it('maps PAID status to "paid" with correct amount', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-001',
      Status: 'PAID',
      Amount: '1000.00',
      Currency: 'USD',
      TransferCompletionDate: '2024-02-01T14:00:00Z',
      PaymentType: 'WIRE',
      TotalSales: '1100.00',
      TotalFees: '50.00',
      TotalRefunds: '50.00',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('PAY-001')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(result.method).toBeUndefined()
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps PARTIALLY_PAID status to "in_transit"', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-002',
      Status: 'PARTIALLY_PAID',
      Amount: '500.00',
      Currency: 'EUR',
      TransferCompletionDate: '2024-02-15T10:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED status to "cancelled"', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-003',
      Status: 'CANCELED',
      Amount: '200.00',
      Currency: 'GBP',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('GBP')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps NOT_PAID status to "pending"', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-004',
      Status: 'NOT_PAID',
      Amount: '750.00',
      Currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to "pending"', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-005',
      Status: 'PROCESSING',
      Amount: '300.00',
      Currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('sets arrivalDate from TransferCompletionDate', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-006',
      Status: 'PAID',
      Amount: '400.00',
      Currency: 'USD',
      TransferCompletionDate: '2024-03-10T09:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.arrivalDate).toBe('2024-03-10T09:00:00.000Z')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('sets method to undefined (no clean mapping for PaymentType)', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-007',
      Status: 'PAID',
      Amount: '600.00',
      Currency: 'USD',
      PaymentType: 'PAYPAL',
    }
    const result = transformPayout(raw)
    expect(result.method).toBeUndefined()
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('stores PaymentType and totals in metadata', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-008',
      Status: 'PAID',
      Amount: '800.00',
      Currency: 'USD',
      PaymentType: 'WIRE',
      TotalSales: '900.00',
      TotalFees: '40.00',
      TotalRefunds: '60.00',
    }
    const result = transformPayout(raw)
    expect(result.metadata.paymentType).toBe('WIRE')
    expect(result.metadata.totalSales).toBe('900.00')
    expect(result.metadata.totalFees).toBe('40.00')
    expect(result.metadata.totalRefunds).toBe('60.00')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty string id when Reference is absent', () => {
    const raw: RawVerifone2checkoutPayout = {
      Status: 'PAID',
      Amount: '100.00',
      Currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when Currency is absent', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-009',
      Status: 'PAID',
      Amount: '200.00',
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('USD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('sets amount to 0 when Amount is absent', () => {
    const raw: RawVerifone2checkoutPayout = {
      Reference: 'PAY-010',
      Status: 'PAID',
      Currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(0)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
