import { describe, it, expect } from 'vitest'
import { transformAccount } from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/account'
import type { RealBooksLedger } from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/contact'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeLedger(overrides: Partial<RealBooksLedger> = {}): RealBooksLedger {
  return {
    id: 101,
    ledgerName: 'Sales Account',
    printName: 'Sales Account',
    ledgerCode: 'SALES-001',
    ledgerGroupName: 'Sales & Revenue',
    groupNature: 'Income',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeLedger()).id).toBe('101')
  })

  it('falls back to ledgerCode when id is absent', () => {
    expect(transformAccount(makeLedger({ id: undefined })).id).toBe('SALES-001')
  })

  it('falls back to ledgerName when id and ledgerCode are absent', () => {
    expect(transformAccount(makeLedger({ id: undefined, ledgerCode: undefined })).id).toBe(
      'Sales Account',
    )
  })

  it('maps printName to name preferentially', () => {
    expect(transformAccount(makeLedger()).name).toBe('Sales Account')
  })

  it('maps ledgerCode to customerDefinedCode', () => {
    expect(transformAccount(makeLedger()).customerDefinedCode).toBe('SALES-001')
  })

  it('maps ledgerGroupName to group', () => {
    expect(transformAccount(makeLedger()).group).toBe('Sales & Revenue')
  })

  it('always sets status to ACTIVE', () => {
    expect(transformAccount(makeLedger()).status).toBe('ACTIVE')
  })

  it('maps groupNature=Income to INCOME type', () => {
    expect(transformAccount(makeLedger({ groupNature: 'income' })).type).toBe('INCOME')
  })

  it('maps groupNature=Asset to ASSET type', () => {
    expect(transformAccount(makeLedger({ groupNature: 'asset', ledgerGroupName: '' })).type).toBe(
      'ASSET',
    )
  })

  it('maps groupNature=Liability to LIABILITY type', () => {
    expect(
      transformAccount(makeLedger({ groupNature: 'liability', ledgerGroupName: '' })).type,
    ).toBe('LIABILITY')
  })

  it('maps groupNature=Expense to EXPENSE type', () => {
    expect(transformAccount(makeLedger({ groupNature: 'expense', ledgerGroupName: '' })).type).toBe(
      'EXPENSE',
    )
  })

  it('maps groupNature=Equity to EQUITY type via ledgerGroupName containing "equity"', () => {
    expect(
      transformAccount(makeLedger({ groupNature: '', ledgerGroupName: 'Capital & Equity' })).type,
    ).toBe('EQUITY')
  })

  it('maps ledgerGroupName containing "debtor" to ASSET', () => {
    expect(
      transformAccount(makeLedger({ groupNature: '', ledgerGroupName: 'Sundry Debtors' })).type,
    ).toBe('ASSET')
  })

  it('maps ledgerGroupName containing "creditor" to LIABILITY', () => {
    expect(
      transformAccount(makeLedger({ groupNature: '', ledgerGroupName: 'Sundry Creditors' })).type,
    ).toBe('LIABILITY')
  })

  it('maps unknown nature to OTHER', () => {
    expect(transformAccount(makeLedger({ groupNature: '', ledgerGroupName: '' })).type).toBe(
      'OTHER',
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeLedger()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeLedger()))).not.toThrow()
  })
})
