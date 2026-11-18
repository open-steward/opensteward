import { describe, it, expect } from 'vitest'
import {
  transformWallet,
  type SoldoWallet,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<SoldoWallet> = {}): SoldoWallet {
  return {
    id: 'wlt_abc123',
    name: 'Main Wallet',
    type: 'main',
    currency: 'EUR',
    balance: 100.5,
    status: 'ACTIVE',
    customreferenceId: 'ref-001',
    ...overrides,
  }
}

describe('transformWallet (soldo)', () => {
  it('maps id', () => {
    expect(transformWallet(makeRaw()).id).toBe('wlt_abc123')
  })

  it('maps name', () => {
    expect(transformWallet(makeRaw()).name).toBe('Main Wallet')
  })

  it('always maps type to ASSET', () => {
    expect(transformWallet(makeRaw({ type: 'employee' })).type).toBe('ASSET')
    expect(transformWallet(makeRaw({ type: 'company' })).type).toBe('ASSET')
  })

  it('maps ACTIVE status to ACTIVE', () => {
    expect(transformWallet(makeRaw({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps INACTIVE status to ARCHIVED', () => {
    expect(transformWallet(makeRaw({ status: 'INACTIVE' })).status).toBe('ARCHIVED')
  })

  it('maps CLOSED status to ARCHIVED', () => {
    expect(transformWallet(makeRaw({ status: 'CLOSED' })).status).toBe('ARCHIVED')
  })

  it('converts balance to minor units (100.5 → 10050)', () => {
    // Soldo: 100.50 EUR major units → 10050 cents (canonical Amount)
    expect(transformWallet(makeRaw({ balance: 100.5 })).balance).toBe(10050)
  })

  it('converts balance=0 to 0 minor units', () => {
    expect(transformWallet(makeRaw({ balance: 0 })).balance).toBe(0)
  })

  it('maps currency', () => {
    expect(transformWallet(makeRaw()).currency).toBe('EUR')
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformWallet(makeRaw()))).not.toThrow()
  })
})
