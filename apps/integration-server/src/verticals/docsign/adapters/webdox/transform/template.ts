import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Webdox CLM workflow template — the reusable definition that decision
 * workflows are instantiated from. Steps define the process; signature steps
 * carry the roles that map to canonical signer roles.
 */
export interface RawWebdoxTemplate {
  id: number | string
  name?: string
  text_description?: string
  description?: string
  draft?: boolean
  created_at?: string
  updated_at?: string
  steps?: Array<RawWebdoxTemplateStep>
  [key: string]: unknown
}

interface RawWebdoxTemplateStep {
  name?: string
  number?: number | string
  kind?: string
  signers?: Array<{ name?: string; role?: string }>
}

/** Role names from the template's signature steps. */
function signerRoles(raw: RawWebdoxTemplate): string[] {
  const roles: string[] = []
  for (const step of raw.steps ?? []) {
    if ((step.kind ?? '').toLowerCase() !== 'signature') continue
    if (step.signers && step.signers.length > 0) {
      for (const s of step.signers) {
        const role = pickStr(s.role) ?? pickStr(s.name)
        if (role) roles.push(role)
      }
    } else {
      const stepName = pickStr(step.name)
      if (stepName) roles.push(stepName)
    }
  }
  return roles
}

export function transformTemplate(raw: RawWebdoxTemplate): Template {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.text_description ?? raw.description),
    signerRoles: signerRoles(raw),
    documentCount: 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'webdox',
    metadata: strMap({
      draft: raw.draft,
      stepCount: (raw.steps ?? []).length,
    }),
    raw,
  }
}
