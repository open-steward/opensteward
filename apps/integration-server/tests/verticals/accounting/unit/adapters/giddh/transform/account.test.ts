import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type GiddhAccountRecord,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/account'

function makeRaw(overrides: Partial<GiddhAccountRecord> = {}): GiddhAccountRecord {
  return {
    uniqueName: 'cash-in-hand',
    name: 'Cash In Hand',
    type: 'CURRENTASSETS',
    isActive: true,
    openingBalance: 50000,
    currency: 'INR',
    ...overrides,
  }
}

describe('transformAccount (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('cash-in-hand')
    expect(result.name).toBe('Cash In Hand')
    expect(result.currency).toBe('INR')
    expect(result.balance).toBe(50000)
  })

  it('maps isActive true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps CURRENTASSETS to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'CURRENTASSETS' })).type).toBe('ASSET')
  })

  it('maps NONCURRENTASSETS to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'NONCURRENTASSETS' })).type).toBe('ASSET')
  })

  it('maps FIXEDASSETS to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'FIXEDASSETS' })).type).toBe('ASSET')
  })

  it('maps CURRENTLIABILITIES to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'CURRENTLIABILITIES' })).type).toBe('LIABILITY')
  })

  it('maps NONCURRENTLIABILITIES to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'NONCURRENTLIABILITIES' })).type).toBe('LIABILITY')
  })

  it('maps SHAREHOLDER to EQUITY', () => {
    expect(transformAccount(makeRaw({ type: 'SHAREHOLDER' })).type).toBe('EQUITY')
  })

  it('maps REVENUEFROMOPERATIONS to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'REVENUEFROMOPERATIONS' })).type).toBe('INCOME')
  })

  it('maps OTHERINCOME to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'OTHERINCOME' })).type).toBe('INCOME')
  })

  it('maps OPERATINGCOST to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'OPERATINGCOST' })).type).toBe('EXPENSE')
  })

  it('maps INDIRECTEXPENSES to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'INDIRECTEXPENSES' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'UNKNOWN' })).type).toBe('OTHER')
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
