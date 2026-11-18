import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FlowAccountInvoice } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/invoice'

function makeInvoice(overrides: Partial<FlowAccountInvoice> = {}): FlowAccountInvoice {
  return {
    id: 100,
    documentSerial: 'IV2024-00001',
    statusId: 1,
    issuedDate: '2024-01-15',
    dueDate: '2024-02-15',
    amountTotal: 10700,
    vatTotal: 700,
    currencyCode: 'THB',
    contactCode: 'CUST-001',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('100')
    expect(result.invoiceNumber).toBe('IV2024-00001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(10700)
    expect(result.taxAmount).toBe(700)
    expect(result.currency).toBe('THB')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps statusId 1 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ statusId: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps statusId 3 to PAID', () => {
    expect(transformInvoice(makeInvoice({ statusId: 3 })).status).toBe('PAID')
  })

  it('maps statusId 4 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ statusId: 4 })).status).toBe('VOIDED')
  })

  it('maps statusId 5 to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ statusId: 5 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({
      items: [
        {
          id: 'ITEM-1',
          description: 'Service Fee',
          quantity: 1,
          unitPrice: 10000,
          amount: 10000,
          vatAmount: 700,
          accountCode: '4100',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ITEM-1')
    expect(li.itemDescription).toBe('Service Fee')
    expect(li.unitAmount).toBe(10000)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(700)
    expect(li.accountId).toBe('4100')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice(makeInvoice({ vatTotal: 0, currencyCode: '' }))
    expect(result.taxAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
