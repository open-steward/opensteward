/**
 * Transform an InLoox OData `ApiContact` object into the canonical User schema.
 *
 * InLoox contact fields (from Microsoft Learn connector docs + Swagger):
 *   ContactId    — UUID primary key
 *   DisplayName  — full display name
 *   FirstName    — first name
 *   LastName     — last name
 *   Email        — email address
 *   CompanyName  — company / organisation name
 *   Title        — job title
 *   IsIdentity   — true when this contact is an InLoox user account
 *   DescriptionHTML — free-text notes
 *
 * InLoox does not expose workspace membership on contacts; workspaceId is
 * passed through from the list context when available.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawInlooxContact {
  ContactId?: string
  DisplayName?: string
  FirstName?: string
  LastName?: string
  Email?: string
  CompanyName?: string
  Title?: string
  IsIdentity?: boolean
  DescriptionHTML?: string
  [key: string]: unknown
}

export function transformUser(raw: RawInlooxContact, workspaceId?: string): User {
  const id = pickStr(raw.ContactId) ?? ''
  const composed = [raw.FirstName, raw.LastName].filter(Boolean).join(' ')
  const name = pickStr(raw.DisplayName) ?? (composed || '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.Email),
    name,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'inloox',
    metadata: strMap({
      companyName: raw.CompanyName,
      title: raw.Title,
      isIdentity: raw.IsIdentity,
    }),
    raw,
  }
}
