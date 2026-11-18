/**
 * Fixtures copied from Autenti's first-party documentation, Stoplight project
 * cHJqOjQxMTI4 (developers.autenti.com). Each names its source.
 */

/**
 * `components.examples.DocumentProcessInProgress.value` of the Document
 * Process API v2 OpenAPI
 * (https://stoplight.io/api/v1/projects/autenti/autenti-public-api-v2/nodes/Autenti.com-Autenti-Document-Process-API-v2.yaml?fromExportButton=true&snapshotType=http_service&deref=optimizedBundle).
 */
export function documentProcessInProgress() {
  return {
    id: 'DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42',
    title: 'Sailing boat rental agreement',
    description: 'Please review the terms and sign',
    processLanguage: 'en',
    status: 'PROCESSING',
    parties: [
      {
        party: {
          id: 'PARTY-PUBLIC_APPROVAL_PROCESS_ID:4060e833',
          firstName: 'Mark',
          lastName: 'Wazowski',
          name: 'Mark Wazowski',
          contacts: [
            { type: 'CONTACT-TYPE:EMAIL', attributes: { email: 'mark.wazowski@acme.com' } },
          ],
          relationships: [
            {
              type: 'PARTY_RELATIONSHIP-TYPE:REPRESENTATIVE',
              party: {
                name: 'Acme Co.',
                extIds: [{ identificationSpace: 'TAXID-PL-NIP', identifier: '898123432' }],
              },
              attributes: { relationshipDescription: 'President' },
            },
          ],
        },
        role: 'APPROVER',
        participationStatus: 'COMPLETED',
        constraints: [
          {
            classifiers: ['CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY'],
            attributes: { priority: 1 },
          },
        ],
        currentUser: false,
        participationEvents: [
          { eventType: 'APPROVAL', timestamp: '2020-10-21T15:48:34.863Z' },
          { eventType: 'VIEWING', timestamp: '2020-07-18T19:16:40.997Z' },
        ],
      },
      {
        party: {
          id: 'PARTY-PUBLIC_SIGNING_PROCESS_ID:4060e833',
          firstName: 'John',
          lastName: 'Smith',
          name: 'John Smith',
          contacts: [{ type: 'CONTACT-TYPE:EMAIL', attributes: { email: 'john.smith@acme.com' } }],
          relationships: [
            {
              type: 'PARTY_RELATIONSHIP-TYPE:REPRESENTATIVE',
              party: {
                name: 'Acme Co.',
                extIds: [{ identificationSpace: 'TAXID-PL-NIP', identifier: '898123432' }],
              },
              attributes: { relationshipDescription: 'Salesman' },
            },
          ],
        },
        role: 'SIGNER',
        participationStatus: 'COMPLETED',
        constraints: [
          {
            classifiers: ['CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY'],
            attributes: { priority: 2 },
          },
          {
            classifiers: ['CONSTRAINT-UNIQUE_TYPE:SIGNATURE_TYPE'],
            attributes: { requiredClassifiers: ['SIGNATURE_PROVIDER-SIGNATURE_TYPE:BASIC'] },
          },
        ],
        currentUser: true,
        participationEvents: [
          { eventType: 'SIGNATURE', timestamp: '2020-10-21T15:48:34.863Z' },
          { eventType: 'VIEWING', timestamp: '2020-06-18T19:16:40.997Z' },
        ],
      },
      {
        party: {
          id: 'PARTY-PUBLIC_SIGNING_PROCESS_ID:bdb551b2',
          firstName: 'Maurice',
          lastName: 'Chevallier',
          name: 'Maurice Chevaller',
          contacts: [
            { type: 'CONTACT-TYPE:EMAIL', attributes: { email: 'chevallier1981@gmail.com' } },
          ],
        },
        role: 'SIGNER',
        participationStatus: 'PENDING',
        constraints: [
          {
            classifiers: ['CONSTRAINT-UNIQUE_TYPE:SIGNATURE_TYPE'],
            attributes: { requiredClassifiers: ['SIGNATURE_PROVIDER-SIGNATURE_TYPE:BASIC'] },
          },
          {
            classifiers: ['CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY'],
            attributes: { priority: 3 },
          },
        ],
        currentUser: false,
      },
      {
        party: {
          id: 'PARTY-PUBLIC_SIGNING_PROCESS_ID:4060e833',
          firstName: 'John',
          lastName: 'Smith',
          name: 'John Smith',
          contacts: [{ type: 'CONTACT-TYPE:EMAIL', attributes: { email: 'john.smith@acme.com' } }],
        },
        role: 'SENDER',
        participationStatus: 'COMPLETED',
        currentUser: true,
        participationEvents: [{ eventType: 'SUBMISSION', timestamp: '2020-06-18T19:16:40.997Z' }],
      },
    ],
    files: [
      {
        id: 'FILE-SOURCE_FILE:3cf4307e-63cc-4be9-b616-bd2b99d9778e',
        filename: 'SailCruiser-15-rental.pdf',
        description: null,
        version: '1',
        modificationTime: null,
        filePurpose: 'SOURCE_FILE',
        mimeType: 'application/pdf',
      },
      {
        id: 'FILE-DTBS:ac842283-afd4-4e26-9873-2bf35bd89b42/DTBS',
        filename: 'SailCruiser-15-rental.pdf',
        description: null,
        version: '999',
        modificationTime: null,
        filePurpose: 'PARTIALLY_SIGNED_CONTENT_FILE',
        mimeType: 'application/pdf',
      },
    ],
    tags: [],
    flags: ['FLAG:VIEWED'],
    createdAt: '2020-06-18T19:16:40.997Z',
    modifiedAt: '2020-10-21T15:48:34.863Z',
  }
}

