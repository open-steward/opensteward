import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type TipaltiGlAccount,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<TipaltiGlAccount> = {}): TipaltiGlAccount {
  return {
    id: 'gl-001',
    name: 'Accounts Payable',
    description: 'Trade payables',
    code: '2000',
    type: 'LIABILITY',
    status: 'ACTIVE',
    currency: 'USD',
    externalId: 'ext-gl-001',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('tipalti transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('gl-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Accounts Payable')
  })

  it('maps description', () => {
    expect(transformAccount(makeRaw()).description).toBe('Trade payables')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('2000')
  })

  it('maps type LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'LIABILITY' })).type).toBe('LIABILITY')
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

  it('maps type COST_OF_GOODS_SOLD to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'COST_OF_GOODS_SOLD' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'MYSTERY' })).type).toBe('OTHER')
  })

  it('maps status ACTIVE', () => {
    expect(transformAccount(makeRaw({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps status INACTIVE to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ status: 'INACTIVE' })).status).toBe('ARCHIVED')
  })

  it('maps currency', () => {
    expect(transformAccount(makeRaw()).currency).toBe('USD')
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
})
