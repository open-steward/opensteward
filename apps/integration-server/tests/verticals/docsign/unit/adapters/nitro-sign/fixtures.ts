/**
 * Nitro Sign Public API fixtures, built from the first-party OpenAPI document
 * https://api.gonitro.dev/openapi.json (info.title "Nitro Sign Public API",
 * info.version "0.1"), as rendered at
 * https://developers.gonitro.com/docs/api-reference/sign/.
 */

/**
 * `GET /sign/envelopes/{envelopeID}/documents` → "List Documents Response
 * Example", verbatim — including the spec's own `statue` typo, which is why
 * the transform never depends on `status` being present.
 */
export const LIST_DOCUMENTS_EXAMPLE = {
  items: [
    {
      ID: '987e6543-e21b-12d3-a456-426614174999',
      name: 'Document',
      statue: 'pending',
      createdAt: '2023-11-07T05:31:56Z',
    },
  ],
}

/**
 * One `UploadedDocumentResponse`: every property that schema declares
 * (`ID`, `name`, `createdAt`, `status`, `sizeBytes`, `numPages`). The ID and
 * createdAt are the list example's; `status` is the documented enum value
 * `uploaded`; sizes are illustrative integers.
 */
export const UPLOADED_DOCUMENT = {
  ID: '987e6543-e21b-12d3-a456-426614174999',
  name: 'Document',
  createdAt: '2023-11-07T05:31:56Z',
  status: 'uploaded',
  sizeBytes: 248320,
  numPages: 12,
}

/**
 * `GET /sign/envelopes/{envelopeID}/participants` returns a `ParticipantList`
 * (`items`, `total`) of `Participant` (`ID`, `email`, `role`,
 * `authentication`). The spec carries no response example, so the items use
 * the values of the "Create Participants" request examples in the same
 * document (`"email":"user@gonitro.com","role":"SIGNER","authentication":
 * {"type":"AccessCode","accessCode":"123456"}` and the SMS variant) and the
 * tutorial's response example ID `participant-111`
 * (https://developers.gonitro.com/docs/build-nitro/create-envelope.md).
 */
export const PARTICIPANT_ACCESS_CODE = {
  ID: 'participant-111',
  email: 'user@gonitro.com',
  role: 'SIGNER',
  authentication: { type: 'AccessCode', accessCode: '123456' },
}

export const PARTICIPANT_SMS = {
  ID: 'participant-112',
  email: 'user1@gonitro.com',
  role: 'SIGNER',
  authentication: { type: 'SMS', countryCode: '+1', phoneNumber: '1234567890' },
}

/** The tutorial's lower-case role spelling: `"role": "signer"` / `cc`. */
export const PARTICIPANT_CC = {
  ID: 'participant-113',
  email: 'john.doe@example.com',
  role: 'cc',
}
