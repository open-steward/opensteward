import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type BindAccount,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/account'

function makeAccount(overrides: Partial<BindAccount> = {}): BindAccount {
  return {
    ID: 'acct-1',
    Number: '1000',
    Description: 'Cash',
    GLGroup: 'ACTIVO',
    Group: 'Current Assets',
    SubGroup: 'Cash & Equivalents',
    GLGroupID: 'grp-100',
    GroupID: 'grp-200',
    SubGroupID: 'grp-300',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('prefers ID over Number for id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct-1')
  })

  it('falls back to Number when ID is absent', () => {
    expect(transformAccount(makeAccount({ ID: undefined })).id).toBe('1000')
  })

  it('returns empty string when both ID and Number are absent', () => {
    expect(transformAccount(makeAccount({ ID: undefined, Number: undefined })).id).toBe('')
  })

  it('maps Description to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps Number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1000')
  })

  it('status is always ACTIVE', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('infers ASSET from ACTIVO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'ACTIVO' })).type).toBe('ASSET')
  })

  it('infers ASSET from ASSET keyword', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Fixed Asset' })).type).toBe('ASSET')
  })

  it('infers LIABILITY from PASIVO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'PASIVO' })).type).toBe('LIABILITY')
  })

  it('infers LIABILITY from LIABILIT substring', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Liabilities' })).type).toBe('LIABILITY')
  })

  it('infers EQUITY from CAPITAL', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'CAPITAL' })).type).toBe('EQUITY')
  })

  it('infers EQUITY from PATRIMONIO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Patrimonio' })).type).toBe('EQUITY')
  })

  it('infers INCOME from INGRESO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'INGRESO' })).type).toBe('INCOME')
  })

  it('infers INCOME from VENTA', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Ventas' })).type).toBe('INCOME')
  })

  it('infers INCOME from REVENUE keyword', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Revenue' })).type).toBe('INCOME')
  })

  it('infers EXPENSE from GASTO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Gastos' })).type).toBe('EXPENSE')
  })

  it('infers EXPENSE from COSTO', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Costo operativo' })).type).toBe('EXPENSE')
  })

  it('infers EXPENSE from EXPENSE keyword', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Operating Expense' })).type).toBe('EXPENSE')
  })

  it('falls back to OTHER for unknown GLGroup', () => {
    expect(transformAccount(makeAccount({ GLGroup: 'Unknown Group' })).type).toBe('OTHER')
  })

  it('falls back to OTHER when GLGroup is absent', () => {
    expect(transformAccount(makeAccount({ GLGroup: undefined })).type).toBe('OTHER')
  })

  it('maps GLGroup, Group, SubGroup, GLGroupID to canonical fields', () => {
    const a = transformAccount(makeAccount())
    expect(a.group).toBe('ACTIVO')
    expect(a.section).toBe('Current Assets')
    expect(a.subgroup).toBe('Cash & Equivalents')
    expect(a.parentId).toBe('grp-100')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
