/**
 * Respond.io ↔ canonical Company transforms.
 *
 * Respond.io does not have a dedicated Company object in its v2 REST API.
 * These stubs exist so the transform module is complete; the adapter does
 * not expose company methods (the registry returns 501 automatically).
 */
import type { Company } from '../../../schema/company'

export interface RawRespondIoCompany {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawRespondIoCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  return out
}
