import type { Contact } from '../../../schema/contact'

export interface RawCapsuleContact {
  id: number | string
  type?: 'person' | 'organisation'
  firstName?: string
  lastName?: string
  title?: string
  jobTitle?: string
  organisation?: { id: number | string; name?: string } | null
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
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCapsuleContact): Contact {
  const primaryEmail = raw.emailAddresses?.[0]?.address
  const primaryPhone = raw.phoneNumbers?.find((p) => p.type === 'Work')?.number
    ?? raw.phoneNumbers?.[0]?.number
  const mobilePhone = raw.phoneNumbers?.find((p) =>
    p.type?.toLowerCase() === 'mobile',
  )?.number

  const primaryAddress = raw.addresses?.[0]

  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    title: raw.jobTitle ?? raw.title,
    email: primaryEmail,
    phone: primaryPhone,
    mobile: mobilePhone,
    company_id: raw.organisation?.id != null ? String(raw.organisation.id) : undefined,
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

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'person' }
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.title !== undefined) out.jobTitle = data.title
  if (data.email != null) {
    out.emailAddresses = [{ address: data.email, type: 'Work' }]
  }
  if (data.phone != null) {
    const phones: Array<{ number: string; type: string }> = [
      { number: data.phone, type: 'Work' },
    ]
    if (data.mobile != null) {
      phones.push({ number: data.mobile, type: 'Mobile' })
    }
    out.phoneNumbers = phones
  } else if (data.mobile != null) {
    out.phoneNumbers = [{ number: data.mobile, type: 'Mobile' }]
  }
  if (data.company_id != null) {
    out.organisation = { id: Number(data.company_id) }
  }
  if (data.tags !== undefined) {
    out.tags = data.tags.map((name) => ({ name }))
  }
  if (data.address != null) {
    out.addresses = [
      {
        street: data.address.line1,
        city: data.address.city,
        state: data.address.region,
        zip: data.address.postalCode,
        country: data.address.country,
        type: 'Home',
      },
    ]
  }
  return out
}
