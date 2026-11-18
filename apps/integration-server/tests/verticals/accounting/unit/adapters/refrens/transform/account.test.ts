import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type RefrensAccount,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<RefrensAccount> = {}): RefrensAccount {
  return {
    _id: 'acct_001',
    name: 'Revenue',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps _id to id', () => {
    const result = transformAccount(makeAccount({ _id: 'acct_xyz' }))
    expect(result.id).toBe('acct_xyz')
  })

  it('maps name when present', () => {
    const result = transformAccount(makeAccount({ name: 'Sales Revenue' }))
    expect(result.name).toBe('Sales Revenue')
  })

  it('returns undefined name when name is absent', () => {
    const result = transformAccount(makeAccount({ name: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies AccountSchema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
