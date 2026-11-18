/**
 * Wati does not have a native Company resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 */
import type { Company } from '../../../schema/company'

export interface RawWatiCompany {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawWatiCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
