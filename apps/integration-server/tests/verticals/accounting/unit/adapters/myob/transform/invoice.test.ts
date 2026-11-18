import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MyobInvoice, type MyobInvoiceLine } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/invoice'

function makeInvoice(overrides: Partial<MyobInvoice> = {}): MyobInvoice {
  return {
    UID: 'myob-uid-001',
    Number: 'INV-0042',
    Customer: { UID: 'cust-uid-001', Name: 'Globex Corp' },
    Date: '2024-07-01',
    DueDate: '2024-08-01',
    IsTaxInclusive: true,
    TotalTax: 1500,
    TotalAmount: 11500,
    BalanceDueAmount: 11500,
    Status: 'Open',
    Lines: [],
    ...overrides,
  }
}

function makeInvoiceLine(overrides: Partial<MyobInvoiceLine> = {}): MyobInvoiceLine {
  return {
    RowID: 1,
    Description: 'Service Fee',
    Units: 4,
    UnitPrice: 2500,
    Total: 10000,
    TaxAmount: 1500,
    Account: { UID: 'acc-uid-001', DisplayID: '4-1000' },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('myob-uid-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-0042')
    expect(result.contactId).toBe('cust-uid-001')
    expect(result.totalAmount).toBe(11500)
    expect(result.taxAmount).toBe(1500)
    expect(result.balanceAmount).toBe(11500)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
    expect(result.dueAt).toEqual(new Date('2024-08-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Open status with full balance to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Open', BalanceDueAmount: 11500, TotalAmount: 11500 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Open status with partial balance to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Open', BalanceDueAmount: 5000, TotalAmount: 11500 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps Closed status to PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Closed', BalanceDueAmount: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps CreditApplied status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'CreditApplied' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps Lines to lineItems', () => {
    const raw = makeInvoice({ Lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Service Fee')
    expect(li.unitAmount).toBe(2500)
    expect(li.unitQuantity).toBe(4)
    expect(li.taxAmount).toBe(1500)
    expect(li.totalAmount).toBe(10000)
    expect(li.accountId).toBe('acc-uid-001')
  })

  it('omits accountId on lineitem when Account is null', () => {
    const raw = makeInvoice({ Lines: [makeInvoiceLine({ Account: null })] })
    const result = transformInvoice(raw)
    expect(result.lineItems![0].accountId).toBeUndefined()
  })

  it('produces empty lineItems when Lines is absent', () => {
    const raw = makeInvoice({ Lines: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('sets contactId from Customer UID', () => {
    const result = transformInvoice(makeInvoice({ Customer: { UID: 'cust-uid-999', Name: 'Foo' } }))
    expect(result.contactId).toBe('cust-uid-999')
  })

  it('omits contactId when Customer is null', () => {
    const result = transformInvoice(makeInvoice({ Customer: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits invoiceNumber when Number is empty', () => {
    const result = transformInvoice(makeInvoice({ Number: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits postedAt when Date is empty', () => {
    const result = transformInvoice(makeInvoice({ Date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('omits dueAt when DueDate is empty', () => {
    const result = transformInvoice(makeInvoice({ DueDate: '' }))
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
