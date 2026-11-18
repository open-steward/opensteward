import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type SevDeskAccount,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/account'

function makeAccount(overrides: Partial<SevDeskAccount> = {}): SevDeskAccount {
  return {
    id: 'acc-1',
    name: 'Bank Account',
    number: '1200',
    type: 'asset',
    status: '100',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-1')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Bank Account')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1200')
  })

  it('maps status 100 to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: '100' })).status).toBe('ACTIVE')
  })

  it('maps other status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: '200' })).status).toBe('ARCHIVED')
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
