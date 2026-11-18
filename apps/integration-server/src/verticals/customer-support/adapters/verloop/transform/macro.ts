/**
 * Transform a Verloop Template record into the canonical Macro shape.
 *
 * Verloop templates are pre-approved WhatsApp message templates (analogous to
 * canned responses). Each template has a name, a category, and a set of
 * parameters that fill in placeholder slots.
 *
 * API response shape reference:
 *   POST https://<client_id>.verloop.io/api/v1/Campaign/ListTemplates
 *   POST https://<client_id>.verloop.io/api/v1/Campaign/GetTemplate
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawVerloopTemplateParameter {
  Name?: string
  Type?: string
  Example?: string
}

export interface RawVerloopTemplateMeta {
  Id?: string
}

export interface RawVerloopTemplate {
  Meta?: RawVerloopTemplateMeta
  Name?: string
  Category?: string
  Language?: string
  Status?: string
  Body?: string
  Parameters?: RawVerloopTemplateParameter[]
  [key: string]: unknown
}

/**
 * Build a human-readable body from the template Body field.
 * If Body is absent, construct a representation from parameter names.
 */
function extractBody(raw: RawVerloopTemplate): string {
  if (pickStr(raw.Body)) return raw.Body as string
  const params = (raw.Parameters ?? [])
    .map((p) => p.Name ?? p.Type ?? '')
    .filter(Boolean)
    .join(', ')
  return params ? `[Parameters: ${params}]` : ''
}

export function transformMacro(raw: RawVerloopTemplate): Macro {
  const id = pickStr(raw.Meta?.Id) ?? pickStr(raw.Name) ?? ''
  return {
    id,
    externalId: id,
    title: pickStr(raw.Name) ?? '',
    body: extractBody(raw),
    category: pickStr(raw.Category),
    platform: 'verloop',
    metadata: strMap({
      language: raw.Language,
      status: raw.Status,
    }),
    raw,
  }
}
