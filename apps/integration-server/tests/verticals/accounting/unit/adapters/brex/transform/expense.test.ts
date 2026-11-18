import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type BrexCardExpense,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<BrexCardExpense> = {}): BrexCardExpense {
  return {
    id: 'exp_001',
    memo: 'Team lunch',
    amount: { amount: 8500, currency: 'USD' },
    category: 'FOOD',
    merchant: { raw_descriptor: 'CHIPOTLE 1234' },
    user_id: 'user_abc',
    purchased_at: '2024-02-15T12:30:00Z',
    updated_at: '2024-02-15T13:00:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp_001')
  })

  it('prefers merchant.raw_descriptor over memo for name', () => {
    const result = transformExpense(makeExpense())
    expect(result.name).toBe('CHIPOTLE 1234')
  })

  it('falls back to memo when merchant.raw_descriptor is absent', () => {
    const result = transformExpense(makeExpense({ merchant: undefined }))
    expect(result.name).toBe('Team lunch')
  })

  it('falls back to memo when merchant is present but raw_descriptor is absent', () => {
    const result = transformExpense(makeExpense({ merchant: {} }))
    expect(result.name).toBe('Team lunch')
  })

  it('name is undefined when both merchant.raw_descriptor and memo are absent', () => {
    const result = transformExpense(makeExpense({ merchant: undefined, memo: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('maps user_id to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('user_abc')
  })

  it('maps amount.currency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('always sets paymentMethod to CARD', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('CARD')
  })

  it('paymentMethod is CARD even when all optional fields are absent', () => {
    const result = transformExpense(
      makeExpense({
        merchant: undefined,
        amount: undefined,
        user_id: undefined,
      }),
    )
    expect(result.paymentMethod).toBe('CARD')
  })

  it('maps amount.amount to totalAmount without conversion', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(8500)
  })

  it('maps purchased_at to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-02-15T12:30:00Z'))
  })

  it('postedAt is undefined when purchased_at is absent', () => {
    const result = transformExpense(makeExpense({ purchased_at: undefined }))
    expect(result.postedAt).toBeUndefined()
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformExpense(makeExpense()).updatedAt).toEqual(new Date('2024-02-15T13:00:00Z'))
  })

  it('updatedAt is undefined when updated_at is absent', () => {
    const result = transformExpense(makeExpense({ updated_at: undefined }))
    expect(result.updatedAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('metadata contains category', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect((result.metadata as Record<string, unknown>)['category']).toBe('FOOD')
  })

  it('produces output that passes ExpenseSchema validation', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformExpense(
      makeExpense({
        memo: undefined,
        amount: undefined,
        merchant: undefined,
        user_id: undefined,
        purchased_at: undefined,
        updated_at: undefined,
      }),
    )
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
