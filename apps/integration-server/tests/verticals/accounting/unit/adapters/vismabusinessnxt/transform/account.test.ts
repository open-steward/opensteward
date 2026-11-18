import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type VismaBusinessNxtAccount,
} from '../../../../../../../src/verticals/accounting/adapters/vismabusinessnxt/transform/account'

function makeAccount(overrides: Partial<VismaBusinessNxtAccount> = {}): VismaBusinessNxtAccount {
  return {
    id: 'acc-1',
    accountNumber: '1200',
    name: 'Bank',
    type: 'asset',
    isActive: true,
    ...overrides,
  }
}

describe('transformAccount (Visma Business NXT)', () => {
  it('maps account number and name', () => {
    const result = transformAccount(makeAccount())
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.name).toBe('Bank')
  })

  it('defaults isActive to true when absent', () => {
    const raw = makeAccount()
    delete raw.isActive
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps isActive=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
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
