import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type RilletAccount,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<RilletAccount> = {}): RilletAccount {
  return {
    id: 'acct_4000',
    code: '4000',
    name: 'Sales Revenue',
    type: 'INCOME',
    subtype: 'Product Sales',
    status: 'ACTIVE',
    intercompany: false,
    updated_at: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id directly', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct_4000')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps INCOME type directly', () => {
    expect(transformAccount(makeAccount({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps ASSET type directly', () => {
    expect(transformAccount(makeAccount({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps LIABILITY type directly', () => {
    expect(transformAccount(makeAccount({ type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps EQUITY type directly', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps EXPENSE type directly', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'CONTRA' })).type).toBe('OTHER')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps non-ACTIVE status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'INACTIVE' })).status).toBe('ARCHIVED')
  })

  it('maps subtype to subgroup', () => {
    expect(transformAccount(makeAccount()).subgroup).toBe('Product Sales')
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformAccount(makeAccount()).updatedAt).toEqual(new Date('2026-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
