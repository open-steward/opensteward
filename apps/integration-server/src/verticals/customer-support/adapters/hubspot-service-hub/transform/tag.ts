/**
 * HubSpot Service Hub tag transform.
 *
 * HubSpot does not have a standalone tags-list API endpoint. Tags on tickets
 * are stored as the `hs_tag_ids` property (semicolon-separated IDs) with
 * their labels available from the CRM Properties API. This adapter surfaces
 * tags as name-only objects derived from the ticket pipeline's `hs_tags`
 * field or from the Properties enum options.
 *
 * For a richer tag list the caller can hit:
 *   GET /crm/v3/properties/tickets/hs_tag_ids
 * and enumerate the `options` array. This transform handles those option
 * objects returned from that properties endpoint.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Shape returned by GET /crm/v3/properties/tickets/hs_tag_ids options[] */
export interface RawHubspotTagOption {
  value: string
  label?: string
  displayOrder?: number
  hidden?: boolean
  [key: string]: unknown
}

export function transformTag(raw: RawHubspotTagOption): Tag {
  return {
    id: raw.value,
    externalId: raw.value,
    name: pickStr(raw.label) ?? raw.value,
    platform: 'hubspot-service-hub',
    metadata: strMap({
      displayOrder: raw.displayOrder,
    }),
    raw,
  }
}

/**
 * Shape returned by GET /crm/object-tags/2026-09/{objectTypeId}/{tagId}
 * (HubSpot's `PublicCrmObjectTag`). This is a different HubSpot object than
 * the ticket-property option above — `getTag` fetches an actual CRM object
 * tag by id, distinct from `listTags`'s enum-option scrape. See getTag() in
 * index.ts for why the two do not (yet) share ids.
 */
export interface RawHubspotObjectTag {
  id: string
  name: string
  color?: string
  objectTypeId: string
  description?: string
  displayOrder?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformObjectTag(raw: RawHubspotObjectTag): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? raw.id,
    color: pickStr(raw.color),
    platform: 'hubspot-service-hub',
    metadata: strMap({
      objectTypeId: raw.objectTypeId,
      displayOrder: raw.displayOrder,
      description: raw.description,
    }),
    raw,
  }
}
