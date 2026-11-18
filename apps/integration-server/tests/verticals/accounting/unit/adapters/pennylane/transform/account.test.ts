import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type PennylaneAccount,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/account'

function makeAccount(overrides: Partial<PennylaneAccount> = {}): PennylaneAccount {
  return {
    id: 'acc-1',
    number: '411000',
    label: 'Accounts Receivable',
    enabled: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-1')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('411000')
  })

  it('maps label to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Accounts Receivable')
  })

  it('maps enabled true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ enabled: true })).status).toBe('ACTIVE')
  })

  it('maps enabled false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ enabled: false })).status).toBe('ARCHIVED')
  })

  it('maps number starting with 1 to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ number: '100000' })).type).toBe('LIABILITY')
  })

  it('maps number starting with 2 to ASSET type', () => {
    expect(transformAccount(makeAccount({ number: '200000' })).type).toBe('ASSET')
  })

  it('maps number starting with 3 to ASSET type', () => {
    expect(transformAccount(makeAccount({ number: '300000' })).type).toBe('ASSET')
  })

  it('maps number starting with 4 to ASSET type', () => {
    expect(transformAccount(makeAccount({ number: '400000' })).type).toBe('ASSET')
  })

  it('maps number starting with 5 to ASSET type', () => {
    expect(transformAccount(makeAccount({ number: '500000' })).type).toBe('ASSET')
  })

  it('maps number starting with 6 to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ number: '600000' })).type).toBe('EXPENSE')
  })

  it('maps number starting with 7 to INCOME type', () => {
    expect(transformAccount(makeAccount({ number: '700000' })).type).toBe('INCOME')
  })

  it('maps unrecognised number prefix to OTHER type', () => {
    expect(transformAccount(makeAccount({ number: '900000' })).type).toBe('OTHER')
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
