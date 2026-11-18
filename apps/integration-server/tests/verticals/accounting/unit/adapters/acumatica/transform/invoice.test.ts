import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AcumaticaInvoice } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/invoice'

function makeInvoice(overrides: Partial<AcumaticaInvoice> = {}): AcumaticaInvoice {
  return {
    RefNbr: 'AR001234',
    Type: 'Invoice',
    Status: 'Open',
    Amount: 1200,
    TaxTotal: 200,
    Balance: 1200,
    CurrencyID: 'USD',
    CustomerID: 'CUST001',
    DocDate: '2024-03-01',
    DueDate: '2024-03-31',
    InvoiceNbr: 'INV-001',
    Details: [],
    ...overrides,
  }
}

describe('transformInvoice (Acumatica)', () => {
  it('maps id from RefNbr', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('AR001234')
  })

  it('maps invoiceNumber from InvoiceNbr', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps contacts from CustomerID', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('CUST001')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
  })

  it('maps currency from CurrencyID', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Hold status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('maps Details to lineItems', () => {
    const raw = makeInvoice({
      Details: [
        {
          LineNbr: 1,
          InventoryID: 'WIDGET',
          Description: 'Widget A',
          Qty: 5,
          UnitPrice: 100,
          ExtPrice: 500,
          TaxAmt: 50,
          AccountID: '4000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('WIDGET')
    expect(li.itemDescription).toBe('Widget A')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(50)
    expect(li.accountId).toBe('4000')
  })

  it('returns empty lineItems when Details is absent', () => {
    const result = transformInvoice(makeInvoice({ Details: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
