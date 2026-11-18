import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FenbeitongInvoice } from '../../../../../../../src/verticals/accounting/adapters/fenbeitong/transform/invoice'

function makeInvoice(overrides: Partial<FenbeitongInvoice> = {}): FenbeitongInvoice {
  return {
    expenseId: 'exp-1',
    expenseNo: 'FB-001',
    expenseDate: '2024-03-15',
    dueDate: '2024-04-15',
    totalAmount: 500,
    taxAmount: 45,
    status: 'approved',
    applyerId: 'emp-1',
    currency: 'CNY',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (fenbeitong)', () => {
  it('maps id from expenseId', () => { expect(transformInvoice(makeInvoice()).id).toBe('exp-1') })
  it('maps invoiceNumber from expenseNo', () => { expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FB-001') })
  it('maps postedAt from expenseDate as Date', () => { expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15')) })
  it('maps dueAt from dueDate as Date', () => { expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15')) })
  it('maps totalAmount', () => { expect(transformInvoice(makeInvoice()).totalAmount).toBe(500) })
  it('maps taxAmount', () => { expect(transformInvoice(makeInvoice()).taxAmount).toBe(45) })
  it('maps status pending to DRAFT', () => { expect(transformInvoice(makeInvoice({ status: 'pending' })).status).toBe('DRAFT') })
  it('maps status approved to AUTHORIZED', () => { expect(transformInvoice(makeInvoice({ status: 'approved' })).status).toBe('AUTHORIZED') })
  it('maps status paid to PAID', () => { expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID') })
  it('maps status rejected to VOIDED', () => { expect(transformInvoice(makeInvoice({ status: 'rejected' })).status).toBe('VOIDED') })
  it('maps unknown status to DRAFT', () => { expect(transformInvoice(makeInvoice({ status: 'unknown' })).status).toBe('DRAFT') })
  it('maps contactId from applyerId', () => { expect(transformInvoice(makeInvoice()).contactId).toBe('emp-1') })
  it('maps currency', () => { expect(transformInvoice(makeInvoice()).currency).toBe('CNY') })
  it('sets type to INVOICE', () => { expect(transformInvoice(makeInvoice()).type).toBe('INVOICE') })
  it('metadata identity', () => { const raw = makeInvoice(); expect(transformInvoice(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
