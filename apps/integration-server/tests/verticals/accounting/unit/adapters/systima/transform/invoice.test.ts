import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SystimaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/systima/transform/invoice'

function makeInvoice(overrides: Partial<SystimaInvoice> = {}): SystimaInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'SYS-001',
    date: '2024-03-01',
    dueDate: '2024-03-31',
    amountExVat: 10000,
    vatAmount: 2500,
    amountIncVat: 12500,
    unpaidAmount: 12500,
    status: 'SENT',
    currency: 'NOK',
    customerId: 'cust-1',
    ...overrides,
  }
}

describe('transformInvoice (Systima)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('SYS-001')
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

  it('maps SENT status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps CANCELLED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 'li-1',
          description: 'Consulting',
          quantity: 5,
          unitPrice: 1000,
          amount: 5000,
          vatAmount: 1250,
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
