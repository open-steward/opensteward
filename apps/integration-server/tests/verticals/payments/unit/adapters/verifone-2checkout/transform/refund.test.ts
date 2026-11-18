import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawVerifone2checkoutRefund,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('verifone-2checkout transformRefund', () => {
  it('maps Approved=true to "succeeded" with correct amount', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-001',
      OrderRefNo: 'REF-100',
      Amount: '19.99',
      Currency: 'USD',
      Approved: true,
      Reason: 'Customer requested refund',
      Note: 'Refund processed',
      Date: '2024-03-01T12:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1999)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('RF-001')
    expect(result.chargeId).toBe('REF-100')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Approved=false to "failed"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-002',
      OrderRefNo: 'REF-101',
      Amount: '10.00',
      Currency: 'EUR',
      Approved: false,
      Reason: 'Fraud detected',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('fraudulent')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps absent Approved to "pending"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-003',
      OrderRefNo: 'REF-102',
      Amount: '5.00',
      Currency: 'GBP',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.reason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Approved=null to "pending"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-004',
      OrderRefNo: 'REF-103',
      Amount: '8.00',
      Currency: 'USD',
      Approved: null,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Reason containing "duplicate" to "duplicate"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-005',
      OrderRefNo: 'REF-104',
      Amount: '25.00',
      Currency: 'USD',
      Approved: true,
      Reason: 'This is a duplicate charge',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Reason containing "fraud" to "fraudulent"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-006',
      OrderRefNo: 'REF-105',
      Amount: '50.00',
      Currency: 'USD',
      Approved: true,
      Reason: 'Fraudulent transaction',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps Reason containing "requested" to "requested_by_customer"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-007',
      OrderRefNo: 'REF-106',
      Amount: '15.00',
      Currency: 'USD',
      Approved: true,
      Reason: 'Customer requested a refund',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('requested_by_customer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unrecognized Reason to "other"', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-008',
      OrderRefNo: 'REF-107',
      Amount: '7.50',
      Currency: 'USD',
      Approved: true,
      Reason: 'Product unavailable',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('other')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty string id when RefundId is absent', () => {
    const raw: RawVerifone2checkoutRefund = {
      OrderRefNo: 'REF-108',
      Amount: '3.00',
      Currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('stores note and rawReason in metadata', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-009',
      OrderRefNo: 'REF-109',
      Amount: '12.00',
      Currency: 'USD',
      Approved: true,
      Reason: 'duplicate order',
      Note: 'Processed by support team',
    }
    const result = transformRefund(raw)
    expect(result.metadata.note).toBe('Processed by support team')
    expect(result.metadata.rawReason).toBe('duplicate order')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when Currency is absent', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-010',
      OrderRefNo: 'REF-110',
      Amount: '9.99',
      Approved: true,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('sets amount to 0 when Amount is absent', () => {
    const raw: RawVerifone2checkoutRefund = {
      RefundId: 'RF-011',
      OrderRefNo: 'REF-111',
      Currency: 'USD',
      Approved: true,
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(0)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
