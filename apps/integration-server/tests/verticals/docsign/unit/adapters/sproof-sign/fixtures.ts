/**
 * Fixtures built from the documented examples in sproof Sign's OpenAPI spec,
 * https://sign.sproof.com/api/v1/documentation/json (version 3.0.8):
 * `components.schemas._Document`, `_Member` and `_PaginationObject`.
 *
 * Every field name and example value below is copied from that spec. Where a
 * test needs a second member or document, it varies only documented fields.
 */
import type {
  RawSproofDocument,
  RawSproofMember,
} from '../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/shared'

/**
 * `_Member` example, verbatim, with every field `_Member.required` lists.
 * `signaturePosition` has no example of its own in `_Member`: its value is
 * the position example the spec gives for a signer recipient
 * (`{"page":0,"x":0.57489,"y":0.8455,"width":0.35,"height":0.1}`) plus the
 * `SignaturePositionResponse` examples for `cardStyle`, `pageWidth` and
 * `pageHeight`.
 */
export const MEMBER_EXAMPLE: RawSproofMember = {
  id: '0dd4a4718ad3669c7133a615d955b4a89f5f11452de55d21d7ca0fff859a08c698b5a3',
  email: 'max.mustermann@sproof.com',
  firstName: 'Max',
  lastName: 'Mustermann',
  lastActivityAt: '2022-04-05T08:58:04.206Z',
  createdAt: '2022-04-05T08:58:04.206Z',
  signed: false,
  isAdmin: true,
  isSigner: false,
  isApprover: false,
  isViewer: false,
  approvedAt: null,
  viewedAt: null,
  signedAt: null,
  signaturePosition: {
    page: 0,
    x: 0.57489,
    y: 0.8455,
    width: 0.35,
    height: 0.1,
    cardStyle: 'default',
    pageWidth: 478,
    pageHeight: 675,
  },
  signingOrder: 1,
  declinedAt: null,
  signatures: [{ signatureType: 'aes_sproof', signedAt: '2023-05-26T08:03:42.946Z' }],
}

/** An invited signer who has signed, shaped by `_Member`. */
export function signerMember(i: number, over: Partial<RawSproofMember> = {}): RawSproofMember {
  return {
    ...MEMBER_EXAMPLE,
    id: `member${i}`,
    email: `signer${i}@sproof.com`,
    firstName: `First${i}`,
    lastName: `Last${i}`,
    isAdmin: false,
    isSigner: true,
    signed: true,
    signedAt: '2023-05-26T08:03:42.946Z',
    signingOrder: 1,
    ...over,
  }
}

/** `_Document` example, verbatim, with the `_Member` example as its owner. */
export const DOCUMENT_EXAMPLE: RawSproofDocument = {
  name: 'important_contract',
  id: '7c4d105bf2cc7a146ce00b873563770fc8be20fe8c9946552dd212cdc2b49a554a356a',
  updatedAt: '2022-03-28T14:40:06.698Z',
  createdAt: '2022-03-28T14:36:06.314Z',
  signaturesTypes: [],
  callbackUrl: 'string',
  returnUrl: 'https://sign.sproof.com',
  returnBtnText: 'Back to the Dashboard',
  inPersonSigning: false,
  signingRound: 2,
  state: 'pending',
  member: MEMBER_EXAMPLE,
  members: [],
  boxes: [],
  refId: 'Aug24-1234',
  allSignersSigned: false,
  allMembersSigned: false,
  focusedSigningMode: false,
}

/** The `i`th document of a list, owner member id `owner<i>`. */
export function documentRow(i: number, over: Partial<RawSproofDocument> = {}): RawSproofDocument {
  return {
    ...DOCUMENT_EXAMPLE,
    id: `doc${i}`,
    name: `contract_${i}`,
    member: { ...MEMBER_EXAMPLE, id: `owner${i}` },
    ...over,
  }
}
