import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/** A configurable fill field on the template detail (`fields[]`). */
export interface RawEsignglobalTemplateField {
  fieldId?: string
  fieldKey?: string
  fieldName?: string
  required?: boolean
  /** 1-text, 2-number, 3-date, 8-multiline, 9/10-choice, 11-image, 14-dropdown, 15-checkbox. */
  fieldType?: string | number
  [key: string]: unknown
}

/**
 * Shared by the list (`/templates/templateList` → `templateList[]`) and the
 * detail (`/templates/templateDetail` → `data`) shapes. The detail response
 * additionally carries `fields[]`; the list response carries `owner`/`tags`.
 */
export interface RawEsignglobalTemplate {
  templateId: string
  templateName?: string
  /** 0-PDF, 1-WORD. */
  templateType?: number
  createTime?: number | string
  updateTime?: number | string
  /** 0-Not Enabled, 1-Enabled. */
  templateStatus?: number | string
  owner?: string
  tags?: unknown[]
  fields?: RawEsignglobalTemplateField[]
  [key: string]: unknown
}

const TEMPLATE_TYPE_LABEL: Record<number, string> = { 0: 'PDF', 1: 'WORD' }

export function transformTemplate(raw: RawEsignglobalTemplate): Template {
  return {
    id: raw.templateId,
    externalId: raw.templateId,
    name: pickStr(raw.templateName) ?? '',
    // eSignGlobal templates don't expose named signer roles — only fill
    // fields — so the canonical role list is left empty.
    signerRoles: [],
    // A template always backs exactly one source document (PDF or WORD).
    documentCount: 1,
    createdAt: toIso(raw.createTime),
    updatedAt: toIso(raw.updateTime),
    platform: 'esignglobal',
    metadata: strMap({
      owner: raw.owner,
      templateStatus: raw.templateStatus,
      templateType:
        typeof raw.templateType === 'number'
          ? (TEMPLATE_TYPE_LABEL[raw.templateType] ?? raw.templateType)
          : raw.templateType,
      fieldCount: Array.isArray(raw.fields) ? raw.fields.length : undefined,
    }),
    raw,
  }
}
