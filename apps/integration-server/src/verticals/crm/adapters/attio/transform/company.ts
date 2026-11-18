import type { Company } from '../../../schema/company'

// ── Raw Attio types ────────────────────────────────────────────────────────

interface AttioTextValue {
  value: string
  attribute_type?: string
}

interface AttioPhoneValue {
  phone_number: string
  attribute_type?: string
}

interface AttioDomainValue {
  domain: string
  attribute_type?: string
}

interface AttioActorRef {
  id: {
    workspace_member_id: string
  }
}

interface AttioRecordId {
  record_id: string
  created_at?: string
}

export interface RawAttioCompany {
  id: AttioRecordId
  values: {
    name?: AttioTextValue[]
    domains?: AttioDomainValue[]
    primary_phone_numbers?: AttioPhoneValue[]
    owner?: AttioActorRef[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformCompany(raw: RawAttioCompany): Company {
  const v = raw.values
  return {
    id: String(raw.id.record_id),
    name: v.name?.[0]?.value ?? '',
    domain: v.domains?.[0]?.domain,
    phone: v.primary_phone_numbers?.[0]?.phone_number,
    owner_id: v.owner?.[0]?.id.workspace_member_id
      ? String(v.owner[0].id.workspace_member_id)
      : undefined,
    created_at: raw.id.created_at,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  if (data.name !== undefined) {
    values['name'] = [{ value: data.name }]
  }
  if (data.domain !== undefined) {
    values['domains'] = [{ domain: data.domain }]
  }
  if (data.phone !== undefined) {
    values['primary_phone_numbers'] = [{ phone_number: data.phone }]
  }

  return { data: { values } }
}
