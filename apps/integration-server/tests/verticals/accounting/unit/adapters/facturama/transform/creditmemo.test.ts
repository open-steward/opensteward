import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FacturamaCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/creditmemo'

function makeRaw(overrides: Partial<FacturamaCreditMemo> = {}): FacturamaCreditMemo {
  return {
    Id: 'cm-1',
    Folio: 'NC-001',
    ClientId: 'cust-1',
    Currency: 'MXN',
    Total: 500,
    TaxAmount: 80,
    Balance: 500,
    PaidAmount: 0,
    Date: '2024-02-01',
    DueDate: '2024-03-01',
    Status: 'pending',
    IsCancelled: false,
    Items: [],
    ...overrides,
  }
}

describe('facturama transformCreditMemo', () => {
  it('maps Id to id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('cm-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
  it('maps IsCancelled true -> VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ IsCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Balance=0 -> PAID', () => {
    expect(transformCreditMemo(makeRaw({ Balance: 0 })).status).toBe('PAID')
  })
  it('maps Date to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
