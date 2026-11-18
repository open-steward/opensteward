import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type QuickFileNominalLedger,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<QuickFileNominalLedger> = {}): QuickFileNominalLedger {
  return {
    NominalCode: 4000,
    Name: 'Sales Revenue',
    Description: 'Product sales income',
    CategoryGroupID: 10,
    CategoryGroupName: 'Income',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps NominalCode to id and customerDefinedCode as string', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('4000')
    expect(result.customerDefinedCode).toBe('4000')
  })

  it('maps Name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps Description to description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Product sales income')
  })

  it('always sets status to ACTIVE', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('maps CategoryGroupName to group', () => {
    expect(transformAccount(makeAccount()).group).toBe('Income')
  })

  it('maps NominalCode 0–999 to ASSET', () => {
    expect(transformAccount(makeAccount({ NominalCode: 100 })).type).toBe('ASSET')
  })

  it('maps NominalCode 1000–1999 to ASSET', () => {
    expect(transformAccount(makeAccount({ NominalCode: 1500 })).type).toBe('ASSET')
  })

  it('maps NominalCode 2000–2999 to LIABILITY', () => {
    expect(transformAccount(makeAccount({ NominalCode: 2100 })).type).toBe('LIABILITY')
  })

  it('maps NominalCode 3000–3999 to EQUITY', () => {
    expect(transformAccount(makeAccount({ NominalCode: 3000 })).type).toBe('EQUITY')
  })

  it('maps NominalCode 4000–4999 to INCOME', () => {
    expect(transformAccount(makeAccount({ NominalCode: 4000 })).type).toBe('INCOME')
  })

  it('maps NominalCode 5000–7999 to EXPENSE', () => {
    expect(transformAccount(makeAccount({ NominalCode: 6000 })).type).toBe('EXPENSE')
  })

  it('maps NominalCode 8000+ to OTHER', () => {
    expect(transformAccount(makeAccount({ NominalCode: 8500 })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformAccount({ NominalCode: 1000 })
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
