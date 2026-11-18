import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawPagarmeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('pagarme transformInvoice', () => {
  it('maps core fields to canonical invoice', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_abc',
      code: 'INV-001',
      amount: 15000,
      status: 'paid',
      customer: { id: 'cus_xyz' },
      subscription_id: 'sub_11',
      created_at: '2024-03-01T00:00:00Z',
      billing_at: '2024-03-01T12:00:00Z',
      due_at: '2024-03-15T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_abc')
    expect(result.externalId).toBe('INV-001')
    expect(result.number).toBe('INV-001')
    expect(result.customerId).toBe('cus_xyz')
    expect(result.subscriptionId).toBe('sub_11')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('BRL')
    expect(result.total).toBe(15000)
    expect(result.amountPaid).toBe(15000)
    expect(result.gateway).toBe('pagarme')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps pending status to open', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_pend',
      amount: 5000,
      status: 'pending',
      created_at: '2024-03-02T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountPaid).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to void', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_can',
      amount: 3000,
      status: 'canceled',
      canceled_at: '2024-03-05T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps failed status to uncollectible', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_fail',
      amount: 2000,
      status: 'failed',
      created_at: '2024-03-03T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('extracts line item ids and cycle dates', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_items',
      amount: 10000,
      status: 'paid',
      items: [
        { id: 'item_1', amount: 5000, description: 'Item 1' },
        { id: 'item_2', amount: 5000, description: 'Item 2' },
      ],
      cycle: {
        start_at: '2024-03-01T00:00:00Z',
        end_at: '2024-03-31T00:00:00Z',
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.lineItemIds).toEqual(['item_1', 'item_2'])
    expect(result.periodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.periodEnd).toBe('2024-03-31T00:00:00.000Z')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('resolves subscriptionId from subscription object when id not present', () => {
    const raw: RawPagarmeInvoice = {
      id: 'inv_sub',
      amount: 1000,
      status: 'paid',
      subscription: { id: 'sub_from_obj' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.subscriptionId).toBe('sub_from_obj')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
