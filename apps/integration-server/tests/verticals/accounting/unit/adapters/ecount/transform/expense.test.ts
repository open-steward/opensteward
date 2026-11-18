import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type EcountExpense,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/expense'

function makeRaw(overrides: Partial<EcountExpense> = {}): EcountExpense {
  return {
    SLIP_NO: 'EX-2024-001',
    IO_DATE: '2024-01-20',
    EMP_CODE: 'EMP-001',
    EMP_NAME: 'Kim Chulsu',
    TOTAL_AMT: 150000,
    STATUS: '02',
    REMARK: 'Business trip expenses',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformExpense (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EX-2024-001')
    expect(result.name).toBe('Business trip expenses')
    expect(result.totalAmount).toBe(150000)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
  })

  it('falls back to SLIP_NO when REMARK is absent', () => {
    const result = transformExpense(makeRaw({ REMARK: undefined }))
    expect(result.name).toBe('EX-2024-001')
  })

  it('maps ITEM_LIST to lineItems', () => {
    const raw = makeRaw({
      ITEM_LIST: [
        {
          SEQ: 1,
          ACCOUNT_CODE: 'TRAVEL-001',
          DESCRIPTION: 'Hotel accommodation',
          AMOUNT: 100000,
          VAT_AMT: 10000,
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('TRAVEL-001')
    expect(result.lineItems![0].itemDescription).toBe('Hotel accommodation')
    expect(result.lineItems![0].totalAmount).toBe(100000)
    expect(result.lineItems![0].taxAmount).toBe(10000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
