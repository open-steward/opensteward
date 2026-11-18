/**
 * Twenty REST records, shaped from Twenty's own source (docs.twenty.com says
 * "There is no static API reference for Twenty. Each workspace has its own
 * schema", so the standard objects' definitions are the reference):
 *
 * - Find-many envelope, rest-api-find-many.handler.ts:
 *     `return { data: { [objectNamePlural]: records }, totalCount: Number(...), pageInfo }`
 * - Find-one envelope, rest-api-find-one.handler.ts:
 *     `return { data: { [objectNameSingular]: record } }`
 * - Fields at the default `depth` 0 (get-all-selectable-fields.util.ts): every
 *   scalar and composite field, and for a MANY_TO_ONE relation only its join
 *   column (`companyId`, not `company`). Every object also gets "automatic
 *   system fields: `id`, `createdAt`, `updatedAt`, `createdBy`, and `position`"
 *   (https://docs.twenty.com/getting-started/core-concepts/data-model.md).
 * - Standard objects at twentyhq/twenty@f5b41d837c40e6c21f8522c44979352cc9d2dc1e
 *   packages/twenty-server/src/modules/<object>/standard-objects/*.workspace-entity.ts,
 *   composite types in packages/twenty-shared/src/types/composite-types/.
 */

const ACTOR = {
  source: 'MANUAL',
  workspaceMemberId: '20202020-0687-4c41-b707-ed1bfca972a7',
  name: 'Tim Apple',
  context: {},
}

/** PersonWorkspaceEntity: name (FullNameMetadata), emails, phones, jobTitle, companyId. */
export const PERSON = {
  id: '20202020-1c0e-494c-a1b6-85b1c6fefaa5',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T14:20:00.000Z',
  deletedAt: null,
  name: { firstName: 'Christoph', lastName: 'Callisto' },
  emails: { primaryEmail: 'christoph.calisto@linkedin.com', additionalEmails: null },
  linkedinLink: { primaryLinkLabel: '', primaryLinkUrl: '', secondaryLinks: null },
  jobTitle: 'CEO',
  phones: {
    primaryPhoneNumber: '789012345',
    primaryPhoneCountryCode: 'FR',
    primaryPhoneCallingCode: '+33',
    additionalPhones: null,
  },
  position: 1,
  createdBy: ACTOR,
  updatedBy: ACTOR,
  companyId: '20202020-3ec3-4fe3-8997-b76aa0bfa408',
}

/** CompanyWorkspaceEntity: name, domainName (LinksMetadata), annualRevenue, accountOwnerId. */
export const COMPANY = {
  id: '20202020-3ec3-4fe3-8997-b76aa0bfa408',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T14:20:00.000Z',
  deletedAt: null,
  name: 'Linkedin',
  domainName: {
    primaryLinkLabel: '',
    primaryLinkUrl: 'https://linkedin.com',
    secondaryLinks: null,
  },
  linkedinLink: { primaryLinkLabel: '', primaryLinkUrl: '', secondaryLinks: null },
  annualRevenue: { amountMicros: null, currencyCode: '' },
  position: 1,
  createdBy: ACTOR,
  updatedBy: ACTOR,
  accountOwnerId: '20202020-0687-4c41-b707-ed1bfca972a7',
}

/** OpportunityWorkspaceEntity: name, amount (CurrencyMetadata), closeDate, stage, pointOfContactId, companyId, ownerId. */
export const OPPORTUNITY = {
  id: '20202020-be10-412b-a663-16bd3c2228e1',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T14:20:00.000Z',
  deletedAt: null,
  name: 'Linkedin expansion',
  amount: { amountMicros: 1_250_500_000, currencyCode: 'EUR' },
  closeDate: '2026-03-31T00:00:00.000Z',
  stage: 'MEETING',
  position: 1,
  createdBy: ACTOR,
  updatedBy: ACTOR,
  pointOfContactId: '20202020-1c0e-494c-a1b6-85b1c6fefaa5',
  companyId: '20202020-3ec3-4fe3-8997-b76aa0bfa408',
  ownerId: '20202020-0687-4c41-b707-ed1bfca972a7',
}

/** NoteWorkspaceEntity: title, bodyV2 (RichTextMetadata { blocknote, markdown }). */
export const NOTE = {
  id: '20202020-a3f5-4b2c-9d3e-2f1b6c8e7a90',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T14:20:00.000Z',
  deletedAt: null,
  position: 1,
  title: 'Q1 call',
  bodyV2: { blocknote: '[{"type":"paragraph"}]', markdown: 'Follow up on Q1 expansion' },
  createdBy: ACTOR,
  updatedBy: ACTOR,
}

/** TaskWorkspaceEntity: title, bodyV2, dueAt, status (TODO | IN_PROGRESS | DONE), assigneeId. */
export const TASK = {
  id: '20202020-7c1d-4e8a-b5f2-3a9d0e6c4b12',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T14:20:00.000Z',
  deletedAt: null,
  position: 1,
  title: 'Send the proposal',
  bodyV2: { blocknote: null, markdown: 'Draft and send the Q1 proposal' },
  dueAt: '2026-02-10T17:00:00.000Z',
  status: 'IN_PROGRESS',
  createdBy: ACTOR,
  updatedBy: ACTOR,
  assigneeId: '20202020-0687-4c41-b707-ed1bfca972a7',
}
