import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MasteraccountingAccount } from '../../../../../../../src/verticals/accounting/adapters/masteraccounting/transform/account'

function makeAccount(overrides: Partial<MasteraccountingAccount> = {}): MasteraccountingAccount {
  return {
    id: 'acc-1',
    code: '301',
    name: 'Каса',
    type: 'ASSET',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-1')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Каса')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('301')
  })

  it('maps ASSET type', () => {
    expect(transformAccount(makeAccount({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps LIABILITY type', () => {
    expect(transformAccount(makeAccount({ type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps EQUITY type', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps INCOME type', () => {
    expect(transformAccount(makeAccount({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps EXPENSE type', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('sets status ACTIVE', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('UAH')
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
