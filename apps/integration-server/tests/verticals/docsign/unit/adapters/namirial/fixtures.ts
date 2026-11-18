/**
 * Namirial eSignAnyWhere v6 response fixtures.
 *
 * The swagger (https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json)
 * ships no example responses, so each fixture is built field for field from
 * the response model it names there: only documented property names, and
 * enum members taken from the model's `enum`.
 */
import type {
  RawNamirialEnvelope,
  RawNamirialEnvelopeFiles,
  RawNamirialEnvelopeFindResponse,
  RawNamirialEnvelopeHistory,
  RawNamirialTemplate,
  RawNamirialTemplateFiles,
  RawNamirialTemplateFindResponse,
} from '../../../../../../src/verticals/docsign/adapters/namirial/types'

export const ENVELOPE_ID = '0f06ec86-1234-1234-1234-2b70cf544c24'
export const TEMPLATE_ID = '7c2a1e44-5b6d-4f1a-9e3b-0a1b2c3d4e5f'

/** `EnvelopeFindResponse`. */
export const ENVELOPE_FIND_EXAMPLE: RawNamirialEnvelopeFindResponse = {
  Envelopes: [
    {
      Status: 'Active',
      Id: ENVELOPE_ID,
      Name: 'Project proposal',
      MetaData: 'crm-ref-42',
      IsExpiringSoon: false,
    },
  ],
}

/** `EnvelopeGetResponse` with one of each recipient action and an automatic signature. */
export const ENVELOPE_GET_EXAMPLE: RawNamirialEnvelope = {
  Id: ENVELOPE_ID,
  EnvelopeStatus: 'Active',
  Name: 'Project proposal',
  SentDate: '2017-07-21T17:32:28Z',
  Activities: [
    {
      Id: 'a1000000-0000-0000-0000-000000000001',
      Status: 'Completed',
      FinishedDate: '2017-07-22T09:00:00Z',
      OpenedDate: '2017-07-22T08:55:00Z',
      Action: {
        Sign: {
          ContactInformation: {
            Email: 'bob@example.com',
            GivenName: 'Bob',
            Surname: 'Builder',
            LanguageCode: 'EN',
          },
          SigningGroup: 1,
        },
      },
    },
    {
      Id: 'a1000000-0000-0000-0000-000000000002',
      Status: 'Rejected',
      StatusReason: 'Budget not approved',
      FinishedDate: '2017-07-23T10:00:00Z',
      OpenedDate: '2017-07-23T09:30:00Z',
      Action: {
        Sign: {
          ContactInformation: { Email: 'eve@example.com', GivenName: 'Eve', Surname: 'Adams' },
          SigningGroup: 1,
        },
      },
    },
    {
      Id: 'a1000000-0000-0000-0000-000000000003',
      Status: 'Pending',
      Action: {
        View: {
          ContactInformation: { Email: 'grace@example.com', GivenName: 'Grace', Surname: 'Hopper' },
          ViewingGroup: 2,
        },
      },
    },
    {
      Id: 'a1000000-0000-0000-0000-000000000004',
      Status: 'Pending',
      Action: { SignAutomatic: { ProfileId: 'profile-1', RenderingLanguageCode: 'EN' } },
    },
    {
      Id: 'a1000000-0000-0000-0000-000000000005',
      Status: 'Pending',
      Action: {
        SendCopy: {
          ContactInformation: { Email: 'alice@example.com', GivenName: 'Alice', Surname: 'Smith' },
          CopyingGroup: 3,
        },
      },
    },
  ],
  SenderUserInformation: { Email: 'alice@example.com', GivenName: 'Alice', Surname: 'Smith' },
}

/** `EnvelopeGetFilesResponse`. */
export const ENVELOPE_FILES_EXAMPLE: RawNamirialEnvelopeFiles = {
  Documents: [
    {
      FileId: 'f2000000-0000-0000-0000-000000000001',
      FileName: 'proposal.pdf',
      Attachments: [],
      PageCount: 12,
      DocumentNumber: 1,
    },
  ],
  AuditTrail: {
    FileId: 'f2000000-0000-0000-0000-0000000000a1',
    XmlFileId: 'f2000000-0000-0000-0000-0000000000a2',
  },
  LegalDocuments: [],
}

/**
 * `EnvelopeGetHistoryResponse`: one fired event, one still to fire. `Type` is a
 * free string in the swagger; the values here are the callback `Action` names
 * from the API Documentation page ("sendSignNotification : when the sign
 * notification was sent"), used only as opaque strings.
 */
export const ENVELOPE_HISTORY_EXAMPLE: RawNamirialEnvelopeHistory = {
  Events: [
    {
      CreationDate: '2017-07-21T17:32:28Z',
      Type: 'sendSignNotification',
      AffectedRecipient: {
        Id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        Email: 'bob@example.com',
        GivenName: 'Bob',
        Surname: 'Builder',
      },
      Completed: true,
      CompletedOn: '2017-07-21T17:32:30Z',
      IsInErrorState: false,
      Attempt: 1,
      RemainingAttempts: 29,
      TraceId: 'trace-1',
    },
    {
      CreationDate: '2017-07-21T17:32:28Z',
      Type: 'envelopeExpired',
      Completed: false,
      IsInErrorState: false,
      NextAttemptOn: '2017-08-21T17:32:28Z',
      Attempt: 0,
      RemainingAttempts: 30,
    },
  ],
  EnvelopeHasBeenDeleted: false,
}

/** `TemplateFindResponse`. */
export const TEMPLATE_FIND_EXAMPLE: RawNamirialTemplateFindResponse = {
  Templates: [{ Id: TEMPLATE_ID, Name: 'NDA', MetaData: 'legal' }],
}

/** `TemplateGetResponse`: one placeholder signer, one concrete contact. */
export const TEMPLATE_GET_EXAMPLE: RawNamirialTemplate = {
  Id: TEMPLATE_ID,
  Name: 'NDA',
  CreationDate: '2017-07-21T17:32:28Z',
  Activities: [
    {
      Id: 't1000000-0000-0000-0000-000000000001',
      Action: { SignPlaceholder: { SigningGroup: 1, PlaceholderLabel: 'Customer' } },
    },
    {
      Id: 't1000000-0000-0000-0000-000000000002',
      Action: {
        Sign: {
          ContactInformation: { Email: 'legal@example.com', GivenName: 'Lee', Surname: 'Gal' },
          SigningGroup: 2,
        },
      },
    },
  ],
}

/** `TemplateGetFilesResponse`. */
export const TEMPLATE_FILES_EXAMPLE: RawNamirialTemplateFiles = {
  Documents: [
    { FileName: 'nda.pdf', PageCount: 3, Pages: [], DocumentNumber: 1 },
    { FileName: 'annex.pdf', PageCount: 1, Pages: [], DocumentNumber: 2 },
  ],
}
