import type { Contact } from '../../../schema/contact'

export interface RawRetailCrmContact {
  id: number | string
  firstName?: string
  lastName?: string
  email?: string
  phones?: Array<{ number: string }>
  address?: {
    city?: string
    region?: string
    zip?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformContact(raw: RawRetailCrmContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.phones?.[0]?.number,
    address: raw.address
      ? {
          city: raw.address.city,
          region: raw.address.region,
          postalCode: raw.address.zip,
          country: raw.address.country,
        }
      : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phones = [{ number: data.phone }]
  return out
}
