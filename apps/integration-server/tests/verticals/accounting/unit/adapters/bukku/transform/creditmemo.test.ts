import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type BukkuCreditNote } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/creditmemo'

function makeRaw(overrides: Partial<BukkuCreditNote> = {}): BukkuCreditNote {
  return {
    id: '20',
    number: 'CN-001',
    date: '2024-04-01',
    total: 500,
    tax_total: 65,
    balance: 500,
    status: 'draft',
    contact_id: '42',
    contact_name: 'Acme Sdn Bhd',
    line_items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('20')
    expect(result.creditmemoNumber).toBe('CN-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(65)
    expect(result.balanceAmount).toBe(500)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'CN-999' })
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('CN-999')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps void status to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps line items', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: '1',
          description: 'Refund item',
          quantity: 1,
          unit_price: 500,
          amount: 500,
          tax_amount: 65,
          account_id: '400',
          account_code: '4-001',
          tax_rate_id: '13',
          discount: 0,
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].taxAmount).toBe(65)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
