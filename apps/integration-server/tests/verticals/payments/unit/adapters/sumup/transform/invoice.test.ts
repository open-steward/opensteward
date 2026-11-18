import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('sumup transformInvoice', () => {
  it('maps id, total, currency, status and gateway', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_001',
      object: 'invoice',
      currency: 'usd',
      total: 12500,
      status: 'paid',
      customer: 'cus_abc',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_001')
    expect(result.externalId).toBe('inv_001')
    expect(result.total).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.customerId).toBe('cus_abc')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('upcases currency', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_002',
      object: 'invoice',
      currency: 'eur',
      total: 5000,
      status: 'open',
    }
    expect(transformInvoice(raw).currency).toBe('EUR')
  })

  it('maps all status values correctly', () => {
    const statuses: Array<{ raw: string; expected: string }> = [
      { raw: 'draft', expected: 'draft' },
      { raw: 'open', expected: 'open' },
      { raw: 'paid', expected: 'paid' },
      { raw: 'void', expected: 'void' },
      { raw: 'uncollectible', expected: 'uncollectible' },
      { raw: 'unknown_value', expected: 'open' },
    ]
    for (const { raw: rawStatus, expected } of statuses) {
      const raw: RawStripeInvoice = {
        id: 'inv_s',
        object: 'invoice',
        currency: 'usd',
        total: 0,
        status: rawStatus,
      }
      expect(transformInvoice(raw).status).toBe(expected)
    }
  })

  it('maps subtotal, tax, amountDue, amountPaid, amountRemaining', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_003',
      object: 'invoice',
      currency: 'usd',
      total: 13750,
      status: 'paid',
      subtotal: 12500,
      tax: 1250,
      amount_due: 13750,
      amount_paid: 13750,
      amount_remaining: 0,
    }
    const result = transformInvoice(raw)
    expect(result.subtotal).toBe(12500)
    expect(result.tax).toBe(1250)
    expect(result.amountDue).toBe(13750)
    expect(result.amountPaid).toBe(13750)
    expect(result.amountRemaining).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps paidAt from status_transitions and periodStart/End', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_004',
      object: 'invoice',
      currency: 'usd',
      total: 1000,
      status: 'paid',
      status_transitions: { paid_at: 1709251200 },
      period_start: 1709251200,
      period_end: 1711929600,
    }
    const result = transformInvoice(raw)
    expect(result.paidAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.periodStart).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lineItemIds from lines.data', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_005',
      object: 'invoice',
      currency: 'usd',
      total: 500,
      status: 'open',
      lines: { data: [{ id: 'il_001' }, { id: 'il_002' }] },
    }
    expect(transformInvoice(raw).lineItemIds).toEqual(['il_001', 'il_002'])
  })

  it('maps subscriptionId and number', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_006',
      object: 'invoice',
      currency: 'usd',
      total: 2000,
      status: 'open',
      number: 'INV-0042',
      subscription: 'sub_xyz',
    }
    const result = transformInvoice(raw)
    expect(result.number).toBe('INV-0042')
    expect(result.subscriptionId).toBe('sub_xyz')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('sumup untransformInvoice', () => {
  it('roundtrips customerId and subscriptionId', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_rt',
      object: 'invoice',
      currency: 'usd',
      total: 1000,
      status: 'open',
      customer: 'cus_rt',
      subscription: 'sub_rt',
    }
    const transformed = transformInvoice(raw)
    const back = untransformInvoice(transformed)
    expect(back.customer).toBe('cus_rt')
    expect(back.subscription).toBe('sub_rt')
  })

  it('includes metadata in untransformed output', () => {
    const invoice = transformInvoice({
      id: 'inv_meta',
      object: 'invoice',
      currency: 'usd',
      total: 0,
      status: 'open',
      metadata: { key: 'value' },
    })
    const back = untransformInvoice(invoice)
    expect(back.metadata).toEqual({ key: 'value' })
  })

  it('omits fields that are undefined', () => {
    const back = untransformInvoice({})
    expect(Object.keys(back)).toHaveLength(0)
  })
})
