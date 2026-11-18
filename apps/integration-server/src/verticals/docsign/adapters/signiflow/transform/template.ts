/**
 * SigniFlow PrepperTemplate → canonical Template.
 *
 * Templates are fetched via POST /GetPrepperTemplateList and
 * POST /GetPrepperTemplate. The list endpoint returns a
 * TemplateInformationValuesField[] array; the single-item endpoint
 * returns a PrepperTemplateField object with additional metadata.
 */

import type { Template } from '../../../schema/template'
import { pickStr, pickNum, strMap, toIso } from './shared'

// ── Raw API types ─────────────────────────────────────────────────────────────

/** One entry from POST /GetPrepperTemplateList — TemplateInformationValuesField[]. */
export interface RawSigniFlowTemplateInfo {
  PrepperTemplateIDField?: number | string
  NameField?: string
  TemplateDescriptionField?: string
  [key: string]: unknown
}

/** The full template from POST /GetPrepperTemplate — PrepperTemplateField. */
export interface RawSigniFlowTemplateFull {
  PrepperTemplateIDField?: number | string
  TemplateNameField?: string
  TemplateDescriptionField?: string
  /** Workflow / signing roles embedded in the template */
  WorkflowField?: Array<{
    UserEmailField?: string
    UserFullNameField?: string
    RoleField?: string
    [key: string]: unknown
  }>
  CreatedDateField?: string
  ModifiedDateField?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a lightweight template-list entry (RawSigniFlowTemplateInfo) into
 * the canonical Template shape.
 */
export function transformTemplateInfo(raw: RawSigniFlowTemplateInfo): Template {
  const id = pickStr(raw.PrepperTemplateIDField) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.NameField) ?? '',
    description: pickStr(raw.TemplateDescriptionField),
    signerRoles: [],
    documentCount: 0,
    platform: 'signiflow',
    metadata: strMap(raw),
    raw,
  }
}

/**
 * Transform a full PrepperTemplateField response into the canonical Template
 * shape. Signer roles are derived from WorkflowField entries.
 */
export function transformTemplate(raw: RawSigniFlowTemplateFull): Template {
  const id = pickStr(raw.PrepperTemplateIDField) ?? ''
  const roles = (raw.WorkflowField ?? [])
    .map((w) => pickStr(w.RoleField) ?? pickStr(w.UserFullNameField))
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
  return {
    id,
    externalId: id,
    name: pickStr(raw.TemplateNameField) ?? '',
    description: pickStr(raw.TemplateDescriptionField),
    signerRoles: roles,
    documentCount: pickNum(raw.documentCount) ?? 0,
    createdAt: toIso(raw.CreatedDateField),
    updatedAt: toIso(raw.ModifiedDateField),
    platform: 'signiflow',
    metadata: strMap({
      TemplateNameField: raw.TemplateNameField,
      TemplateDescriptionField: raw.TemplateDescriptionField,
    }),
    raw,
  }
}
