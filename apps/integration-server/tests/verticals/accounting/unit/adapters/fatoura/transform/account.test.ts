import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FatouaAccount } from '../../../../../../../src/verticals/accounting/adapters/fatoura/transform/account'

function makeRaw(overrides: Partial<FatouaAccount> = {}): FatouaAccount {
  return {
    id: 'acc1',
    code: '3000',
    name: 'Capital Account',
    type: 'equity',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (fatoura)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc1')
    expect(result.name).toBe('Capital Account')
    expect(result.customerDefinedCode).toBe('3000')
    expect(result.type).toBe('EQUITY')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeRaw({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'suspense' })).type).toBe('OTHER')
  })

  it('is case-insensitive for type mapping', () => {
    expect(transformAccount(makeRaw({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ active: true })).status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE when active is undefined', () => {
    const raw = makeRaw()
    delete raw.active
    expect(transformAccount(raw).status).toBe('ACTIVE')
  })

  it('returns undefined type when type not set', () => {
    expect(transformAccount(makeRaw({ type: undefined })).type).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
