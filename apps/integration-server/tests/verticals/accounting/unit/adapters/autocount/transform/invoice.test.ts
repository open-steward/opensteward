import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type AutocountInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/invoice'

function makeRaw(overrides: Partial<AutocountInvoice> = {}): AutocountInvoice {
  return {
    DocNo: 'INV-001',
    DocDate: '2024-03-01',
    PostDate: '2024-03-01',
    DueDate: '2024-03-31',
    SubTotal: 1000,
    TaxAmt: 60,
    DocAmt: 1060,
    CreditBalance: 1060,
    DebtorCode: 'D001',
    DebtorName: 'Acme Sdn Bhd',
    CurrencyCode: 'MYR',
    Description: 'March invoice',
    Cancelled: false,
    Posted: false,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformInvoice (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('D001')
    expect(result.currency).toBe('MYR')
    expect(result.totalAmount).toBe(1060)
    expect(result.taxAmount).toBe(60)
    expect(result.balanceAmount).toBe(1060)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ Description: 'Test invoice' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['Description']).toBe('Test invoice')
  })

  it('maps non-posted non-cancelled invoice to DRAFT', () => {
    const result = transformInvoice(makeRaw({ Posted: false, Cancelled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps posted invoice with full credit balance to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ Posted: true, CreditBalance: 1060, DocAmt: 1060 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps posted invoice with zero credit balance to PAID', () => {
    const result = transformInvoice(makeRaw({ Posted: true, CreditBalance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps posted invoice with partial credit balance to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ Posted: true, CreditBalance: 530, DocAmt: 1060 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps cancelled invoice to VOIDED regardless of posted state', () => {
    const result = transformInvoice(makeRaw({ Posted: true, CreditBalance: 0, Cancelled: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps DetailItems to lineItems', () => {
    const raw = makeRaw({
      DetailItems: [
        {
          Seq: 1,
          ItemCode: 'ITEM-001',
          Description: 'Widget',
          Qty: 5,
          UnitPrice: 200,
          Amount: 1000,
          TaxAmt: 60,
          TaxCode: 'SR',
          AccNo: '300-000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('ITEM-001')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(60)
    expect(li.accountId).toBe('300-000')
    expect(li.taxrateId).toBe('SR')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
