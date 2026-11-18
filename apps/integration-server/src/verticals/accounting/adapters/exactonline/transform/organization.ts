import type { Organization } from '../../../schema/organization'

export interface ExactDivision {
  HID?: number | string
  Code?: number | string
  Description?: string
  Country?: string
  Currency?: string
  VATNumber?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ExactDivision): Organization {
  return {
    id: raw.HID !== undefined ? String(raw.HID) : undefined,
    name: raw.Description || undefined,
    taxNumber: raw.VATNumber || undefined,
    currency: raw.Currency || undefined,
    address: raw.Country ? { country: raw.Country } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
