import type { Company } from '../../../schema/company'

export interface RawRetailCrmCompany {
  id: number | string
  name?: string
  phones?: Array<{ number: string }>
  [key: string]: unknown
}

export function transformCompany(raw: RawRetailCrmCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phones?.[0]?.number,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phones = [{ number: data.phone }]
  return out
}
