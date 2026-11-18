import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type TwinfieldAccount,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/account'

function makeAccount(overrides: Partial<TwinfieldAccount> = {}): TwinfieldAccount {
  return {
    code: '1000',
    name: 'Bank account',
    shortName: 'Bank',
    type: 'BAS',
    groupCode: 'BALSHEET',
    status: 'active',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps code to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('1000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Bank account')
  })

  it('maps shortName to description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Bank')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1000')
  })

  it('maps type BAS to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'BAS' })).type).toBe('ASSET')
  })

  it('maps type PNL to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'PNL' })).type).toBe('EXPENSE')
  })

  it('maps type BAL to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'BAL' })).type).toBe('LIABILITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'XYZ' })).type).toBe('OTHER')
  })

  it('maps status active to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps status deleted to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'deleted' })).status).toBe('ARCHIVED')
  })

  it('maps groupCode to group', () => {
    expect(transformAccount(makeAccount()).group).toBe('BALSHEET')
  })

  it('returns undefined name when empty', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
