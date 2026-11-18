import type { Company } from '../../../schema/company'

export interface RawOnePageCrmCompany {
  id?: string | number
  name?: string
  url?: string
  description?: string
  phone_numbers?: Array<{ type?: string; value?: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawOnePageCrmCompany): Company {
  const phone = raw.phone_numbers?.find((p) => p.type === 'work' || p.type === 'main' || p.type === 'mobile')
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    domain: raw.url ?? undefined,
    phone: phone?.value ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['url'] = data.domain
  if (data.phone !== undefined) {
    out['phone_numbers'] = [{ type: 'work', value: data.phone }]
  }
  return out
}
