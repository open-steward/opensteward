import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawAsaasInvoice,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('asaas transformInvoice', () => {
  it('maps an AUTHORIZED invoice to paid status with correct amounts', () => {
    const raw: RawAsaasInvoice = {
      id: 'inv_001',
      customer: 'cus_001',
      payment: 'pay_001',
      status: 'AUTHORIZED',
      value: 150.0,
      number: 'NF-001',
      effectiveDate: '2024-03-01T00:00:00Z',
      pdfUrl: 'https://example.com/invoice.pdf',
    }
    const result = transformInvoice(raw)

    expect(result.id).toBe('inv_001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(15000)
    expect(result.currency).toBe('BRL')
    expect(result.amountPaid).toBe(15000)
    expect(result.amountDue).toBe(0)
    expect(result.amountRemaining).toBe(0)
    expect(result.number).toBe('NF-001')
    expect(result.customerId).toBe('cus_001')
    expect(result.hostedInvoiceUrl).toBe('https://example.com/invoice.pdf')
    expect(result.gateway).toBe('asaas')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a SCHEDULED invoice to open status', () => {
    const raw: RawAsaasInvoice = {
      id: 'inv_002',
      customer: 'cus_002',
      status: 'SCHEDULED',
      value: 200.0,
      effectiveDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(20000)
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED invoice to void status', () => {
    const raw: RawAsaasInvoice = {
      id: 'inv_003',
      customer: 'cus_003',
      status: 'CANCELED',
      value: 100.0,
      effectiveDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an ERROR invoice to uncollectible status', () => {
    const raw: RawAsaasInvoice = {
      id: 'inv_004',
      status: 'ERROR',
      value: 50.0,
      effectiveDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('includes paymentId and serviceDescription in metadata', () => {
    const raw: RawAsaasInvoice = {
      id: 'inv_005',
      status: 'AUTHORIZED',
      value: 80.0,
      payment: 'pay_005',
      serviceDescription: 'Software consulting',
      effectiveDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.metadata?.paymentId).toBe('pay_005')
    expect(result.metadata?.serviceDescription).toBe('Software consulting')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
