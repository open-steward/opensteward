import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type Sage50DeAccount } from '../../../../../../../src/verticals/accounting/adapters/sage50de/transform/account'

function makeAccount(overrides: Partial<Sage50DeAccount> = {}): Sage50DeAccount {
  return {
    id: 'acc-1',
    displayed_as: 'Forderungen aus LuL',
    nominal_code: '1200',
    account_type: { id: 'ASSET' },
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Sage 50 DE)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-1')
    expect(result.name).toBe('Forderungen aus LuL')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps LIABILITY type', () => {
    expect(transformAccount(makeAccount({ account_type: { id: 'LIABILITY' } })).type).toBe('LIABILITY')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
