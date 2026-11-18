/**
 * Row building: masking happens before anything is exported, flattened
 * columns come from the masked copy, names are `[a-z0-9_]`, and tombstones
 * map to the right delete scope.
 */
import { describe, it, expect } from 'vitest'
import { REDACTED, type ResourceClassification, type StoredResource } from '@opensteward/shared'
import {
  buildExportRow,
  deleteScopeOf,
  flattenScalars,
  flattenedColumnName,
  resourcePk,
  sanitizeColumnName,
  tombstoneToDelete,
  FIXED_COLUMNS,
} from '../src/transform'

const CLS: ResourceClassification = {
  email: { class: 'pii', mask: 'email' },
  name: { class: 'pii', mask: 'name' },
  total: { class: 'financial', mask: 'redact' },
  api_key: { class: 'secret' },
  '*': { class: 'internal' },
}

function item(data: Record<string, unknown>): StoredResource & { pk: string } {
  return {
    pk: 'crm:hubspot:c1:contacts:r1',
    resourceId: 'r1',
    resourceType: 'contacts',
    vertical: 'crm',
    platform: 'hubspot',
    connectionId: 'c1',
    data,
    fetchedAt: 1,
    updatedAt: 2,
    changedAt: 3,
    normVersion: 'v1',
  }
}

describe('sanitizeColumnName', () => {
  it.each([
    ['firstName', 'first_name'],
    ['HTTPStatus', 'http_status'],
    ['billing-address.city', 'billing_address_city'],
    ['__weird__', 'weird'],
    ['9lives', 'f_9lives'],
    ['', 'field'],
    ['Ünïcode', 'n_code'],
  ])('%s → %s', (input, out) => {
    expect(sanitizeColumnName(input)).toBe(out)
    expect(sanitizeColumnName(input)).toMatch(/^[a-z0-9_]+$/)
  })

  it('caps names at 63 characters', () => {
    expect(sanitizeColumnName('a'.repeat(100))).toHaveLength(63)
  })

  it('prefixes flattened names that collide with a fixed column', () => {
    expect(flattenedColumnName('platform')).toBe('field_platform')
    expect(flattenedColumnName('data')).toBe('field_data')
    expect(flattenedColumnName('status')).toBe('status')
  })
})

describe('flattenScalars', () => {
  it('keeps top-level strings, finite numbers and booleans only', () => {
    expect(
      flattenScalars({
        s: 'x',
        n: 1.5,
        b: false,
        nul: null,
        obj: { a: 1 },
        arr: [1],
      }),
    ).toEqual({ s: 'x', n: 1.5, b: false })
  })

  it('resolves sanitisation collisions deterministically (first sorted key wins)', () => {
    expect(flattenScalars({ a_b: 'second', 'a-b': 'first' })).toEqual({ a_b: 'first' })
  })

  it('returns nothing for non-objects', () => {
    expect(flattenScalars(null)).toEqual({})
    expect(flattenScalars([1, 2])).toEqual({})
  })
})

describe('buildExportRow', () => {
  const record = {
    id: 'r1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    total: 100,
    api_key: 'sk_live_123',
    status: 'active',
    platform: 'upstream-value',
    metadata: { raw: 'upstream' },
  }

  it('masks PII, strips secrets and flattens from the masked copy', () => {
    const row = buildExportRow(item(record), {
      ownerTenantId: 'tenant-a',
      classification: CLS,
      mask: {},
    })
    expect(row._pk).toBe('crm:hubspot:c1:contacts:r1')
    expect(row.owner_tenant_id).toBe('tenant-a')
    expect(row.changed_at).toBe(3)
    expect(row._deleted).toBe(false)
    const data = JSON.parse(row.data) as Record<string, unknown>
    expect(data['email']).toBe('j***@example.com')
    expect(data['name']).toBe('J*** D***')
    expect(data['api_key']).toBeUndefined()
    expect(data['metadata']).toBe(REDACTED)
    expect(data['total']).toBe(100)
    expect(row.fields['email']).toBe('j***@example.com')
    expect(row.fields['api_key']).toBeUndefined()
    expect(row.fields['field_platform']).toBe('upstream-value')
    expect(row.platform).toBe('hubspot')
    // No unmasked value anywhere in the row.
    expect(JSON.stringify(row)).not.toContain('jane@example.com')
    expect(JSON.stringify(row)).not.toContain('sk_live_123')
  })

  it('reveals PII with include_pii, never secrets', () => {
    const row = buildExportRow(item(record), {
      ownerTenantId: null,
      classification: CLS,
      mask: { revealPii: true },
    })
    expect(row.fields['email']).toBe('jane@example.com')
    expect(JSON.stringify(row)).not.toContain('sk_live_123')
  })

  it('masks financial fields when the scope asks', () => {
    const row = buildExportRow(item(record), {
      ownerTenantId: null,
      classification: CLS,
      mask: { maskFinancial: true },
    })
    expect(row.fields['total']).toBe(REDACTED)
  })

  it('builds the store pk when the item has none', () => {
    const { pk: _pk, ...noPk } = item(record)
    const row = buildExportRow(noPk, { ownerTenantId: null, classification: CLS, mask: {} })
    expect(row._pk).toBe(resourcePk('crm', 'hubspot', 'c1', 'contacts', 'r1'))
  })

  it('fixed columns are exactly the documented set', () => {
    expect(FIXED_COLUMNS).toEqual([
      '_pk',
      'connection_id',
      'owner_tenant_id',
      'platform',
      'vertical',
      'resource_type',
      'resource_id',
      'changed_at',
      'norm_version',
      '_deleted',
      'data',
    ])
  })
})

describe('tombstones', () => {
  const base = {
    id: 7,
    vertical: 'crm',
    platform: 'hubspot',
    connectionId: 'c1',
    resourceType: 'contacts',
    resourceId: 'r1',
    deletedAt: 99,
  }
  it('classifies the delete scope by which columns are NULL', () => {
    expect(deleteScopeOf(base)).toBe('record')
    expect(deleteScopeOf({ ...base, resourceType: null, resourceId: null })).toBe('connection')
    expect(
      deleteScopeOf({
        ...base,
        platform: null,
        connectionId: null,
        resourceType: null,
        resourceId: null,
      }),
    ).toBe('vertical')
    expect(
      deleteScopeOf({
        ...base,
        vertical: null,
        platform: null,
        connectionId: null,
        resourceType: null,
        resourceId: null,
      }),
    ).toBe('all')
  })

  it('a record delete carries the row pk', () => {
    const d = tombstoneToDelete(base, 'tenant-a')
    expect(d).toMatchObject({
      scope: 'record',
      pk: 'crm:hubspot:c1:contacts:r1',
      ownerTenantId: 'tenant-a',
      tombstoneId: 7,
      deletedAt: 99,
    })
    expect(tombstoneToDelete({ ...base, resourceId: null, resourceType: null }, null).pk).toBeNull()
  })
})
