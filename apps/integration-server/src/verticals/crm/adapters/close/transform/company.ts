import type { Company } from '../../../schema/company'

export interface RawCloseLead {
  id: string
  display_name?: string
  name?: string
  url?: string
  description?: string
  addresses?: Array<{
    label?: string
    address_1?: string
    city?: string
    state?: string
    zipcode?: string
    country?: string
  }>
  date_created?: string
  date_updated?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCloseLead): Company {
  const addr = raw.addresses?.[0]
  return {
    id: raw.id,
    name: raw.display_name ?? raw.name ?? '',
    domain: raw.url,
    address: addr
      ? {
          line1: addr.address_1,
          city: addr.city,
          region: addr.state,
          postalCode: addr.zipcode,
          country: addr.country,
        }
      : undefined,
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.url = data.domain
  if (data.address) {
    out.addresses = [
      {
        label: 'office',
        address_1: data.address.line1,
        city: data.address.city,
        state: data.address.region,
        zipcode: data.address.postalCode,
        country: data.address.country,
      },
    ]
  }
  return out
}
