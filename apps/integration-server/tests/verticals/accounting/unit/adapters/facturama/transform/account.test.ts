import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FacturamaAccount } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/account'

function makeRaw(overrides: Partial<FacturamaAccount> = {}): FacturamaAccount {
  return {
    Id: 'acc-1',
    Name: 'Cash',
    Code: '1001',
    IsActive: true,
    Balance: 5000,
    Type: 'Asset',
    ...overrides,
  }
}

describe('facturama transformAccount', () => {
  it('maps Id to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('acc-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })
  it('maps IsActive true -> ACTIVE', () => {
    expect(transformAccount(makeRaw({ IsActive: true })).status).toBe('ACTIVE')
  })
  it('maps IsActive false -> ARCHIVED', () => {
    expect(transformAccount(makeRaw({ IsActive: false })).status).toBe('ARCHIVED')
  })
  it('maps Name to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Cash')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
