import { describe, it, expect } from 'vitest'
import {
  transformImport,
  type SynderImport,
} from '../../../../../../../src/verticals/accounting/adapters/synder/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<SynderImport> = {}): SynderImport {
  return {
    id: 'import-001',
    status: 'FINISHED',
    entityName: 'Invoice',
    mappingId: 'map-abc',
    dateCreated: '2024-01-15T09:30:00.000Z',
    dateFinished: '2024-01-15T10:00:00.000Z',
    summary: { total: 100, succeeded: 98, failed: 2, warnings: 1 },
    company: { id: 'co-001', name: 'Acme QB' },
    ...overrides,
  }
}

describe('synder transformImport', () => {
  it('maps id', () => {
    expect(transformImport(makeRaw()).id).toBe('import-001')
  })

  it('maps FINISHED status to type IMPORT_FINISHED', () => {
    expect(transformImport(makeRaw({ status: 'FINISHED' })).type).toBe('IMPORT_FINISHED')
  })

  it('maps FAILED status to IMPORT_FAILED', () => {
    expect(transformImport(makeRaw({ status: 'FAILED' })).type).toBe('IMPORT_FAILED')
  })

  it('maps IN_PROGRESS status to IMPORT_IN_PROGRESS', () => {
    expect(transformImport(makeRaw({ status: 'IN_PROGRESS' })).type).toBe('IMPORT_IN_PROGRESS')
  })

  it('maps SCHEDULED status', () => {
    expect(transformImport(makeRaw({ status: 'SCHEDULED' })).type).toBe('IMPORT_SCHEDULED')
  })

  it('maps FINISHED_WITH_WARNINGS', () => {
    expect(transformImport(makeRaw({ status: 'FINISHED_WITH_WARNINGS' })).type).toBe(
      'IMPORT_FINISHED_WITH_WARNINGS',
    )
  })

  it('maps entityName to memo', () => {
    expect(transformImport(makeRaw()).memo).toBe('Invoice')
  })

  it('maps mappingId to reference', () => {
    expect(transformImport(makeRaw()).reference).toBe('map-abc')
  })

  it('maps dateCreated to createdAt as Date', () => {
    expect(transformImport(makeRaw()).createdAt).toEqual(new Date('2024-01-15T09:30:00.000Z'))
  })

  it('maps dateFinished to updatedAt as Date', () => {
    expect(transformImport(makeRaw()).updatedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'))
  })

  it('omits updatedAt when dateFinished is null', () => {
    expect(transformImport(makeRaw({ dateFinished: null })).updatedAt).toBeUndefined()
  })

  it('does not emit totalAmount (summary.total is record count, not money)', () => {
    // Verified in source: totalAmount intentionally omitted to avoid
    // treating record count as monetary minor units
    expect(transformImport(makeRaw()).totalAmount).toBeUndefined()
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformImport(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformImport(raw).metadata).toBe(raw)
  })
})
