import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SevDeskInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/invoice'

function makeInvoice(overrides: Partial<SevDeskInvoice> = {}): SevDeskInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-2024-001',
    contact: { id: 'con-1', objectName: 'Contact' },
    invoiceDate: '2024-03-01',
    header: '',
    footText: '',
    timeToPay: '14',
    discountTime: '0',
    discount: '0',
    payDate: null,
    status: '100',
    sumNet: '1000.00',
    sumGross: '1190.00',
    sumTax: '190.00',
    sumDiscounts: '0.00',
    currency: 'EUR',
    invoiceType: 'RE',
    createUser: { id: 'user-1' },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-1')
  })

  it('maps invoiceNumber correctly', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps contact id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('con-1')
  })

  it('maps currency correctly', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1190)
  })

  it('parses sumTax as taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(190)
  })

  it('parses invoiceDate as Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps payDate to paidAt as Date object', () => {
    const inv = transformInvoice(makeInvoice({ payDate: '2024-03-15' }))
    expect(inv.paidAt).toEqual(new Date('2024-03-15'))
  })

  it('maps status 100 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: '100' })).status).toBe('DRAFT')
  })

  it('maps status 200 without payDate to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: '200', payDate: null })).status).toBe('AUTHORIZED')
  })

  it('maps status 200 with payDate to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: '200', payDate: '2024-03-15' })).status).toBe('PAID')
  })

  it('maps status 1000 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: '1000' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
