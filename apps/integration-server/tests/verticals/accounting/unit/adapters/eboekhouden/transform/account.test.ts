import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type EBoekhoudenAccount } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/account'

function makeAccount(overrides: Partial<EBoekhoudenAccount> = {}): EBoekhoudenAccount {
  return {
    id: 10,
    code: '1000',
    description: 'Bank',
    category: 'Assets',
    isActive: true,
    ...overrides,
  }
}

describe('transformAccount (eboekhouden)', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount()).id).toBe('10')
  })

  it('maps code and description', () => {
    const result = transformAccount(makeAccount())
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.name).toBe('Bank')
  })

  it('maps Assets category → ASSET', () => {
    expect(transformAccount(makeAccount({ category: 'Assets' })).type).toBe('ASSET')
  })

  it('maps Expense category → EXPENSE', () => {
    expect(transformAccount(makeAccount({ category: 'Expense' })).type).toBe('EXPENSE')
  })

  it('isActive true → ACTIVE', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('isActive false → ARCHIVED', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
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
