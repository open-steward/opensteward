import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DineroInvoice } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/invoice'

function makeInvoice(overrides: Partial<DineroInvoice> = {}): DineroInvoice {
  return {
    Guid: 'inv-guid-001',
    Number: 1042,
    ContactGuid: 'contact-guid-001',
    Currency: 'DKK',
    Date: '2024-03-15',
    PaymentDate: '2024-04-15',
    TotalInclVat: 12500,
    TotalVat: 2500,
    RemainingAmount: 12500,
    PaymentAmount: 0,
    Status: 'Draft',
    ProductLines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps Guid to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-guid-001')
  })

  it('maps Number to invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('1042')
  })

  it('maps ContactGuid to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-guid-001')
  })

  it('maps core amount fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('DKK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses Date as postedAt Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('parses PaymentDate as dueAt Date object', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when Date is empty', () => {
    expect(transformInvoice(makeInvoice({ Date: '' })).postedAt).toBeUndefined()
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Booked status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Booked' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps PartPayment status to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'PartPayment' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps Overdue status to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps ProductLines to lineItems', () => {
    const raw = makeInvoice({
      ProductLines: [
        {
          Guid: 'line-001',
          ProductGuid: 'prod-001',
          Description: 'Consulting hours',
          Quantity: 10,
          AccountNumber: 1000,
          Unit: 'hours',
          BaseAmountValue: 500,
          TotalAmount: 5000,
          VatAmount: 1250,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-001')
    expect(li.itemId).toBe('prod-001')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(1250)
    expect(li.accountId).toBe('1000')
  })

  it('returns undefined contactId when ContactGuid is empty', () => {
    expect(transformInvoice(makeInvoice({ ContactGuid: '' })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata unchanged', () => {
    const raw = makeInvoice({ Currency: 'EUR' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['Currency']).toBe('EUR')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
