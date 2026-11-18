import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type UhasibuInvoice } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/invoice'

function makeRaw(overrides: Partial<UhasibuInvoice> = {}): UhasibuInvoice {
  return {
    id: 'ui-1',
    invoice_number: 'UI-001',
    contact_id: 'c-9',
    status: 'sent',
    currency: 'KES',
    tax_amount: 150,
    total_amount: 1650,
    amount_due: 1650,
    amount_paid: 0,
    issue_date: '2024-06-10',
    due_date: '2024-07-10',
    line_items: [],
    ...overrides,
  }
}

describe('uhasibu transformInvoice', () => {
  it('maps id to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('ui-1')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('UI-001')
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

  it('maps issue_date to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-06-10'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformInvoice(makeRaw()).dueAt).toEqual(new Date('2024-07-10'))
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
