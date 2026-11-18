import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTwoC2PTransaction,
} from '../../../../../../../src/verticals/payments/adapters/2c2p/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('2c2p transformCharge', () => {
  it('maps respCode 0000 to status "succeeded" and scales amount to minor units', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-001',
      tranRef: 'TREF-001',
      amount: 100.0,
      currencyCode: 'THB',
      transactionDateTime: '20240301120000',
      respCode: '0000',
      respDesc: 'Success',
      approvalCode: 'APP123',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('THB')
    expect(result.gateway).toBe('2c2p')
    expect(result.captured).toBe(true)
    expect(result.capturedAt).toBeDefined()
    expect(result.failureCode).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps respCode 0001 to status "pending"', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-002',
      amount: 50.0,
      currencyCode: 'SGD',
      respCode: '0001',
      respDesc: 'Pending',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(result.currency).toBe('SGD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps respCode starting with "2" to status "failed" and sets failure fields', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-003',
      amount: 25.5,
      currencyCode: 'USD',
      respCode: '2001',
      respDesc: 'Declined by issuer',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('2001')
    expect(result.failureMessage).toBe('Declined by issuer')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps respCode starting with "4" to status "cancelled"', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-004',
      amount: 10.0,
      currencyCode: 'MYR',
      respCode: '4001',
      respDesc: 'Voided',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.failureCode).toBe('4001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to THB currency when currencyCode is absent', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-005',
      amount: 99.0,
      respCode: '0000',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('THB')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses tranRef as externalId and falls back id chain correctly', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-006',
      tranRef: 'TREF-006',
      referenceNo: 'REF-006',
      amount: 10,
      respCode: '0000',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('INV-006')
    expect(result.externalId).toBe('TREF-006')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('parses transactionDateTime into ISO-8601 for createdAt', () => {
    const raw: RawTwoC2PTransaction = {
      invoiceNo: 'INV-007',
      amount: 20,
      transactionDateTime: '20240301120000',
      respCode: '0000',
    }
    const result = transformCharge(raw)
    expect(result.createdAt).toBe('2024-03-01T12:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
