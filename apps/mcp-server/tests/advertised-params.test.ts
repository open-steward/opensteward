import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { buildTools } from '../src/tool-registry.js'
import type { RestClient } from '../src/rest-client.js'

/**
 * Findings 8, 9, 10 and 11 are one defect: the MCP server advertised
 * parameters the REST API does not implement.
 *
 * `PAGINATION_FIELDS` promised `offset`, `since` and `status` on every one of
 * the ~150 list tools. `parseQueryParams` on the server reads exactly four
 * keys — `page`, `limit`, `updated_after`, `search` — and the OpenAPI document
 * describes only those four. So all three were accepted, forwarded, and
 * dropped without comment:
 *
 *     list_invoices(status="PAID")  ->  [ AUTHORIZED, PAID, ... ]
 *
 * This reproduced identically on Fortnox and Xero, which is what ruled out a
 * platform-vocabulary mismatch and pointed upstream of the adapters.
 *
 * A silently-ignored filter is worse than a rejected one. An agent filtering
 * for unpaid invoices gets a plausible list containing paid ones and no signal
 * that anything went wrong. The tool description IS the contract, so the fix
 * is to make it describe the endpoint that exists.
 *
 * Note `search` — implemented server-side the whole time, and never
 * advertised. The surface was wrong in both directions.
 */

const client = {
  listResource: vi.fn().mockResolvedValue({ data: [] }),
  getResource: vi.fn().mockResolvedValue({ data: {} }),
  listCustomers: vi.fn().mockResolvedValue({ data: [] }),
  getCustomer: vi.fn().mockResolvedValue({ data: {} }),
  listCustomerConnections: vi.fn().mockResolvedValue({ data: [] }),
  mode: 'tenant' as const,
} as unknown as RestClient

function tools() {
  return buildTools({ mode: 'tenant', client })
}

function listTools() {
  return tools().filter((t) => t.name.startsWith('list_') && t.name !== 'list_customers' && t.name !== 'list_customer_connections')
}

function keysOf(schema: z.ZodType<Record<string, unknown>>): string[] {
  return Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape)
}

/**
 * The four keys `parseQueryParams` actually reads, plus the connection
 * selector, plus `since` — which is advertised but is TRANSLATED to
 * `updated_after` before the request leaves, so it is acted on rather than
 * dropped. This list is the contract; if the server grows a fifth key, this
 * test is the place that has to agree before the tool surface claims it.
 */
const SERVER_UNDERSTOOD = ['connection_id', 'page', 'limit', 'updated_after', 'search', 'since']

describe('advertised list-tool parameters match what the server implements', () => {
  it('advertises no parameter the REST API ignores', () => {
    const offenders = new Map<string, string[]>()
    for (const t of listTools()) {
      const extra = keysOf(t.schema).filter((k) => !SERVER_UNDERSTOOD.includes(k))
      if (extra.length) offenders.set(t.name, extra)
    }
    expect(Object.fromEntries(offenders)).toEqual({})
  })

  it.each(['offset', 'status'])('no longer advertises `%s`', (param) => {
    for (const t of listTools()) expect(keysOf(t.schema)).not.toContain(param)
  })

  it('advertises `search`, which the server has always implemented', () => {
    for (const t of listTools()) expect(keysOf(t.schema)).toContain('search')
  })

  it('advertises `updated_after` under the name the REST API uses', () => {
    for (const t of listTools()) expect(keysOf(t.schema)).toContain('updated_after')
  })

  it('marks `since` deprecated so the canonical name is the one agents reach for', () => {
    const t = listTools()[0]!
    const shape = (t.schema as unknown as { shape: Record<string, { description?: string }> }).shape
    expect(shape['since']?.description ?? '').toMatch(/deprecated/i)
  })
})

describe('`since` keeps working as an alias rather than being silently dropped', () => {
  it('forwards `since` to the server as `updated_after`', async () => {
    const t = listTools().find((x) => x.name === 'list_invoices')!
    await t.call({ connection_id: 'conn-1', since: '2026-01-01T00:00:00Z' })
    const [, , params] = client.listResource.mock.calls.at(-1)!
    expect(params).toMatchObject({ updated_after: '2026-01-01T00:00:00Z' })
    // The server ignores `since`; forwarding both would leave the dead key in
    // the query string and re-advertise the thing being fixed.
    expect(params).not.toHaveProperty('since')
  })

  it('does not let the alias overwrite an explicit updated_after', async () => {
    const t = listTools().find((x) => x.name === 'list_invoices')!
    await t.call({ connection_id: 'conn-1', since: '2020-01-01T00:00:00Z', updated_after: '2026-01-01T00:00:00Z' })
    const [, , params] = client.listResource.mock.calls.at(-1)!
    expect(params).toMatchObject({ updated_after: '2026-01-01T00:00:00Z' })
  })
})

describe('unknown parameters are refused, not accepted and discarded', () => {
  it('rejects a parameter the server cannot act on', () => {
    // Finding 11. `z.looseObject` accepted anything and forwarded it into a
    // query string the server ignores, so a typo (`limitt`, `statuss`) read as
    // a working filter. A rejected call is recoverable; a silently unfiltered
    // one is not.
    const t = listTools().find((x) => x.name === 'list_invoices')!
    const parsed = t.schema.safeParse({ connection_id: 'conn-1', nonsense_filter: 'PAID' })
    expect(parsed.success).toBe(false)
  })

  it('still accepts every parameter it advertises', () => {
    const t = listTools().find((x) => x.name === 'list_invoices')!
    const parsed = t.schema.safeParse({
      connection_id: 'conn-1', page: 1, limit: 10, search: 'acme',
      updated_after: '2026-01-01T00:00:00Z',
    })
    expect(parsed.success).toBe(true)
  })
})
