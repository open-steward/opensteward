import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  transformInvoiceState,
  untransformInvoice,
  type CrunchInvoice,
  type CrunchInvoiceState,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<CrunchInvoice> = {}): CrunchInvoice {
  return {
    id: 101,
    customer: { id: 42, name: 'Acme Ltd', email: 'billing@acme.example' },
    issuedDate: '2026-01-15',
    dueDate: '2026-02-15',
    currency: 'POUND_STERLING',
    reference: 'PO-9001',
    netAmount: 1000,
    vatAmount: 200,
    grossAmount: 1200,
    status: 'ISSUED',
    outstandingBalance: 1200,
    items: [],
    note: { id: 1, text: 'Net 30 terms' },
    ...overrides,
  }
}

function makeInvoiceState(overrides: Partial<CrunchInvoiceState> = {}): CrunchInvoiceState {
  return {
    id: 202,
    invoiceNumber: 'INV-202',
    customerId: 77,
    currency: 'EURO',
    grossAmount: 500,
    outstandingBalance: 0,
    status: 'SETTLED',
    issuedDate: '2026-03-01',
    dueDate: '2026-04-01',
    ...overrides,
  }
}

describe('transformInvoice (crunch)', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('maps type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps customer id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('normalises POUND_STERLING to GBP', () => {
    expect(transformInvoice(makeInvoice({ currency: 'POUND_STERLING' })).currency).toBe('GBP')
  })

  it('normalises EURO to EUR', () => {
    expect(transformInvoice(makeInvoice({ currency: 'EURO' })).currency).toBe('EUR')
  })

  it('normalises UNITED_STATES_DOLLAR to USD', () => {
    expect(transformInvoice(makeInvoice({ currency: 'UNITED_STATES_DOLLAR' })).currency).toBe('USD')
  })

  it('converts grossAmount float to totalAmount in minor units', () => {
    // grossAmount=1200 → 120000
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(120000)
  })

  it('converts vatAmount to taxAmount in minor units', () => {
    // vatAmount=200 → 20000
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(20000)
  })

  it('maps reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-9001')
  })

  it('falls back to purchaseOrder when reference absent', () => {
    expect(
      transformInvoice(makeInvoice({ reference: undefined, purchaseOrder: 'PO-fallback' }))
        .reference,
    ).toBe('PO-fallback')
  })

  it('maps notes from note.text', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Net 30 terms')
  })

  it('ISSUED status → AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'ISSUED' })).status).toBe('AUTHORIZED')
  })

  it('SETTLED status → PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'SETTLED' })).status).toBe('PAID')
  })

  it('OVERDUE status → OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'OVERDUE' })).status).toBe('OVERDUE')
  })

  it('status containing PARTIAL → PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PARTIALLY_PAID' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('computes paidAmount as gross - outstanding when positive', () => {
    // gross=1200, outstanding=700 → paid=500 → 50000 minor units
    const result = transformInvoice(makeInvoice({ grossAmount: 1200, outstandingBalance: 700 }))
    expect(result.paidAmount).toBe(50000)
  })

  it('omits paidAmount when outstanding equals gross', () => {
    // gross=1200, outstanding=1200 → paid=0, not > 0
    expect(
      transformInvoice(makeInvoice({ grossAmount: 1200, outstandingBalance: 1200 })).paidAmount,
    ).toBeUndefined()
  })

  it('parses issuedDate and dueDate as Dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-01-15')).toBe(true)
    expect(expectDate(result.dueAt).toISOString().startsWith('2026-02-15')).toBe(true)
  })

  it('attaches raw as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  describe('untransformInvoice round-trip', () => {
    it('round-trips contactId and reference', () => {
      const invoice = transformInvoice(makeInvoice())
      const back = untransformInvoice(invoice)
      expect((back['customer'] as { id: number })['id']).toBe(42)
      expect(back['reference']).toBe('PO-9001')
    })
  })
})

describe('transformInvoiceState (crunch)', () => {
  it('maps list item id to string', () => {
    expect(transformInvoiceState(makeInvoiceState()).id).toBe('202')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoiceState(makeInvoiceState()).invoiceNumber).toBe('INV-202')
  })

  it('maps customerId to contactId as string', () => {
    expect(transformInvoiceState(makeInvoiceState()).contactId).toBe('77')
  })

  it('normalises EURO to EUR', () => {
    expect(transformInvoiceState(makeInvoiceState()).currency).toBe('EUR')
  })

  it('SETTLED status → PAID', () => {
    expect(transformInvoiceState(makeInvoiceState({ status: 'SETTLED' })).status).toBe('PAID')
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoiceState(makeInvoiceState())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
