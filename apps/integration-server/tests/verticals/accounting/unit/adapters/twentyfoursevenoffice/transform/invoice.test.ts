import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type TwentyFourSevenInvoice,
  type TwentyFourSevenInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/invoice'

function makeInvoiceLine(overrides: Partial<TwentyFourSevenInvoiceLine> = {}): TwentyFourSevenInvoiceLine {
  return {
    id: 'line-1',
    productId: 'prod-1',
    description: 'Consulting hours',
    quantity: 10,
    unitPrice: 1200,
    amount: 12000,
    taxCode: 'tax-25',
    taxAmount: 3000,
    accountId: 'acc-3000',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<TwentyFourSevenInvoice> = {}): TwentyFourSevenInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 5001,
    customerId: 'cust-1',
    currency: 'NOK',
    invoiceDate: '2024-06-15',
    dueDate: '2024-07-15',
    status: 'approved',
    totalAmount: 15000,
    taxAmount: 3000,
    balance: 15000,
    paidAmount: 0,
    lines: [],
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

  it('maps invoiceNumber to invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('5001')
  })

  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('NOK')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(15000)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(3000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(15000)
  })

  it('maps invoiceDate to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-15'))
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-07-15'))
  })

  it('returns undefined postedAt when invoiceDate is empty', () => {
    expect(transformInvoice(makeInvoice({ invoiceDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full balance', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'approved', balance: 15000, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and balance is zero', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'approved', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'approved', balance: 7000, paidAmount: 8000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is voided', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status VOIDED when status is cancelled', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [makeInvoiceLine()],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(1200)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(12000)
    expect(li.taxAmount).toBe(3000)
    expect(li.accountId).toBe('acc-3000')
    expect(li.taxrateId).toBe('tax-25')
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
