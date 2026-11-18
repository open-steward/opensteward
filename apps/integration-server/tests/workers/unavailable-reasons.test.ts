/**
 * The sync report's reason for a skipped resource comes from the adapter's
 * own `metadata.ts` declaration. The first case loads Bokio's real
 * declaration through the default loader, so a change to either the file
 * layout or the resource ↔ method match is caught here.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  declarationSpecifier,
  listMethodKey,
  unavailableReasonResolver,
} from '../../src/workers/unavailable-reasons'
import { metadata as bokio } from '../../src/verticals/accounting/adapters/bokio/metadata'
import { LISTABLE_RESOURCES } from '../../src/verticals/accounting/sync/listable-resources'

const reasonOf = (resource: string): string =>
  bokio.unavailableResources.find((u) => u.resource === resource)!.reason

describe('unavailableReasonResolver', () => {
  it('answers every accounting resource Bokio has no list method for with its declared reason', async () => {
    const resolve = unavailableReasonResolver('accounting')
    const byType: Record<string, string | undefined> = {}
    for (const r of LISTABLE_RESOURCES) byType[r.resourceType] = await resolve('bokio', r)
    expect(byType).toEqual({
      invoices: undefined,
      bills: undefined,
      contacts: undefined,
      accounts: undefined,
      journals: undefined,
      transactions: reasonOf('transaction'),
      taxrates: reasonOf('taxrate'),
      expenses: reasonOf('expense'),
      creditmemos: undefined,
      orders: reasonOf('order'),
      salesorders: reasonOf('salesorder'),
      purchaseorders: reasonOf('purchaseorder'),
    })
    expect(byType.taxrates).toBe('VAT exists only as a per-line taxRate on invoices')
  })

  it('answers undefined for an adapter with no metadata.ts, or no such directory', async () => {
    const resolve = unavailableReasonResolver('accounting')
    const r = { resourceType: 'transactions', method: 'listTransactions' }
    expect(await resolve('no-such-adapter', r)).toBeUndefined()
  })

  it('never imports a path built from an unsafe platform or vertical', async () => {
    const load = vi.fn(async () => undefined)
    const r = { resourceType: 'transactions', method: 'listTransactions' }
    expect(await unavailableReasonResolver('accounting', load)('../../x', r)).toBeUndefined()
    expect(await unavailableReasonResolver('../x', load)('bokio', r)).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('loads each adapter declaration once', async () => {
    const load = vi.fn(async () => ({
      unavailableResources: [{ resource: 'tax-rate', reason: 'none' }],
    }))
    const resolve = unavailableReasonResolver('accounting', load)
    expect(await resolve('acme', { resourceType: 'taxrates', method: 'listTaxRates' })).toBe('none')
    expect(await resolve('acme', { resourceType: 'orders', method: 'listOrders' })).toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('listMethodKey (the key check-adapter-declarations compares on)', () => {
  it.each([
    ['accounting', 'listTaxRates', 'taxrate'],
    ['accounting', 'listPurchaseOrders', 'purchaseorder'],
    ['accounting', 'listCreditMemos', 'creditmemo'],
    ['crm', 'listCompanies', 'company'],
    ['crm', 'listActivities', 'activity'],
    ['ecommerce', 'listInventoryLevels', 'inventory'],
    ['inventory', 'listInventoryLevels', 'inventorylevel'],
  ])('%s %s → %s', (vertical, method, key) => {
    expect(listMethodKey(vertical, method)).toBe(key)
  })
})

describe('declarationSpecifier', () => {
  // vitest (like tsx) resolves a `.ts` specifier to the source too, so the
  // lookups above would pass with `metadata.ts`; production imports from
  // dist/, where only `metadata.js` exists. Pin the extension here.
  it('names the emitted .js next to this module, which maps to the adapter source', () => {
    const spec = declarationSpecifier('accounting', 'bokio')
    expect(spec).toBe('../verticals/accounting/adapters/bokio/metadata.js')
    const workersDir = join(__dirname, '../../src/workers')
    expect(existsSync(join(workersDir, spec.replace(/\.js$/, '.ts')))).toBe(true)
  })
})
