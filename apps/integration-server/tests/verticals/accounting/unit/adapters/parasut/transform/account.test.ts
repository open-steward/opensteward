import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ParasutAccount } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/account'

function makeAccount(overrides: Partial<ParasutAccount> = {}): ParasutAccount {
  return {
    id: 'acc_1',
    type: 'accounts',
    attributes: {
      name: 'Main Bank Account',
      currency: 'TRY',
      balance: 50000,
      account_type: 'bank',
      archived: false,
    },
    ...overrides,
  }
}

describe('transformAccount (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc_1')
  })

  it('maps name and currency', () => {
    const a = transformAccount(makeAccount())
    expect(a.name).toBe('Main Bank Account')
    expect(a.currency).toBe('TRY')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('maps status to ACTIVE when not archived', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('maps status to ARCHIVED when archived is true', () => {
    const raw = makeAccount({ attributes: { ...makeAccount().attributes, archived: true } })
    expect(transformAccount(raw).status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutAccount = { id: 'acc_2', type: 'accounts', attributes: {} }
    const a = transformAccount(raw)
    expect(a.id).toBe('acc_2')
    expect(a.name).toBeUndefined()
    expect(a.balance).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
