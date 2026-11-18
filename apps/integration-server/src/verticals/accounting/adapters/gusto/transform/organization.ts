import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface GustoOrganization {
  id: string | number
  name: string
  ein?: string
  phone?: string
  email?: string
  locations?: Array<{
    street_1?: string
    street_2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export function transformOrganization(raw: GustoOrganization): Organization {
  const primaryLocation = raw.locations?.[0]

  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.ein || undefined,
    address: primaryLocation
      ? toAddress({
          address1: primaryLocation.street_1,
          address2: primaryLocation.street_2,
          city: primaryLocation.city,
          region: primaryLocation.state,
          postalCode: primaryLocation.zip,
          country: primaryLocation.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
