import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type XeroInvoice } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/invoice'

function makeInvoice(overrides: Partial<XeroInvoice> = {}): XeroInvoice {
  return {
    InvoiceID: 'xero-inv-001',
    Type: 'ACCREC',
    Status: 'AUTHORISED',
    InvoiceNumber: 'INV-001',
    Reference: 'PO-999',
    Contact: { ContactID: 'cid-1', Name: 'Acme Ltd' },
    DateString: '2024-01-15',
    DueDateString: '2024-02-15',
    Total: 12000,
    TotalTax: 2000,
    AmountDue: 12000,
    AmountPaid: 0,
    CurrencyCode: 'GBP',
    LineItems: [],
    Url: 'https://api.xero.com/api.xro/2.0/Invoices/xero-inv-001',
    ...overrides,
  }
}

describe('transformInvoice (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('xero-inv-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('cid-1')
    expect(result.totalAmount).toBe(1200000)
    expect(result.taxAmount).toBe(200000)
    expect(result.currency).toBe('GBP')
    expect(result.type).toBe('INVOICE')
    expect(result.reference).toBe('PO-999')
  })

  it('maps ACCREC to INVOICE type', () => {
    expect(transformInvoice(makeInvoice({ Type: 'ACCREC' })).type).toBe('INVOICE')
  })

  it('maps ACCPAY to BILL type', () => {
    expect(transformInvoice(makeInvoice({ Type: 'ACCPAY' })).type).toBe('BILL')
  })

  it('maps AUTHORISED with full balance to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'AUTHORISED', AmountDue: 12000, AmountPaid: 0 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps AUTHORISED with zero balance to PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'AUTHORISED', AmountDue: 0, AmountPaid: 12000 }))
    expect(result.status).toBe('PAID')
  })

  it('maps AUTHORISED with partial payment to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'AUTHORISED', AmountDue: 6000, AmountPaid: 6000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps VOIDED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'PAID', AmountDue: 0, AmountPaid: 12000 })).status).toBe('PAID')
  })

  it('emits postedAt/dueAt as calendar dates, matching the source precision', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toBe('2024-01-15')
    expect(result.dueAt).toBe('2024-02-15')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ Reference: 'TEST-REF' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['Reference']).toBe('TEST-REF')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      LineItems: [
        {
          LineItemID: 'li-1',
          Description: 'Widget',
          UnitAmount: 100,
          Quantity: 5,
          TaxAmount: 100,
          LineAmount: 500,
          AccountCode: '200',
          AccountID: 'acc-guid-200',
          ItemCode: 'WGT-01',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemId).toBe('WGT-01')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(50000)
    expect(li.taxAmount).toBe(10000)
    // The GUID, not the code — see account-fk.test.ts. `get_accounts(id=…)`
    // resolves against `Account.id`, which is `AccountID`.
    expect(li.accountId).toBe('acc-guid-200')
    expect(li.accountCode).toBe('200')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
