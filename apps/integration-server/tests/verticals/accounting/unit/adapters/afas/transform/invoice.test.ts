import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type AfasSalesInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<AfasSalesInvoice> = {}): AfasSalesInvoice {
  return {
    InvoiceNr: 'INV-100',
    DebtorId: 'DEB-001',
    Description: 'Consulting services',
    AmtInvoice: 1000,
    AmtInvoiceCurr: 1000,
    Balance: 1000,
    BalanceCurr: 1000,
    CurrencyId: 'EUR',
    ExpDate: '2024-02-15',
    NookPieceDate: '2024-01-15',
    UnitId: 1,
    ...overrides,
  }
}

describe('transformInvoice (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-100')
    expect(result.invoiceNumber).toBe('INV-100')
    expect(result.contactId).toBe('DEB-001')
    expect(result.currency).toBe('EUR')
    // AmtInvoice=1000 → toMinorUnits → 100000
    expect(result.totalAmount).toBe(100000)
    expect(result.balanceAmount).toBe(100000)
    expect(result.type).toBe('INVOICE')
    expect(result.notes).toBe('Consulting services')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps balance=0 to PAID', () => {
    const result = transformInvoice(makeRaw({ AmtInvoice: 1000, Balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partial balance to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ AmtInvoice: 1000, Balance: 500 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps full positive balance to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ AmtInvoice: 1000, Balance: 1000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps zero total to DRAFT', () => {
    const result = transformInvoice(makeRaw({ AmtInvoice: 0, Balance: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
