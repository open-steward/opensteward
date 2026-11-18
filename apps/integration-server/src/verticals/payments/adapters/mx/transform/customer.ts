import type { Customer } from '../../../schema/customer'

/**
 * UserResponse, from https://docs.mx.com/openapi/platform-api/v20250224.yaml
 * (components.schemas.UserResponse). These five fields are all it documents:
 * no name and no timestamps, and `metadata` is "Additional information you
 * stored about the `user`", typed as a string rather than a map.
 */
export interface RawMxUser {
  email?: string | null
  guid?: string | null
  id?: string | null
  is_disabled?: boolean | null
  metadata?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawMxUser): Customer {
  // guid: "The unique identifier for the user. Defined by MX."
  if (typeof raw.guid !== 'string' || raw.guid === '') {
    throw new Error('MX user has no guid; cannot identify the customer')
  }
  return {
    id: raw.guid,
    externalId: raw.guid,
    email: typeof raw.email === 'string' && raw.email !== '' ? raw.email : undefined,
    gateway: 'mx',
    metadata: {},
    raw,
  }
}
