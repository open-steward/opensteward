import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawVerifone2checkoutInvoice,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('verifone-2checkout transformInvoice', () => {
  it('maps PAID status to "paid" with full invoice data', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-001',
      InvoiceNumber: 'INV-2024-001',
      SubscriptionReference: 'SUB-001',
      CustomerReference: 'CUST-001',
      Status: 'PAID',
      Currency: 'USD',
      NetPrice: '90.00',
      Tax: '10.00',
      GrossPrice: '100.00',
      AmountPaid: '100.00',
      AmountDue: '0.00',
      PaidDate: '2024-01-20T10:00:00Z',
      CreatedAt: '2024-01-15T08:00:00Z',
      UpdatedAt: '2024-01-20T10:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.subtotal).toBe(9000)
    expect(result.tax).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('INV-001')
    expect(result.number).toBe('INV-2024-001')
    expect(result.customerId).toBe('CUST-001')
    expect(result.subscriptionId).toBe('SUB-001')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps COMPLETED status to "paid"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-002',
      Status: 'COMPLETED',
      Currency: 'EUR',
      GrossPrice: '50.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "void"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-003',
      Status: 'CANCELLED',
      Currency: 'USD',
      GrossPrice: '75.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED status to "void"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-004',
      Status: 'CANCELED',
      Currency: 'USD',
      GrossPrice: '75.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps REFUNDED status to "void"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-005',
      Status: 'REFUNDED',
      Currency: 'USD',
      GrossPrice: '30.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps REVERSED status to "void"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-006',
      Status: 'REVERSED',
      Currency: 'USD',
      GrossPrice: '40.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps UNCOLLECTIBLE status to "uncollectible"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-007',
      Status: 'UNCOLLECTIBLE',
      Currency: 'USD',
      GrossPrice: '200.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps CHARGEBACK status to "uncollectible"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-008',
      Status: 'CHARGEBACK',
      Currency: 'USD',
      GrossPrice: '150.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps DRAFT status to "draft"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-009',
      Status: 'DRAFT',
      Currency: 'USD',
      GrossPrice: '99.99',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to "open"', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-010',
      Status: 'PENDING',
      Currency: 'USD',
      GrossPrice: '60.00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('falls back to InvoiceNumber when InvoiceCode is absent', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceNumber: 'INV-2024-011',
      Status: 'PAID',
      Currency: 'USD',
      GrossPrice: '45.00',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('INV-2024-011')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('falls back to NetPrice when GrossPrice is absent', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-012',
      Status: 'PAID',
      Currency: 'USD',
      NetPrice: '80.00',
    }
    const result = transformInvoice(raw)
    expect(result.total).toBe(8000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('sets total to 0 when both GrossPrice and NetPrice are absent', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-013',
      Status: 'DRAFT',
      Currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.total).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('parses dueDate and paidAt as ISO datetimes', () => {
    const raw: RawVerifone2checkoutInvoice = {
      InvoiceCode: 'INV-014',
      Status: 'PAID',
      Currency: 'USD',
      GrossPrice: '100.00',
      DueDate: '2024-01-31T23:59:59Z',
      PaidDate: '2024-01-25T12:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.dueDate).toBeDefined()
    expect(result.paidAt).toBeDefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
