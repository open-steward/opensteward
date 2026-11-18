import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { MegaventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/megaventory/index'

/**
 * What this adapter ASKS FOR, and how it reads the answer.
 *
 * Two of Megaventory's behaviours are invisible to a transform test and both
 * are load-bearing: the five list operations used here do not paginate, and
 * failure is reported in-band on an HTTP 200.
 */
const calls: Array<{ op: string; key: string; body: Record<string, unknown> }> = []
let nextRows: unknown[] = []

vi.mock('../../../../../../src/verticals/inventory/adapters/megaventory/client', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../../../src/verticals/inventory/adapters/megaventory/client')
  >('../../../../../../src/verticals/inventory/adapters/megaventory/client')
  return {
    ...actual,
    MegaventoryClient: class {
      async call(op: string, key: string, body: Record<string, unknown>) {
        calls.push({ op, key, body })
        return nextRows
      }
    },
  }
})

const creds = { accessToken: 'key' } as Credentials

beforeEach(() => {
  calls.length = 0
  nextRows = []
})

describe('megaventory request contracts', () => {
  it('calls the operation whose response key it then reads', () => {
    // The key is not derivable from the operation name:
    // InventoryLocationStockGet answers with mvProductStockList.
    return new MegaventoryAdapter().listStockLevels(creds, {}).then(() => {
      expect(calls[0]!.op).toBe('InventoryLocationStockGet')
      expect(calls[0]!.key).toBe('mvProductStockList')
    })
  })

  it('asks for all records when no limit is given', async () => {
    await new MegaventoryAdapter().listProducts(creds, {})
    expect(calls[0]!.op).toBe('ProductGet')
    expect(calls[0]!.body['ReturnTopNRecords']).toBe(-1)
  })

  it('asks for all records even when a limit is given', async () => {
    // ReturnTopNRecords is a top-N limiter, not a page size: sent as the
    // limit, every page came back as the same newest N. The local slice is
    // tested in paging.test.ts.
    await new MegaventoryAdapter().listProducts(creds, { limit: 25 })
    expect(calls[0]!.body['ReturnTopNRecords']).toBe(-1)
  })

  it('never sends a page number, because ProductGet has no offset', async () => {
    // ReturnTopNRecords takes the N highest ids, and ProductGet (like the other
    // four list operations here) documents no offset, page or cursor, so
    // translating `page` would return the same newest rows every time while
    // appearing to advance.
    await new MegaventoryAdapter().listProducts(creds, { page: 3, limit: 25 })
    const body = calls[0]!.body
    expect(body).not.toHaveProperty('Page')
    expect(body).not.toHaveProperty('Offset')
    expect(body).not.toHaveProperty('Skip')
    expect(JSON.stringify(body)).not.toContain('3')
  })

  it('filters suppliers to Suppliers, not every customer in the account', async () => {
    // SupplierClientGet returns clients as well. Without the filter a sync
    // imports the account's whole customer list as suppliers.
    await new MegaventoryAdapter().listSuppliers(creds, {})
    expect(calls[0]!.op).toBe('SupplierClientGet')
    expect(calls[0]!.body['Filters']).toEqual([
      { FieldName: 'SupplierClientType', SearchOperator: 'Equals', SearchValue: 'Supplier' },
    ])
  })

  it('refuses to return a customer through the supplier route', async () => {
    nextRows = [{ SupplierClientID: 1, SupplierClientType: 'Client', SupplierClientName: 'Acme' }]
    await expect(new MegaventoryAdapter().getSupplier(creds, '1')).rejects.toThrow(/not found/)
  })

  it('rejects a stock level id that is not the composite listStockLevels emits', async () => {
    await expect(new MegaventoryAdapter().getStockLevel(creds, '51')).rejects.toThrow(
      /productId>:<locationId/,
    )
  })
})
