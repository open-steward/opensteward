import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MazumaAccount } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/account'

function makeRaw(overrides: Partial<MazumaAccount> = {}): MazumaAccount {
  return { id: '1', ...overrides }
}

describe('mazuma transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })
  it('maps type income -> INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })
  it('maps type liability -> LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })
  it('maps is_active false -> ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })
  it('defaults status to ACTIVE when is_active is missing', () => {
    expect(transformAccount(makeRaw()).status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
