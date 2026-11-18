import type { Template } from '../../../schema/template'
import { epochToIso, pickStr, strMap } from './shared'

/** A role entry on a BoldSign template. */
export interface RawBoldsignTemplateRole {
  roleName?: string
  defaultSignerName?: string
  defaultSignerEmail?: string
  signerOrder?: number
  signerType?: string
  [key: string]: unknown
}

/**
 * BoldSign template object from `/v1/template/list` and
 * `/v1/template/properties`. The list shape keys the id as `documentId`; the
 * properties shape uses `templateId`. We accept either.
 */
export interface RawBoldsignTemplate {
  templateId?: string
  documentId?: string
  templateName?: string
  templateDescription?: string
  createdDate?: number
  activityDate?: number
  modifiedDate?: number
  roles?: RawBoldsignTemplateRole[]
  signerDetails?: RawBoldsignTemplateRole[]
  files?: Array<unknown>
  brandId?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawBoldsignTemplate): Template {
  const id = raw.templateId ?? raw.documentId ?? ''
  const roles = raw.roles ?? raw.signerDetails ?? []
  return {
    id,
    externalId: id,
    name: pickStr(raw.templateName) ?? '',
    description: pickStr(raw.templateDescription),
    signerRoles: roles
      .map((r) => r.roleName ?? r.defaultSignerName)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: Array.isArray(raw.files) ? raw.files.length : 0,
    createdAt: epochToIso(raw.createdDate),
    updatedAt: epochToIso(raw.modifiedDate ?? raw.activityDate),
    platform: 'boldsign',
    metadata: strMap({ brandId: raw.brandId }),
    raw,
  }
}
