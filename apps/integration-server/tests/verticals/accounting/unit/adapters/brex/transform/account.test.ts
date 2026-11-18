import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type BrexCashAccount,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<BrexCashAccount> = {}): BrexCashAccount {
  return {
    id: 'acct_001',
    description: 'Operating Account',
    status: 'ACTIVE',
    account_number: '123456789',
    routing_number: '021000021',
    current_balance: { amount: 100000, currency: 'USD' },
    available_balance: { amount: 95000, currency: 'USD' },
    primary: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct_001')
  })

  it('maps description to name and description fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Operating Account')
    expect(result.description).toBe('Operating Account')
  })

  it('always sets type to ASSET', () => {
    expect(transformAccount(makeAccount()).type).toBe('ASSET')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ status: 'ARCHIVED' })).status).toBe('ARCHIVED')
  })

  it('prefers available_balance currency over current_balance currency', () => {
    const result = transformAccount(makeAccount())
    expect(result.currency).toBe('USD')
  })

  it('prefers available_balance amount over current_balance amount', () => {
    const result = transformAccount(makeAccount())
    expect(result.balance).toBe(95000)
  })

  it('falls back to current_balance when available_balance is absent', () => {
    const result = transformAccount(makeAccount({ available_balance: undefined }))
    expect(result.balance).toBe(100000)
    expect(result.currency).toBe('USD')
  })

  it('balance is undefined when both balances are absent', () => {
    const result = transformAccount(
      makeAccount({ available_balance: undefined, current_balance: undefined }),
    )
    expect(result.balance).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('name and description are undefined when description is missing', () => {
    const result = transformAccount(makeAccount({ description: undefined }))
    expect(result.name).toBeUndefined()
    expect(result.description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('metadata contains account_number and routing_number', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect((result.metadata as Record<string, unknown>)['account_number']).toBe('123456789')
    expect((result.metadata as Record<string, unknown>)['routing_number']).toBe('021000021')
  })

  it('produces output that passes AccountSchema validation', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformAccount(
      makeAccount({
        description: undefined,
        available_balance: undefined,
        current_balance: undefined,
      }),
    )
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
