import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Sphereon signature configuration.
 *
 * `GET /configs` returns a bare array of these; `GET /configs/{configId}`
 * returns one. A configuration is a reusable signing definition — a
 * signature level, digest algorithm, and form/timestamp parameters — which
 * is the closest Sphereon analogue to a canonical docsign Template (a
 * reusable signing setup). Sphereon has no envelope/recipient/document
 * resources, so those canonical resources are left unimplemented.
 */
export interface RawSphereonSignatureConfig {
  configId?: string
  id?: string
  name?: string
  description?: string
  config?: {
    signatureLevel?: string
    digestAlgorithm?: string
    signatureFormParameters?: Record<string, unknown>
    timestampParameters?: Record<string, unknown>
    accessRestrictions?: {
      roles?: string[]
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawSphereonSignatureConfig): Template {
  const id = pickStr(raw.configId) ?? pickStr(raw.id) ?? ''
  const cfg = raw.config ?? {}
  const signatureLevel = pickStr(cfg.signatureLevel)
  const name = pickStr(raw.name) ?? signatureLevel ?? id
  const roles = Array.isArray(cfg.accessRestrictions?.roles)
    ? cfg.accessRestrictions!.roles.filter((r): r is string => typeof r === 'string')
    : []
  return {
    id,
    externalId: id,
    name,
    description: pickStr(raw.description),
    signerRoles: roles,
    // A signature config governs how documents are signed, not which
    // documents are attached; Sphereon does not bundle documents.
    documentCount: 0,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'blueink-bypass',
    metadata: strMap({
      signatureLevel,
      digestAlgorithm: cfg.digestAlgorithm,
    }),
    raw,
  }
}
