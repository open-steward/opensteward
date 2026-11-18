import { describe, it, expect } from 'vitest'
import { transformAccount } from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { account } from '../fixtures'

describe('transformAccount (spendesk, GET /v1/experimental/accounts)', () => {
  it('maps the documented fields', () => {
    expect(AccountSchema.parse(transformAccount(account()))).toMatchObject({
      id: '5f0c1f9e-8b1a-4a52-9d0e-0c8a1f7e2b31',
      name: 'Office supplies',
      customerDefinedCode: '606000',
      type: 'EXPENSE',
      isPayable: false,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-10T08:00:00Z'),
    })
  })

  it.each([
    ['bank', 'ASSET', false],
    ['expense', 'EXPENSE', false],
    ['supplier', 'LIABILITY', true],
    ['employee', 'LIABILITY', true],
    ['tax', 'unknown', false],
    ['reverseCharge', 'unknown', false],
  ] as const)('type %s → %s (payable: %s)', (type, canonical, isPayable) => {
    const out = AccountSchema.parse(transformAccount(account({ type })))
    expect(out.type).toBe(canonical)
    expect(out.isPayable).toBe(isPayable)
  })

  it('isArchived → ARCHIVED', () => {
    expect(AccountSchema.parse(transformAccount(account({ isArchived: true }))).status).toBe(
      'ARCHIVED',
    )
  })

  it('description and currency when present; a non-ISO currency is dropped', () => {
    const out = AccountSchema.parse(
      transformAccount(account({ type: 'bank', description: 'Main bank', currency: 'EUR' })),
    )
    expect(out.description).toBe('Main bank')
    expect(out.currency).toBe('EUR')
    expect(
      AccountSchema.parse(transformAccount(account({ currency: 'euro' }))).currency,
    ).toBeUndefined()
    expect(AccountSchema.parse(transformAccount(account())).currency).toBeUndefined()
  })
})
