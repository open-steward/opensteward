import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type BexioInvoice,
  type BexioInvoicePosition,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/invoice'

function makePosition(overrides: Partial<BexioInvoicePosition> = {}): BexioInvoicePosition {
  return {
    id: 'pos-1',
    article_id: 'art-1',
    text: 'Consulting hours',
    amount: 10,
    unit_price: 150,
    position_total: 1500,
    tax_id: 'tax-1',
    tax_value: 120,
    account_id: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<BexioInvoice> = {}): BexioInvoice {
  return {
    id: 101,
    document_nr: 'INV-2024-001',
    contact_id: 42,
    currency_id: 1,
    currency_code: 'CHF',
    is_valid_from: '2024-03-01',
    is_valid_to: '2024-04-01',
    kb_item_status: 'pending',
    total_gross: 1620,
    total_taxes: 120,
    total_remaining_payments: 1620,
    total_received_payments: 0,
    positions: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps document_nr to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1620)
  })

  it('maps total_taxes to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(120)
  })

  it('maps total_remaining_payments to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1620)
  })

  it('maps is_valid_from to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps is_valid_to to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('returns undefined postedAt when is_valid_from is empty', () => {
    expect(transformInvoice(makeInvoice({ is_valid_from: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when kb_item_status is draft', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when kb_item_status is pending', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'pending' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when kb_item_status is paid', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when kb_item_status is partial', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'partial' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status VOIDED when kb_item_status is cancelled', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ kb_item_status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps positions to lineItems', () => {
    const raw = makeInvoice({ positions: [makePosition()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('pos-1')
    expect(li.itemId).toBe('art-1')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(150)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1500)
    expect(li.taxAmount).toBe(120)
    expect(li.taxrateId).toBe('tax-1')
    expect(li.accountId).toBe('acc-1')
  })

  it('returns empty lineItems array when positions is empty', () => {
    expect(transformInvoice(makeInvoice({ positions: [] })).lineItems).toEqual([])
  })

  it('returns undefined invoiceNumber when document_nr is empty', () => {
    expect(transformInvoice(makeInvoice({ document_nr: '' })).invoiceNumber).toBeUndefined()
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
