import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type EcountTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/transaction'

function makeRaw(overrides: Partial<EcountTransaction> = {}): EcountTransaction {
  return {
    SLIP_NO: 'LG-2024-001',
    SLIP_DATE: '2024-01-15',
    ACCOUNT_CODE: '1001',
    ACCOUNT_NAME: 'Cash',
    DR_AMT: 0,
    CR_AMT: 50000,
    BALANCE: 1050000,
    REMARK: 'Payment from customer',
    CUST_CODE: 'CUST-001',
    ...overrides,
  }
}

describe('transformTransaction (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('LG-2024-001')
    expect(result.accountId).toBe('1001')
    expect(result.reference).toBe('LG-2024-001')
    expect(result.memo).toBe('Payment from customer')
    expect(result.totalAmount).toBe(50000)
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('maps CUST_CODE to contacts array', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('CUST-001')
  })

  it('uses DR_AMT when CR_AMT is zero', () => {
    const result = transformTransaction(makeRaw({ DR_AMT: 30000, CR_AMT: 0 }))
    expect(result.totalAmount).toBe(30000)
  })

  it('returns no contacts when CUST_CODE is absent', () => {
    const result = transformTransaction(makeRaw({ CUST_CODE: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
