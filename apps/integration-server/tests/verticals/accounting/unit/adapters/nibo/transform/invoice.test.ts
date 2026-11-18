import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type NiboInvoice } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/invoice'

function makeRaw(overrides: Partial<NiboInvoice> = {}): NiboInvoice {
  return {
    invoiceId: 1,
    documentNumber: 'NF-001',
    customerId: 5,
    customerName: 'Cliente SA',
    issueDate: '2024-01-15',
    dueDate: '2024-02-15',
    totalValue: 1160,
    taxValue: 160,
    balance: 1160,
    paidValue: 0,
    currencyCode: 'BRL',
    status: 'Pending',
    isCancelled: false,
    items: [],
    reference: '',
    ...overrides,
  }
}

describe('nibo transformInvoice', () => {
  it('maps invoiceId to id as string', () => {
    expect(transformInvoice(makeRaw()).id).toBe('1')
  })
  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })
  it('handles fields gracefully', () => {
    expect(() => transformInvoice(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })
  it('maps isCancelled true -> VOIDED', () => {
    expect(transformInvoice(makeRaw({ isCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Paid status -> PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })
  it('maps issueDate to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-01-15'))
  })
  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
