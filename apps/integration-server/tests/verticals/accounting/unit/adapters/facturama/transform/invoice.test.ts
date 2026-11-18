import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FacturamaInvoice } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/invoice'

function makeRaw(overrides: Partial<FacturamaInvoice> = {}): FacturamaInvoice {
  return {
    Id: 'inv-1',
    Folio: 'F-001',
    ClientId: 'cust-1',
    ClientName: 'Test Client',
    Date: '2024-01-15',
    DueDate: '2024-02-15',
    Total: 1160,
    TaxAmount: 160,
    Balance: 1160,
    Currency: 'MXN',
    Status: 'pending',
    IsCancelled: false,
    PaidAmount: 0,
    Reference: '',
    Items: [],
    ...overrides,
  }
}

describe('facturama transformInvoice', () => {
  it('maps Id to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('inv-1')
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
  it('maps IsCancelled true -> VOIDED', () => {
    expect(transformInvoice(makeRaw({ IsCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Balance=0 -> PAID', () => {
    expect(transformInvoice(makeRaw({ Balance: 0 })).status).toBe('PAID')
  })
  it('maps Date to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-01-15'))
  })
  it('maps ClientId to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('cust-1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
