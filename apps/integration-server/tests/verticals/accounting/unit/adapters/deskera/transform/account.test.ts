import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type DeskeraAccount,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/account'

function makeRaw(overrides: Partial<DeskeraAccount> = {}): DeskeraAccount {
  return {
    id: 'ACC-001',
    code: '1000',
    name: 'Cash and Cash Equivalents',
    accountGroup: 'ASSET',
    status: 'ACTIVE',
    description: 'Main cash account',
    openingBalance: 50000,
    ...overrides,
  }
}

describe('transformAccount (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Cash and Cash Equivalents')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.description).toBe('Main cash account')
    expect(result.balance).toBe(50000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps ASSET account group', () => {
    const result = transformAccount(makeRaw({ accountGroup: 'ASSET' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps LIABILITY account group', () => {
    const result = transformAccount(makeRaw({ accountGroup: 'LIABILITY' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps EQUITY account group', () => {
    const result = transformAccount(makeRaw({ accountGroup: 'EQUITY' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps INCOME account group', () => {
    const result = transformAccount(makeRaw({ accountGroup: 'INCOME' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps EXPENSES account group', () => {
    const result = transformAccount(makeRaw({ accountGroup: 'EXPENSES' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps INACTIVE status to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ status: 'INACTIVE' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
