import { describe, it, expect, vi } from 'vitest'
import { buildTools } from '../src/tool-registry.js'
import { STATUS_ENUMS } from '../src/generated/status-enums.js'
import type { RestClient } from '../src/rest-client.js'

/**
 * Finding 20 — the normalized status vocabulary was reported as undefined for
 * four review rounds. It is not: every entity declares a per-entity enum and
 * every one of them is published in `docs/openapi/openapi.yaml`.
 *
 * The reason four rounds concluded otherwise is that they were reading through
 * MCP, and an MCP tool description advertises only its INPUT schema. Nothing
 * an agent can see says what `status` may contain, so a defined vocabulary and
 * an undefined one look identical from there.
 *
 * The values are therefore surfaced in the tool descriptions, from a file
 * GENERATED out of the OpenAPI document — hand-maintaining them in
 * `resources.ts` would drift from the schemas silently, which is the failure
 * this is meant to end rather than repeat. `resources.ts` is deliberately free
 * of any runtime dependency on integration-server, so generation is how the
 * CLI solves the same problem.
 */

const client = {
  listResource: vi.fn().mockResolvedValue({ data: [] }),
  getResource: vi.fn().mockResolvedValue({ data: {} }),
  listCustomers: vi.fn().mockResolvedValue({ data: [] }),
  getCustomer: vi.fn().mockResolvedValue({ data: {} }),
  listCustomerConnections: vi.fn().mockResolvedValue({ data: [] }),
  mode: 'tenant' as const,
} as unknown as RestClient

const tools = buildTools({ mode: 'tenant', client })
const byName = new Map(tools.map((t) => [t.name, t]))

describe('the generated status enums', () => {
  it('covers the entities that have one', () => {
    // Guards the guard: an empty generated file would make every assertion
    // below pass while advertising nothing.
    expect(Object.keys(STATUS_ENUMS).length).toBeGreaterThan(5)
  })

  it('carries the invoice vocabulary in full', () => {
    expect(STATUS_ENUMS['accounting:invoices']).toEqual([
      'DRAFT',
      'AUTHORIZED',
      'SUBMITTED',
      'PAID',
      'PARTIALLY_PAID',
      'OVERDUE',
      'VOIDED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
      'DELETED',
      'unknown',
    ])
  })

  it('keeps the order vocabulary distinct from the invoice one', () => {
    // They are different state machines, and the decision was to leave both
    // rather than force one word on both. The generated file has to reflect
    // that rather than flattening it.
    expect(STATUS_ENUMS['accounting:orders']).toContain('ACTIVE')
    expect(STATUS_ENUMS['accounting:orders']).not.toContain('AUTHORIZED')
    expect(STATUS_ENUMS['accounting:invoices']).toContain('AUTHORIZED')
    expect(STATUS_ENUMS['accounting:invoices']).not.toContain('ACTIVE')
  })

  it('includes the synthetic `unknown` member', () => {
    // `withUnknown` appends it to every canonical status enum: "the platform
    // said something we could not map". An agent needs to expect it.
    expect(STATUS_ENUMS['accounting:invoices']).toContain('unknown')
  })
})

describe('tool descriptions advertise the values', () => {
  it('names them on the list tool', () => {
    const d = byName.get('list_invoices')!.description
    expect(d).toContain('PARTIALLY_PAID')
    expect(d).toContain('VOIDED')
  })

  it('names them on the get tool too', () => {
    // An agent may reach a record either way and needs the vocabulary both
    // times.
    expect(byName.get('get_invoices')!.description).toContain('PARTIALLY_PAID')
  })

  it('advertises the ORDER vocabulary on order tools, not the invoice one', () => {
    const d = byName.get('list_accounting_orders')?.description ?? byName.get('list_orders')!.description
    expect(d).toContain('COMPLETED')
    expect(d).not.toContain('PARTIALLY_PAID')
  })

  it('leaves tools with no status vocabulary unchanged', () => {
    // Contacts model activity as an `isActive` boolean rather than a status,
    // which is the right shape and must not acquire a fake vocabulary.
    expect(byName.get('list_accounting_contacts')!.description).not.toMatch(/Possible `status` values/)
  })

  it('does not bloat every description with the same list', () => {
    const withVocab = tools.filter((t) => /Possible `status` values/.test(t.description))
    expect(withVocab.length).toBeGreaterThan(4)
    expect(withVocab.length).toBeLessThan(tools.length / 2)
  })
})
