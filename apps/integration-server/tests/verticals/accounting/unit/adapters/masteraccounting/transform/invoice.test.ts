import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MasteraccountingInvoice } from '../../../../../../../src/verticals/accounting/adapters/masteraccounting/transform/invoice'

function makeInvoice(overrides: Partial<MasteraccountingInvoice> = {}): MasteraccountingInvoice {
  return {
    id: 'ma-1',
    number: 'INV-2024-100',
    date: '2024-03-01',
    dueDate: '2024-04-01',
    totalSum: 1200,
    taxSum: 200,
    status: 'DRAFT',
    partnerId: 'partner-1',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('ma-1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-100')
  })

  it('maps totalSum to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps taxSum to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps CANCELLED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps partnerId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('partner-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('UAH')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps invoice lines', () => {
    const raw = makeInvoice({
      lines: [
        { id: 'ln-1', description: 'Consulting', unitPrice: 600, quantity: 2, amount: 1200, taxAmount: 200, accountId: 'acc-1' },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Consulting')
    expect(result.lineItems![0].unitAmount).toBe(600)
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(1200)
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
