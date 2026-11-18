import type { Company } from '../../../schema/company'

export interface RawCapsuleCompany {
  id: number | string
  type?: 'person' | 'organisation'
  name?: string
  about?: string
  emailAddresses?: Array<{ address: string; type?: string }>
  phoneNumbers?: Array<{ number: string; type?: string }>
  addresses?: Array<{
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    type?: string
  }>
  tags?: Array<{ name: string }>
  owner?: { id: number | string; name?: string } | null
  website?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCapsuleCompany): Company {
  const primaryPhone = raw.phoneNumbers?.[0]?.number
  const primaryAddress = raw.addresses?.[0]

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: primaryPhone,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    tags: raw.tags?.map((t) => t.name),
    address: primaryAddress
      ? {
          line1: primaryAddress.street,
          city: primaryAddress.city,
          region: primaryAddress.state,
          postalCode: primaryAddress.zip,
          country: primaryAddress.country,
        }
      : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'organisation' }
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) {
    out.phoneNumbers = [{ number: data.phone, type: 'Work' }]
  }
  if (data.tags !== undefined) {
    out.tags = data.tags.map((name) => ({ name }))
  }
  if (data.address !== undefined) {
    out.addresses = [
      {
        street: data.address.line1,
        city: data.address.city,
        state: data.address.region,
        zip: data.address.postalCode,
        country: data.address.country,
        type: 'Work',
      },
    ]
  }
  return out
}
