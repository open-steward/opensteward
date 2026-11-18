/**
 * The analytics view catalog: names, SQL types, masks and determinism, the
 * breaking/additive diff, and the real registry building cleanly.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  buildCatalog,
  buildCatalogFrom,
  canonicalJson,
  diffCatalogs,
  sqlName,
  sqlTypeOf,
  viewName,
} from '../../src/analytics/view-catalog'
import { fixtureCatalog, FIXTURE_SOURCES } from './fixtures'

describe('sqlName / viewName', () => {
  it('snake_cases camelCase and sanitises', () => {
    expect(sqlName('billingAddress')).toBe('billing_address')
    expect(sqlName('HTTPStatus')).toBe('http_status')
    expect(sqlName('a-b c')).toBe('a_b_c')
    expect(sqlName('9lives')).toBe('f_9lives')
    expect(sqlName('"; DROP TABLE x; --')).toBe('drop_table_x')
    expect(sqlName('')).toBe('field')
    expect(sqlName('x'.repeat(100))).toHaveLength(63)
  })

  it('names a view <vertical>_<resource_type>', () => {
    expect(viewName('customer-support', 'tickets')).toBe('customer_support_tickets')
    expect(viewName('inventory', 'purchaseOrders')).toBe('inventory_purchase_orders')
  })
})

describe('sqlTypeOf', () => {
  it('maps Zod shapes to SQL types', () => {
    expect(sqlTypeOf(z.string())).toBe('text')
    expect(sqlTypeOf(z.string().nullish())).toBe('text')
    expect(sqlTypeOf(z.iso.datetime().nullish())).toBe('timestamptz')
    expect(sqlTypeOf(z.iso.date())).toBe('date')
    expect(sqlTypeOf(z.string(), 'closed_at')).toBe('timestamptz')
    expect(sqlTypeOf(z.string(), 'dueDate')).toBe('timestamptz')
    expect(sqlTypeOf(z.number().int())).toBe('numeric')
    expect(sqlTypeOf(z.boolean().default(false))).toBe('boolean')
    expect(sqlTypeOf(z.enum(['a', 'b']))).toBe('text')
    expect(sqlTypeOf(z.date())).toBe('timestamptz')
    expect(sqlTypeOf(z.union([z.date(), z.iso.date()]))).toBe('timestamptz')
    expect(sqlTypeOf(z.union([z.string(), z.number()]))).toBe('jsonb')
    expect(sqlTypeOf(z.object({ a: z.string() }))).toBe('jsonb')
    expect(sqlTypeOf(z.array(z.string()))).toBe('jsonb')
    expect(sqlTypeOf(z.record(z.string(), z.unknown()))).toBe('jsonb')
    expect(sqlTypeOf(z.unknown())).toBe('jsonb')
    expect(sqlTypeOf({})).toBe('jsonb')
  })
})

describe('buildCatalogFrom', () => {
  const catalog = fixtureCatalog()
  const contacts = catalog.views.find((v) => v.name === 'crm_contacts')!
  const charges = catalog.views.find((v) => v.name === 'payments_charges')!
  const col = (name: string) => contacts.columns.find((c) => c.name === name)

  it('starts with the fixed store columns and ends with data', () => {
    expect(contacts.columns.slice(0, 9).map((c) => c.name)).toEqual([
      'connection_id',
      'owner_tenant_id',
      'platform',
      'vertical',
      'resource_id',
      'fetched_at',
      'updated_at',
      'changed_at',
      'norm_version',
    ])
    expect(contacts.columns.at(-1)).toMatchObject({ name: 'data', type: 'jsonb', class: 'pii' })
  })

  it('renames fields that collide with store columns', () => {
    expect(col('record_updated_at')).toMatchObject({ field: 'updated_at', type: 'timestamptz' })
    expect(col('record_data')).toMatchObject({ field: 'data', type: 'text' })
    expect(col('created_at')).toMatchObject({ field: 'created_at' })
    expect(col('birth_date')).toMatchObject({ field: 'birthDate', type: 'date' })
  })

  it('omits secrets, carries class and mask, types masked scalars as text', () => {
    expect(col('api_token')).toBeUndefined()
    expect(col('email')).toMatchObject({
      class: 'pii',
      mask: 'email',
      type: 'text',
      maskedType: 'text',
    })
    expect(col('birth_date')).toMatchObject({
      class: 'pii',
      mask: 'redact',
      type: 'date',
      maskedType: 'text',
    })
    expect(col('address')).toMatchObject({
      class: 'pii',
      mask: 'address',
      type: 'jsonb',
      maskedType: 'jsonb',
    })
    expect(col('amount')).toMatchObject({
      class: 'financial',
      type: 'numeric',
      maskedType: 'numeric',
    })
    expect(col('amount')!.mask).toBeUndefined()
    // Nested PII makes the column pii, but the column itself is not masked whole.
    expect(col('telephones')).toMatchObject({ class: 'pii', type: 'jsonb' })
    expect(col('telephones')!.mask).toBeUndefined()
    expect(col('metadata')).toMatchObject({ class: 'pii', mask: 'redact', type: 'jsonb' })
  })

  it('strips the payments upstream payload from SQL altogether', () => {
    expect(charges.stripFields).toEqual(['raw'])
    expect(charges.columns.find((c) => c.name === 'raw')).toBeUndefined()
  })

  it('lists the system views', () => {
    expect(catalog.views.filter((v) => v.kind === 'system').map((v) => v.name)).toEqual([
      'connections',
      'sync_status',
      'tenants',
    ])
  })

  it('is deterministic: same sources, same JSON and hash', () => {
    const again = buildCatalogFrom([...FIXTURE_SOURCES].reverse())
    expect(canonicalJson(again)).toBe(canonicalJson(catalog))
    expect(again.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(again.hash).toBe(catalog.hash)
  })

  it('rejects two resource types mapping to one view name', () => {
    expect(() =>
      buildCatalogFrom([FIXTURE_SOURCES[0]!, { ...FIXTURE_SOURCES[0]!, resourceType: 'Contacts' }]),
    ).toThrow(/collision/)
  })
})

describe('diffCatalogs', () => {
  const base = fixtureCatalog()
  const clone = () => JSON.parse(JSON.stringify(base)) as typeof base

  it('no change → nothing', () => {
    expect(diffCatalogs(base, clone())).toEqual({
      breaking: false,
      breakingChanges: [],
      additiveChanges: [],
    })
  })

  it('a new column or view is additive', () => {
    const next = clone()
    next.views[0]!.columns.push({ ...next.views[0]!.columns[0]!, name: 'extra' })
    next.views.push({ ...next.views[0]!, name: 'zzz_new' })
    const d = diffCatalogs(base, next)
    expect(d.breaking).toBe(false)
    expect(d.additiveChanges).toEqual([
      `column ${next.views[0]!.name}.extra added`,
      'view zzz_new added',
    ])
  })

  it('a removed column, a removed view or a type change is breaking', () => {
    const next = clone()
    const contacts = next.views.find((v) => v.name === 'crm_contacts')!
    contacts.columns = contacts.columns.filter((c) => c.name !== 'email')
    contacts.columns.find((c) => c.name === 'amount')!.type = 'text'
    next.views = next.views.filter((v) => v.name !== 'payments_charges')
    const d = diffCatalogs(base, next)
    expect(d.breaking).toBe(true)
    expect(d.breakingChanges).toEqual([
      'column crm_contacts.amount type numeric/numeric → text/numeric',
      'column crm_contacts.email removed',
      'view payments_charges removed',
    ])
  })

  it('a classification change alone is neither', () => {
    const next = clone()
    next.views.find((v) => v.name === 'crm_contacts')!.rules = []
    expect(diffCatalogs(base, next).breaking).toBe(false)
  })
})

describe('buildCatalog (the real registry)', () => {
  it('builds every listable resource type with unique, valid names', () => {
    const catalog = buildCatalog()
    const resources = catalog.views.filter((v) => v.kind === 'resource')
    expect(resources.length).toBeGreaterThan(50)
    for (const v of catalog.views) {
      expect(v.name).toMatch(/^[a-z][a-z0-9_]{0,62}$/)
      const names = v.columns.map((c) => c.name)
      expect(new Set(names).size).toBe(names.length)
      for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]{0,62}$/)
    }
    expect(buildCatalog().hash).toBe(catalog.hash)
  })
})
