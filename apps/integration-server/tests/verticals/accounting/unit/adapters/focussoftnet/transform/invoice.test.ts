import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FocusSoftnetInvoice } from '../../../../../../../src/verticals/accounting/adapters/focussoftnet/transform/invoice'

function makeRaw(overrides: Partial<FocusSoftnetInvoice> = {}): FocusSoftnetInvoice {
  return {
    DocNo: 'INV-2024-001',
    DocDate: '2024-06-01',
    DueDate: '2024-06-30',
    SubTotal: 10000,
    TaxAmt: 500,
    TotalAmt: 10500,
    OutstandingAmt: 10500,
    DocStatus: 'D',
    CustCode: 'CUST001',
    CurrCode: 'AED',
    Lines: [],
    ...overrides,
  }
}

describe('transformInvoice (focussoftnet)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-2024-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.totalAmount).toBe(10500)
    expect(result.taxAmount).toBe(500)
    expect(result.currency).toBe('AED')
    expect(result.type).toBe('INVOICE')
    expect(result.contactId).toBe('CUST001')
    expect(result.balanceAmount).toBe(10500)
  })

  it('uses DocNo for both id and invoiceNumber', () => {
    const result = transformInvoice(makeRaw({ DocNo: 'SI-99' }))
    expect(result.id).toBe('SI-99')
    expect(result.invoiceNumber).toBe('SI-99')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps DocStatus D to DRAFT', () => {
    expect(transformInvoice(makeRaw({ DocStatus: 'D' })).status).toBe('DRAFT')
  })

  it('maps DocStatus A to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ DocStatus: 'A' })).status).toBe('AUTHORIZED')
  })

  it('maps DocStatus P to PAID', () => {
    expect(transformInvoice(makeRaw({ DocStatus: 'P' })).status).toBe('PAID')
  })

  it('maps DocStatus C to VOIDED', () => {
    expect(transformInvoice(makeRaw({ DocStatus: 'C' })).status).toBe('VOIDED')
  })

  it('defaults unknown DocStatus to DRAFT', () => {
    expect(transformInvoice(makeRaw({ DocStatus: 'X' })).status).toBe('DRAFT')
  })

  it('maps Lines correctly', () => {
    const raw = makeRaw({
      Lines: [
        {
          ItemCode: 'PROD001',
          Description: 'Hardware',
          Qty: 4,
          UnitPrice: 2500,
          SubTotal: 10000,
          TaxAmt: 500,
          AccCode: 'ACC400',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('PROD001')
    expect(result.lineItems![0].itemDescription).toBe('Hardware')
    expect(result.lineItems![0].unitQuantity).toBe(4)
    expect(result.lineItems![0].unitAmount).toBe(2500)
    expect(result.lineItems![0].totalAmount).toBe(10000)
    expect(result.lineItems![0].taxAmount).toBe(500)
    expect(result.lineItems![0].accountId).toBe('ACC400')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
