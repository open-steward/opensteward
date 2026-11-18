import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ExactAccount } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/account'

function makeAccount(overrides: Partial<ExactAccount> = {}): ExactAccount {
  return { ID: 'acc-guid', Code: '1000', Description: 'Bank', TypeDescription: 'Assets', IsBlocked: false, Balance: 5000, ...overrides }
}

describe('transformAccount (exactonline)', () => {
  it('maps id, code, name', () => {
    const r = transformAccount(makeAccount())
    expect(r.id).toBe('acc-guid')
    expect(r.customerDefinedCode).toBe('1000')
    expect(r.name).toBe('Bank')
  })
  it('maps Assets → ASSET', () => {
    expect(transformAccount(makeAccount({ TypeDescription: 'Assets' })).type).toBe('ASSET')
  })
  it('maps Expense → EXPENSE', () => {
    expect(transformAccount(makeAccount({ TypeDescription: 'Expense' })).type).toBe('EXPENSE')
  })
  it('IsBlocked false → ACTIVE', () => {
    expect(transformAccount(makeAccount({ IsBlocked: false })).status).toBe('ACTIVE')
  })
  it('IsBlocked true → ARCHIVED', () => {
    expect(transformAccount(makeAccount({ IsBlocked: true })).status).toBe('ARCHIVED')
  })
  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
