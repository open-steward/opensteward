import type { Company } from '../../../schema/company'

export interface RawTeamleaderCompany {
  id: string
  name?: string
  emails?: Array<{ email: string; type?: string }>
  telephones?: Array<{ number: string; type?: string }>
  website?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawTeamleaderCompany): Company {
  const primaryPhone = raw.telephones?.[0]?.number

  return {
    id: raw.id,
    name: raw.name ?? '',
    phone: primaryPhone,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.telephones = [{ number: data.phone, type: 'phone' }]
  return out
}
