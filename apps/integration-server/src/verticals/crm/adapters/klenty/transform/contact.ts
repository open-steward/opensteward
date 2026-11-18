import type { Contact } from '../../../schema/contact'

/**
 * Raw prospect shape returned by the Klenty API.
 *
 * GET /apis/v1/user/{username}/{email}
 * GET /apis/v1/user/{username}/prospects  (list)
 */
export interface RawKlentyProspect {
  id?: string
  Email?: string
  FirstName?: string
  LastName?: string
  MiddleName?: string
  FullName?: string
  Company?: string
  CompanyDomain?: string
  Title?: string
  Phone?: string
  CompanyPhone?: string
  CompanyEmail?: string
  Account?: string
  Department?: string
  Location?: string
  City?: string
  Country?: string
  TwitterId?: string
  LinkedinURL?: string
  List?: string
  Tags?: string
  assignTo?: string
  [key: string]: unknown
}

export function transformContact(raw: RawKlentyProspect): Contact {
  const firstName = raw.FirstName ?? undefined
  const lastName = raw.LastName ?? undefined
  const nameParts = [firstName, lastName].filter(Boolean)

  return {
    id: raw.id != null ? String(raw.id) : (raw.Email ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: raw.FullName ?? (nameParts.length > 0 ? nameParts.join(' ') : undefined),
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    title: raw.Title ?? undefined,
    tags: raw.Tags ? raw.Tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    owner_id: raw.assignTo ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.Email = data.email
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.title !== undefined) out.Title = data.title
  // NOTE: GET responses carry the owner in `assignTo`; POST/PUT requests
  // require the field name `Owner`. This asymmetry is documented in the
  // Klenty POST API docs (https://support.klenty.com/en/articles/8193937).
  if (data.owner_id !== undefined) out.Owner = data.owner_id
  // POST API requires pipe-separated tags (e.g. "Tag1|Tag2").
  // GET responses return comma-separated tags and are parsed in transformContact.
  if (data.tags !== undefined && data.tags.length > 0) out.Tags = data.tags.join('|')
  return out
}
