import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FocusSoftnetAccount } from '../../../../../../../src/verticals/accounting/adapters/focussoftnet/transform/account'

function makeRaw(overrides: Partial<FocusSoftnetAccount> = {}): FocusSoftnetAccount {
  return {
    AccCode: 'ACC4000',
    AccName: 'Sales Income',
    AccType: 'I',
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount (focussoftnet)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ACC4000')
    expect(result.name).toBe('Sales Income')
    expect(result.customerDefinedCode).toBe('ACC4000')
    expect(result.type).toBe('INCOME')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps AccType I to INCOME', () => {
    expect(transformAccount(makeRaw({ AccType: 'I' })).type).toBe('INCOME')
  })

  it('maps AccType E to EXPENSE', () => {
    expect(transformAccount(makeRaw({ AccType: 'E' })).type).toBe('EXPENSE')
  })

  it('maps AccType A to ASSET', () => {
    expect(transformAccount(makeRaw({ AccType: 'A' })).type).toBe('ASSET')
  })

  it('maps AccType L to LIABILITY', () => {
    expect(transformAccount(makeRaw({ AccType: 'L' })).type).toBe('LIABILITY')
  })

  it('maps AccType Q to EQUITY', () => {
    expect(transformAccount(makeRaw({ AccType: 'Q' })).type).toBe('EQUITY')
  })

  it('maps unknown AccType to OTHER', () => {
    expect(transformAccount(makeRaw({ AccType: 'Z' })).type).toBe('OTHER')
  })

  it('uses AccCode for both id and customerDefinedCode', () => {
    const result = transformAccount(makeRaw({ AccCode: 'X9999' }))
    expect(result.id).toBe('X9999')
    expect(result.customerDefinedCode).toBe('X9999')
  })

  it('maps IsActive=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ IsActive: true })).status).toBe('ACTIVE')
  })

  it('maps IsActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ IsActive: false })).status).toBe('ARCHIVED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
