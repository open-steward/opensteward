import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type InvoicePortalAccount } from '../../../../../../../src/verticals/accounting/adapters/invoiceportal/transform/account'

function makeAccount(overrides: Partial<InvoicePortalAccount> = {}): InvoicePortalAccount {
  return {
    id: 'acc-1',
    account_number: '1200',
    name: 'Forderungen',
    account_type: 'asset',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Invoice-Portal)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-1')
    expect(result.name).toBe('Forderungen')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
