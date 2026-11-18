/**
 * Documented Skribble example responses, copied from the public API
 * reference (https://api-doc.skribble.com/).
 *
 * SIGNATURE_REQUEST_EXAMPLE is the example response of
 * "📙 Reference / SignatureRequests / Find / Get a single SignatureRequest"
 * (`GET /v2/signature-requests/{id}`), verbatim.
 *
 * DOCUMENT_EXAMPLE is the example response of
 * "📙 Reference / Documents / Find / Get the document metadata"
 * (`GET /v2/documents/{id}`). The docs elide the tail of the object with
 * `...`; only the fields they print are kept here.
 */
export const SIGNATURE_REQUEST_EXAMPLE = {
  id: 'cccccccc-4a6a-a958-a42e-6ea4172a378b',
  title: 'Example contract',
  message: 'Please sign this document!',
  document_id: 'd98ae06a-3ae4-5cc5-c0a3-62b05901b84f',
  quality: 'DEMO',
  signing_url: 'https://my.skribble.com/view/cccccccc-4a6a-a958-a42e-6ea4172a378b',
  status_overall: 'OPEN',
  signatures: [
    {
      sid: 'eeeeeeee-cdab-938a-aed9-ebabbc92a013',
      account_email: 'you@example.info',
      order: -1,
      status_code: 'OPEN',
      notify: true,
    },
    {
      sid: 'ffffffff-bbbb-1111-1313-012345678900',
      account_email: 'john.doe@skribble.com',
      signer_identity_data: {
        first_name: 'John',
        last_name: 'Doe',
      },
      order: -1,
      notify: true,
      status_code: 'SIGNED',
      signed_at: '2099-01-01T12:00:01.000Z',
      signed_quality: 'DEMO',
    },
  ],
  cc_email_addresses: [],
  owner: 'api_demo_your_name',
  read_access: ['api_demo_your_name', 'you@example.info'],
  write_access: ['api_demo_your_name'],
  created_at: '2099-12-12T12:12:12.000Z',
  updated_at: '2099-12-12T12:12:12.000Z',
}

export const DOCUMENT_EXAMPLE = {
  id: 'dddddddd-7777-caca-be12-121212121212',
  title: 'First example contract',
  content_type: 'application/pdf',
  size: 29094,
  page_count: 1,
  page_width: 595,
  page_height: 841,
  owner: 'api_demo_your_company',
}
