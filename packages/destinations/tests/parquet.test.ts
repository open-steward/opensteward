/**
 * Parquet round trip through apache-arrow + parquet-wasm: every fixed column,
 * the flattened columns' type inference, NULLs, deletes files, and each
 * compression codec.
 */
import { describe, it, expect } from 'vitest'
import {
  deletesToParquet,
  readParquetRows,
  rowsToParquet,
  rowColumns,
  DELETE_COLUMNS,
} from '../src/writers/parquet'
import { FIXED_COLUMNS } from '../src/transform'
import type { DeleteSpec, ExportRow } from '../src/types'

function row(id: string, fields: ExportRow['fields'], extra: Partial<ExportRow> = {}): ExportRow {
  return {
    _pk: `crm:hubspot:c1:contacts:${id}`,
    connection_id: 'c1',
    owner_tenant_id: 'tenant-a',
    platform: 'hubspot',
    vertical: 'crm',
    resource_type: 'contacts',
    resource_id: id,
    changed_at: 1_700_000_000_000,
    norm_version: 'v1',
    _deleted: false,
    data: JSON.stringify({ id, ...fields }),
    fields,
    ...extra,
  }
}

describe('rowsToParquet', () => {
  it.each(['zstd', 'snappy', 'none'] as const)('round-trips with %s', async (compression) => {
    const rows = [
      row('a', { status: 'active', count: 3, ratio: 0.5, vip: true, mixed: 'x' }),
      row(
        'b',
        { status: 'lead', count: 4, ratio: 2, vip: false, mixed: 7 },
        {
          connection_id: null,
          owner_tenant_id: null,
          norm_version: null,
        },
      ),
      row('c', {}),
    ]
    const bytes = await rowsToParquet(rows, { compression })
    // PAR1 magic at both ends.
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('PAR1')
    expect(Buffer.from(bytes.subarray(bytes.length - 4)).toString()).toBe('PAR1')

    const back = await readParquetRows(bytes)
    expect(back.columns.map((c) => c.name)).toEqual(rowColumns(rows))
    expect(back.columns.map((c) => c.name).slice(0, FIXED_COLUMNS.length)).toEqual([
      ...FIXED_COLUMNS,
    ])
    const types = Object.fromEntries(back.columns.map((c) => [c.name, c.type]))
    expect(types['changed_at']).toBe('Timestamp<MILLISECOND, UTC>')
    expect(types['_deleted']).toBe('Bool')
    expect(types['count']).toBe('Int64')
    expect(types['ratio']).toBe('Float64')
    expect(types['vip']).toBe('Bool')
    expect(types['mixed']).toMatch(/Utf8/)

    expect(back.rows).toHaveLength(3)
    const [a, b, c] = back.rows
    expect(a).toMatchObject({
      _pk: 'crm:hubspot:c1:contacts:a',
      connection_id: 'c1',
      owner_tenant_id: 'tenant-a',
      resource_id: 'a',
      changed_at: 1_700_000_000_000,
      _deleted: false,
      status: 'active',
      count: 3n,
      ratio: 0.5,
      vip: true,
      mixed: 'x',
    })
    expect(JSON.parse(a!['data'] as string)).toEqual({
      id: 'a',
      status: 'active',
      count: 3,
      ratio: 0.5,
      vip: true,
      mixed: 'x',
    })
    expect(b).toMatchObject({ connection_id: null, norm_version: null, mixed: '7', ratio: 2 })
    expect(c).toMatchObject({ status: null, count: null, vip: null })
  })

  it('writes a valid file for zero rows', async () => {
    const back = await readParquetRows(await rowsToParquet([]))
    expect(back.rows).toEqual([])
    expect(back.columns.map((c) => c.name)).toEqual([...FIXED_COLUMNS])
  })
})

describe('deletesToParquet', () => {
  it('round-trips record and scope deletes', async () => {
    const deletes: DeleteSpec[] = [
      {
        tombstoneId: 1,
        scope: 'record',
        pk: 'crm:hubspot:c1:contacts:a',
        vertical: 'crm',
        platform: 'hubspot',
        connectionId: 'c1',
        ownerTenantId: 'tenant-a',
        resourceType: 'contacts',
        resourceId: 'a',
        deletedAt: 1_700_000_000_500,
      },
      {
        tombstoneId: 2,
        scope: 'vertical',
        pk: null,
        vertical: 'crm',
        platform: null,
        connectionId: null,
        ownerTenantId: null,
        resourceType: null,
        resourceId: null,
        deletedAt: 1_700_000_000_900,
      },
    ]
    const back = await readParquetRows(await deletesToParquet(deletes))
    expect(back.columns.map((c) => c.name)).toEqual([...DELETE_COLUMNS])
    expect(back.rows[0]).toMatchObject({
      tombstone_id: 1n,
      scope: 'record',
      _pk: 'crm:hubspot:c1:contacts:a',
      deleted_at: 1_700_000_000_500,
      _deleted: true,
    })
    expect(back.rows[1]).toMatchObject({ scope: 'vertical', _pk: null, resource_type: null })
  })
})
