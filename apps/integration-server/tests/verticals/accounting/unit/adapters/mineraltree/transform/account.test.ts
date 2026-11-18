import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type MtGlAccount,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<MtGlAccount> = {}): MtGlAccount {
  return {
    id: 'gl_001',
    externalId: 'EXT-4000',
    name: 'Sales Revenue',
    code: '4000',
    type: 'INCOME',
    active: true,
    description: 'Product sales revenue',
    ...overrides,
  }
}

describe('transformAccount (mineraltree)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('gl_001')
  })

  it('falls back to externalId when id is absent', () => {
    const result = transformAccount(makeAccount({ id: undefined }))
    expect(result.id).toBe('EXT-4000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('falls back to description when name is absent', () => {
    const result = transformAccount(makeAccount({ name: undefined }))
    expect(result.name).toBe('Product sales revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Product sales revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps type INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps type ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps type LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps type EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps type EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps type EXPENSE_ACCOUNT to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE_ACCOUNT' })).type).toBe('EXPENSE')
  })

  it('maps type AP_ACCOUNT to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'AP_ACCOUNT' })).type).toBe('LIABILITY')
  })

  it('maps unknown type to "unknown"', () => {
    expect(transformAccount(makeAccount({ type: 'SOMETHING_ELSE' })).type).toBe('unknown')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('defaults to ACTIVE when active is undefined', () => {
    expect(transformAccount(makeAccount({ active: undefined })).status).toBe('ACTIVE')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
