import type { Template } from '../../../schema/template'

/**
 * One `TemplateSummary` from `GET /v2/templates` → `{ templateList: TemplateSummary[] }`.
 * The spec (https://docs.a-trust.at/swagger/signaturbox.yaml) gives it exactly
 * two properties, `id: string` and `description: string`; the documented
 * example is `{"id":"1", "description":"Default Template"}`.
 */
export interface RawATrustTemplate {
  id: string
  description?: string
}

export function transformTemplate(raw: RawATrustTemplate): Template {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('A-Trust TemplateSummary carries no id')
  }
  const description =
    typeof raw.description === 'string' && raw.description !== '' ? raw.description : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    // `description` is the only human label a TemplateSummary documents.
    name: description ?? raw.id,
    description,
    // A template is a signature appearance, not a document set: "A template is a
    // pre-defined format for a signing process consisting of Signature-Image,
    // position of this image in the PDF document and additional optional fields"
    // (https://docs.a-trust.at/apis/SignaturServer/templates). It defines no
    // signer roles and holds no documents.
    signerRoles: [],
    documentCount: 0,
    platform: 'a-trust',
    metadata: {},
    raw,
  }
}
