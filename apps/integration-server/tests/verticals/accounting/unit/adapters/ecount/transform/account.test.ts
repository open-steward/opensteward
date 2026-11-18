import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type EcountAccount,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/account'

function makeRaw(overrides: Partial<EcountAccount> = {}): EcountAccount {
  return {
    ACCOUNT_CODE: '1001',
    ACCOUNT_NAME: 'Cash',
    ACCOUNT_TYPE: '01',
    USE_YN: 'Y',
    BALANCE: 1000000,
    ...overrides,
  }
}

describe('transformAccount (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('1001')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1001')
    expect(result.balance).toBe(1000000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps ACCOUNT_TYPE 01 to ASSET', () => {
    const result = transformAccount(makeRaw({ ACCOUNT_TYPE: '01' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps ACCOUNT_TYPE 02 to LIABILITY', () => {
    const result = transformAccount(makeRaw({ ACCOUNT_TYPE: '02' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps ACCOUNT_TYPE 03 to EQUITY', () => {
    const result = transformAccount(makeRaw({ ACCOUNT_TYPE: '03' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps ACCOUNT_TYPE 04 to INCOME', () => {
    const result = transformAccount(makeRaw({ ACCOUNT_TYPE: '04' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps ACCOUNT_TYPE 05 to EXPENSE', () => {
    const result = transformAccount(makeRaw({ ACCOUNT_TYPE: '05' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps USE_YN N to ARCHIVED status', () => {
    const result = transformAccount(makeRaw({ USE_YN: 'N' }))
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
