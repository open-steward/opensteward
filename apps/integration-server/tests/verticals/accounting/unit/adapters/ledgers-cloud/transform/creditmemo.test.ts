import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

const base = {
  id: 'cn-10',
  credit_note_number: 'CN-2024-001',
  credit_date: '2024-05-01T00:00:00.000Z',
  contact: { id: 'cont-3' },
  currency: 'USD',
  payment_status: 'Not Paid',
  total_amount: 3000,
  paid_amount: 0,
  balance_amount: 3000,
  tax_amount: 300,
  notes: 'Corrected credit note',
  created_at: '2024-05-01T00:00:00.000Z',
  updated_at: '2024-05-02T00:00:00.000Z',
  items: [
    {
      id: 'li-1',
      description: 'Returned goods',
      unit_price: 3000,
      quantity: 1,
      amount: 3000,
      tax_amount: 300,
    },
  ],
}

describe('transformCreditMemo', () => {
  it('maps core fields', () => {
    const result = transformCreditMemo(base)
    expect(result.id).toBe('cn-10')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('cont-3')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(300)
  })

  it('maps payment_status Paid to PAID', () => {
    expect(transformCreditMemo({ ...base, payment_status: 'Paid' }).status).toBe('PAID')
  })

  it('maps payment_status Part Paid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo({ ...base, payment_status: 'Part Paid' }).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps payment_status Not Paid to AUTHORIZED', () => {
    expect(transformCreditMemo({ ...base, payment_status: 'Not Paid' }).status).toBe('AUTHORIZED')
  })

  it('parses credit_date as postedAt', () => {
    expect(transformCreditMemo(base).postedAt).toEqual(new Date('2024-05-01T00:00:00.000Z'))
  })

  it('maps items to lineItems', () => {
    const result = transformCreditMemo(base)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Returned goods')
    expect(result.lineItems![0].totalAmount).toBe(3000)
  })

  it('passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(base))).not.toThrow()
  })
})
