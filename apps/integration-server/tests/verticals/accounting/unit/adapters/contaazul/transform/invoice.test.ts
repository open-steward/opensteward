import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ContaAzulInvoice } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/invoice'

function makeInvoice(overrides: Partial<ContaAzulInvoice> = {}): ContaAzulInvoice {
  return {
    id: 'inv-001',
    number: 'NF-3000',
    issue_date: '2025-05-01',
    due_date: '2025-06-01',
    customer_id: 'cust-200',
    total: 18000,
    tax_total: 3240,
    balance: 9000,
    paid_amount: 9000,
    currency: 'BRL',
    status: 'paid',
    reference: 'PO-500',
    items: [
      { id: 'li-1', description: 'Consultoria', quantity: 6, unit_price: 3000, total: 18000, tax_amount: 3240, account_id: 'acc-30', product_id: 'svc-1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('NF-3000')
    expect(result.contactId).toBe('cust-200')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(18000)
    expect(result.taxAmount).toBe(3240)
    expect(result.balanceAmount).toBe(9000)
    expect(result.paidAmount).toBe(9000)
    expect(result.reference).toBe('PO-500')
  })

  it('maps status values', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
    expect(transformInvoice(makeInvoice({ status: 'liquidated' })).status).toBe('PAID')
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
    expect(transformInvoice(makeInvoice({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformInvoice(makeInvoice({ status: 'confirmed' })).status).toBe('AUTHORIZED')
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
    expect(transformInvoice(makeInvoice({ status: '' })).status).toBe('DRAFT')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2025-05-01'))
    expect(result.dueAt).toEqual(new Date('2025-06-01'))
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
