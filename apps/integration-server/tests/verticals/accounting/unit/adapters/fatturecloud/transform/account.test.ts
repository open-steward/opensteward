import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FattureCloudAccount } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/account'

function makeAccount(overrides: Partial<FattureCloudAccount> = {}): FattureCloudAccount {
  return { id: 5, description: 'IVA 22%', value: 22, is_disabled: false, ...overrides }
}

describe('transformAccount (fatturecloud)', () => {
  it('maps id to string', () => { expect(transformAccount(makeAccount()).id).toBe('5') })
  it('maps name from description', () => { expect(transformAccount(makeAccount()).name).toBe('IVA 22%') })
  it('is_disabled false → ACTIVE', () => { expect(transformAccount(makeAccount({ is_disabled: false })).status).toBe('ACTIVE') })
  it('is_disabled true → ARCHIVED', () => { expect(transformAccount(makeAccount({ is_disabled: true })).status).toBe('ARCHIVED') })
  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
