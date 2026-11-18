import { toIsoDatetime } from '@opensteward/shared'
import type { Template } from '../../../schema/template'
import { pickStr, strMap } from './shared'

interface RawSignPlusTemplateRecipient {
  id?: string
  name?: string
  email?: string
  role?: string
}

interface RawSignPlusTemplateSigningStep {
  recipients?: RawSignPlusTemplateRecipient[]
}

export interface RawSignPlusTemplate {
  id: string
  name?: string
  comment?: string
  pages?: number
  legality_level?: string
  created_at?: number
  updated_at?: number
  expiration_delay?: number
  num_recipients?: number
  signing_steps?: RawSignPlusTemplateSigningStep[]
  documents?: Array<{ id?: string }>
  notification?: { subject?: string; message?: string; reminder_interval?: number }
  dynamic_fields?: string[]
  [key: string]: unknown
}

/** Collect the distinct recipient roles defined across the template's signing steps. */
function signerRoles(raw: RawSignPlusTemplate): string[] {
  const roles = new Set<string>()
  for (const step of raw.signing_steps ?? []) {
    for (const r of step.recipients ?? []) {
      if (r.role) roles.add(r.role)
    }
  }
  return [...roles]
}

export function transformTemplate(raw: RawSignPlusTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.comment),
    signerRoles: signerRoles(raw),
    documentCount: Array.isArray(raw.documents) ? raw.documents.length : 0,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    platform: 'sign-plus',
    metadata: strMap({
      legalityLevel: raw.legality_level,
      pages: raw.pages,
      numRecipients: raw.num_recipients,
      expirationDelay: raw.expiration_delay,
      dynamicFields: (raw.dynamic_fields ?? []).join(','),
    }),
    raw,
  }
}
