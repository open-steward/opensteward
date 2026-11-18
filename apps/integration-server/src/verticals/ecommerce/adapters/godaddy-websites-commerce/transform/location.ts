/**
 * GoDaddy catalog Location → canonical Location.
 *
 * "A location represents the physical location of an inventory." — `Location`
 * on https://developer.godaddy.com/docs/references/rest/catalog/inventory/queries/location
 *
 * `address` is typed `Address` there, but that type's fields are not listed
 * anywhere in the reference, so it is not selected or mapped.
 */

import type { Location } from '../../../schema/location'

/** The `Location` fields `LOCATION_FIELDS` selects. */
export interface RawGoDaddyLocation {
  /** "The globally-unique ID of the Location." */
  id: string
  /** "A unique and human-friendly name of the Location." */
  name: string
  /** "The display name of the Location." */
  label?: string | null
  /** "The status of the location, one of `ACTIVE`, `INACTIVE`, `ARCHIVED`." */
  status: string
  createdAt: string
  updatedAt: string
}

/** GraphQL selection for a `Location`, kept beside the type it fills. */
export const LOCATION_FIELDS = 'id name label status createdAt updatedAt'

export function transformLocation(raw: RawGoDaddyLocation): Location {
  return {
    id: raw.id,
    name: raw.label ?? raw.name,
    active: raw.status === 'ACTIVE',
    metadata: { ...raw },
  }
}
