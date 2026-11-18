import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type InbooksAccount,
} from '../../../../../../../src/verticals/accounting/adapters/inbooks/transform/account'

function makeAccount(overrides: Partial<InbooksAccount> = {}): InbooksAccount {
  return {
    id: 30,
    account_code: '3001',
    account_name: 'Försäljning varor',
    account_type: 'income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Inbooks)', () => {
  it('maps id and account_code to customerDefinedCode', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('30')
    expect(result.customerDefinedCode).toBe('3001')
  })

  it('maps account_name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Försäljning varor')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps income account_type to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account_type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset account_type to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'unknown' })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
