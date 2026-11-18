import type { Contact } from '../../../schema/contact'

export interface RawLacrmContact {
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

function splitName(name?: string): { first_name?: string; last_name?: string } {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0] }
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1],
  }
}

export function transformContact(raw: RawLacrmContact): Contact {
  const { first_name, last_name } = splitName(raw.Name)
  const addr = raw.Address?.[0]

  return {
    id: raw.ContactId,
    name: raw.Name,
    first_name,
    last_name,
    email: raw.Email?.[0]?.Text,
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

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) {
    out.Name = data.name
  } else if (data.first_name || data.last_name) {
    out.Name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.email !== undefined) out.Email = [{ Text: data.email, Type: 'Email' }]
  if (data.phone !== undefined) out.Phone = [{ Text: data.phone, Type: 'Phone' }]
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
