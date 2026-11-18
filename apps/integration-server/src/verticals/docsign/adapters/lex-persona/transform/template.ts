/**
 * Goodflag Signature `WorkflowTemplate` (modèle de parapheur) → canonical
 * `Template`.
 *
 * Fields are the documented `WorkflowTemplate` type of `GET /api/templates`
 * and `GET /api/templates/{templateId}`
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflow-templates/search-workflow-templates.md).
 * A template carries no document list or count; the adapter counts its
 * documents with `GET /api/templateDocuments?items.templateId=…` and passes
 * the documented `totalItems` in.
 */
import type { Template } from '../../../schema/template'
import { msToIso, str } from './shared'

export interface RawGoodflagTemplate {
  id: string
  name: string
  tenantId: string
  created: number
  updated: number
  isDisabled: boolean
  steps: Array<{ id: string; stepType: 'approval' | 'signature'; [key: string]: unknown }>
  description?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawGoodflagTemplate, documentCount: number): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    description: str(raw.description),
    // Goodflag steps name no roles: a step is only `approval` or `signature`.
    signerRoles: [],
    documentCount,
    createdAt: msToIso(raw.created),
    updatedAt: msToIso(raw.updated),
    platform: 'lex-persona',
    metadata: {
      isDisabled: String(raw.isDisabled),
      stepCount: String((raw.steps ?? []).length),
      tenantId: raw.tenantId,
    },
    raw,
  }
}
