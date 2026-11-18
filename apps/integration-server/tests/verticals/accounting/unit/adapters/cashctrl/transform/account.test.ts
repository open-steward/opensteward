import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type CashCtrlAccount,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<CashCtrlAccount> = {}): CashCtrlAccount {
  return {
    id: 1000,
    name: 'Sales Revenue',
    number: '4000',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount({ id: 42 })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currencyCode to currency', () => {
    expect(transformAccount(makeAccount({ currencyCode: 'CHF' })).currency).toBe('CHF')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount({ balance: 500 })).balance).toBe(500)
  })

  it('maps categoryId to parentId as string', () => {
    expect(transformAccount(makeAccount({ categoryId: 99 })).parentId).toBe('99')
  })

  it('maps null categoryId to undefined parentId', () => {
    expect(transformAccount(makeAccount({ categoryId: null })).parentId).toBeUndefined()
  })

  it('maps isInactive=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isInactive: false })).status).toBe('ACTIVE')
  })

  it('maps isInactive=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isInactive: true })).status).toBe('ARCHIVED')
  })

  it('maps isInactive=undefined to ACTIVE status', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
