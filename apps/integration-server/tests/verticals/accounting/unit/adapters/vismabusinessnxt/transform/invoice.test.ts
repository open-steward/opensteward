import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type VismaBusinessNxtInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/vismabusinessnxt/transform/invoice'

function makeInvoice(overrides: Partial<VismaBusinessNxtInvoice> = {}): VismaBusinessNxtInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'BNX-001',
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    netAmount: 10000,
    taxAmount: 2500,
    grossAmount: 12500,
    outstandingAmount: 12500,
    status: 'Open',
    currency: 'NOK',
    customerId: 'cust-1',
    ...overrides,
  }
}

describe('transformInvoice (Visma Business NXT)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('BNX-001')
    expect(result.contactId).toBe('cust-1')
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

  it('maps Open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      lineItems: [
        {
          id: 'li-1',
          description: 'Consulting',
          quantity: 5,
          unitPrice: 1000,
          amount: 5000,
          taxAmount: 1250,
          accountNumber: '3001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
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
