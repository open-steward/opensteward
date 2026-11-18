import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FattureCloudInvoice, type FattureCloudItem } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/invoice'

function makeInvoice(overrides: Partial<FattureCloudInvoice> = {}): FattureCloudInvoice {
  return {
    id: 7001,
    type: 'fattura',
    number: 'FC-2024-007',
    numeration: 'FE',
    client_id: 300,
    date: '2024-04-10',
    currency: { id: 'EUR', symbol: '€' },
    amount_net: 4000,
    amount_gross: 4880,
    amount_vat: 880,
    payment_status: 'not_paid',
    status: 'rec',
    items_list: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<FattureCloudItem> = {}): FattureCloudItem {
  return {
    id: 101,
    product_id: 55,
    name: 'Consulting Service',
    qty: 8,
    cost: 500,
    net_price: 4000,
    vat: { value: 22 },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('7001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FC-2024-007')
    expect(result.contactId).toBe('300')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(4880)
    expect(result.taxAmount).toBe(880)
  })

  it('converts numeric id to string', () => {
    const result = transformInvoice(makeInvoice({ id: 9999 }))
    expect(result.id).toBe('9999')
    expect(typeof result.id).toBe('string')
  })

  it('converts numeric client_id to string contactId', () => {
    const result = transformInvoice(makeInvoice({ client_id: 42 }))
    expect(result.contactId).toBe('42')
  })

  it('parses date as Date object', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft', payment_status: 'not_paid' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps void status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'void', payment_status: 'not_paid' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps rec status with paid payment_status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'rec', payment_status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps rec status with partial payment_status to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'rec', payment_status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps rec status with not_paid payment_status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'rec', payment_status: 'not_paid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('draft status takes precedence over payment_status', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft', payment_status: 'paid' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps items_list to lineItems', () => {
    const raw = makeInvoice({ items_list: [makeItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('101')
    expect(li.itemId).toBe('55')
    expect(li.itemDescription).toBe('Consulting Service')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(8)
    expect(li.totalAmount).toBe(4000)
  })

  it('produces empty lineItems when items_list is absent', () => {
    const raw = makeInvoice({ items_list: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits itemId when product_id is 0 (falsy)', () => {
    const raw = makeInvoice({ items_list: [makeItem({ product_id: 0 })] })
    const result = transformInvoice(raw)
    expect(result.lineItems![0].itemId).toBeUndefined()
  })

  it('omits invoiceNumber when number is empty', () => {
    const result = transformInvoice(makeInvoice({ number: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits contactId when client_id is 0 (falsy)', () => {
    const result = transformInvoice(makeInvoice({ client_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits currency when currency id is empty', () => {
    const result = transformInvoice(makeInvoice({ currency: { id: '', symbol: '' } }))
    expect(result.currency).toBeUndefined()
  })

  it('omits postedAt when date is empty', () => {
    const result = transformInvoice(makeInvoice({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
