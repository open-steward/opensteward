import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AbraflexiAccount } from '../../../../../../../src/verticals/accounting/adapters/abraflexi/transform/account'

function makeAccount(overrides: Partial<AbraflexiAccount> = {}): AbraflexiAccount {
  return {
    id: '5',
    kod: '321',
    nazev: 'Pohledávky z obchodních vztahů',
    typUctu: 'ASSET',
    mena: 'CZK',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount({ id: 99 })).id).toBe('99')
  })

  it('maps name from nazev', () => {
    expect(transformAccount(makeAccount()).name).toBe('Pohledávky z obchodních vztahů')
  })

  it('maps customerDefinedCode from kod', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('321')
  })

  it('maps currency from mena', () => {
    expect(transformAccount(makeAccount()).currency).toBe('CZK')
  })

  it('returns undefined name when nazev is missing', () => {
    expect(transformAccount(makeAccount({ nazev: undefined })).name).toBeUndefined()
  })

  it('returns undefined currency when mena is missing', () => {
    expect(transformAccount(makeAccount({ mena: undefined })).currency).toBeUndefined()
  })

  it('returns undefined customerDefinedCode when kod is missing', () => {
    expect(transformAccount(makeAccount({ kod: undefined })).customerDefinedCode).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount({ id: 99 }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
