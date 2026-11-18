import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AisinoInvoice } from '../../../../../../../src/verticals/accounting/adapters/aisino/transform/invoice'

function makeInvoice(overrides: Partial<AisinoInvoice> = {}): AisinoInvoice {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'AS-001',
    invoiceDate: '2024-03-15',
    dueDate: '2024-04-15',
    totalAmount: 1180,
    taxAmount: 180,
    status: 1,
    buyerId: 'buyer-1',
    currency: 'CNY',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (aisino)', () => {
  it('maps id from invoiceId', () => { expect(transformInvoice(makeInvoice()).id).toBe('inv-1') })
  it('maps invoiceNumber', () => { expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('AS-001') })
  it('maps postedAt from invoiceDate as Date', () => { expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15')) })
  it('maps dueAt from dueDate as Date', () => { expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15')) })
  it('maps totalAmount', () => { expect(transformInvoice(makeInvoice()).totalAmount).toBe(1180) })
  it('maps taxAmount', () => { expect(transformInvoice(makeInvoice()).taxAmount).toBe(180) })
  it('maps status 0 to DRAFT', () => { expect(transformInvoice(makeInvoice({ status: 0 })).status).toBe('DRAFT') })
  it('maps status 1 to AUTHORIZED', () => { expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('AUTHORIZED') })
  it('maps status 2 to PAID', () => { expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('PAID') })
  it('maps status 3 to VOIDED', () => { expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('VOIDED') })
  it('maps unknown status to DRAFT', () => { expect(transformInvoice(makeInvoice({ status: 99 })).status).toBe('DRAFT') })
  it('maps contactId from buyerId', () => { expect(transformInvoice(makeInvoice()).contactId).toBe('buyer-1') })
  it('maps currency', () => { expect(transformInvoice(makeInvoice()).currency).toBe('CNY') })
  it('sets type to INVOICE', () => { expect(transformInvoice(makeInvoice()).type).toBe('INVOICE') })
  it('metadata identity', () => { const raw = makeInvoice(); expect(transformInvoice(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
