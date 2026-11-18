/**
 * Netstock's read methods refuse before sending anything.
 *
 * Netstock's only documented REST API is the Data Orchestrator
 * (https://intercom.help/testing-ebdf46/en/articles/12869750-data-orchestrator-rest-api):
 *
 *   "Data Orchestrator exposes a REST API to allow customers to push the data IA
 *    requires to IA rather than IA having to pull the data from the customer via
 *    an ERP integration."
 *
 * Items, stock, locations, suppliers and purchase orders can only be sent in
 * (POST /import/*). Its only GET calls are /dataset/status,
 * /dataset/status_legend, /dataset/full_audit_log and /model/status, none of
 * which returns business records. The adapter used to call GET /items,
 * /stock-on-hand, /warehouses, /suppliers and /purchase-orders on
 * https://api.netstock.com/v1, a host with no DNS record, with an invented
 * cursor/pageSize contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import http from 'node:http'
import https from 'node:https'
import type { Credentials } from '@opensteward/shared'
import { NetstockAdapter } from '../../../../../../src/verticals/inventory/adapters/netstock/index'

// Module-level sentinel for node's http/https: spying on the default export
// alone misses `import * as http` and `(await import('node:http')).request`,
// so replace request/get on the modules themselves (namespace and default).
const nodeSent = vi.hoisted(() => ({ calls: 0 }))
function guardNodeModule(actual: Record<string, unknown>): Record<string, unknown> {
  const trap = (): never => {
    nodeSent.calls++
    throw new Error('netstock sent a request through node http/https')
  }
  const base = (actual['default'] ?? actual) as Record<string, unknown>
  const guarded = { ...base, request: trap, get: trap }
  return { ...actual, ...guarded, default: guarded }
}
vi.mock('node:http', async (load) => guardNodeModule(await load()))
vi.mock('node:https', async (load) => guardNodeModule(await load()))
vi.mock('http', async (load) => guardNodeModule(await load()))
vi.mock('https', async (load) => guardNodeModule(await load()))

const CREDS: Credentials = { accessToken: 'token', extra: {} }

const PUSH_ONLY =
  /Data Orchestrator exposes a REST API to allow customers to push the data IA requires to IA/

describe('netstock read methods refuse without a request', () => {
  let sent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    nodeSent.calls = 0
    sent = vi.fn(() => {
      throw new Error('netstock sent a request')
    })
    vi.spyOn(axios, 'create').mockImplementation(sent as never)
    vi.spyOn(axios, 'get').mockImplementation(sent as never)
    vi.spyOn(axios, 'post').mockImplementation(sent as never)
    vi.spyOn(axios, 'request').mockImplementation(sent as never)
    vi.spyOn(http, 'request').mockImplementation(sent as never)
    vi.spyOn(http, 'get').mockImplementation(sent as never)
    vi.spyOn(https, 'request').mockImplementation(sent as never)
    vi.spyOn(https, 'get').mockImplementation(sent as never)
    vi.stubGlobal('fetch', sent)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const lists = [
    ['listProducts', 'products', 'POST /import/master ("Imports master", '],
    ['listStockLevels', 'stock levels', 'URL: /import/stock_by_location Method: POST'],
    ['listLocations', 'locations', 'URL: /import/locations Method: POST'],
    ['listSuppliers', 'suppliers', 'URL: /import/suppliers Method: POST'],
    ['listPurchaseOrders', 'purchase orders', 'URL: /import/po Method: POST'],
  ] as const

  for (const [method, resource, importPath] of lists) {
    it(`${method} throws 501 NOT_SUPPORTED`, async () => {
      const adapter = new NetstockAdapter()
      const call = adapter[method].bind(adapter)
      const err = await call(CREDS, { page: 1, limit: 50 }).then(
        () => undefined,
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(err?.message.startsWith(`Netstock cannot list ${resource}: `)).toBe(true)
      expect(err?.message).toMatch(PUSH_ONLY)
      expect(err?.message).toContain(importPath)
      expect(sent).not.toHaveBeenCalled()
      expect(nodeSent.calls).toBe(0)
    })

    it(`${method} refuses on later pages and with updatedAfter too`, async () => {
      const adapter = new NetstockAdapter()
      const call = adapter[method].bind(adapter)
      await expect(
        call(CREDS, { page: 3, limit: 7, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(sent).not.toHaveBeenCalled()
      expect(nodeSent.calls).toBe(0)
    })
  }

  const gets = [
    ['getProduct', 'product'],
    ['getStockLevel', 'stock level'],
    ['getLocation', 'location'],
    ['getSupplier', 'supplier'],
    ['getPurchaseOrder', 'purchase order'],
  ] as const

  for (const [method, resource] of gets) {
    it(`${method} throws 501 NOT_SUPPORTED`, async () => {
      const adapter = new NetstockAdapter()
      const call = adapter[method].bind(adapter)
      await expect(call(CREDS, 'item-001')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(new RegExp(`^Netstock cannot read a ${resource} by id: `)),
      })
      expect(sent).not.toHaveBeenCalled()
      expect(nodeSent.calls).toBe(0)
    })
  }
})
