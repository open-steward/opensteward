import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { strMap } from './shared'

/**
 * An eWAY token customer, returned by `GET /Customer/{tokenCustomerID}` and
 * echoed inside the `Customer` block of every transaction response. eWAY uses
 * PascalCase field names and a flat address (Street1/Street2/City/State/…)
 * rather than a nested object.
 */
export interface RawEwayCustomer {
  TokenCustomerID?: number | string | null
  Reference?: string | null
  Title?: string | null
  FirstName?: string | null
  LastName?: string | null
  CompanyName?: string | null
  JobDescription?: string | null
  Email?: string | null
  Phone?: string | null
  Mobile?: string | null
  Fax?: string | null
  Url?: string | null
  Comments?: string | null
  Street1?: string | null
  Street2?: string | null
  City?: string | null
  State?: string | null
  PostalCode?: string | null
  Country?: string | null
  CardDetails?: {
    Number?: string | null
    Name?: string | null
    CardType?: string | null
  } | null
  [k: string]: unknown
}

function mapAddress(raw: RawEwayCustomer): Address | undefined {
  const line1 = raw.Street1 ?? undefined
  const city = raw.City ?? undefined
  const postalCode = raw.PostalCode ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.Street2 ?? undefined,
    city,
    region: raw.State ?? undefined,
    postalCode,
    // eWAY returns ISO 3166 alpha-2 lower-cased (e.g. "au"); canonical is upper.
    country: country ? country.toUpperCase() : undefined,
  }
}

export function transformCustomer(raw: RawEwayCustomer): Customer {
  const id = String(raw.TokenCustomerID ?? raw.Reference ?? '')
  const name = [raw.FirstName, raw.LastName].filter(Boolean).join(' ').trim()
  return {
    id,
    externalId: id,
    email: raw.Email ?? undefined,
    name: name || undefined,
    phone: raw.Phone ?? raw.Mobile ?? undefined,
    description: raw.JobDescription ?? undefined,
    billingAddress: mapAddress(raw),
    gateway: 'eway',
    metadata: strMap({
      reference: raw.Reference,
      title: raw.Title,
      company_name: raw.CompanyName,
      job_description: raw.JobDescription,
      mobile: raw.Mobile,
      fax: raw.Fax,
      url: raw.Url,
      comments: raw.Comments,
      card_type: raw.CardDetails?.CardType,
      card_number: raw.CardDetails?.Number,
    }),
    raw,
  }
}
