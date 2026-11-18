import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawRecurlyInvoice,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('recurly transformInvoice', () => {
  it('maps a paid invoice correctly', () => {
    const raw: RawRecurlyInvoice = {
      id: 'inv-001',
      number: 'INV-001',
      state: 'paid',
      account: { id: 'acc-001' },
      subscription_ids: ['sub-001'],
      currency: 'USD',
      subtotal: 45,
      tax: 5,
      total: 50,
      paid: 50,
      balance: 0,
      closed_at: '2024-03-02T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.number).toBe('INV-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(5000)
    expect(result.subtotal).toBe(4500)
    expect(result.tax).toBe(500)
    expect(result.customerId).toBe('acc-001')
    expect(result.subscriptionId).toBe('sub-001')
    expect(result.gateway).toBe('recurly')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice correctly', () => {
    const raw: RawRecurlyInvoice = {
      id: 'inv-002',
      state: 'open',
      currency: 'EUR',
      total: 30,
      balance: 30,
      paid: 0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(3000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a voided invoice correctly', () => {
    const raw: RawRecurlyInvoice = {
      id: 'inv-003',
      state: 'voided',
      currency: 'GBP',
      total: 100,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a closed (failed) invoice to uncollectible', () => {
    const raw: RawRecurlyInvoice = {
      id: 'inv-004',
      state: 'failed',
      currency: 'USD',
      total: 50,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
