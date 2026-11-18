/**
 * Concord fixtures, shaped by
 * https://api.doc.concordnow.com/concord-openapi-bundled.yaml.
 *
 * Where the spec gives an `example:` the value is that example. Where it gives
 * none, the value is a PLACEHOLDER chosen for the test, and the fixture's
 * comment says so. Placeholders: every email address on a signature slot
 * (SlotReservationGet.user.email, email.email and signature.info.email have no
 * example), SignatureInfoSlotGet.signature.date, and every value of
 * ATTACHMENT_EXAMPLE except createdBy (Attachment has no examples at all).
 * No transform decision rests on a placeholder's value, only on its presence.
 */

/** AgreementListItemDto, per-field examples. */
export const AGREEMENT_LIST_ITEM_EXAMPLE = {
  accessFromRole: false,
  accessType: 'FOLDER',
  createdAt: 1456763982000,
  createdBy: 123,
  createdByIsActive: true,
  createdByName: 'John doe',
  description: 'NDA',
  endDate: 1548979200000,
  endDateUnknown: true,
  folderId: 123,
  hasSigned: true,
  isInboxed: true,
  isBookmarked: true,
  modifiedAt: 1456763982000,
  mustValidate: false,
  organizationId: 1,
  signatureCount: 1,
  signatureDate: 1548979200000,
  signatureDateUnknown: false,
  signatureRequired: 1,
  signatureProvider: 'CONCORD',
  status: 'UNKNOWN_CONTRACT',
  tags: [],
  title: 'Non',
  unread: false,
  uuid: '01sp9L4YEZNcLHaSV8447N',
  validated: false,
  validationCount: 1,
  validationRequired: 1,
}

/**
 * GetAgreementresponse. `metadata` is the GetMetadataresponse example
 * verbatim; `uid` is the AgreementUid example; `creation` follows Creation /
 * Creator with the Creator.user examples (name "John Doe", email
 * "john.doe@awesome-corp.com").
 */
export const GET_AGREEMENT_EXAMPLE = {
  uid: '01sp9L4YEZNcLHaSV8447N',
  folderId: '123',
  lastPublicVersion: 1,
  lock: {},
  metadata: {
    organization: { id: 1, name: 'My Organization' },
    title: 'Non-Disclosure Agreement',
    description: 'This NDA covers the company for 10 years.',
    status: 'DRAFT',
    read: true,
    inboxed: true,
    bookmarked: true,
    accessFromRole: false,
    trackChanges: false,
    trashed: false,
    lastAccessAt: 1459499655224,
    tags: [{ id: 1, name: 'Monday' }],
  },
  canUseVersioning: true,
  canUseClausePicker: true,
  canUseSingleClause: true,
  canUseOrganizationFieldItem: true,
  permission: 'FULL',
  creation: {
    date: 1456763982000,
    creator: {
      user: { id: 14, name: 'John Doe', email: 'john.doe@awesome-corp.com' },
      organization: { id: 1, name: 'My Organization' },
    },
  },
}

/**
 * SignatureInfoSlotGet, per-field examples: slot id 33; reservation user
 * name "John Smith"; signature.info name "John Smith", organization "Acme
 * Corp", job "Lawyer", font "daniel", signature "John Smith", timezone
 * "America/Chicago", image "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAkwAAABMCAYAAACf...".
 * PLACEHOLDERS: both email addresses and signature.date (type is a documented enum value).
 */
export const SIGNED_SLOT_EXAMPLE = {
  id: 33,
  reservation: {
    type: 'USER',
    user: { id: 14, name: 'John Smith', email: 'john.smith@acme.example' },
  },
  signature: {
    date: '2026-02-01T14:20:00Z',
    type: 'DRAWN_IMAGE',
    info: {
      name: 'John Smith',
      organization: 'Acme Corp',
      job: 'Lawyer',
      email: 'john.smith@acme.example',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAkwAAABMCAYAAACf...',
      font: 'daniel',
      signature: 'John Smith',
      timezone: 'America/Chicago',
    },
  },
}

/** An unsigned slot reserved to a group (SlotReservationGet.group example "Legal dept."). */
export const GROUP_SLOT_EXAMPLE = {
  id: 34,
  reservation: { type: 'GROUP', group: { id: 7, deleted: false, name: 'Legal dept.' } },
}

/**
 * A slot reserved to the group "Legal dept." and signed by "John Smith" (both
 * spec examples): the signatory, not the reservation, names the signer.
 * PLACEHOLDER: signature.date.
 */
export const GROUP_SIGNED_SLOT_EXAMPLE = {
  id: 37,
  reservation: { type: 'GROUP', group: { id: 7, deleted: false, name: 'Legal dept.' } },
  signature: {
    date: '2026-02-01T14:20:00Z',
    type: 'DRAWN_IMAGE',
    info: { name: 'John Smith', organization: 'Acme Corp', job: 'Lawyer' },
  },
}

/**
 * An unsigned slot reserved to a user (SlotReservationGet.user.name example
 * "John Smith"). PLACEHOLDER: the email.
 */
export const USER_SLOT_EXAMPLE = {
  id: 38,
  reservation: {
    type: 'USER',
    user: { id: 14, name: 'John Smith', email: 'john.smith@acme.example' },
  },
}

/** An unsigned slot reserved to an organization (SlotReservationGet.organization.name example "Acme corp"). */
export const ORGANIZATION_SLOT_EXAMPLE = {
  id: 39,
  reservation: { type: 'ORGANIZATION', organization: { id: 1, name: 'Acme corp' } },
}

/** An unsigned slot open to anyone outside the organization: it names no signer. */
export const OPEN_SLOT_EXAMPLE = {
  id: 35,
  reservation: { type: 'NOT_ORGANIZATION' },
}

/**
 * Attachment. The schema documents types only, no examples: every value here
 * except createdBy (UserDto examples) is a PLACEHOLDER.
 */
export const ATTACHMENT_EXAMPLE = {
  id: 'att-1',
  uid: '01sp9L4YEZNcLHaSV8447N',
  fileName: 'annex-a.pdf',
  name: 'Annex A',
  description: 'Pricing annex',
  hasPreview: true,
  url: 'https://files.concordnow.example/annex-a.pdf',
  data: 'JVBERi0xLjQK',
  createdAt: '2026-01-15T09:30:00Z',
  createdBy: { id: 14, name: 'userName', email: 'test@mail.fr', newUserId: 'u' },
}

/** ActivityAudit, required fields, action AGREEMENT_VIEW ("User read the contract"). */
export const AUDIT_ACTIVITY_EXAMPLE = {
  id: 'act-1',
  organization: { id: 1, name: 'My Organization' },
  createdAt: 1456763982000,
  action: 'AGREEMENT_VIEW',
  status: 'CONTRACT',
  params: '',
  userOrganization: {
    id: 3,
    job: 'R&D Manager',
    user: { id: 14, email: 'test@mail.fr', name: 'userName' },
    organization: { id: 1, name: 'My Organization' },
  },
  visibility: 'ALL',
}
