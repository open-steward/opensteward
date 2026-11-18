import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * AIS never receives the document itself — only its hash. The signed-document
 * references appear in the SignResponse as `sc.ExtendedSignatureObject` entries
 * keyed by `@WhichDocument`. We expose each as a content-free Document: the
 * WhichDocument id, plus the detached-signature type under metadata. There is
 * no filename, size, page count, or content available from AIS.
 */
export interface RawSwisscomSignatureObject {
  '@WhichDocument'?: string
  Base64Signature?: { '@Type'?: string; $?: string }
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSwisscomSignatureObject,
  envelopeId: string,
  order: number,
): Document {
  const whichDocument = pickStr(raw['@WhichDocument']) ?? String(order)
  return {
    id: `${envelopeId}:${whichDocument}`,
    externalId: whichDocument,
    envelopeId,
    name: whichDocument,
    order,
    platform: 'swisscom-trust-services',
    metadata: strMap({
      whichDocument,
      signatureType: raw.Base64Signature?.['@Type'],
    }),
    raw,
  }
}
