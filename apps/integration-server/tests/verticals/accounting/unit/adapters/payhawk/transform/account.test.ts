import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type PayhawkFundAccount,
} from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

/** IFundAccount exactly as the spec documents it: these five properties and no others. */
function makeRaw(overrides: Partial<PayhawkFundAccount> = {}): PayhawkFundAccount {
  return {
    id: 'fund-123',
    currency: 'USD',
    type: 'debit',
    status: 'active',
    // IFundAccountBalance: an object, present only for debit and credit accounts.
    balance: { availableAmount: 1000.5, reservedAmount: 20 },
    ...overrides,
  }
}

describe('payhawk transformAccount', () => {
  it('maps id directly', () => {
    expect(transformAccount(makeRaw()).id).toBe('fund-123')
  })

  it('has no name to map: IFundAccount carries none', () => {
    expect(transformAccount(makeRaw()).name).toBeUndefined()
  })

  it('uses the id as customerDefinedCode: IFundAccount carries no IBAN', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('fund-123')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformAccount(makeRaw({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps closed status to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ status: 'closed' })).status).toBe('ARCHIVED')
  })

  it('keeps every documented status but closed ACTIVE, with the exact status in metadata', () => {
    for (const status of ['processing', 'blocked', 'pending_closure'] as const) {
      const account = transformAccount(makeRaw({ status }))
      expect(account.status).toBe('ACTIVE')
      expect(account.metadata?.['status']).toBe(status)
    }
  })

  it('converts the decimal available amount to minor units', () => {
    expect(
      transformAccount(makeRaw({ balance: { availableAmount: 1000.5, reservedAmount: 20 } }))
        .balance,
    ).toBe(100050)
  })

  it('leaves balance unset when the account has none (linked accounts)', () => {
    expect(
      transformAccount(makeRaw({ type: 'linked', balance: undefined })).balance,
    ).toBeUndefined()
  })

  it('passes AccountSchema.parse', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
