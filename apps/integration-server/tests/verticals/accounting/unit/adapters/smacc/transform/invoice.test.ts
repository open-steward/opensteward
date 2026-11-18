import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SmaccInvoice } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/invoice'

function makeRaw(overrides: Partial<SmaccInvoice> = {}): SmaccInvoice {
  return {
    id: 'inv-1',
    number: 'INV-001',
    contact_id: 'c-2',
    status: 'sent',
    currency: 'EUR',
    tax_amount: 200,
    total: 2200,
    amount_due: 2200,
    amount_paid: 0,
    date: '2024-06-01',
    due_date: '2024-07-01',
    line_items: [],
    ...overrides,
  }
}

describe('smacc transformInvoice', () => {
  it('maps id to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('inv-1')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-001')
  })

  it('maps status=sent to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status=paid to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status=overdue to OVERDUE', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformInvoice(makeRaw()).dueAt).toEqual(new Date('2024-07-01'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformInvoice(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
