import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type KonturelbaAccount } from '../../../../../../../src/verticals/accounting/adapters/konturelba/transform/account'

function makeAccount(overrides: Partial<KonturelbaAccount> = {}): KonturelbaAccount {
  return {
    id: 'acc-1',
    name: 'Main Bank Account',
    code: 'CHK-001',
    type: 'asset',
    currency: 'RUB',
    ...overrides,
  }
}

describe('transformAccount (konturelba)', () => {
  it('maps id field', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name field', () => { expect(transformAccount(makeAccount()).name).toBe('Main Bank Account') })
  it('maps customerDefinedCode from code', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('CHK-001') })
  it('maps asset type to ASSET', () => { expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET') })
  it('maps checking type to ASSET', () => { expect(transformAccount(makeAccount({ type: 'checking' })).type).toBe('ASSET') })
  it('maps cash type to ASSET', () => { expect(transformAccount(makeAccount({ type: 'cash' })).type).toBe('ASSET') })
  it('maps liability type to LIABILITY', () => { expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY') })
  it('maps income type to INCOME', () => { expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME') })
  it('maps expense type to EXPENSE', () => { expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('RUB') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
