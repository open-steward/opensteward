/**
 * Fixtures shaped on the documented example responses of the Goodflag
 * Signature Workflow Manager API (the `Workflow`, `Document` and
 * `WorkflowTemplate` types). The docs' examples fill every string with
 * "string" and every number with 1; the values here are realistic stand-ins
 * of the same type, with the documented id prefixes (`wfl_`, `stp_`, `doc_`,
 * `wtm_`, `usr_`, `cop_`, `grp_`, `ten_`) and millisecond timestamps.
 */
import type { RawGoodflagWorkflow } from '../../../../../../src/verticals/docsign/adapters/lex-persona/transform/envelope'
import type { RawGoodflagDocument } from '../../../../../../src/verticals/docsign/adapters/lex-persona/transform/document'
import type { RawGoodflagTemplate } from '../../../../../../src/verticals/docsign/adapters/lex-persona/transform/template'

const recipient = (email: string, firstName: string, lastName: string) => ({
  consentPageId: 'cop_Default',
  email,
  firstName,
  lastName,
  country: 'FR',
})

const step = (
  id: string,
  stepType: 'approval' | 'signature',
  recipients: ReturnType<typeof recipient>[],
  isStarted: boolean,
  isFinished: boolean,
) => ({
  stepType,
  id,
  recipients,
  requiredRecipients: recipients.length,
  validityPeriod: 4320000000,
  invitePeriod: 1340000000,
  maxInvites: 5,
  sendDownloadLink: true,
  isStarted,
  isFinished,
  allowComments: true,
  hideAttachments: false,
  viewConfidentialAttachments: false,
  hideWorkflowRecipients: false,
  logs: [],
})

export function workflow(overrides: Partial<RawGoodflagWorkflow> = {}): RawGoodflagWorkflow {
  return {
    workflowMode: 'FULL',
    steps: [
      step('stp_A', 'approval', [recipient('alice@example.com', 'Alice', 'Martin')], true, true),
      step(
        'stp_B',
        'signature',
        [
          recipient('bob@example.com', 'Bob', 'Durand'),
          recipient('carol@example.com', 'Carol', 'Petit'),
        ],
        true,
        false,
      ),
      step('stp_C', 'signature', [recipient('dave@example.com', 'Dave', 'Roux')], false, false),
    ],
    created: 1783777360803,
    currentRecipientEmails: ['bob@example.com'],
    currentRecipientUsers: [],
    email: 'owner@example.com',
    firstName: 'Olivia',
    groupId: 'grp_1',
    id: 'wfl_1',
    lastName: 'Admin',
    logs: [],
    name: 'Contrat de prestation',
    notifiedEvents: ['workflowFinished'],
    pictureResourceId: 'res_1',
    progress: 40,
    tenantId: 'ten_1',
    updated: 1783777460803,
    userId: 'usr_1',
    viewAuthorizedGroups: [],
    viewAuthorizedUsers: [],
    watchers: [],
    workflowStatus: 'started',
    description: 'Merci de signer',
    started: 1783777400000,
    templateId: 'wtm_1',
    ...overrides,
  }
}

export function document(overrides: Partial<RawGoodflagDocument> = {}): RawGoodflagDocument {
  const part = {
    contentType: 'application/pdf',
    filename: 'contrat.pdf',
    hash: 'a1b2c3',
    size: 248320,
    isOriginal: true,
  }
  return {
    created: 1783777360803,
    displayedParts: [part],
    groupId: 'grp_1',
    id: 'doc_1',
    parts: [part],
    tenantId: 'ten_1',
    updated: 1783777360803,
    userId: 'usr_1',
    viewAuthorizedGroups: [],
    viewAuthorizedUsers: [],
    workflowId: 'wfl_1',
    workflowName: 'Contrat de prestation',
    confidentiality: false,
    orderIndex: 2,
    signatureProfileId: 'sip_PAdES',
    ...overrides,
  }
}

export function template(overrides: Partial<RawGoodflagTemplate> = {}): RawGoodflagTemplate {
  return {
    layoutSelectionMode: 'any',
    steps: [{ id: 'stp_T1', stepType: 'signature' }],
    documentSelectionMode: 'list',
    coManagerSelectionMode: 'none',
    allowConsolidation: false,
    allowManagerAddStep: true,
    allowedLayouts: [],
    allowedSignatureProfiles: [],
    coManagerCanEditCoManager: false,
    coManagerNotifiedEvents: [],
    coManagerNotifiedEventsReadonly: false,
    coManagerUsersModifiable: false,
    created: 1783777360803,
    id: 'wtm_1',
    isDisabled: false,
    maxAttachments: 10,
    maxDocuments: 200,
    maxWatchers: 5,
    name: 'Modèle NDA',
    notifiedEvents: [],
    notifiedEventsReadonly: false,
    tenantId: 'ten_1',
    updated: 1783777460803,
    watchers: [],
    description: 'Accord de confidentialité',
    ...overrides,
  }
}
