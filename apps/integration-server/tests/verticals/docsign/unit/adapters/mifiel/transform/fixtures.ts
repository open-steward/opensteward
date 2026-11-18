/**
 * Mifiel fixtures, built from the documented examples.
 *
 * Records of `POST /api/query` with `"resource": "document"` come from the
 * responses printed in Mifiel's advanced-search guide
 * (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api), e.g.:
 *
 *   { "id": "32214f64-f695-4691-8f6c-073681b05543", "file_file_name": "demo.pdf",
 *     "created_at": "2021-07-21T17:05:36.821Z", "state": "pending" }
 *
 *   "stakeholders": [ { "type": "Signer", "email": "…", "state": "pending",
 *     "widget_id": "77635c95-b33a-4fd8-b0ae-5d694554b471" } ]
 *
 * and `_metadata` from the same responses:
 *   { "page": 1, "per_page": 20, "page_count": 1, "total_count": 4 }
 *
 * `signed` is the document attribute of the API reference
 * (https://docs.mifiel.com/en/api.json, CreateDocumentResponse.signed:
 * "Whether the document has been signed by all parties"). The stakeholder
 * `id` and `name` are the attributes of the reference's
 * `stakeholders(id,email,name,tax_id)` example; the guide prints no id value,
 * so the id below is a fixture uuid, and the name is the reference's example
 * ("Sergio Montoya"). The guide's email is obfuscated in the page; its text
 * names it as "victor(at)mifiel.com".
 */
import type { RawMifielQueryDocument } from '../../../../../../../src/verticals/docsign/adapters/mifiel/transform/envelope'
import type { RawMifielStakeholder } from '../../../../../../../src/verticals/docsign/adapters/mifiel/transform/signer'

export const STAKEHOLDER_EXAMPLE: RawMifielStakeholder = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  type: 'Signer',
  email: 'victor@mifiel.com',
  name: 'Sergio Montoya',
  state: 'pending',
  widget_id: '77635c95-b33a-4fd8-b0ae-5d694554b471',
}

export const QUERY_RECORD_EXAMPLE: RawMifielQueryDocument = {
  id: '32214f64-f695-4691-8f6c-073681b05543',
  file_file_name: 'demo.pdf',
  created_at: '2021-07-21T17:05:36.821Z',
  state: 'pending',
  signed: false,
  stakeholders: [STAKEHOLDER_EXAMPLE],
}

export const QUERY_METADATA_EXAMPLE = { page: 1, per_page: 20, page_count: 1, total_count: 4 }
