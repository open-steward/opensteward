import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type BexioAccount,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/account'

function makeAccount(overrides: Partial<BexioAccount> = {}): BexioAccount {
  return {
    id: 401,
    account_no: 1000,
    name: 'Cash',
    account_type: 1,
    is_active: true,
    parent_id: null,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('401')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps account_no to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1000')
  })

  it('maps account_type 1 to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 1 })).type).toBe('ASSET')
  })

  it('maps account_type 2 to LIABILITY', () => {
    expect(transformAccount(makeAccount({ account_type: 2 })).type).toBe('LIABILITY')
  })

  it('maps account_type 3 to EQUITY', () => {
    expect(transformAccount(makeAccount({ account_type: 3 })).type).toBe('EQUITY')
  })

  it('maps account_type 4 to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 4 })).type).toBe('INCOME')
  })

  it('maps account_type 5 to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 5 })).type).toBe('EXPENSE')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 99 })).type).toBe('OTHER')
  })

  it('maps is_active true to status ACTIVE', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active false to status ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps parent_id to parentId as string', () => {
    expect(transformAccount(makeAccount({ parent_id: 100 })).parentId).toBe('100')
  })

  it('returns undefined parentId when parent_id is null', () => {
    expect(transformAccount(makeAccount({ parent_id: null })).parentId).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
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
