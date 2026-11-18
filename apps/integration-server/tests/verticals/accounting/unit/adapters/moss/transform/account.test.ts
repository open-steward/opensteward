import { describe, it, expect } from 'vitest'
import {
  transformExpenseAccount,
  type MossExpenseAccount,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<MossExpenseAccount> = {}): MossExpenseAccount {
  return {
    id: 'acct-001',
    organisationId: 'org-001',
    name: 'Travel Expenses',
    code: 'TRVL',
    status: 'ACTIVE',
    createTime: '2024-01-15T09:00:00.000Z',
    updateTime: '2024-06-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpenseAccount (moss)', () => {
  it('maps id directly', () => {
    expect(transformExpenseAccount(makeRaw()).id).toBe('acct-001')
  })

  it('maps name', () => {
    expect(transformExpenseAccount(makeRaw()).name).toBe('Travel Expenses')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformExpenseAccount(makeRaw()).customerDefinedCode).toBe('TRVL')
  })

  it('sets type to EXPENSE', () => {
    expect(transformExpenseAccount(makeRaw()).type).toBe('EXPENSE')
  })

  it('maps ACTIVE status', () => {
    expect(transformExpenseAccount(makeRaw({ status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps non-ACTIVE status to ARCHIVED', () => {
    expect(transformExpenseAccount(makeRaw({ status: 'INACTIVE' })).status).toBe('ARCHIVED')
  })

  it('maps createTime to createdAt Date', () => {
    expect(transformExpenseAccount(makeRaw()).createdAt).toEqual(
      new Date('2024-01-15T09:00:00.000Z'),
    )
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformExpenseAccount(makeRaw()))).not.toThrow()
  })
})
