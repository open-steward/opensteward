import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type KlaraCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditNote(overrides: Partial<KlaraCreditNote> = {}): KlaraCreditNote {
  return {
    id: 'cn-1',
    credit_note_number: 'CN-2024-001',
    status: 'issued',
    contact_id: 'cont-1',
    currency: 'CHF',
    total_amount: 5000,
    balance_amount: 5000,
    paid_amount: 0,
    credit_date: '2024-04-01T00:00:00.000Z',
    notes: 'Refund for INV-001',
    created_at: '2024-04-01T00:00:00.000Z',
    updated_at: '2024-04-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.id).toBe('cn-1')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('cont-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(5000)
    expect(result.notes).toBe('Refund for INV-001')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status issued to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('infers PAID from balance math when status unknown', () => {
    const result = transformCreditMemo(
      makeCreditNote({ status: undefined, balance_amount: 0, total_amount: 5000 }),
    )
    expect(result.status).toBe('PAID')
  })

  it('parses credit_date as postedAt Date', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.postedAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps positions to lineItems', () => {
    const result = transformCreditMemo(
      makeCreditNote({
        positions: [
          {
            id: 'pos-1',
            description: 'Returned widget',
            quantity: 1,
            unit_price: 5000,
            total_price: 5000,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Returned widget')
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditNote()))).not.toThrow()
  })
})
