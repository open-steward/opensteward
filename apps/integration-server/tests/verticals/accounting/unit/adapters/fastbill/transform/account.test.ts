import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FastBillAccount } from '../../../../../../../src/verticals/accounting/adapters/fastbill/transform/account'

function makeAccount(overrides: Partial<FastBillAccount> = {}): FastBillAccount {
  return {
    ACCOUNT_ID: 'acc-1',
    ACCOUNT_CODE: '1200',
    ACCOUNT_NAME: 'Forderungen',
    ACCOUNT_TYPE: 'asset',
    IS_ACTIVE: true,
    ...overrides,
  }
}

describe('transformAccount (FastBill)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-1')
    expect(result.name).toBe('Forderungen')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive account as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ IS_ACTIVE: false })).status).toBe('ARCHIVED')
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
