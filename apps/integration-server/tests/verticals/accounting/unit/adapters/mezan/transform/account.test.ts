import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type MezanAccount,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<MezanAccount> = {}): MezanAccount {
  return {
    id: 'acct_001',
    name: 'Sales Revenue',
    code: '4000',
    type: 'revenue',
    is_archived: false,
    balance: 125000,
    ...overrides,
  }
}

describe('transformAccount (mezan)', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct_001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps type revenue to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps type asset to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps type expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'special' })).type).toBe('OTHER')
  })

  it('maps is_archived=false to ACTIVE', () => {
    expect(transformAccount(makeAccount({ is_archived: false })).status).toBe('ACTIVE')
  })

  it('maps is_archived=true to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_archived: true })).status).toBe('ARCHIVED')
  })

  it('maps parent_id as string', () => {
    expect(transformAccount(makeAccount({ parent_id: 'acct_root' })).parentId).toBe('acct_root')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(125000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
