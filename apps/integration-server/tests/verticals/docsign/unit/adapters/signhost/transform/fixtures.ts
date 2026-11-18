/**
 * Signhost fixtures, built from the documented example response.
 *
 * TRANSACTION_EXAMPLE is the "Postback Request Body Example" of
 * https://developer.signhost.com/guide/features/postbacks.md (also in
 * https://developer.signhost.com/llms-full.txt), copied verbatim. A postback
 * body is the Transaction model
 * (https://developer.signhost.com/openapi/models/Transaction.md), which is also
 * the 200 schema of `GET /api/transaction/{transactionId}`
 * (https://developer.signhost.com/openapi/transactions/getTransaction.md):
 * "**Schema:** [Transaction](/openapi/models/Transaction.md)".
 */
import type { RawSignhostTransaction } from '../../../../../../../src/verticals/docsign/adapters/signhost/transform/envelope'

export const TRANSACTION_EXAMPLE = {
  Id: 'b10ae331-af78-4e79-a39e-5b64693b6b68',
  Status: 30,
  Files: {
    'contract.pdf': {
      Links: [
        {
          Rel: 'file',
          Type: 'application/pdf',
          Link: 'https://api.signhost.com/api/transaction/b10ae331-af78-4e79-a39e-5b64693b6b68/file/contract.pdf',
        },
      ],
      DisplayName: 'contract.pdf',
    },
  },
  Seal: false,
  Signers: [
    {
      Id: 'fa95495d-6c59-48e0-962a-a4552f8d6b85',
      Expires: '2025-11-30T06:00:00+01:00',
      Email: 'user@example.com',
      Authentications: [],
      Verifications: [
        {
          Type: 'Scribble',
          RequireHandsignature: true,
          ScribbleNameFixed: true,
          ScribbleName: 'John Doe',
        },
        {
          Type: 'IPAddress',
          IPAddress: '203.0.113.42',
        },
      ],
      Mobile: null,
      Iban: null,
      BSN: null,
      RequireScribbleName: true,
      RequireScribble: true,
      RequireEmailVerification: true,
      RequireSmsVerification: false,
      RequireIdealVerification: false,
      RequireDigidVerification: false,
      RequireSurfnetVerification: false,
      SendSignRequest: true,
      SendSignConfirmation: true,
      SignRequestMessage:
        'Dear John,\n\nThis automated email is intended to inform you that one or more documents need to be signed.',
      DaysToRemind: 7,
      Language: 'en',
      ScribbleName: 'John Doe',
      ScribbleNameFixed: true,
      Reference: '',
      IntroText: null,
      ReturnUrl: null,
      AllowDelegation: false,
      Activities: [
        {
          Id: 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6',
          Code: 101,
          Activity: 'InvitationSent',
          CreatedDateTime: '2016-06-15T23:30:00.0000000+02:00',
        },
        {
          Id: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
          Code: 103,
          Activity: 'Opened',
          CreatedDateTime: '2016-06-15T23:33:04.1965465+02:00',
        },
        {
          Id: 'c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8',
          Code: 105,
          Activity: 'DocumentOpened',
          Info: 'contract.pdf',
          CreatedDateTime: '2016-06-15T23:33:10.0000000+02:00',
        },
        {
          Id: 'f6a7b8c9-d0e1-42f3-a4b5-c6d7e8f9a0b1',
          Code: 203,
          Activity: 'Signed',
          CreatedDateTime: '2016-06-15T23:38:04.1965465+02:00',
        },
        {
          Id: 'a7b8c9d0-e1f2-43a4-b5c6-d7e8f9a0b1c2',
          Code: 301,
          Activity: 'SignedDocumentSent',
          CreatedDateTime: '2016-06-15T23:38:15.0000000+02:00',
        },
        {
          Id: 'b8c9d0e1-f2a3-44b5-c6d7-e8f9a0b1c2d3',
          Code: 401,
          Activity: 'ReceiptSent',
          CreatedDateTime: '2016-06-15T23:38:16.0000000+02:00',
        },
        {
          Id: 'c9d0e1f2-a3b4-45c6-d7e8-f9a0b1c2d3e4',
          Code: 302,
          Activity: 'SignedDocumentOpened',
          CreatedDateTime: '2016-06-15T23:40:30.0000000+02:00',
        },
        {
          Id: 'd0e1f2a3-b4c5-46d7-e8f9-a0b1c2d3e4f5',
          Code: 402,
          Activity: 'ReceiptOpened',
          CreatedDateTime: '2016-06-15T23:40:35.0000000+02:00',
        },
        {
          Id: 'a3b4c5d6-e7f8-49a0-b1c2-d3e4f5a6b7c8',
          Code: 303,
          Activity: 'SignedDocumentDownloaded',
          CreatedDateTime: '2016-06-15T23:42:30.0000000+02:00',
        },
      ],
      RejectReason: null,
      DelegateReason: null,
      DelegateSignerEmail: null,
      DelegateSignerName: null,
      DelegateSignUrl: null,
      SignUrl: 'https://view.signhost.com/sign/d3c93bd6-f1ce-48e7-8c9c-c2babfdd4034',
      SignedDateTime: '2016-06-15T23:38:10+02:00',
      RejectDateTime: null,
      CreatedDateTime: '2016-06-15T23:30:00.0000000+02:00',
      SignerDelegationDateTime: null,
      ModifiedDateTime: '2016-06-15T23:38:12.0000000+02:00',
      ShowUrl:
        'https://view.signhost.com/show/document/b10ae331-af78-4e79-a39e-5b64693b6b68?signerId=d3c93bd6-f1ce-48e7-8c9c-c2babfdd4034',
      ReceiptUrl:
        'https://view.signhost.com/show/receipt/b10ae331-af78-4e79-a39e-5b64693b6b68?signerId=d3c93bd6-f1ce-48e7-8c9c-c2babfdd4034',
      Context: {
        'contract.pdf': {},
      },
    },
  ],
  Receivers: [],
  Reference: '',
  PostbackUrl: null,
  SignRequestMode: 2,
  DaysToExpire: 30,
  SendEmailNotifications: true,
  Language: 'en',
  CreatedDateTime: '2016-06-15T23:30:00.0000000+02:00',
  ModifiedDateTime: '2016-06-15T23:38:16.0000000+02:00',
  CanceledDateTime: null,
  Context: null,
  Checksum: 'b5a99e1de5b9e0e9915df09d3b819be188dae900',
} satisfies RawSignhostTransaction

export type ExampleSigner = (typeof TRANSACTION_EXAMPLE)['Signers'][number]

/** The documented example transaction, deep-copied so a test can edit it. */
export function exampleTransaction(): typeof TRANSACTION_EXAMPLE {
  return structuredClone(TRANSACTION_EXAMPLE)
}
