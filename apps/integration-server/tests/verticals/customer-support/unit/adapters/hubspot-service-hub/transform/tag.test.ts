/**
 * HubSpot Service Hub tag transform.
 *
 * `transformTag` handles the ticket-property enum-option shape returned by
 * `listTags` (GET /crm/v3/properties/tickets/hs_tag_ids). `transformObjectTag`
 * is a different HubSpot object entirely: `PublicCrmObjectTag`, returned by
 * `getTag` (GET /crm/object-tags/2026-09/{objectTypeId}/{tagId}).
 * These pin both, since the two ids live in different HubSpot
 * namespaces and are not guaranteed to round-trip against each other.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTag,
  transformObjectTag,
  type RawHubspotTagOption,
  type RawHubspotObjectTag,
} from '../../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('hubspot-service-hub transformTag (property enum option)', () => {
  it('uses the option value as id/externalId and its label as name', () => {
    const raw: RawHubspotTagOption = { value: 'urgent', label: 'Urgent', displayOrder: 2 }
    const result = transformTag(raw)
    expect(result.id).toBe('urgent')
    expect(result.externalId).toBe('urgent')
    expect(result.name).toBe('Urgent')
    expect(result.metadata['displayOrder']).toBe('2')
  })

  it('produces a TagSchema-valid result', () => {
    const raw: RawHubspotTagOption = { value: 'billing' }
    expect(() => TagSchema.parse(transformTag(raw))).not.toThrow()
  })
})

describe('hubspot-service-hub transformObjectTag (PublicCrmObjectTag, getTag)', () => {
  const raw: RawHubspotObjectTag = {
    id: '4001',
    name: 'VIP customer',
    color: '#e53935',
    objectTypeId: '0-5',
    description: 'High-priority ticket tag',
    displayOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }

  it('maps id and externalId from raw.id (the object-tag id, not the property option value)', () => {
    const result = transformObjectTag(raw)
    expect(result.id).toBe('4001')
    expect(result.externalId).toBe('4001')
  })

  it('maps name', () => {
    expect(transformObjectTag(raw).name).toBe('VIP customer')
  })

  it('maps color onto the schema color field, not just metadata', () => {
    expect(transformObjectTag(raw).color).toBe('#e53935')
  })

  it('places objectTypeId, displayOrder and description in metadata', () => {
    const result = transformObjectTag(raw)
    expect(result.metadata['objectTypeId']).toBe('0-5')
    expect(result.metadata['displayOrder']).toBe('1')
    expect(result.metadata['description']).toBe('High-priority ticket tag')
  })

  it('sets platform to hubspot-service-hub', () => {
    expect(transformObjectTag(raw).platform).toBe('hubspot-service-hub')
  })

  it('keeps the raw object by reference', () => {
    expect(transformObjectTag(raw).raw).toBe(raw)
  })

  it('produces a TagSchema-valid result', () => {
    expect(() => TagSchema.parse(transformObjectTag(raw))).not.toThrow()
  })

  it('falls back to id when name is missing, and drops color/description from metadata when absent', () => {
    // The vendor spec marks `name` required, but the transform stays
    // defensive about wire data that doesn't match the spec.
    const minimal = { id: '9', objectTypeId: '0-5' } as RawHubspotObjectTag
    const result = transformObjectTag(minimal)
    expect(result.name).toBe('9')
    expect(result.color).toBeUndefined()
    expect(result.metadata['description']).toBeUndefined()
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
