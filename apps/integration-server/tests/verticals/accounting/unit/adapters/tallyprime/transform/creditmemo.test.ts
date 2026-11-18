import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type TallyCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/creditmemo'

function makeCreditMemo(overrides: Partial<TallyCreditMemo> = {}): TallyCreditMemo {
  return {
    VOUCHERNUMBER: 'CN/2024/001',
    PARTYLEDGERNAME: 'Customer ABC',
    DATE: '20240410',
    AMOUNT: '2500.00',
    NARRATION: 'Goods returned',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps VOUCHERNUMBER to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('CN/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('Customer ABC')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(2500)
  })

  it('maps NARRATION to notes', () => {
    expect(transformCreditMemo(makeCreditMemo()).notes).toBe('Goods returned')
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-04-10'))
  })

  it('always sets status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo()).status).toBe('AUTHORIZED')
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    expect(transformCreditMemo(makeCreditMemo({ AMOUNT: 'N/A' })).totalAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformCreditMemo(makeCreditMemo({ DATE: 'not-a-date' })).postedAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
