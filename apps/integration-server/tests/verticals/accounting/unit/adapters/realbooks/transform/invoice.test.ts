import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RealBooksInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<RealBooksInvoice> = {}): RealBooksInvoice {
  return {
    id: 101,
    transactionNumber: 'INV-2024-001',
    transactionDate: '10-04-2024',
    transactionDescription: 'April sales',
    transactionType: 'Sales',
    partyLedger: { id: 50, ledgerName: 'Widget Co' },
    currencySymbol: 'INR',
    itemDetails: [
      {
        rowId: 1,
        itemName: 'Widget A',
        itemCode: 'WGT-001',
        itemDescription: 'Standard widget',
        itemRate: 1000.0,
        quantity: 10,
        discountAmount: 0,
        itemAmount: 10000.0,
        itemGrossAmount: 10000.0,
        itemTax: [{ taxLedgerName: 'GST 18%', taxAmount: 1800.0, rate: 18 }],
      },
    ],
    accountsTransaction: {
      id: 201,
      transactionDate: '10-04-2024',
      transactionNumber: 'INV-2024-001',
      transactionType: 'Sales',
      ledgerDetails: [
        { ledger: { id: 50, ledgerName: 'Widget Co' }, amountType: 'dr', amount: 11800.0 },
        { ledger: 'Sales Account', amountType: 'cr', amount: 11800.0 },
      ],
    },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('always sets status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('AUTHORIZED')
  })

  it('maps transactionNumber to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps partyLedger.ledgerName to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('Widget Co')
  })

  it('maps currencySymbol to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('INR')
  })

  it('computes totalAmount from debit legs of accountsTransaction (in minor units)', () => {
    // debit leg: 11800.00 INR → 1180000 minor units
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1180000)
  })

  it('maps transactionDescription to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('April sales')
  })

  it('parses DD-MM-YYYY transactionDate to postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-04-10'))
  })

  it('maps itemDetails to lineItems', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('1')
    expect(result.lineItems?.[0].itemName).toBe('Widget A')
    expect(result.lineItems?.[0].itemId).toBe('WGT-001')
    expect(result.lineItems?.[0].unitAmount).toBe(100000)
    expect(result.lineItems?.[0].totalAmount).toBe(1000000)
  })

  it('maps itemTax sum to lineitem taxAmount in minor units', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems?.[0].taxAmount).toBe(180000)
  })

  it('handles DD/MM/YYYY date format', () => {
    const result = transformInvoice(makeInvoice({ transactionDate: '10/04/2024' }))
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces output that passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformInvoice({ transactionNumber: 'INV-001' })
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInvoice', () => {
  it('round-trips invoiceNumber back to transactionNumber', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect(raw['transactionNumber']).toBe('INV-2024-001')
  })

  it('sets transactionType to Sales', () => {
    expect(untransformInvoice(transformInvoice(makeInvoice()))['transactionType']).toBe('Sales')
  })

  it('round-trips contactId back to partyLedger.ledgerName', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect((raw['partyLedger'] as Record<string, unknown>)['ledgerName']).toBe('Widget Co')
  })
})
