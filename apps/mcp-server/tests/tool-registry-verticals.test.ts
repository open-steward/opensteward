/**
 * buildTools({ verticals }) registers resource tools only for the verticals the
 * deployment reports (GET /v1/capabilities). Names never depend on the list.
 */
import { describe, it, expect } from 'vitest'
import { buildTools, registeredVerticals } from '../src/tool-registry.js'
import { RESOURCES } from '../src/resources.js'
import { RestClient } from '../src/rest-client.js'

const tenant = new RestClient({ baseUrl: 'http://stub.local', token: 'osk_stub', mode: 'tenant' })
const endUser = new RestClient({
  baseUrl: 'http://stub.local',
  token: 'eut_stub',
  mode: 'end-user',
})
const TENANT_CUSTOMER = ['list_customers', 'get_customer', 'list_customer_connections']
const END_USER_CUSTOMER = ['get_me', 'list_my_connections']
const count = (vs: readonly string[]) =>
  RESOURCES.filter((r) => vs.includes(r.vertical)).reduce((n, r) => n + (r.singleton ? 1 : 2), 0)
const names = (verticals?: readonly string[]) =>
  new Set(buildTools({ mode: 'tenant', client: tenant, verticals }).map((t) => t.name))

describe('buildTools — vertical filtering', () => {
  it('registers only the listed verticals [L7:G03]', () => {
    const n = names(['accounting', 'crm'])
    expect(n.size).toBe(TENANT_CUSTOMER.length + count(['accounting', 'crm'])) // 3 + 25 + 12
    for (const t of ['list_invoices', 'get_organization', 'list_deals']) expect(n.has(t)).toBe(true)
    for (const t of ['list_charges', 'list_tickets', 'list_ecommerce_orders']) {
      expect(n.has(t)).toBe(false)
    }
  })

  it('keeps names stable: conflicts come from the full catalogue [L7:G03]', () => {
    const n = names(['accounting'])
    expect(n.has('list_accounting_contacts')).toBe(true)
    expect(n.has('list_contacts')).toBe(false)
    expect(n.has('list_accounting_orders')).toBe(true)
  })

  it('undefined (unknown) registers every tool', () => {
    const all = [...new Set(RESOURCES.map((r) => r.vertical))]
    expect(names(undefined).size).toBe(TENANT_CUSTOMER.length + count(all))
    expect(names(undefined).size).toBe(154)
  })

  it('[] leaves only customer-level tools', () => {
    expect([...names([])].sort()).toEqual([...TENANT_CUSTOMER].sort())
  })

  // The next two cases also pin the filter itself: without it every list
  // registers all 154 tools, so the exact sizes and the absent tools fail.
  it('handles the hyphenated vertical', () => {
    const n = names(['customer-support'])
    expect(n.has('list_tickets')).toBe(true)
    expect(n.size).toBe(TENANT_CUSTOMER.length + count(['customer-support']))
    for (const t of ['list_invoices', 'list_deals', 'list_charges']) expect(n.has(t)).toBe(false)
  })

  it('ignores names the catalogue does not know', () => {
    const n = names(['accounting', 'hris', 'vertical:crm'])
    expect(n).toEqual(names(['accounting']))
    expect(n.size).toBe(TENANT_CUSTOMER.length + count(['accounting']))
    // 'vertical:crm' is a feature string, not a vertical: it registers no crm tool.
    expect(n.has('list_deals')).toBe(false)
  })

  it('end-user mode filters resources and keeps its own customer tools', () => {
    const n = new Set(
      buildTools({ mode: 'end-user', client: endUser, verticals: ['crm'] }).map((t) => t.name),
    )
    expect(n.size).toBe(END_USER_CUSTOMER.length + count(['crm']))
    expect(n.has('get_me') && n.has('list_deals') && !n.has('list_invoices')).toBe(true)
  })

  it('end-user mode with [] leaves only get_me and list_my_connections', () => {
    const n = buildTools({ mode: 'end-user', client: endUser, verticals: [] }).map((t) => t.name)
    expect(n.sort()).toEqual([...END_USER_CUSTOMER].sort())
  })
})

describe('registeredVerticals — what the ready line counts', () => {
  it('keeps the known verticals, once each, and drops the rest', () => {
    expect(
      registeredVerticals(['accounting', 'hris', 'accounting', 'vertical:crm', 'crm']),
    ).toEqual(['accounting', 'crm'])
    expect(registeredVerticals(['customer-support'])).toEqual(['customer-support'])
    expect(registeredVerticals([])).toEqual([])
  })
})
