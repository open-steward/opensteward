import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MaxioCreditNote } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/creditmemo'

function makeCreditMemo(overrides: Partial<MaxioCreditNote> = {}): MaxioCreditNote {
  return {
    uid: 'cn_DEF789',
    number: 'CN-001',
    state: 'open',
    issued_date: '2024-03-20',
    currency: 'USD',
    total_amount: '300.00',
    tax_amount: '30.00',
    customer_id: 42,
    line_items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Maxio)', () => {
  it('maps id from uid', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cn_DEF789')
  })

  it('maps creditmemoNumber from number', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-001')
  })

  it('maps contacts from customer_id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('42')
  })

  it('maps totalAmount from total_amount string', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(300)
  })

  it('maps taxAmount from tax_amount string', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(30)
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('parses issued_date as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('maps draft state to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps open state to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ state: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps applied state to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ state: 'applied' })).status).toBe('PAID')
  })

  it('maps voided state to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ state: 'voided' })).status).toBe('VOIDED')
  })

  it('maps canceled state to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ state: 'canceled' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
