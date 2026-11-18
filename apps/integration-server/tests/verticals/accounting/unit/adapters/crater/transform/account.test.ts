import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type CraterAccount,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<CraterAccount> = {}): CraterAccount {
  return {
    id: 'acct-1',
    name: 'Cash',
    type: 'ASSET',
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformAccount (crater)', () => {
  it('maps id to string and name', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acct-1')
    expect(result.name).toBe('Cash')
  })

  it('maps type ASSET to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps type LIABILITY to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps type EQUITY to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps type INCOME to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps type EXPENSE to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'UNKNOWN_TYPE' })).type).toBe('OTHER')
  })

  it('maps status ACTIVE to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps status ARCHIVED to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'ARCHIVED' })).status).toBe('ARCHIVED')
  })

  it('maps any non-ARCHIVED status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'ENABLED' })).status).toBe('ACTIVE')
  })

  it('maps absent status to undefined', () => {
    expect(transformAccount(makeAccount({ status: undefined })).status).toBeUndefined()
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount({ currency: 'EUR' })).currency).toBe('EUR')
  })

  it('maps empty name to undefined', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
