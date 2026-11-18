import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type QuickFileInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<QuickFileInvoice> = {}): QuickFileInvoice {
  return {
    InvoiceID: 9001,
    InvoiceNumber: 'INV-9001',
    InvoiceType: 'INVOICE',
    Status: 'SENT',
    ClientID: 200,
    ClientName: 'Big Corp',
    Currency: 'GBP',
    IssueDate: '2024-04-01',
    DueDate: '2024-05-01',
    GrossAmount: 1200.0,
    VatAmount: 200.0,
    AmountOutstanding: 1200.0,
    AmountPaid: 0,
    PurchaseReference: 'PO-ABC',
    Notes: 'Please pay promptly',
    InvoiceLines: [
      {
        ItemID: 10,
        ItemName: 'Consulting',
        ItemDescription: 'April consulting hours',
        ItemNominalCode: '4200',
        UnitCost: 1000.0,
        Qty: 1,
        Tax1: { TaxAmount: 200.0 },
        Total: 1200.0,
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps InvoiceID to id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('9001')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps InvoiceNumber to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-9001')
  })

  it('maps ClientID to a prefixed contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_200')
  })

  it('maps Currency to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('GBP')
  })

  it('maps GrossAmount to totalAmount in minor units', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(120000)
  })

  it('maps VatAmount to taxAmount in minor units', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(20000)
  })

  it('maps AmountOutstanding to balanceAmount in minor units', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(120000)
  })

  it('maps PurchaseReference to reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-ABC')
  })

  it('maps Notes to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Please pay promptly')
  })

  it('maps IssueDate to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps DueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-05-01'))
  })

  it('maps PAIDFULL to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'PAIDFULL' })).status).toBe('PAID')
  })

  it('maps PAIDPART to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'PAIDPART' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps SENT to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps DISPUTED to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ Status: 'DISPUTED' })).status).toBe('OVERDUE')
  })

  it('maps AGED to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ Status: 'AGED' })).status).toBe('OVERDUE')
  })

  it('maps DELETED to DELETED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'DELETED' })).status).toBe('DELETED')
  })

  it('maps InvoiceLines to lineItems', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('10')
    expect(result.lineItems?.[0].itemName).toBe('Consulting')
    expect(result.lineItems?.[0].accountId).toBe('4200')
    expect(result.lineItems?.[0].unitAmount).toBe(100000)
    expect(result.lineItems?.[0].totalAmount).toBe(120000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces output that passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformInvoice({ InvoiceID: 1 })
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInvoice', () => {
  it('round-trips contactId back to ClientID', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect(raw['ClientID']).toBe(200)
  })

  it('round-trips currency', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect(raw['Currency']).toBe('GBP')
  })

  it('sets InvoiceType to INVOICE', () => {
    expect(untransformInvoice(transformInvoice(makeInvoice()))['InvoiceType']).toBe('INVOICE')
  })
})
