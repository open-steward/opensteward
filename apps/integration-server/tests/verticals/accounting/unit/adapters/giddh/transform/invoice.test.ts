import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type GiddhVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/invoice'

function makeRaw(overrides: Partial<GiddhVoucher> = {}): GiddhVoucher {
  return {
    uniqueName: 'voucher-sales-001',
    number: 'INV-001',
    voucherDate: '2024-03-01',
    dueDate: '2024-03-31',
    grandTotal: 118000,
    taxesTotal: 18000,
    subTotal: 100000,
    balanceDue: 118000,
    currency: 'INR',
    account: { uniqueName: 'customer-abc', name: 'ABC Pvt Ltd' },
    entries: [],
    status: 'pending',
    ...overrides,
  }
}

describe('transformInvoice (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('voucher-sales-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('customer-abc')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(118000)
    expect(result.taxAmount).toBe(18000)
    expect(result.balanceAmount).toBe(118000)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status pending to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'pending' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status cancel to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'cancel' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          description: 'Software License',
          quantity: 1,
          rate: 100000,
          amount: 100000,
          taxableAmount: 100000,
          accountUniqueName: 'sales-account',
          accountName: 'Sales Account',
          taxes: [{ uniqueName: 'gst-18', percent: 18 }],
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('sales-account')
    expect(li.itemDescription).toBe('Software License')
    expect(li.unitAmount).toBe(100000)
    expect(li.totalAmount).toBe(100000)
    expect(li.taxAmount).toBe(18000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
