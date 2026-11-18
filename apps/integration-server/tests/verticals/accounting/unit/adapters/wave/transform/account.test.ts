import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type WaveAccount,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/account'

function makeAccount(overrides: Partial<WaveAccount> = {}): WaveAccount {
  return {
    id: 'acc-001',
    name: 'Cash on Hand',
    description: 'Petty cash account',
    type: { value: 'asset' },
    subtype: { value: 'cash_and_bank' },
    currency: { code: 'CAD' },
    isArchived: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash on Hand')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Petty cash account')
  })

  it('maps type asset to ASSET', () => {
    expect(transformAccount(makeAccount({ type: { value: 'asset' } })).type).toBe('ASSET')
  })

  it('maps type liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: { value: 'liability' } })).type).toBe('LIABILITY')
  })

  it('maps type equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: { value: 'equity' } })).type).toBe('EQUITY')
  })

  it('maps type income to INCOME', () => {
    expect(transformAccount(makeAccount({ type: { value: 'income' } })).type).toBe('INCOME')
  })

  it('maps type expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: { value: 'expense' } })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: { value: 'custom' } })).type).toBe('OTHER')
  })

  it('maps isArchived false to ACTIVE', () => {
    expect(transformAccount(makeAccount({ isArchived: false })).status).toBe('ACTIVE')
  })

  it('maps isArchived true to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ isArchived: true })).status).toBe('ARCHIVED')
  })

  it('maps currency.code to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('CAD')
  })

  it('returns undefined name when name is empty', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined description when description is empty', () => {
    expect(transformAccount(makeAccount({ description: '' })).description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
