import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type BokioAccount,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/account'
import { ACCOUNT_WITH_DETAILS, CHART_OF_ACCOUNTS, copyOf } from '../fixtures'

describe('transformAccount (Bokio, documented account)', () => {
  it('takes the id from the numeric "account" key, as a string', () => {
    const rows = copyOf<BokioAccount[]>(CHART_OF_ACCOUNTS)
    const out = rows.map((r) => AccountSchema.parse(transformAccount(r)))
    expect(out.map((a) => a.id)).toEqual(['1930', '3001', '8001'])
    expect(out.map((a) => a.customerDefinedCode)).toEqual(['1930', '3001', '8001'])
    expect(out[0]!.name).toBe('Företagskonto / Affärskonto')
  })

  it('does not invent a type or status from accountType', () => {
    const out = AccountSchema.parse(transformAccount(copyOf<BokioAccount>(CHART_OF_ACCOUNTS[2])))
    expect(out.type).toBeUndefined()
    expect(out.status).toBeUndefined()
  })

  it('maps accountBalance of the get-by-id shape to minor units', () => {
    const out = AccountSchema.parse(transformAccount(copyOf<BokioAccount>(ACCOUNT_WITH_DETAILS)))
    expect(out).toMatchObject({ id: '1930', balance: 1_500_075 })
  })

  it('never reads the undocumented accountNumber key', () => {
    const out = AccountSchema.parse(
      transformAccount({ accountNumber: '9999', account: 1930 } as BokioAccount),
    )
    expect(out.id).toBe('1930')
  })

  it('keeps the raw row as metadata', () => {
    const raw = copyOf<BokioAccount>(CHART_OF_ACCOUNTS[0])
    expect(transformAccount(raw).metadata).toBe(raw)
  })
})
