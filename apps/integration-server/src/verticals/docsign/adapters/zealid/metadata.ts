/**
 * ZealiD adapter — resource coverage metadata.
 *
 * ZealiD is an eIDAS-qualified trust service provider (QTSP). Its only
 * public REST surface relevant to the docsign vertical is the Data API
 * ("Orpheus"), which exposes per-user signed PDF documents.
 *
 * The API has NO envelope, signer, template, or audit-trail concept:
 *   - Documents are scoped directly to a customer_id — there is no
 *     envelope wrapper.
 *   - Signers are not a queryable resource; the only actor is the
 *     authenticated user identified by their customer_id.
 *   - Templates are not supported — ZealiD's signing flow is ad-hoc
 *     (upload PDF → sign via QR code).
 *   - Audit trail events are not exposed; the API returns document
 *     status ("pending" / "signed") only.
 *
 * Verified against: https://developer.zealid.com/docs/data-api-in-detail
 */
export const metadata = {
  platform: 'zealid',
  totalResources: 5,
  availableResources: ['document'],
  unavailableResources: [
    {
      resource: 'envelope',
      reason:
        'ZealiD has no envelope concept — documents are scoped directly to a customer_id with no envelope wrapper layer',
    },
    {
      resource: 'signer',
      reason:
        'ZealiD exposes no signer resource; the only actor is the OAuth-authenticated user identified by their customer_id',
    },
    {
      resource: 'template',
      reason:
        'ZealiD does not support templates; signing is ad-hoc (upload PDF then sign via QR code)',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'ZealiD exposes no audit trail; the Data API returns only a document status field ("pending" / "signed")',
    },
  ],
} as const
