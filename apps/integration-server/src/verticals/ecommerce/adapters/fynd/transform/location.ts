/**
 * Fynd company location (store/warehouse) ⇄ canonical Location.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/CompanyProfile/CompanyProfilePlatformClient.js` —
 * `getLocations` (`GET company-profile/v2.0/company/{id}/location`) and
 * `getLocationDetail` (`GET company-profile/v2.0/company/{id}/location/{locationId}`);
 * shape from `CompanyProfilePlatformModel.GetLocationSchema()` /
 * `GetAddressSchema()`.
 *
 * `name` is `display_name` only, not a `display_name || name` guess:
 * `GetLocationSchema` declares both `name` and `display_name` `.required()`,
 * so there is no ambiguity to resolve — `display_name` is the
 * customer-facing one.
 *
 * `active`/`isFulfillmentCenter` are left unmapped: `stage` and
 * `store_type` are untyped free strings in the schema
 * (`Joi.string().allow("")`, no enum), so there are no verified values to
 * match against.
 *
 * Read-only: the canonical `EcommerceAdapter` interface only declares
 * `listLocations`/`getLocation` (no create/update/delete), so this resource
 * is fully covered despite the platform also exposing writes we don't call.
 */
import type { Location } from '../../../schema/location'

export interface RawFyndAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  pincode?: string
  country_code?: string
}

export interface RawFyndLocation {
  uid: number
  display_name: string
  phone_number?: string
  address?: RawFyndAddress
}

export function transformLocation(raw: RawFyndLocation): Location {
  if (raw.uid == null) throw new Error('Fynd location is missing uid')
  const address = raw.address
    ? {
        line1: raw.address.address1 || undefined,
        line2: raw.address.address2 || undefined,
        city: raw.address.city || undefined,
        region: raw.address.state || undefined,
        postalCode: raw.address.pincode || undefined,
        country: raw.address.country_code || undefined,
      }
    : undefined
  return {
    id: String(raw.uid),
    name: raw.display_name,
    address,
    phone: raw.phone_number || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
