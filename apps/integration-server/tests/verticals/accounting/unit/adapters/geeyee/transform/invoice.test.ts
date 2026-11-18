import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type GeeyeeInvoice } from '../../../../../../../src/verticals/accounting/adapters/geeyee/transform/invoice'

function makeInvoice(overrides: Partial<GeeyeeInvoice> = {}): GeeyeeInvoice {
  return {
    id: 'inv-1',
    billNo: 'GY-001',
    billDate: '2024-03-15',
    dueDate: '2024-04-15',
    totalAmt: 1180,
    taxAmt: 180,
    billStatus: 'approved',
    partnerId: 'partner-1',
    currency: 'CNY',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (geeyee)', () => {
  it('maps id', () => { expect(transformInvoice(makeInvoice()).id).toBe('inv-1') })
  it('maps invoiceNumber from billNo', () => { expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('GY-001') })
  it('maps postedAt from billDate as Date', () => { expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15')) })
  it('maps dueAt from dueDate as Date', () => { expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15')) })
  it('maps totalAmount from totalAmt', () => { expect(transformInvoice(makeInvoice()).totalAmount).toBe(1180) })
  it('maps taxAmount from taxAmt', () => { expect(transformInvoice(makeInvoice()).taxAmount).toBe(180) })
  it('maps status draft to DRAFT', () => { expect(transformInvoice(makeInvoice({ billStatus: 'draft' })).status).toBe('DRAFT') })
  it('maps status approved to AUTHORIZED', () => { expect(transformInvoice(makeInvoice({ billStatus: 'approved' })).status).toBe('AUTHORIZED') })
  it('maps status paid to PAID', () => { expect(transformInvoice(makeInvoice({ billStatus: 'paid' })).status).toBe('PAID') })
  it('maps status cancelled to VOIDED', () => { expect(transformInvoice(makeInvoice({ billStatus: 'cancelled' })).status).toBe('VOIDED') })
  it('maps unknown status to DRAFT', () => { expect(transformInvoice(makeInvoice({ billStatus: 'unknown' })).status).toBe('DRAFT') })
  it('maps contactId from partnerId', () => { expect(transformInvoice(makeInvoice()).contactId).toBe('partner-1') })
  it('maps currency', () => { expect(transformInvoice(makeInvoice()).currency).toBe('CNY') })
  it('sets type to INVOICE', () => { expect(transformInvoice(makeInvoice()).type).toBe('INVOICE') })
  it('metadata identity', () => { const raw = makeInvoice(); expect(transformInvoice(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
