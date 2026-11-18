import { describe, it, expect } from 'vitest'
import { buildTools, _internal } from '../src/tool-registry.js'
import { RESOURCES } from '../src/resources.js'
import { RestClient } from '../src/rest-client.js'
import { z } from 'zod'

/**
 * The JSON Schema an agent actually receives in `tools/list`. Asserting on
 * this rather than on our own struct keeps these tests pinned to the
 * advertised contract, which is what survived the v1 -> v2 SDK migration.
 */
function advertised(tool: { schema: z.ZodType }): {
  properties: Record<string, unknown>
  required: string[]
  additionalProperties?: unknown
} {
  const js = z.toJSONSchema(tool.schema, { io: 'input' }) as {
    properties?: Record<string, unknown>
    required?: string[]
    additionalProperties?: unknown
  }
  return {
    properties: js.properties ?? {},
    required: js.required ?? [],
    additionalProperties: js.additionalProperties,
  }
}


const stubClient = new RestClient({
  baseUrl: 'http://stub.local',
  token: 'os_stub',
  mode: 'tenant',
})

describe('buildTools — tenant mode', () => {
  const tools = buildTools({ mode: 'tenant', client: stubClient })

  it('emits 3 customer-level tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toContain('list_customers')
    expect(names).toContain('get_customer')
    expect(names).toContain('list_customer_connections')
  })

  it('emits exactly two tools per non-singleton resource and one per singleton', () => {
    const expected = RESOURCES.reduce((sum, r) => sum + (r.singleton ? 1 : 2), 0)
    const customerTools = 3
    expect(tools.length).toBe(customerTools + expected)
  })

  it('every tool name matches /^(list|get)_/', () => {
    for (const t of tools) {
      expect(t.name).toMatch(/^(list|get)_/)
    }
  })

  it('contains zero write tools (no create_*, update_*, delete_*, etc.)', () => {
    for (const t of tools) {
      expect(t.name).not.toMatch(/^(create|update|delete|patch|put|post)_/)
    }
  })

  it('every connection-scoped tool requires connection_id', () => {
    const customerLevel = new Set(['list_customers', 'get_customer', 'list_customer_connections'])
    for (const t of tools) {
      if (customerLevel.has(t.name)) continue
      expect(advertised(t).required).toContain('connection_id')
    }
  })

  it('every tool rejects unknown params, list tools included', () => {
    // This used to assert the opposite for `list_*`: that they stayed open,
    // because unrecognised keys were believed to reach the REST API as
    // filters. They did not. `parseQueryParams` reads a fixed four-key
    // allowlist and drops the rest, so an extra key rode the query string and
    // was ignored — which meant a misspelled filter (`statuss=PAID`) parsed
    // cleanly and read to the agent as a filter that worked. Finding 11.
    //
    // In JSON Schema an absent or `{}` `additionalProperties` allows extras;
    // `false` forbids them.
    let strict = 0
    for (const t of tools) {
      expect(advertised(t).additionalProperties, `${t.name} must reject unknown params`).toBe(false)
      strict++
    }
    // Sanity: a bug that emitted no tools at all cannot pass this test.
    expect(strict).toBeGreaterThan(100)
  })

  it('disambiguates name conflicts with vertical prefixes', () => {
    const conflicts = _internal.computeNameConflicts(RESOURCES)
    expect(conflicts.has('contacts')).toBe(true)        // accounting + crm
    expect(conflicts.has('orders')).toBe(true)          // accounting + ecommerce + logistics
    expect(conflicts.has('transactions')).toBe(true)    // accounting + ecommerce
    expect(conflicts.has('customers')).toBe(true)       // ecommerce, also conflicts with tenant-level

    const names = new Set(tools.map((t) => t.name))
    expect(names.has('list_accounting_contacts')).toBe(true)
    expect(names.has('list_crm_contacts')).toBe(true)
    expect(names.has('list_ecommerce_orders')).toBe(true)
    expect(names.has('list_logistics_orders')).toBe(true)
    expect(names.has('list_accounting_orders')).toBe(true)
  })

  it('keeps unique resource names unprefixed', () => {
    const names = new Set(tools.map((t) => t.name))
    expect(names.has('list_invoices')).toBe(true)
    expect(names.has('list_bills')).toBe(true)
    expect(names.has('list_pipelines')).toBe(true)
    expect(names.has('list_products')).toBe(true)
    expect(names.has('list_carriers')).toBe(true)
  })

  it('singletons emit only get_*', () => {
    const names = new Set(tools.map((t) => t.name))
    expect(names.has('get_organization')).toBe(true)
    expect(names.has('list_organization')).toBe(false)
    expect(names.has('list_organizations')).toBe(false)
  })

  it('every tool has a description', () => {
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(10)
    }
  })

  it('list tools advertise exactly the query params the REST API implements', () => {
    // `offset` and `status` were advertised here and implemented nowhere; see
    // advertised-params.test.ts for the full contract and the reasoning.
    const list = tools.find((t) => t.name === 'list_invoices')!
    const props = advertised(list).properties
    expect(props['limit']).toBeDefined()
    expect(props['page']).toBeDefined()
    expect(props['updated_after']).toBeDefined()
    expect(props['search']).toBeDefined()
    expect(props['since']).toBeDefined() // deprecated alias for updated_after
    expect(props['offset']).toBeUndefined()
    expect(props['status']).toBeUndefined()
  })

  it('keeps `offset` on list_customers, where the endpoint does implement it', () => {
    // `/v1/customers` is a control-plane endpoint that genuinely reads
    // q/limit/offset. Removing offset from the shared field set must not
    // remove the one place it is real.
    const props = advertised(tools.find((t) => t.name === 'list_customers')!).properties
    expect(props['offset']).toBeDefined()
    expect(props['q']).toBeDefined()
  })
})
