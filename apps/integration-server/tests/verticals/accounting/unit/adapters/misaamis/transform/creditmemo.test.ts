import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type MisaAmisCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/creditmemo'

function makeRaw(overrides: Partial<MisaAmisCreditNote> = {}): MisaAmisCreditNote {
  return {
    id: 'cn-001',
    credit_note_number: 'CN-2024-001',
    credit_note_date: '2024-03-20',
    total_amount: 1000000,
    vat_amount: 100000,
    total_payment: 1100000,
    remaining_amount: 1100000,
    partner_id: 'partner-001',
    partner_name: 'Công ty ABC',
    status: 0,
    credit_note_details: [],
    ...overrides,
  }
}

describe('transformCreditMemo (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('cn-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('partner-001')
    expect(result.totalAmount).toBe(1100000)
    expect(result.taxAmount).toBe(100000)
    expect(result.balanceAmount).toBe(1100000)
  })

  it('parses credit_note_date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps status 4 to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 4 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps credit_note_details to lineItems', () => {
    const raw = makeRaw({
      credit_note_details: [
        {
          id: 'detail-001',
          description: 'Hoàn trả hàng',
          unit: 'cái',
          quantity: 1,
          unit_price: 1000000,
          amount: 1000000,
          vat_rate: 10,
          vat_amount: 100000,
          account_id: 'acc-001',
          account_code: '5111',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('detail-001')
    expect(li.totalAmount).toBe(1000000)
    expect(li.taxAmount).toBe(100000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
