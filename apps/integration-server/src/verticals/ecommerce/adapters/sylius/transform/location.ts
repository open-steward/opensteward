/**
 * Sylius Channel -> canonical Location.
 *
 * Sylius doesn't have dedicated stock locations by default. Channels
 * serve as the closest analogue — they define selling contexts with
 * distinct configuration. We map channels to locations for API
 * consistency.
 *
 * Admin API endpoint: `/api/v2/admin/channels`
 */

import type { Location } from '../../../schema/location'

export interface RawSyliusChannel {
  id: number | string
  code: string
  name?: string
  enabled?: boolean
  hostname?: string | null
  description?: string | null
  contactEmail?: string | null
  contactPhoneNumber?: string | null
  defaultLocale?: { code?: string } | string | null
  baseCurrency?: { code?: string } | string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawSyliusChannel): Location {
  return {
    id: raw.code,
    name: raw.name ?? raw.code,
    active: raw.enabled,
    phone: raw.contactPhoneNumber ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}
