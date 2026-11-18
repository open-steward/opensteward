import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AcumaticaTransaction } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/transaction'

function makeTransaction(overrides: Partial<AcumaticaTransaction> = {}): AcumaticaTransaction {
  return {
    TranID: 'TXN0001',
    TranDate: '2024-03-15',
    TranDesc: 'Payment received',
    CuryTranAmt: 500,
    CuryID: 'USD',
    AccountID: '1000',
    ...overrides,
  }
}

describe('transformTransaction (Acumatica)', () => {
  it('maps id from TranID', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('TXN0001')
  })

  it('maps memo from TranDesc', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received')
  })

  it('maps totalAmount from CuryTranAmt', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(500)
  })

  it('maps currency from CuryID', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps accountId from AccountID', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1000')
  })

  it('parses TranDate as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
