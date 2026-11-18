/**
 * Fixtures copied from RightSignature's first-party API docs.
 *
 * SHOW_DOCUMENT: `GET /public/v1/documents/:id` example response,
 * https://api.rightsignature.com/documentation/resources/v1/documents (show).
 * Signed S3 URLs are shortened to placeholders; every other value is verbatim.
 *
 * ARCHIVED_AUDITS: the `audits` array of the archived_documents
 * find_by_original_guid example, https://api.rightsignature.com/documentation/resources/v1
 * — the only place the vendor writes out an audit element (the show example
 * has `"audits": []`).
 */

export const ARCHIVED_AUDITS = [
  {
    id: 34,
    payload: 'All parties have signed document. Signed copies sent to: Ad.',
    user_id: 2,
    metadata: { keyword: 'executed' },
    account_id: 2,
    created_at: '2020-04-22T00:55:14.000-07:00',
    ip_address: null,
    document_id: 5,
  },
  {
    id: 31,
    payload: 'Document created by Ad (test@test.com).',
    user_id: 2,
    metadata: { keyword: 'created' },
    account_id: 2,
    created_at: '2020-04-22T00:55:02.000-07:00',
    ip_address: '10.0.2.2',
    document_id: 5,
  },
  {
    id: 33,
    payload: 'Document signed by Ad (test@test.com) with drawn signature.',
    user_id: 2,
    metadata: { keyword: 'signed' },
    account_id: 2,
    created_at: '2020-04-22T00:55:14.000-07:00',
    ip_address: '10.0.2.2',
    document_id: 5,
  },
  {
    id: 32,
    payload: 'Document viewed by Ad (test@test.com).',
    user_id: 2,
    metadata: { keyword: 'viewed' },
    account_id: 2,
    created_at: '2020-04-22T00:55:03.000-07:00',
    ip_address: '10.0.2.2',
    document_id: 5,
  },
]

export const SHOW_DOCUMENT = {
  document: {
    id: '4840dd4f-2c13-4395-a0e0-3577d1eed6fd',
    current_signer_id: '248883ae-a840-479f-8c2e-04de584019f9',
    name: 'Test',
    filename: 'application.pdf',
    executed_at: null,
    expired_at: '2018-06-06T08:23:28.116-07:00',
    sent_at: '2018-05-07T08:23:28.085-07:00',
    state: 'pending',
    kba: false,
    thumbnail_url: 'https://rightsign-development.s3.amazonaws.com/thumbnail_p1.png',
    sender: {
      id: 'b907e7ae-50f5-4a55-aa2d-166ac96b289e',
      name: 'Dr. Amos Kuhn',
      email: 'santos@tillman.org',
      signer: false,
    },
    recipients: [
      {
        role_name: 'signer2',
        name: 'Susie Orange',
        email: 'susie@citrix.com',
        status: 'pending',
        id: 'c76fad94-749b-495b-b088-c184282072e4',
        sign_url:
          'https://secure.rs.dev:3000/signers/c76fad94-749b-495b-b088-c184282072e4/sign?access_token=GyBD2At_UrapgeDkyccx',
        remind_url:
          'https://api.rs.dev:3002/public/{version}/signers/c76fad94-749b-495b-b088-c184282072e4/reminders',
        message: 'Please sign.',
        sequence: 1,
      },
      {
        role_name: 'signer1',
        name: 'Joe Tangerine',
        email: 'joe@citrix.com',
        status: 'pending',
        id: '248883ae-a840-479f-8c2e-04de584019f9',
        sign_url:
          'https://secure.rs.dev:3000/signers/248883ae-a840-479f-8c2e-04de584019f9/sign?access_token=esLoh2_8AB3qk17Jrpmy',
        remind_url:
          'https://api.rs.dev:3002/public/{version}/signers/248883ae-a840-479f-8c2e-04de584019f9/reminders',
        message: 'Please sign.',
        sequence: 0,
      },
    ],
    audits: [] as typeof ARCHIVED_AUDITS,
    page_image_urls: ['https://rightsign-development.s3.amazonaws.com/original_p1.png'],
    signed_pdf_url: null,
    tags: {},
    merge_field_values: [],
    embed_codes: null,
    in_person: false,
    shared_with: ['test@test.com'],
    identity_method: 'email',
    passcode_pin_enabled: false,
    original_file_url: 'https://rightsign-development.s3.amazonaws.com/application.pdf',
  },
}

/** The archived example's signer, `"status": "signed"`, verbatim minus its extra fields. */
export const SIGNED_RECIPIENT = {
  id: 'DGH4XHJ762ZH436WTSSVB7',
  email: 'test@test.com',
  name: 'Ad',
  role_name: 'A',
  status: 'signed',
  message: '',
  sequence: 1,
}
