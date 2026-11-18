import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type YukiGLAccount,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<YukiGLAccount> = {}): YukiGLAccount {
  return {
    GLAccountCode: '4000',
    GLAccountType: 'Revenue',
    Description: '4000 — Sales',
    IsActive: 'true',
    Balance: '12500.00',
    ...overrides,
  }
}

describe('transformAccount (yuki)', () => {
  it('maps GLAccountCode to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('4000')
  })

  it('maps GLAccountCode to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('4000')
  })

  it('maps Description to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('4000 — Sales')
  })

  it('maps Revenue GLAccountType to INCOME', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps Assets GLAccountType to ASSET', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Assets' })).type).toBe('ASSET')
  })

  it('maps Liabilities GLAccountType to LIABILITY', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Liabilities' })).type).toBe('LIABILITY')
  })

  it('maps Expenses GLAccountType to EXPENSE', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Expenses' })).type).toBe('EXPENSE')
  })

  it('maps Equity GLAccountType to EQUITY', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Equity capital' })).type).toBe('EQUITY')
  })

  it('maps unknown GLAccountType to OTHER', () => {
    expect(transformAccount(makeRaw({ GLAccountType: 'Unknown' })).type).toBe('OTHER')
  })

  it('maps IsActive true to status ACTIVE', () => {
    expect(transformAccount(makeRaw({ IsActive: 'true' })).status).toBe('ACTIVE')
  })

  it('maps IsActive false to status ARCHIVED', () => {
    expect(transformAccount(makeRaw({ IsActive: 'false' })).status).toBe('ARCHIVED')
  })

  it('parses Balance string to float', () => {
    expect(transformAccount(makeRaw()).balance).toBe(12500)
  })

  it('produces a schema-valid Account', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
