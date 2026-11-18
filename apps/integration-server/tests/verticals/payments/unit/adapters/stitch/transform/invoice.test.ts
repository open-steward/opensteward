import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('stitch transformInvoice', () => {
  it('maps id, currency, total, status, and gateway fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_001',
      object: 'invoice',
      currency: 'usd',
      total: 9999,
      status: 'paid',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_stitch_001')
    expect(result.externalId).toBe('inv_stitch_001')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(9999)
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_002',
      object: 'invoice',
      currency: 'eur',
      total: 5000,
      status: 'open',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps status "draft"', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_003',
      object: 'invoice',
      currency: 'usd',
      total: 0,
      status: 'draft',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
  })

  it('maps customerId, subscriptionId, and number fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_004',
      object: 'invoice',
      currency: 'usd',
      total: 2500,
      status: 'paid',
      number: 'INV-0042',
      customer: 'cus_001',
      subscription: 'sub_001',
    }
    const result = transformInvoice(raw)
    expect(result.number).toBe('INV-0042')
    expect(result.customerId).toBe('cus_001')
    expect(result.subscriptionId).toBe('sub_001')
  })

  it('maps amount fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_005',
      object: 'invoice',
      currency: 'usd',
      subtotal: 10000,
      tax: 800,
      total: 10800,
      amount_due: 10800,
      amount_paid: 10800,
      amount_remaining: 0,
      status: 'paid',
    }
    const result = transformInvoice(raw)
    expect(result.subtotal).toBe(10000)
    expect(result.tax).toBe(800)
    expect(result.total).toBe(10800)
    expect(result.amountDue).toBe(10800)
    expect(result.amountPaid).toBe(10800)
    expect(result.amountRemaining).toBe(0)
  })

  it('maps paidAt from status_transitions', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_006',
      object: 'invoice',
      currency: 'usd',
      total: 5000,
      status: 'paid',
      status_transitions: { paid_at: 1709251200 },
    }
    const result = transformInvoice(raw)
    expect(result.paidAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_007',
      object: 'invoice',
      currency: 'usd',
      total: 1000,
      status: 'open',
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lineItemIds from lines.data', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_008',
      object: 'invoice',
      currency: 'usd',
      total: 2000,
      status: 'paid',
      lines: { data: [{ id: 'il_001' }, { id: 'il_002' }] },
    }
    const result = transformInvoice(raw)
    expect(result.lineItemIds).toEqual(['il_001', 'il_002'])
  })

  it('passes InvoiceSchema validation', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_009',
      object: 'invoice',
      number: 'INV-0099',
      customer: 'cus_001',
      subscription: 'sub_001',
      status: 'paid',
      currency: 'gbp',
      subtotal: 8000,
      tax: 640,
      total: 8640,
      amount_due: 8640,
      amount_paid: 8640,
      amount_remaining: 0,
      created: 1709251200,
      metadata: { po: 'PO-001' },
    }
    const result = transformInvoice(raw)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformInvoice preserving customerId and subscriptionId', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_stitch_010',
      object: 'invoice',
      currency: 'usd',
      total: 3000,
      status: 'paid',
      customer: 'cus_roundtrip',
      subscription: 'sub_roundtrip',
      metadata: { note: 'roundtrip' },
    }
    const canonical = transformInvoice(raw)
    const back = untransformInvoice(canonical)
    expect(back.customer).toBe('cus_roundtrip')
    expect(back.subscription).toBe('sub_roundtrip')
    expect((back.metadata as Record<string, string> | undefined)?.note).toBe('roundtrip')
  })
})
