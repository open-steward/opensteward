import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ReckonCreditNote } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/creditmemo'

function makeRaw(overrides: Partial<ReckonCreditNote> = {}): ReckonCreditNote {
  return {
    id: 'cn-001',
    creditNoteNumber: 'CN-0001',
    date: '2024-03-25',
    totalAmount: 550,
    totalTax: 50,
    balance: 550,
    contactId: 'contact-001',
    contactName: 'Acme Pty Ltd',
    status: 'AUTHORIZED',
    lineItems: [],
    ...overrides,
  }
}

describe('transformCreditMemo (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('cn-001')
    expect(result.creditmemoNumber).toBe('CN-0001')
    expect(result.contactId).toBe('contact-001')
    expect(result.totalAmount).toBe(550)
    expect(result.taxAmount).toBe(50)
    expect(result.balanceAmount).toBe(550)
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps DRAFT status', () => {
    expect(transformCreditMemo(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps PAID status', () => {
    expect(transformCreditMemo(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PARTIAL to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps VOID to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'VOID' })).status).toBe('VOIDED')
  })

  it('calculates paidAmount as totalAmount minus balance', () => {
    const result = transformCreditMemo(makeRaw({ totalAmount: 550, balance: 275 }))
    expect(result.paidAmount).toBe(275)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-25'))
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Returned goods',
          quantity: 1,
          unitAmount: 500,
          amount: 500,
          taxAmount: 50,
          accountId: 'acc-300',
          taxCodeId: 'GST',
          discountAmount: 0,
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].accountId).toBe('acc-300')
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
