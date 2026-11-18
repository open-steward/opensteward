import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type FakturoidInvoice,
  type FakturoidInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/invoice'

function makeInvoiceLine(overrides: Partial<FakturoidInvoiceLine> = {}): FakturoidInvoiceLine {
  return {
    id: 101,
    name: 'Web Development',
    quantity: 10,
    unit_name: 'hours',
    unit_price: 1500,
    vat_rate: 21,
    unit_price_without_vat: 1500,
    unit_price_with_vat: 1815,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<FakturoidInvoice> = {}): FakturoidInvoice {
  return {
    id: 1001,
    custom_id: 'CUST-001',
    number: '2024-0001',
    subject_id: 42,
    status: 'open',
    due_on: '2024-04-15',
    issued_on: '2024-03-15',
    total: 18150,
    native_total: 18150,
    remaining_amount: 18150,
    remaining_native_amount: 18150,
    paid_amount: 0,
    currency: 'CZK',
    vat_price: 3150,
    native_vat_price: 3150,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('1001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('2024-0001')
  })

  it('maps subject_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CZK')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(18150)
  })

  it('maps vat_price to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(3150)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(18150)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_on to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when issued_on is empty', () => {
    expect(transformInvoice(makeInvoice({ issued_on: '' })).postedAt).toBeUndefined()
  })

  it('maps status open to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('SUBMITTED')
  })

  it('maps status sent to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('SUBMITTED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status overdue to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({ lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('101')
    expect(li.itemDescription).toBe('Web Development')
    expect(li.unitAmount).toBe(1500)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(18150)
    expect(li.taxAmount).toBe(3150)
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
