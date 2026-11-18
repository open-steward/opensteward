import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type BexioCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BexioCreditMemo> = {}): BexioCreditMemo {
  return {
    id: 1001,
    document_nr: 'CM-2024-001',
    contact_id: 42,
    currency_code: 'CHF',
    is_valid_from: '2024-06-01',
    is_valid_to: '2024-07-01',
    kb_item_status: 'pending',
    total_gross: 500,
    total_taxes: 38,
    total_remaining_payments: 500,
    total_received_payments: 0,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('1001')
  })

  it('maps document_nr to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('maps total_taxes to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(38)
  })

  it('maps total_remaining_payments to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(500)
  })

  it('maps is_valid_from to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps is_valid_to to dueAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-07-01'))
  })

  it('returns undefined postedAt when is_valid_from is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ is_valid_from: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when kb_item_status is draft', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when kb_item_status is pending', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'pending' })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps status PAID when kb_item_status is paid', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when kb_item_status is partial', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'partial' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status VOIDED when kb_item_status is cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'cancelled' })).status).toBe(
      'VOIDED',
    )
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ kb_item_status: 'other' })).status).toBe('DRAFT')
  })

  it('returns undefined creditmemoNumber when document_nr is empty', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ document_nr: '' })).creditmemoNumber,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
