import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawMyfatoorahPaymentStatus,
} from '../../../../../../../src/verticals/payments/adapters/myfatoorah/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('myfatoorah transformInvoice', () => {
  it('maps a paid invoice with all fields', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-001',
      InvoiceStatus: 'paid',
      InvoiceValue: 100.0,
      InvoiceReference: 'REF-001',
      CustomerReference: 'CUST-001',
      PaidCurrency: 'KWD',
      DueValue: 0.0,
      ExpiryDate: '2024-03-01T00:00:00Z',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('INV-001')
    expect(result.externalId).toBe('INV-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.currency).toBe('KWD')
    expect(result.number).toBe('REF-001')
    expect(result.customerId).toBe('CUST-001')
    expect(result.amountPaid).toBe(10000)
    expect(result.gateway).toBe('myfatoorah')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an expired invoice to status "void"', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-002',
      InvoiceStatus: 'expired',
      InvoiceValue: 50.0,
      CurrencyIso: 'SAR',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(result.currency).toBe('SAR')
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a pending invoice to status "open"', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-003',
      InvoiceStatus: 'pending',
      InvoiceValue: 75.0,
      DisplayCurrency: 'AED',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.currency).toBe('AED')
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('uses PaidCurrency first, then DisplayCurrency, then CurrencyIso', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-004',
      InvoiceStatus: 'paid',
      InvoiceValue: 10.0,
      PaidCurrency: 'KWD',
      DisplayCurrency: 'USD',
      CurrencyIso: 'EUR',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('KWD')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('falls back to KWD when no currency field is present', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-005',
      InvoiceStatus: 'open',
      InvoiceValue: 20.0,
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('KWD')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('uses DueValue for amountDue when present', () => {
    const raw: RawMyfatoorahPaymentStatus = {
      InvoiceId: 'INV-006',
      InvoiceStatus: 'open',
      InvoiceValue: 100.0,
      DueValue: 60.0,
      CurrencyIso: 'KWD',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.amountDue).toBe(6000)
    expect(result.total).toBe(10000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
