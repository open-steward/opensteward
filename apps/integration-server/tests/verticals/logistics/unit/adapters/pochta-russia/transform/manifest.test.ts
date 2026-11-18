import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type PochtaRussiaBatch,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

describe('transformManifest', () => {
  it('maps batch-name to id and manifestNumber', () => {
    const raw: PochtaRussiaBatch = {
      'batch-name': 'BATCH-2024-001',
      'batch-status': 'CREATED',
      'shipment-count': 5,
      'created-on': '2024-03-01T00:00:00Z',
    }
    const result = transformManifest(raw)
    expect(result.id).toBe('BATCH-2024-001')
    expect(result.manifestNumber).toBe('BATCH-2024-001')
  })

  it('maps ACCEPTED→SUBMITTED and ARCHIVED→CLOSED', () => {
    const accepted = transformManifest({ 'batch-status': 'ACCEPTED' })
    expect(accepted.status).toBe('SUBMITTED')

    const archived = transformManifest({ 'batch-status': 'ARCHIVED' })
    expect(archived.status).toBe('CLOSED')
  })

  it('maps CREATED→OPEN and unknown→OPEN', () => {
    expect(transformManifest({ 'batch-status': 'CREATED' }).status).toBe('OPEN')
    expect(transformManifest({ 'batch-status': 'WHATEVER' }).status).toBe('OPEN')
  })

  it('sets labelCount from shipment-count', () => {
    const raw: PochtaRussiaBatch = { 'shipment-count': 12 }
    expect(transformManifest(raw).labelCount).toBe(12)
  })

  it('sets submittedAt for SUBMITTED status', () => {
    const raw: PochtaRussiaBatch = {
      'batch-status': 'SENT',
      'send-date': '2024-03-01T00:00:00Z',
    }
    const result = transformManifest(raw)
    expect(result.submittedAt).toBeInstanceOf(Date)
  })

  it('carrierId is pochta-russia', () => {
    expect(transformManifest({}).carrierId).toBe('pochta-russia')
  })

  it('passes schema parse', () => {
    const raw: PochtaRussiaBatch = {
      'batch-name': 'BATCH-001',
      'batch-status': 'CREATED',
      'shipment-count': 3,
      'created-on': '2024-03-01T00:00:00Z',
    }
    const result = transformManifest(raw)
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
