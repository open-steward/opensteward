import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type DirectoAccount,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<DirectoAccount> = {}): DirectoAccount {
  return {
    code: '1000',
    name: 'Cash',
    type: 'A',
    closed: false,
    class: 'Current Assets',
    ...overrides,
  }
}

describe('directo transformAccount', () => {
  it('maps code to id and customerDefinedCode', () => {
    const result = transformAccount(makeRaw({ code: '4000' }))
    expect(result.id).toBe('4000')
    expect(result.customerDefinedCode).toBe('4000')
  })

  it('maps type A to ASSET', () => {
    const result = transformAccount(makeRaw({ type: 'A' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps type L to LIABILITY', () => {
    const result = transformAccount(makeRaw({ type: 'L' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps type Q to EQUITY', () => {
    const result = transformAccount(makeRaw({ type: 'Q' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps type OE to EQUITY', () => {
    const result = transformAccount(makeRaw({ type: 'OE' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps type I to INCOME', () => {
    const result = transformAccount(makeRaw({ type: 'I' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps type E to EXPENSE', () => {
    const result = transformAccount(makeRaw({ type: 'E' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeRaw({ type: 'X' }))
    expect(result.type).toBe('OTHER')
  })

  it('closed=true yields status ARCHIVED', () => {
    const result = transformAccount(makeRaw({ closed: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('closed=false yields status ACTIVE', () => {
    const result = transformAccount(makeRaw({ closed: false }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps class to group', () => {
    const result = transformAccount(makeRaw({ class: 'Revenue' }))
    expect(result.group).toBe('Revenue')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
