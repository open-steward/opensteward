import type { RawSprinklrCase } from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/ticket'
import type { RawSprinklrMessage } from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/message'

/**
 * The "Example - Response" `data` object of "GET - Read Case by Case Id"
 * (https://dev.sprinklr.com/read-case-by-case-id), with the customProperties
 * map shortened to one entry.
 */
const docCase = {
  id: '00000197203b3fe5e4b0324aec609fcf',
  caseNumber: 7030591,
  subject: '#7030591 Sprinklr_voice ',
  version: 350,
  status: 'Archived',
  priority: 'High',
  externalCase: { channelType: 'SPRINKLR_VOICE', modifiedTime: 1748592443434 },
  externalCaseInfo: { externalCases: [] },
  workflow: {
    assignment: {
      assigneeId: '66007905',
      assigneeType: 'USER',
      assignedById: 66008059,
      assignmentTime: 1749111272934,
    },
    customProperties: { spr_uc_status: ['Archived'] },
    queues: [],
  },
  channelCustomProperties: [],
  contact: {
    id: 'SPRINKLR_VOICE___SPR_DEFAULT_PROFILE__',
    channelType: 'SPRINKLR_VOICE',
    channelId: '__SPR_DEFAULT_PROFILE__',
    fromSnUserId: '__SPR_DEFAULT_PROFILE__',
  },
  createdTime: 1870316100000,
  modifiedTime: 1749644307104,
  firstMessageId:
    'VOICE_66124440_1870316106825_SPRINKLR_VOICE_384_00000197203b3fe5e4b0324aec609fcf_recording_2048c2432c24b3d7e1464b7a273d202387ca104f875f6086b067aa0d2cdc9d55',
  latestProfileMessageAssociatedTime: 0,
  conversationId: '0000019720ef0af5e4b08d974f6611e8',
  firstMessageAssociatedTime: 1870316106825,
  latestMessageAssociatedTime: 1748604239691,
  allEngagedUsersList: ['66064014', '66007905'],
  associatedFanMessageCount: 1,
  associatedBrandMessageCount: 5,
  deleted: false,
}
export const DOC_CASE: RawSprinklrCase = docCase

/**
 * The "Sample - Response" `data[0]` of "POST Read Message (Bulk)"
 * (https://dev.sprinklr.com/read-messages-bulk), receiverProfile and
 * enrichments trimmed.
 */
const docMessage = {
  sourceType: 'VOICE',
  sourceId: 66076376,
  content: {
    attachment: { commands: [{ from: '+12025391107', type: 'INCOMING_CALL' }], type: 'VOICE' },
    isRichText: false,
  },
  channelMessageId: '000001932ab35db8e4b042fc69f4425d',
  channelType: 'SPRINKLR_VOICE',
  accountType: 'SPRINKLR_VOICE',
  channelCreatedTime: 1731588218296,
  senderProfile: {
    name: '+12025391107',
    channelType: 'SPRINKLR_VOICE',
    channelId: '+12025391107',
    username: '+12025391107',
  },
  messageId: 'VOICE_66076376_1731588218296_SPRINKLR_VOICE_325_000001932ab35db8e4b042fc69f4425d',
  brandPost: false,
  createdTime: 1731588218337,
  modifiedTime: 1731588218337,
  conversationId: '000001932ab35afae4b042fc69f4425b',
  autoImported: false,
  autoResponse: false,
  associatedCaseNumber: 5313675,
}
export const DOC_MESSAGE: RawSprinklrMessage = docMessage
