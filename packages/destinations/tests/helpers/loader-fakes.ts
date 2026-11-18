/**
 * Fakes shared by the loader suites: an in-memory object store standing in
 * for the stage, and row / tombstone factories.
 */
import { expect } from 'vitest'
import type { DeleteSpec, ExportRow, ObjectStoreSink } from '../../src/types'

export interface FakeObjectStore extends ObjectStoreSink {
  files: Map<string, { bytes: Uint8Array; contentType: string }>
  written: string[]
  deleted: string[]
  tested: number
  closed: boolean
}

export function fakeObjectStore(): FakeObjectStore {
  const store: FakeObjectStore = {
    kind: 'object_store',
    files: new Map(),
    written: [],
    deleted: [],
    tested: 0,
    closed: false,
    async writeFile(path, bytes, contentType) {
      store.files.set(path, { bytes, contentType })
      store.written.push(path)
    },
    async deleteFile(path) {
      store.files.delete(path)
      store.deleted.push(path)
    },
    async test() {
      store.tested++
    },
    async close() {
      store.closed = true
    },
  }
  return store
}

export const allowAll = async () => {}

export function row(
  id: string,
  changedAt: number,
  fields: ExportRow['fields'] = {},
  over: Partial<ExportRow> = {},
): ExportRow {
  return {
    _pk: `crm:hubspot:c1:contacts:${id}`,
    connection_id: 'c1',
    owner_tenant_id: 'tenant-a',
    platform: 'hubspot',
    vertical: 'crm',
    resource_type: 'contacts',
    resource_id: id,
    changed_at: changedAt,
    norm_version: 'v1',
    _deleted: false,
    data: JSON.stringify({ id, ...fields }),
    fields,
    ...over,
  }
}

export function del(over: Partial<DeleteSpec>): DeleteSpec {
  return {
    tombstoneId: 1,
    scope: 'record',
    pk: null,
    vertical: 'crm',
    platform: 'hubspot',
    connectionId: 'c1',
    ownerTenantId: 'tenant-a',
    resourceType: 'contacts',
    resourceId: null,
    deletedAt: 0,
    ...over,
  }
}

export const TARGET = { vertical: 'crm', resourceType: 'contacts' }

/** Sequential ids so staged paths and staging tables are predictable. */
export function ids(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

/** Collapse whitespace so SQL assertions read like the statements. */
export function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

/** Matchers for a list of strings that start with these prefixes. */
export function startingWith(prefixes: string[]): unknown[] {
  return prefixes.map((p) =>
    expect.stringMatching(new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)),
  )
}