/**
 * The response of "Listing files" (node bq2nod4bpilzk,
 * https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/bq2nod4bpilzk),
 * `GET /document-processes/{id}/files` with `Accept: application/json`.
 */
export function filesResponse() {
  return [
    {
      id: 'FILE-SOURCE_FILE:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      filename: 'example.pdf',
      description: null,
      version: '1',
      modificationTime: null,
      filePurpose: 'SOURCE_FILE',
      mimeType: 'application/pdf',
    },
    {
      id: 'FILE-SIGNED_CONTENT_FILE:yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy/DTBS',
      filename: 'example_title.pdf',
      description: null,
      version: '1000',
      modificationTime: null,
      filePurpose: 'SIGNED_CONTENT_FILE',
      mimeType: 'application/pdf',
    },
    {
      id: 'FILE-CONTENT_ARCHIVE:zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz/CONTENT_ARCHIVE',
      filename: 'example_title.zip',
      description: null,
      version: '1000',
      modificationTime: null,
      filePurpose: 'CONTENT_ARCHIVE',
      mimeType: 'application/zip',
    },
  ]
}

/**
 * `components.schemas.Event.examples` of the OpenAPI, the item schema of
 * `GET /document-processes/{id}/actions` (node 945d5931f2fcb).
 */
export function eventExamples() {
  return [
    {
      timestamp: '2023-11-13T20:20:39+00:00',
      id: 'EVENT-AUTENTI:f42c1e87-f814-4b89-b307-adff56b59b0f',
      eventType: 'EVENT_CLASSIFIER-UNIQUE_TYPE:SIGNATURE_REJECTION',
      classifiers: ['EVENT_CLASSIFIER-PROCESS:SIGNATURE'],
      actor: { id: 'PARTY-EMAIL:john@smith.com' },
      object: { id: 'DOCUMENT-a1ba4e0a-5cb1-11eb-ae93-0242ac130002' },
      attributes: { reason: 'The document includes non-agreed clauses' },
    },
    {
      timestamp: '2022-08-24T07:49:02.701Z',
      id: 'EVENT-AUTENTI:a3ccfe86-a16b-3c62-a4a7-0d86a03b1471',
      eventType: 'EVENT_CLASSIFIER-UNIQUE_TYPE:IDENTITY_VERIFICATION_FAILURE',
      classifiers: ['EVENT_CLASSIFIER-PROCESS:SIGNATURE'],
      actor: null,
      object: { id: 'PARTY-EMAIL:john@smith.com', type: 'EVENT_OBJECT-TYPE:PARTY' },
      attributes: { rejection_reasons: ['PERSONAL_DATA_MISMATCH'] },
    },
  ]
}

/**
 * The SENDER party's DOCUMENT_SENT event from "Document events"
 * (node 8440ff51acf3e).
 */
export function documentSentEvent() {
  return {
    timestamp: '2025-07-28T11:07:12.662Z',
    id: 'EVENT-AUTENTI:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    eventType: 'EVENT_CLASSIFIER-UNIQUE_TYPE:DOCUMENT_SENT',
    classifiers: ['EVENT_CLASSIFIER-PROCESS:SUBMISSION'],
    actor: { id: 'PARTY-PUBLIC_SENDER_ID:xxxxxxxx' },
    object: {
      id: 'DOCUMENT_PROCESS:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      type: 'EVENT_OBJECT-TYPE:DOCUMENT_PROCESS',
    },
    attributes: {},
  }
}
