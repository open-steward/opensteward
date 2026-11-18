import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type UnimicroInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/unimicro/transform/invoice'

function makeInvoice(overrides: Partial<UnimicroInvoice> = {}): UnimicroInvoice {
  return {
    ID: 1,
    InvoiceNumber: 'UNI-001',
    InvoiceDate: '2024-03-01',
    PaymentDueDate: '2024-03-31',
    TaxExclusiveAmount: 10000,
    TaxAmount: 2500,
    TaxInclusiveAmount: 12500,
    RestAmount: 12500,
    StatusCode: 30,
    CurrencyCode: 'NOK',
    CustomerID: 42,
    ...overrides,
  }
}

describe('transformInvoice (Unimicro)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1')
    expect(result.invoiceNumber).toBe('UNI-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('NOK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps StatusCode 30 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ StatusCode: 30 })).status).toBe('AUTHORIZED')
  })

  it('maps StatusCode 50 to PAID', () => {
    expect(transformInvoice(makeInvoice({ StatusCode: 50 })).status).toBe('PAID')
  })

  it('maps StatusCode 10 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ StatusCode: 10 })).status).toBe('DRAFT')
  })

  it('maps StatusCode 40 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ StatusCode: 40 })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      Items: [
        {
          ID: 1,
          ProductName: 'Consulting',
          NumberOfItems: 5,
          PriceExVat: 1000,
          SumTotalExVat: 5000,
          SumVat: 1250,
          Account: '3001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(5000)
    expect(li.accountId).toBe('3001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
