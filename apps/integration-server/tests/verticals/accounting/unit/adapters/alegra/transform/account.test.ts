import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AlegraAccount } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/account'

function makeAccount(overrides: Partial<AlegraAccount> = {}): AlegraAccount {
  return {
    id: 1,
    name: 'Sales Revenue',
    code: '4001',
    description: 'Main sales account',
    status: 'active',
    balance: 50000,
    type: 'income',
    parentId: 0,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount()).id).toBe('1')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Main sales account')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('maps active status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'inactive' })).status).toBe('ARCHIVED')
  })

  it('maps parentId to string', () => {
    expect(transformAccount(makeAccount({ parentId: 5 })).parentId).toBe('5')
  })

  it('omits parentId when zero', () => {
    expect(transformAccount(makeAccount({ parentId: 0 })).parentId).toBeUndefined()
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
