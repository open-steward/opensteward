import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MeritaktivaAccount } from '../../../../../../../src/verticals/accounting/adapters/meritaktiva/transform/account'

function makeAccount(overrides: Partial<MeritaktivaAccount> = {}): MeritaktivaAccount {
  return {
    Id: '10',
    Code: '1000',
    Name: 'Cash',
    Active: true,
    Balance: 5000,
    ...overrides,
  }
}

describe('transformAccount (meritaktiva)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('10')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1000')
  })

  it('sets status to ACTIVE when active', () => {
    expect(transformAccount(makeAccount({ Active: true })).status).toBe('ACTIVE')
  })

  it('sets status to ARCHIVED when inactive', () => {
    expect(transformAccount(makeAccount({ Active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(5000)
  })

  it('falls back to id for customerDefinedCode when no code', () => {
    expect(transformAccount(makeAccount({ Code: undefined })).customerDefinedCode).toBe('10')
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
