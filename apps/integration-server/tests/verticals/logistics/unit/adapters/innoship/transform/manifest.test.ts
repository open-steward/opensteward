import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type InnoshipManifest,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(overrides: Partial<InnoshipManifest> = {}): InnoshipManifest {
  return {
    manifestId: 'MAN-001',
    carrierId: 3,
    courierName: 'FAN Courier',
    awbs: ['AWB-001', 'AWB-002', 'AWB-003'],
    status: 'submitted',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('innoship transformManifest', () => {
  it('maps id from manifestId as string', () => {
    expect(transformManifest(makeManifest()).id).toBe('MAN-001')
  })

  it('maps carrierId from carrierId as string', () => {
    expect(transformManifest(makeManifest()).carrierId).toBe('3')
  })

  it('maps shipmentIds from awbs array', () => {
    expect(transformManifest(makeManifest()).shipmentIds).toEqual(['AWB-001', 'AWB-002', 'AWB-003'])
  })

  it('always sets status to SUBMITTED', () => {
    expect(transformManifest(makeManifest()).status).toBe('SUBMITTED')
    expect(transformManifest(makeManifest({ status: 'open' })).status).toBe('SUBMITTED')
  })

  it('maps createdAt as Date', () => {
    expect(transformManifest(makeManifest()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ManifestSchema.parse without throwing', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })

  it('sets shipmentIds to undefined when awbs is empty', () => {
    const result = transformManifest(makeManifest({ awbs: [] }))
    expect(result.shipmentIds).toBeUndefined()
  })

  it('handles numeric manifestId', () => {
    expect(transformManifest(makeManifest({ manifestId: 42 })).id).toBe('42')
  })

  it('handles null manifestId', () => {
    expect(transformManifest(makeManifest({ manifestId: null })).id).toBeUndefined()
  })

  it('handles null carrierId', () => {
    expect(transformManifest(makeManifest({ carrierId: null })).carrierId).toBeUndefined()
  })
})
