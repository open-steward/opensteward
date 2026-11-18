import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type AfasCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<AfasCreditNote> = {}): AfasCreditNote {
  return {
    CrNoteNr: 'CN-300',
    DebtorId: 'DEB-001',
    Description: 'Credit for returned goods',
    AmtNote: 200,
    Balance: 200,
    CurrencyId: 'EUR',
    ExpDate: '2024-04-01',
    NookPieceDate: '2024-03-01',
    ...overrides,
  }
}

describe('transformCreditMemo (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('CN-300')
    expect(result.creditmemoNumber).toBe('CN-300')
    expect(result.contactId).toBe('DEB-001')
    expect(result.currency).toBe('EUR')
    // AmtNote=200 → toMinorUnits → 20000
    expect(result.totalAmount).toBe(20000)
    expect(result.balanceAmount).toBe(20000)
    expect(result.notes).toBe('Credit for returned goods')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps balance=0 to PAID', () => {
    const result = transformCreditMemo(makeRaw({ AmtNote: 200, Balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps full positive balance to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ AmtNote: 200, Balance: 200 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
