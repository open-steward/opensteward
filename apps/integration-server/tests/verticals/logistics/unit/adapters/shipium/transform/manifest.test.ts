import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  transformManifestFromRequest,
  type ShipiumManifestRaw,
  type ShipiumManifestRequest,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeRaw(overrides: Partial<ShipiumManifestRaw> = {}): ShipiumManifestRaw {
  return {
    shipiumManifestId: 'mfst-001',
    manifestJobId: 'job-001',
    carrierId: 'fedex',
    carrierAccountId: 'acct-abc',
    submittedAt: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    status: 'submitted',
    ...overrides,
  }
}

function makeRequest(overrides: Partial<ShipiumManifestRequest> = {}): ShipiumManifestRequest {
  return {
    carrierId: 'fedex',
    carrierAccountId: 'acct-abc',
    fulfillmentContextId: 'ctx-001',
    postalCode: '94114',
    countryCode: 'US',
    ...overrides,
  }
}

describe('transformManifest', () => {
  it('maps id from shipiumManifestId', () => {
    const result = transformManifest(makeRaw())
    expect(result.id).toBe('mfst-001')
  })

  it('maps carrierId from raw carrierId', () => {
    const result = transformManifest(makeRaw())
    expect(result.carrierId).toBe('fedex')
  })

  it('always emits SUBMITTED status', () => {
    const result = transformManifest(makeRaw({ status: 'open' }))
    expect(result.status).toBe('SUBMITTED')
  })

  it('parses submittedAt as Date', () => {
    const result = transformManifest(makeRaw())
    expect(result.submittedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('falls back to manifestJobId when shipiumManifestId absent', () => {
    const result = transformManifest(makeRaw({ shipiumManifestId: null }))
    expect(result.id).toBe('job-001')
  })

  it('passes schema validation', () => {
    const result = transformManifest(makeRaw())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformManifest(raw).metadata).toBe(raw)
  })
})

describe('transformManifestFromRequest', () => {
  it('maps carrierId from request', () => {
    const req = makeRequest()
    const result = transformManifestFromRequest(req)
    expect(result.carrierId).toBe('fedex')
  })

  it('always sets status to SUBMITTED', () => {
    const result = transformManifestFromRequest(makeRequest())
    expect(result.status).toBe('SUBMITTED')
  })

  it('uses provided submittedAt date', () => {
    const at = new Date('2024-03-01T00:00:00Z')
    const result = transformManifestFromRequest(makeRequest(), at)
    expect(result.submittedAt).toEqual(at)
    expect(result.createdAt).toEqual(at)
  })

  it('falls back to a current date if submittedAt not provided', () => {
    const before = Date.now()
    const result = transformManifestFromRequest(makeRequest())
    const after = Date.now()
    expect(result.submittedAt).toBeInstanceOf(Date)
    expect(result.submittedAt!.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.submittedAt!.getTime()).toBeLessThanOrEqual(after)
  })

  it('passes schema validation', () => {
    const result = transformManifestFromRequest(makeRequest(), new Date('2024-03-01T00:00:00Z'))
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
