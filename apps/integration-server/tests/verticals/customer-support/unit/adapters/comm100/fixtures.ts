/**
 * Rows copied from Comm100's documented example responses (trimmed of nested
 * objects the transforms do not read).
 */

/** https://developer.comm100.com/docs/server-api-ticketing-ticket — GET ticketing/tickets example. */
export const DOC_TICKET = {
  id: 11,
  subject: 'Chat Transcript with Michael',
  originalConversationId: '110778970771178_202317311617343',
  assigneeId: '1487fc9d-92e6-4487-a2e8-92e68d6892e6',
  departmentAssigneeId: '91B032D9-0D07-4798-95F7-7EA482BC592C',
  channelId: 'F9B07E54-0D35-4F53-BA63-1194E4297291',
  contactOrVisitorId: 'E23B5D3C-4E7E-4131-9B3A-52B061BA7DE4',
  assigneeType: 'agent',
  contactOrVisitorType: 'contact',
  status: 'new',
  priority: 'normal',
  mergedToTargetId: 89,
  totalReplies: 4,
  createdTime: '2021-05-12T08:10:53.48Z',
  lastUpdatedTime: '2021-04-07T05:59:17.887Z',
  lastStatusChangedTime: '2021-05-12T08:10:53.486Z',
  resolvedTime: '2021-05-12T08:10:53.486Z',
  isInRecycleBin: false,
  tags: [{ id: 'bdf96bad-890f-4af5-8f4e-42d2cc29e61b', name: 'my tag' }],
  tagIds: ['1487fc9d-92e6-4487-a2e8-92e68d6892e6'],
}

/** https://developer.comm100.com/docs/server-api-ticketing-message — GET ticketing/tickets/{id}/messages example row. */
export const DOC_MESSAGE = {
  id: '3b6560d4-0f10-4652-a376-e590936d290e',
  ticketId: '100',
  parentId: 'ef50cc68-5b88-4405-88f0-84334581246d',
  sentById: '31cb8d70-b5a6-4faa-b021-62335d6dcf6c',
  sentByType: 'visitor',
  time: '2021-04-26T10:52:24.336Z',
  type: 'text',
  originalId: '96e7964a-29cb-40d6-8251-4f334b5748bd',
  channelId: 'Email',
  body: 'data:text/plain;base64,PHA+MTExPC9wPg==',
  ifDisplayInTicketCorrespondences: true,
  attachments: [
    {
      id: '8c0136f3-9dd3-47f3-be12-81b232c84408',
      messageId: '3b6560d4-0f10-4652-a376-e590936d290e',
      fileKey: 'isqo-ngLG1Vw7Uh0ieeIGXSjVoAX2DhmQKeWmi7',
      name: 'my file',
      size: 10,
      type: 'file',
      url: 'http://myfile/url',
    },
  ],
}

/** https://developer.comm100.com/docs/server-api-global-setting-contact — GET contact/contacts example row. */
export const DOC_CONTACT = {
  id: '6396ad99-6885-4489-ad95-43c923154a8c',
  contactIdentities: [
    {
      id: '9bf5f300-a8b0-4dd9-996d-140fe87c851e',
      contactId: '6396ad99-6885-4489-ad95-43c923154a8c',
      contactIdentityType: 'Email',
      value: 'testContact@gmail.com',
      displayName: 'testContact@gmail.com',
      isDeleted: false,
    },
    {
      id: '5a1900c6-8329-4d00-86ed-697cdfaa9e8b',
      contactId: '6396ad99-6885-4489-ad95-43c923154a8c',
      contactIdentityType: 'SMS',
      value: '+11111111',
      displayName: '+11111111',
      isDeleted: false,
    },
  ],
  lastName: 'Last name for test',
  firstName: 'Firstname for test',
  name: 'testContact',
  mergeToContactId: '00000000-0000-0000-0000-000000000000',
  createTime: '2022-09-02T04:12:40Z',
  lastUpdatedTime: '2022-09-02T04:12:40Z',
  isDeleted: false,
}

/** https://developer.comm100.com/docs/server-api-global-setting-agent — GET global/agents example row. */
export const DOC_AGENT = {
  id: '2e4e44a0-3910-41e7-a9b5-b7cfe8f2d52d',
  superAgentId: '00000000-0000-0000-0000-000000000000',
  email: 'test@2.ccc',
  displayName: 'test Comm100',
  firstName: 'test',
  lastName: 'Comm100',
  isAdmin: true,
  isActive: true,
  phone: '',
  title: '',
  createdTime: '2022-06-28T07:46:57.3466667Z',
  isLocked: false,
  isSeat: true,
  isDeleted: false,
  departmentIds: ['b6ff11d8-0be7-4e99-b8c7-5a7ab501c69b'],
  roleIds: ['e0bf1302-d145-eb11-8100-00155d081d0b'],
}

/** https://developer.comm100.com/docs/server-api-global-setting-department — GET global/departments example row. */
export const DOC_DEPARTMENT = {
  id: 'a0831b44-a2d0-4bed-96c4-43f7eb69b095',
  name: 'markting',
  description: 'markting departments',
  isAvailableInLiveChat: true,
  isAvailableInTicketingAndMessaging: true,
  offlineMessageMailTo: 'toAllAgents',
  offlineMessageEmailAddresses: 'andy@comm100.com',
  isDeleted: false,
  agentIds: ['3CA2EF45-7D46-EB11-8100-00155D081D0B'],
}

/** https://developer.comm100.com/docs/server-api-ticketing-tag — GET ticketing/tags example row. */
export const DOC_TAG = { id: 'bdf96bad-890f-4af5-8f4e-42d2cc29e61b', name: 'my tag' }
