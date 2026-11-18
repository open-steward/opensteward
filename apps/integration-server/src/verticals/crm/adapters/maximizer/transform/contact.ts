import { Email } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import { requireKey, str, toAddress, zonedIso, type RawOctopusAddress } from '../octopus'

/**
 * An AbEntry of Type Contact or Individual, as the Octopus AbEntry Read returns
 * it for the Scope the adapter sends
 * (https://developer.maximizer.com/reference/octopus-api-docs-objects-abentry):
 * "Email": 1 and "Phone": 1 return the default email and phone as strings;
 * "Parent" "For contacts it will contain the company/individual parent of such
 * contact. It's an abEntry object so it can be expanded using any AbEntry
 * property".
 */
export interface RawMaximizerContact {
  Key: string
  Type?: string
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  Phone?: string | null
  Position?: string | null
  Parent?: { Key?: string | null; Type?: string | null } | null
  Address?: RawOctopusAddress | null
  CreationDate?: string | null
  LastModifyDate?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawMaximizerContact): Contact {
  const first = str(raw.FirstName)
  const last = str(raw.LastName)
  const email = str(raw.Email)
  const parent = raw.Parent && typeof raw.Parent === 'object' ? raw.Parent : undefined
  return {
    id: requireKey(raw, 'AbEntry'),
    first_name: first,
    last_name: last,
    name: [first, last].filter(Boolean).join(' ') || undefined,
    email: email && Email.safeParse(email).success ? email : undefined,
    phone: str(raw.Phone),
    title: str(raw.Position),
    company_id: parent?.Type === 'Company' ? str(parent.Key) : undefined,
    address: toAddress(raw.Address),
    created_at: zonedIso(raw.CreationDate),
    updated_at: zonedIso(raw.LastModifyDate),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.EmailAddress = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.company_id !== undefined) out.CompanyKey = data.company_id
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
