/**
 * Fixtures copied from Annature's documented example responses.
 */

/** "Retrieve an envelope" example, https://docs.annature.com.au/api-reference/envelopes/retrieve-envelope.md */
export const RETRIEVE_ENVELOPE_EXAMPLE = {
  id: '7e8f68e4c6df9395cd7ff48d69d7e2c1',
  name: 'Non disclosure agreement',
  message: 'Lorem ipsum dolor sit amet.',
  status: 'sent',
  shared: false,
  created: '2019-12-17T05:30:00Z',
  sent: '2019-12-17T05:30:00Z',
  voided: null,
  declined: null,
  completed: null,
  master: 'https://annature..',
  certificate: 'https://annature..',
  combined: 'https://annature..',
  account_id: 'c64ce66b70b21c03bfd5dfa0ab14b730',
  group_id: 'a5a885caee6286a54ad7bbd4ab5400e9',
  recipients: [
    {
      id: '255e591c2c9fe1bc99be1ec03075b402',
      name: 'Ted Annature',
      email: 'ted@annature.com.au',
      mobile: '+61422000000',
      type: 'signer',
      status: 'sent',
      message: null,
      password: false,
      muted: false,
      order: 1,
      declined_reason: null,
      created: '2019-12-17T05:30:00Z',
      sent: '2019-12-17T05:30:00Z',
      declined: null,
      completed: null,
      redirects: {
        session_completed: 'https://..',
        session_declined: 'https://..',
      },
    },
  ],
  metadata: {},
}

/** One element of the "List all envelopes (paged)" example's `envelopes`, https://docs.annature.com.au/api-reference/envelopes/list-all-envelopes-paged.md */
export const PAGED_ENVELOPE_EXAMPLE = {
  id: '7e8f68e4c6df9395cd7ff48d69d7e2c1',
  name: 'Non disclosure agreement',
  message: 'Lorem ipsum dolor sit amet.',
  status: 'completed',
  shared: false,
  created: '2019-12-17T05:30:00Z',
  sent: '2019-12-17T05:30:00Z',
  voided: null,
  declined: null,
  completed: '2019-12-17T05:30:00Z',
  account_id: 'c64ce66b70b21c03bfd5dfa0ab14b730',
  group_id: 'a5a885caee6286a54ad7bbd4ab5400e9',
  recipients: [
    {
      id: '255e591c2c9fe1bc99be1ec03075b402',
      name: 'Ted Annature',
      email: 'ted@annature.com.au',
      mobile: '+61422000000',
      type: 'signer',
      status: 'completed',
      message: 'Lorem ipsum dolor sit amet.',
      password: true,
      muted: false,
      order: 1,
      declined_reason: null,
      created: '2019-12-17T05:30:00Z',
      sent: '2019-12-17T05:30:00Z',
      declined: null,
      completed: '2019-12-17T05:30:00Z',
      redirects: {
        session_completed: 'https://..',
        session_declined: 'https://..',
      },
    },
  ],
}

/** "Retrieve a recipient" example, https://docs.annature.com.au/api-reference/recipients/retrieve-recipient.md */
export const RECIPIENT_EXAMPLE = {
  id: '255e591c2c9fe1bc99be1ec03075b402',
  name: 'Ted Annature',
  email: 'ted@annature.com.au',
  mobile: '+61422000000',
  type: 'signer',
  status: 'sent',
  message: 'Lorem ipsum dolor sit amet.',
  password: true,
  muted: false,
  order: 1,
  declined_reason: 'Lorem ipsum dolor sit amet.',
  created: '2019-12-17T05:30:00Z',
  sent: '2019-12-17T05:30:00Z',
  declined: '2019-12-17T05:30:00Z',
  completed: '2019-12-17T05:30:00Z',
  redirects: {
    session_completed: 'https://..',
    session_declined: 'https://..',
  },
}

/** "List all documents" example element, https://docs.annature.com.au/api-reference/documents/list-all-documents.md */
export const DOCUMENT_EXAMPLE = {
  id: 'fcad499b03c6fc222bc66208317a18c9',
  name: 'Non disclosure agreement.pdf',
  pages: 10,
  original: 'https://annature..',
  master: 'https://annature..',
  created: '2019-12-17T05:30:00Z',
}

/** "List all templates" example element, https://docs.annature.com.au/api-reference/templates/list-all-templates.md */
export const TEMPLATE_EXAMPLE = {
  id: '7e8f68e4c6df9395cd7ff48d69d7e2c1',
  name: 'Non disclosure agreement template',
  shared: false,
  envelope_name: 'Non disclosure agreement',
  envelope_message: 'Lorem ipsum dolor sit amet.',
  envelope_shared: false,
  created: '2019-12-17T05:30:00Z',
  account_id: 'c64ce66b70b21c03bfd5dfa0ab14b730',
  group_id: 'a5a885caee6286a54ad7bbd4ab5400e9',
  documents: [
    {
      id: 'fcad499b03c6fc222bc66208317a18c9',
      name: 'Non disclosure agreement.pdf',
      pages: 10,
      original: 'https://annature..',
      master: 'https://annature..',
      created: '2019-12-17T05:30:00Z',
    },
  ],
  roles: [
    {
      id: 'fcad499b03c6fc222bc66208317a18c9',
      name: 'Client',
      recipient_name: 'Ted Annature',
      recipient_email: 'ted@annature.com.au',
      recipient_mobile: '+61422000000',
      recipient_type: 'signer',
      recipient_password: 'password',
      recipient_order: 1,
      recipient_redirects: {
        session_completed: 'https://..',
        session_declined: 'https://..',
      },
    },
  ],
}
