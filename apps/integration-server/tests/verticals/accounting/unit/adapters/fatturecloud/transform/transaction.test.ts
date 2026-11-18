import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FattureCloudTransaction } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/transaction'

function makeTxn(overrides: Partial<FattureCloudTransaction> = {}): FattureCloudTransaction {
  return { id: 30, date: '2024-05-01', amount: 500, description: 'Pagamento', currency: { id: 'EUR' }, ...overrides }
}

describe('transformTransaction (fatturecloud)', () => {
  it('maps id and totalAmount', () => {
    expect(transformTransaction(makeTxn()).id).toBe('30')
    expect(transformTransaction(makeTxn()).totalAmount).toBe(500)
  })
  it('maps memo', () => { expect(transformTransaction(makeTxn()).memo).toBe('Pagamento') })
  it('maps currency', () => { expect(transformTransaction(makeTxn()).currency).toBe('EUR') })
  it('maps createdAt', () => { expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-05-01')) })
  it('passes raw as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTxn())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
