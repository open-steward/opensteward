/**
 * Vivantio Caller → canonical Contact transform.
 *
 * Vivantio uses "Caller" for end-users (contacts) who submit tickets.
 * Key fields: Id, Name (display), FirstName, LastName, Email, Phone,
 * ClientId (organization), ExternalKey, CreateDate, UpdateDate.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawVivantioCaller {
  Id: number
  Name?: string | null
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  Phone?: string | null
  ClientId?: number | null
  ClientName?: string | null
  ExternalKey?: string | null
  ExternalSource?: string | null
  DomainLoginName?: string | null
  Notes?: string | null
  CreateDate?: string | null
  UpdateDate?: string | null
  Deleted?: boolean
  [key: string]: unknown
}

export function transformContact(raw: RawVivantioCaller): Contact {
  const displayName =
    pickStr(raw.Name) ??
    [pickStr(raw.FirstName), pickStr(raw.LastName)].filter(Boolean).join(' ') ??
    ''

  return {
    id: String(raw.Id),
    externalId: pickStr(raw.ExternalKey) ?? String(raw.Id),
    email: pickStr(raw.Email),
    name: displayName,
    phone: pickStr(raw.Phone),
    organizationId: raw.ClientId ? String(raw.ClientId) : undefined,
    platform: 'vivantio',
    metadata: strMap({
      clientName: raw.ClientName,
      domainLoginName: raw.DomainLoginName,
      externalSource: raw.ExternalSource,
      createDate: toIso(raw.CreateDate),
      updateDate: toIso(raw.UpdateDate),
    }),
    raw,
  }
}
