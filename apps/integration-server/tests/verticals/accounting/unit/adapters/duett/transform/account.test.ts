import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type DuettAccount,
} from '../../../../../../../src/verticals/accounting/adapters/duett/transform/account'

function makeAccount(overrides: Partial<DuettAccount> = {}): DuettAccount {
  return {
    id: 'acc-1',
    account_number: '1200',
    name: 'Bank',
    type: 'asset',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Duett)', () => {
  it('maps account number and name', () => {
    const result = transformAccount(makeAccount())
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.name).toBe('Bank')
  })

  it('defaults isActive to true when absent', () => {
    const raw = makeAccount()
    delete raw.active
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
