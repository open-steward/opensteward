import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawMollieInvoice,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('mollie transformInvoice', () => {
  it('maps a paid invoice with gross amount in minor units', () => {
    const raw: RawMollieInvoice = {
      id: 'inv_1',
      reference: 'INV-2023-001',
      status: 'paid',
      netAmount: { value: '100.00', currency: 'EUR' },
      grossAmount: { value: '121.00', currency: 'EUR' },
      issuedAt: '2023-11-01T00:00:00+00:00',
      paidAt: '2023-11-02T00:00:00+00:00',
      dueAt: '2023-11-30T00:00:00+00:00',
    }
    const result = transformInvoice(raw)

    expect(result.id).toBe('inv_1')
    expect(result.number).toBe('INV-2023-001')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('EUR')
    expect(result.total).toBe(12100)
    expect(result.paidAt).toBe('2023-11-02T00:00:00+00:00')
    expect(result.gateway).toBe('mollie')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice from concept status', () => {
    const raw: RawMollieInvoice = {
      id: 'inv_2',
      status: 'concept',
      grossAmount: { value: '50.00', currency: 'EUR' },
      issuedAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an overdue invoice to uncollectible status', () => {
    const raw: RawMollieInvoice = {
      id: 'inv_3',
      status: 'overdue',
      grossAmount: { value: '75.00', currency: 'EUR' },
      issuedAt: '2023-10-01T00:00:00+00:00',
      dueAt: '2023-10-31T00:00:00+00:00',
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
