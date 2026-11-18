import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type StampliGLAccount,
} from '../../../../../../../src/verticals/accounting/adapters/stampli/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<StampliGLAccount> = {}): StampliGLAccount {
  return {
    id: 'acct-001',
    code: '4000',
    name: 'Sales Revenue',
    description: 'Revenue from product sales',
    type: 'INCOME',
    isActive: true,
    parentId: 'acct-parent',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('stampli transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('acct-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('4000')
  })

  it('maps type INCOME correctly', () => {
    expect(transformAccount(makeRaw({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps type REVENUE to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'REVENUE' })).type).toBe('INCOME')
  })

  it('maps type ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps type EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps type COST_OF_GOODS to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'COST_OF_GOODS' })).type).toBe('EXPENSE')
  })

  it('maps isActive=true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps parentId', () => {
    expect(transformAccount(makeRaw()).parentId).toBe('acct-parent')
  })

  it('maps createdAt to Date', () => {
    expect(transformAccount(makeRaw()).createdAt).toEqual(new Date('2024-01-15T09:30:00.000Z'))
  })

  it('maps updatedAt to Date', () => {
    expect(transformAccount(makeRaw()).updatedAt).toEqual(new Date('2024-02-01T14:20:00.000Z'))
  })

  it('passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount({ id: 'acct-min' })).not.toThrow()
  })
})
