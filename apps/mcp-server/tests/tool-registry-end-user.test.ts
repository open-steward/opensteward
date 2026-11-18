import { describe, it, expect } from 'vitest'
import { buildTools } from '../src/tool-registry.js'
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


/**
 * Unit tests for `buildTools` in **end-user mode**.
 *
 * `tool-registry.test.ts` is exhaustive for tenant mode but has zero coverage
 * for end-user mode. These tests mirror its structure for the end-user surface.
 */

const stubClient = new RestClient({
  baseUrl: 'http://stub.local',
  token: 'eut_stub',
  mode: 'end-user',
})

describe('buildTools — end-user mode', () => {
  const tools = buildTools({ mode: 'end-user', client: stubClient })

  it('emits get_me and list_my_connections instead of tenant customer tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toContain('get_me')
    expect(names).toContain('list_my_connections')
    // Tenant-only tools must be absent
    expect(names).not.toContain('list_customers')
    expect(names).not.toContain('get_customer')
    expect(names).not.toContain('list_customer_connections')
  })

  it('emits exactly 2 customer-level tools (not 3)', () => {
    const customerTools = ['get_me', 'list_my_connections']
    const names = tools.map((t) => t.name)
    const found = customerTools.filter((n) => names.includes(n))
    expect(found).toHaveLength(2)
  })

  it('total tool count matches 2 customer tools + resource tools', () => {
    const resourceTools = RESOURCES.reduce((sum, r) => sum + (r.singleton ? 1 : 2), 0)
    expect(tools.length).toBe(2 + resourceTools)
  })

  it('every tool name matches /^(list|get)_/ — no write tools', () => {
    for (const t of tools) {
      expect(t.name).toMatch(/^(list|get)_/)
      expect(t.name).not.toMatch(/^(create|update|delete|patch|put|post)_/)
    }
  })

  it('every resource tool (beyond customer level) still requires connection_id', () => {
    const customerLevel = new Set(['get_me', 'list_my_connections'])
    for (const t of tools) {
      if (customerLevel.has(t.name)) continue
      expect(advertised(t).required).toContain('connection_id')
    }
  })

  it('get_me and list_my_connections do NOT declare connection_id', () => {
    const getMe = tools.find((t) => t.name === 'get_me')!
    const listMyConns = tools.find((t) => t.name === 'list_my_connections')!
    expect(advertised(getMe).required).not.toContain('connection_id')
    expect(advertised(listMyConns).required).not.toContain('connection_id')
  })

  it('every tool has a non-trivial description', () => {
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(10)
    }
  })

  it('resource tools are present and correctly named (spot-check)', () => {
    const names = new Set(tools.map((t) => t.name))
    // Non-conflicting names must be unprefixed
    expect(names.has('list_invoices')).toBe(true)
    expect(names.has('list_bills')).toBe(true)
    // Singleton resource — only get_, no list_
    expect(names.has('get_organization')).toBe(true)
    expect(names.has('list_organization')).toBe(false)
    expect(names.has('list_organizations')).toBe(false)
    // Conflicting names must be prefixed
    expect(names.has('list_accounting_contacts')).toBe(true)
    expect(names.has('list_crm_contacts')).toBe(true)
  })
})
