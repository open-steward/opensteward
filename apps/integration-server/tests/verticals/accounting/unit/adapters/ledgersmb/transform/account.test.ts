import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type LedgerSMBAccount,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<LedgerSMBAccount> = {}): LedgerSMBAccount {
  return {
    accno: '1200',
    description: 'Trade Receivables',
    label: '1200--Trade Receivables',
    obsolete: false,
    category: 'A',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps accno to id and customerDefinedCode', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1200')
    expect(result.customerDefinedCode).toBe('1200')
  })

  it('maps description to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Trade Receivables')
  })

  it('maps category A to ASSET', () => {
    expect(transformAccount(makeAccount({ category: 'A' })).type).toBe('ASSET')
  })

  it('maps category L to LIABILITY', () => {
    expect(transformAccount(makeAccount({ category: 'L' })).type).toBe('LIABILITY')
  })

  it('maps category Q to EQUITY', () => {
    expect(transformAccount(makeAccount({ category: 'Q' })).type).toBe('EQUITY')
  })

  it('maps category I to INCOME', () => {
    expect(transformAccount(makeAccount({ category: 'I' })).type).toBe('INCOME')
  })

  it('maps category E to EXPENSE', () => {
    expect(transformAccount(makeAccount({ category: 'E' })).type).toBe('EXPENSE')
  })

  it('maps obsolete=false to ACTIVE', () => {
    expect(transformAccount(makeAccount({ obsolete: false })).status).toBe('ACTIVE')
  })

  it('maps obsolete=true to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ obsolete: true })).status).toBe('ARCHIVED')
  })

  it('passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
