import { describe, it, expect } from 'vitest'
import {
  transformBankAccount,
  type CrunchBankAccount,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<CrunchBankAccount> = {}): CrunchBankAccount {
  return {
    id: 7,
    displayName: 'Business Current',
    bankName: 'Barclays',
    archived: false,
    balanceDto: { date: '2026-03-01', balance: 1500.5 },
    ...overrides,
  }
}

describe('transformBankAccount (crunch)', () => {
  it('maps numeric id to string', () => {
    expect(transformBankAccount(makeAccount({ id: 7 })).id).toBe('7')
  })

  it('prefers displayName over bankName', () => {
    expect(transformBankAccount(makeAccount()).name).toBe('Business Current')
  })

  it('falls back to bankName when displayName absent', () => {
    expect(transformBankAccount(makeAccount({ displayName: undefined })).name).toBe('Barclays')
  })

  it('always maps type to ASSET', () => {
    expect(transformBankAccount(makeAccount()).type).toBe('ASSET')
  })

  it('maps archived=false to ACTIVE', () => {
    expect(transformBankAccount(makeAccount({ archived: false })).status).toBe('ACTIVE')
  })

  it('maps archived=true to ARCHIVED', () => {
    expect(transformBankAccount(makeAccount({ archived: true })).status).toBe('ARCHIVED')
  })

  it('converts floating-point balance to minor units', () => {
    // 1500.5 pounds → 150050 pence
    expect(transformBankAccount(makeAccount()).balance).toBe(150050)
  })

  it('omits balance when balanceDto is absent', () => {
    expect(transformBankAccount(makeAccount({ balanceDto: undefined })).balance).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeAccount()
    expect(transformBankAccount(raw).metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformBankAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
