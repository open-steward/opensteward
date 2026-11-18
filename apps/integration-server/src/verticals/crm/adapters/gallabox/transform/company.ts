/**
 * Gallabox does not have a native Company resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 *
 * Docs: https://developers.gallabox.com/
 */
import type { Company } from '../../../schema/company'

export interface RawGallaboxCompany {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawGallaboxCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
