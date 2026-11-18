import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type BillyInvoice,
  type BillyInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/invoice'

function makeInvoiceLine(overrides: Partial<BillyInvoiceLine> = {}): BillyInvoiceLine {
  return {
    id: 'line-1',
    productId: 'prod-1',
    description: 'Widget',
    quantity: 2,
    unitPrice: 500,
    amount: 1000,
    taxRateId: 'tax-1',
    taxAmount: 250,
    accountId: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<BillyInvoice> = {}): BillyInvoice {
  return {
    id: 'inv-001',
    invoiceNo: 1001,
    contactId: 'contact-1',
    currencyId: 'DKK',
    entryDate: '2024-03-15',
    dueDate: '2024-04-15',
    state: 'approved',
    grossAmount: 10000,
    taxAmount: 2000,
    balance: 10000,
    paidAmount: 0,
    sentState: 'sent',
    invoiceLines: [],
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNo to invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('1001')
  })

  it('maps contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currencyId to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('DKK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(10000)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(2000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(10000)
  })

  it('maps entryDate to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when entryDate is empty', () => {
    expect(transformInvoice(makeInvoice({ entryDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when state is draft', () => {
    expect(transformInvoice(makeInvoice({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full balance', () => {
    expect(
      transformInvoice(makeInvoice({ state: 'approved', balance: 10000, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and balance is zero', () => {
    expect(
      transformInvoice(makeInvoice({ state: 'approved', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ state: 'approved', balance: 5000, paidAmount: 5000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when state is voided', () => {
    expect(transformInvoice(makeInvoice({ state: 'voided' })).status).toBe('VOIDED')
  })

  it('maps invoiceLines to lineItems', () => {
    const raw = makeInvoice({
      invoiceLines: [makeInvoiceLine()],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(250)
    expect(li.accountId).toBe('acc-1')
    expect(li.taxrateId).toBe('tax-1')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
