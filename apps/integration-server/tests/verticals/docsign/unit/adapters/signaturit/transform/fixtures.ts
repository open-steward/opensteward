/**
 * Fixtures copied from Signaturit's documented example responses
 * (https://docs.signaturit.com/api/latest).
 */

/**
 * The "Signature" object example: "A signature represents a request to one or
 * more signers with one or more documents."
 */
export const SIGNATURE_OBJECT_EXAMPLE = {
  created_at: '2014-08-21T08:53:35+0000',
  data: [],
  documents: [
    {
      created_at: '2014-08-21T08:53:35+0000',
      email: 'john@signaturit.com',
      events: [
        { created_at: '2014-08-21T08:55:14+0000', type: 'email_processed' },
        { created_at: '2014-08-21T08:55:20+0000', type: 'email_delivered' },
      ],
      file: { name: 'document.pdf', pages: 5, size: 72218 },
      id: '9781f42d-2910-11e4-b3d4-0aa7697eb409',
      name: 'John',
      status: 'ready',
    },
  ],
  id: '974e6f6c-2910-11e4-b3d4-0aa7697eb409',
}

/**
 * "GET /v3/signatures.json" example filtered by the custom `crm_id` key: the
 * one documented example with a non-empty `data` array.
 */
export const SIGNATURE_WITH_DATA_EXAMPLE = {
  created_at: '2014-08-21T08:53:35+0000',
  data: [{ key: 'crm_id', value: '2455' }],
  documents: [
    {
      email: 'john@signaturit.com',
      events: [{ type: 'email_processed', created_at: '2014-08-21T08:55:14+0000' }],
      file: { name: 'document.pdf', pages: 11, size: 72218 },
      id: '9781f42d-2910-11e4-b3d4-0aa7697eb409',
      name: 'John',
      status: 'ready',
    },
  ],
  id: '974e6f6c-2910-11e4-b3d4-0aa7697eb409',
}

/** "GET /v3/templates.json" example response item. */
export const TEMPLATE_EXAMPLE = {
  created_at: '2014-08-20T14:19:51+0000',
  id: 'e5d25677-8a52-11e3-af02-080027880ca6',
  name: '#nda',
}
