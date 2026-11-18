import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type SnelStartAccount,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/account'

function makeAccount(overrides: Partial<SnelStartAccount> = {}): SnelStartAccount {
  return {
    id: 'acc-001',
    nummer: 8000,
    omschrijving: 'Omzet binnenland',
    rekeningCode: 'OMZET',
    nonactief: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-001')
  })

  it('maps omschrijving to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Omzet binnenland')
  })

  it('maps nummer to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('8000')
  })

  it('maps nonactief=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ nonactief: false })).status).toBe('ACTIVE')
  })

  it('maps nonactief=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ nonactief: true })).status).toBe('ARCHIVED')
  })

  it('maps rekeningCode ACTIVA to ASSET type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'BALANS_ACTIVA' })).type).toBe('ASSET')
  })

  it('maps rekeningCode PASSIVA to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'BALANS_PASSIVA' })).type).toBe('LIABILITY')
  })

  it('maps rekeningCode EIGEN_VERMOGEN to EQUITY type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'EIGEN_VERMOGEN' })).type).toBe('EQUITY')
  })

  it('maps rekeningCode OMZET to INCOME type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'OMZET' })).type).toBe('INCOME')
  })

  it('maps rekeningCode KOSTEN to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'KOSTEN' })).type).toBe('EXPENSE')
  })

  it('maps unknown rekeningCode to OTHER type', () => {
    expect(transformAccount(makeAccount({ rekeningCode: 'OVERIG' })).type).toBe('OTHER')
  })

  it('returns undefined name when omschrijving is empty', () => {
    expect(transformAccount(makeAccount({ omschrijving: '' })).name).toBeUndefined()
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
