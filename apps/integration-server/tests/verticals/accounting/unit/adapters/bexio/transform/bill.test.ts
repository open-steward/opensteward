import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type BexioBill,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/bill'

function makeBill(overrides: Partial<BexioBill> = {}): BexioBill {
  return {
    id: 201,
    document_nr: 'BILL-2024-001',
    contact_id: 55,
    currency_id: 1,
    currency_code: 'CHF',
    is_valid_from: '2024-02-10',
    is_valid_to: '2024-03-10',
    kb_item_status: 'pending',
    total_gross: 5000,
    total_taxes: 380,
    total_remaining_payments: 5000,
    total_received_payments: 0,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id as string', () => {
    expect(transformBill(makeBill()).id).toBe('201')
  })

  it('maps document_nr to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(5000)
  })

  it('maps total_taxes to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(380)
  })

  it('maps total_remaining_payments to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(5000)
  })

  it('maps is_valid_from to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('maps is_valid_to to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-10'))
  })

  it('returns undefined postedAt when is_valid_from is empty', () => {
    expect(transformBill(makeBill({ is_valid_from: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when kb_item_status is draft', () => {
    expect(transformBill(makeBill({ kb_item_status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when kb_item_status is pending', () => {
    expect(transformBill(makeBill({ kb_item_status: 'pending' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when kb_item_status is paid', () => {
    expect(transformBill(makeBill({ kb_item_status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when kb_item_status is partial', () => {
    expect(transformBill(makeBill({ kb_item_status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when kb_item_status is cancelled', () => {
    expect(transformBill(makeBill({ kb_item_status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ kb_item_status: 'other' })).status).toBe('DRAFT')
  })

  it('returns undefined billNumber when document_nr is empty', () => {
    expect(transformBill(makeBill({ document_nr: '' })).billNumber).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
