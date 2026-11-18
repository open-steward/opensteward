import type { Company } from '../../../schema/company'

/**
 * In LACRM, companies are Contacts with IsCompany = true.
 * The CompanyName field holds the business name.
 */
export interface RawLacrmCompany {
  ContactId: string
  Name?: string
  CompanyName?: string
  IsCompany?: boolean
  Email?: Array<{ Text: string; Type?: string }>
  Phone?: Array<{ Text: string; Type?: string }>
  Address?: Array<{
    Street?: string
    City?: string
    State?: string
    Zip?: string
    Country?: string
    Type?: string
  }>
  Website?: string
  AssignedTo?: string
  DateCreated?: string
  DateModified?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawLacrmCompany): Company {
  const addr = raw.Address?.[0]
  return {
    id: raw.ContactId,
    name: raw.CompanyName ?? raw.Name ?? '',
    domain: raw.Website,
    phone: raw.Phone?.[0]?.Text,
    owner_id: raw.AssignedTo,
    address: addr
      ? {
          line1: addr.Street,
          city: addr.City,
          region: addr.State,
          postalCode: addr.Zip,
          country: addr.Country,
        }
      : undefined,
    created_at: raw.DateCreated,
    updated_at: raw.DateModified,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    IsCompany: true,
  }
  if (data.name !== undefined) {
    out.Name = data.name
    out.CompanyName = data.name
  }
  if (data.domain !== undefined) out.Website = data.domain
  if (data.phone !== undefined) out.Phone = [{ Text: data.phone, Type: 'Business' }]
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  if (data.address) {
    out.Address = [
      {
        Street: data.address.line1,
        City: data.address.city,
        State: data.address.region,
        Zip: data.address.postalCode,
        Country: data.address.country,
        Type: 'Business',
      },
    ]
  }
  return out
}
