import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type EconomicInvoice } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/invoice'

function makeRaw(overrides: Partial<EconomicInvoice> = {}): EconomicInvoice {
  return {
    bookedInvoiceNumber: 1001,
    draftInvoiceNumber: 0,
    date: '2024-01-20',
    dueDate: '2024-02-20',
    currency: 'DKK',
    netAmount: 800,
    grossAmount: 1000,
    vatAmount: 200,
    remainder: 1000,
    roundingAmount: 0,
    customer: { customerNumber: 1, name: 'Customer A' },
    lines: [],
    paymentTerms: null,
    notes: null,
    references: null,
    ...overrides,
  }
}

describe('economic transformInvoice', () => {
  it('maps bookedInvoiceNumber to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('1001')
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
  it('maps fully paid -> PAID', () => {
    expect(transformInvoice(makeRaw({ remainder: 0, bookedInvoiceNumber: 1001 })).status).toBe('PAID')
  })
  it('maps booked with full remainder -> AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ remainder: 1000, bookedInvoiceNumber: 1001 })).status).toBe('AUTHORIZED')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-01-20'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
