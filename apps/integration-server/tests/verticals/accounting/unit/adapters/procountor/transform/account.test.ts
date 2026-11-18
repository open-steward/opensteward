import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type ProcountorAccount,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/account'

function makeAccount(overrides: Partial<ProcountorAccount> = {}): ProcountorAccount {
  return {
    id: 100,
    number: 3000,
    name: 'Sales revenue',
    accountType: 'REVENUE',
    active: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('100')
  })

  it('maps number to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('3000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales revenue')
  })

  it('maps REVENUE to INCOME type', () => {
    expect(transformAccount(makeAccount({ accountType: 'REVENUE' })).type).toBe('INCOME')
  })

  it('maps ASSETS to ASSET type', () => {
    expect(transformAccount(makeAccount({ accountType: 'ASSETS' })).type).toBe('ASSET')
  })

  it('maps LIABILITIES to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ accountType: 'LIABILITIES' })).type).toBe('LIABILITY')
  })

  it('maps EXPENSES to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ accountType: 'EXPENSES' })).type).toBe('EXPENSE')
  })

  it('maps EQUITY to EQUITY type', () => {
    expect(transformAccount(makeAccount({ accountType: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ accountType: 'UNKNOWN' })).type).toBe('OTHER')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('returns undefined name when empty', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const a = transformAccount(raw)
    expect(a.metadata).toBe(raw)
    expect((a.metadata as Record<string, unknown>)['accountType']).toBe('REVENUE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
