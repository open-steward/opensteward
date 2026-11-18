/**
 * Fixtures copied from the Dokobit Portal API documentation
 * (https://beta.dokobit.com/api/doc, the same page app.dokobit.com/api/doc serves).
 *
 * The documented examples are not valid JSON as printed, so three repairs were
 * made and nothing else:
 *   - GET /api/signing/list.json: a missing comma after `last_signature_date`
 *     and a trailing comma after the last row.
 *   - GET /api/signing/{token}/status.json: the example opens with `{ {` and
 *     closes with `} }`; the inner object is used as the body. A missing comma
 *     between the second and third signers is restored.
 *   - The certificate PEM in the first signer is shortened to its BEGIN/END
 *     lines.
 */

/** "200 Response example" of GET /api/signing/list.json. */
export const SIGNING_LIST_EXAMPLE = {
  status: 'ok',
  signings: [
    {
      token: 'cca3f26183eb0089d82439a9e036cf94',
      status: 'pending',
      document_number: null,
      client_code: null,
      is_in_trash_bin: false,
      last_signature_date: null,
      template: null,
    },
    {
      token: '2f04007b083fc89b3b99c24b3d4b3654',
      status: 'completed',
      document_number: null,
      client_code: null,
      is_in_trash_bin: false,
      last_signature_date: '2024-01-11T15:47:50+02:00',
      template: null,
    },
  ],
}

/** "200 Response example" of GET /api/signing/{token}/status.json. */
export const SIGNING_STATUS_EXAMPLE = {
  name: 'Document to sign',
  type: 'pdf',
  status: 'completed',
  deadline: '2018-01-12T10:07:10+02:00',
  categories: [
    {
      token: '9fe352d9fa48b04fcb47989ded891aa6b5bee13a',
      name: 'Sutartys',
    },
  ],
  files: [
    {
      name: 'labadienaVTnqOstest.pdf',
      url: 'https://beta.dokobit.com/file/9b8674d69fa6338485cc9207007f557663d6e17081e59eb0456ec0cf1dccfec8/download',
      type: null,
      mime_type: 'application/pdf',
    },
  ],
  signed_file: [
    {
      url: 'https://beta.dokobit.com/signing/89749614bb4a3a99366fbdf4edffe5bb24f7c26d0/download',
    },
  ],
  signers: [
    {
      token: 'fac1c3834b37f8bebf2f3584d1b8b222a2262def',
      first_name: 'James',
      last_name: 'Smith',
      code: '11412090004',
      country: 'lt',
      email: 'james.smith@dokobit.com',
      type: 'signer',
      status: 'signed',
      signature: {
        signing_time: null,
        certificate: {
          owner: 'SEVENTH TESTNUMBER',
          issuer: 'TEST of EID-SK 2011, AS Sertifitseerimiskeskus, EE',
          valid_from: '2011-09-19 17:33:02',
          valid_to: '2016-09-17 23:59:59',
          qualified: true,
          value: '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----',
        },
        level: 'PAdES-BES',
        timestamp: [],
        timemark: [],
        seal: false,
        errors: [],
        warnings: [],
      },
      meta_information: {
        company: null,
        position: null,
        signing_purpose: null,
        signing_location: null,
        country: null,
        city: null,
        postal_code: null,
        subdivision: null,
      },
    },
    {
      token: '595b357172b142cab7792c3324a1155bd47090ad',
      first_name: 'Maria',
      last_name: 'Garcia',
      code: '51001091072',
      country: 'lt',
      email: 'maria.garcia@dokobit.com',
      type: 'signer',
      status: 'pending',
      signature: [],
      meta_information: {
        company: 'UAB Dokobit',
        position: 'Software engineer',
        signing_purpose: 'signature',
        signing_location: '',
        country: null,
        city: null,
        postal_code: null,
        subdivision: null,
      },
    },
    {
      token: '595b357172b142cab7792c3324a1155bd47090ao',
      first_name: 'John',
      last_name: 'Doe',
      code: '51001091073',
      country: 'lt',
      email: 'john.doe@dokobit.com',
      type: 'signer',
      status: 'declined',
      decline_reason: 'Declined by user',
      signature: [],
      meta_information: {
        company: 'UAB Dokobit',
        position: 'Software engineer',
        signing_purpose: 'signature',
        signing_location: '',
        country: null,
        city: null,
        postal_code: null,
        subdivision: null,
      },
    },
  ],
  is_qualified_signature_required: false,
  signing_deadline: null,
  template: {
    name: 'Template',
    token: '45daf7cee3ede21aab3d5fbf19e2dc1991d1db55',
  },
}
