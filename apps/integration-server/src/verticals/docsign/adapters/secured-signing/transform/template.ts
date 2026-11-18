import type { Template } from '../../../schema/template'
import { pickStr, strMap } from './shared'

/**
 * Secured Signing `EmailTemplate` — the only template-like resource the API
 * exposes for listing (`/EmailTemplate/GetInvitationTemplates`). These are
 * reusable invitation/completion email bodies, not document templates, so
 * there are no signer roles, document counts, or timestamps on the wire.
 */
export interface RawSecuredSigningEmailTemplate {
  Reference?: string
  Name?: string
  Subject?: string
  Template?: string
  IsDefault?: boolean
  [key: string]: unknown
}

export function transformTemplate(raw: RawSecuredSigningEmailTemplate): Template {
  const reference = pickStr(raw.Reference) ?? ''
  return {
    id: reference,
    externalId: reference,
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Subject),
    signerRoles: [],
    documentCount: 0,
    platform: 'secured-signing',
    metadata: strMap({
      subject: raw.Subject,
      isDefault: raw.IsDefault,
    }),
    raw,
  }
}
