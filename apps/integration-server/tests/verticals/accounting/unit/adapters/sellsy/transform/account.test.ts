import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type SellsyAccount,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/account'

function makeAccount(overrides: Partial<SellsyAccount> = {}): SellsyAccount {
  return {
    id: 'acc-001',
    name: 'Banque courante',
    description: 'Compte bancaire principal',
    number: '512000',
    type: 'asset',
    is_archived: false,
    currency: 'EUR',
    group: 'Trésorerie',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Banque courante')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Compte bancaire principal')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('512000')
  })

  it('maps type asset to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps type income to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps type expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps type charge (French) to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'charge' })).type).toBe('EXPENSE')
  })

  it('maps type produit (French) to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'produit' })).type).toBe('INCOME')
  })

  it('falls back to French plan comptable code for type mapping', () => {
    expect(transformAccount(makeAccount({ type: '', number: '6010' })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ type: '', number: '7010' })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ type: '', number: '1010' })).type).toBe('EQUITY')
  })

  it('maps is_archived false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ is_archived: false })).status).toBe('ACTIVE')
  })

  it('maps is_archived true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ is_archived: true })).status).toBe('ARCHIVED')
  })

  it('maps group', () => {
    expect(transformAccount(makeAccount()).group).toBe('Trésorerie')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('EUR')
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
