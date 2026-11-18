import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type XeroAccount } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/account'

/**
 * Finding 18 — an unrecognised `Type` must never override a known-good `Class`.
 *
 * Xero sends both. `Class` is its own coarse classification and a closed
 * five-value set that maps 1:1 onto the canonical enum; `Type` is a long,
 * open-ended list that Xero extends. The mapper consulted only `Type` and fell
 * through to `OTHER`, so the demo org's Inventory account — `Class: ASSET`,
 * unambiguous — came out `OTHER` and lands in the wrong section of any balance
 * sheet built on this data. Wrong in a way that looks plausible.
 *
 * The regression guard is the `Class`-present-but-`Type`-unknown case: it is
 * the one that was broken and the one a future `Type`-only refactor breaks
 * again. Xero's published `Type` enum is inconsistent between its own
 * documents, which is precisely why correctness cannot rest on enumerating it.
 */

function account(overrides: Partial<XeroAccount> = {}): XeroAccount {
  return {
    AccountID: 'acc-001',
    Code: '200',
    Name: 'Sales',
    Type: 'REVENUE',
    Class: 'REVENUE',
    Status: 'ACTIVE',
    Description: '',
    CurrencyCode: 'GBP',
    ...overrides,
  } as XeroAccount
}

describe('transformAccount type derivation (Xero)', () => {
  it('reproduces the reported defect case: Inventory is an ASSET, not OTHER', () => {
    // Verbatim from the live demo org.
    const a = transformAccount(account({ Name: 'Inventory', Type: 'INVENTORY', Class: 'ASSET' }))
    expect(a.type).toBe('ASSET')
  })

  it.each([
    ['ASSET', 'ASSET'],
    ['LIABILITY', 'LIABILITY'],
    ['EQUITY', 'EQUITY'],
    ['REVENUE', 'INCOME'],
    ['EXPENSE', 'EXPENSE'],
  ] as const)('Class %s maps to %s', (cls, expected) => {
    expect(transformAccount(account({ Class: cls, Type: 'REVENUE' })).type).toBe(expected)
  })

  it('lets Class win over a Type that maps somewhere else', () => {
    // Not hypothetical: Xero's own docs list `Type` spellings that collide
    // with Class names. Whichever wins must be the deliberate one.
    expect(transformAccount(account({ Class: 'ASSET', Type: 'EXPENSE' })).type).toBe('ASSET')
  })

  it('does not fall through to OTHER when Class is known but Type is not', () => {
    expect(transformAccount(account({ Class: 'ASSET', Type: 'SOMETHING_XERO_ADDED_LAST_WEEK' })).type).toBe('ASSET')
  })

  it('is case-insensitive about Class', () => {
    expect(transformAccount(account({ Class: 'asset' as XeroAccount['Class'], Type: 'X' })).type).toBe('ASSET')
  })

  it.each([
    ['BANK', 'ASSET'],
    ['CURRENT', 'ASSET'],
    ['FIXED', 'ASSET'],
    ['INVENTORY', 'ASSET'],
    ['NONCURRENT', 'ASSET'],
    ['PREPAYMENT', 'ASSET'],
    ['EQUITY', 'EQUITY'],
    ['CURRLIAB', 'LIABILITY'],
    ['LIABILITY', 'LIABILITY'],
    ['TERMLIAB', 'LIABILITY'],
    ['PAYGLIABILITY', 'LIABILITY'],
    ['SUPERANNUATIONLIABILITY', 'LIABILITY'],
    ['WAGESPAYABLELIABILITY', 'LIABILITY'],
    ['REVENUE', 'INCOME'],
    ['SALES', 'INCOME'],
    ['OTHERINCOME', 'INCOME'],
    ['EXPENSE', 'EXPENSE'],
    ['OVERHEADS', 'EXPENSE'],
    ['DIRECTCOSTS', 'EXPENSE'],
    ['DEPRECIATN', 'EXPENSE'],
    ['SUPERANNUATIONEXPENSE', 'EXPENSE'],
    ['WAGESEXPENSE', 'EXPENSE'],
  ] as const)('falls back to Type %s -> %s when Class is absent', (type, expected) => {
    // Older payloads and some endpoints omit Class entirely, so the Type map
    // still has to carry every value Xero publishes.
    const { Class: _drop, ...noClass } = account({ Type: type })
    expect(transformAccount(noClass as XeroAccount).type).toBe(expected)
  })

  it('returns OTHER only when neither signal is usable', () => {
    const { Class: _drop, ...noClass } = account({ Type: 'NOT_A_REAL_TYPE' })
    expect(transformAccount(noClass as XeroAccount).type).toBe('OTHER')
  })

  it('keeps the Xero Type as sub-classification rather than discarding it', () => {
    const a = transformAccount(account({ Type: 'INVENTORY', Class: 'ASSET' }))
    expect(a.type).toBe('ASSET')
    expect(a.group).toBe('INVENTORY')
  })

  it('produces canonical output that satisfies the schema', () => {
    expect(() => AccountSchema.parse(transformAccount(account({ Type: 'INVENTORY', Class: 'ASSET' })))).not.toThrow()
  })
})
