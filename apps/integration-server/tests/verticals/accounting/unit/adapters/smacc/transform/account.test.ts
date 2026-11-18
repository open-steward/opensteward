import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SmaccAccount } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/account'

function makeRaw(overrides: Partial<SmaccAccount> = {}): SmaccAccount {
  return {
    id: 'acct-1',
    code: 'A100',
    name: 'Cash',
    type: 'asset',
    currency: 'EUR',
    description: 'Cash account',
    is_active: true,
    ...overrides,
  }
}

describe('smacc transformAccount', () => {
  it('maps id to id as string', () => {
    expect(transformAccount(makeRaw()).id).toBe('acct-1')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('A100')
  })

  it('maps name to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Cash')
  })

  it('maps type=asset to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type=liability to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type=equity to EQUITY', () => {
    expect(transformAccount(makeRaw({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
