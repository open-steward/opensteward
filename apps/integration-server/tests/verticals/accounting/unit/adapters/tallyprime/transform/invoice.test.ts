import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type TallyInvoice,
  type TallyAllLedgerEntry,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/invoice'

function makeLedgerEntry(overrides: Partial<TallyAllLedgerEntry> = {}): TallyAllLedgerEntry {
  return {
    LEDGERNAME: 'Sales Account',
    AMOUNT: '-5000',
    ISDEEMEDPOSITIVE: 'No',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<TallyInvoice> = {}): TallyInvoice {
  return {
    VOUCHERNUMBER: 'INV/2024/001',
    PARTYLEDGERNAME: 'Acme Customer',
    DATE: '20240320',
    AMOUNT: '5900.00',
    NARRATION: 'Invoice for services rendered',
    ALLLEDGERENTRIES: [makeLedgerEntry()],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps VOUCHERNUMBER to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('INV/2024/001')
  })

  it('maps VOUCHERNUMBER to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('Acme Customer')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(5900)
  })

  it('maps NARRATION to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Invoice for services rendered')
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('always sets status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('AUTHORIZED')
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformInvoice(makeInvoice({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
