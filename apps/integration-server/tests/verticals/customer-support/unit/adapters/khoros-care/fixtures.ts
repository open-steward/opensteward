/**
 * Fixtures copied from the documented example responses of the Khoros Care
 * API v2 (developer.khoros.com/khoroscaredevdocs/reference/...):
 *   - facebook-conversations: GET /api/v2/conversations/{lswUuid}
 *   - instagram-conversations: GET /api/v2/conversations/{lswUuid}
 *     (trimmed to the conversation's fields and its first message)
 *   - authors:                GET /api/v2/authors
 *   - authorslswuuid:         GET /api/v2/authors/{lswUuid}
 *   - tags:                   GET /api/v2/tags
 *   - active-1:               GET /api/v2/workqueues/active
 */

export const FACEBOOK_CONVERSATION = {
  status: 'success',
  data: [
    {
      userHasPermissionToView: true,
      displayNumber: 758108,
      encodedCaseDisposition: 1,
      status: 'INPROGRESS',
      assignedToAgent: {
        name: 'KH-Ryan Pierson',
        email: 'ryan.pierson@khoros.com',
        lswUuid: '01e638e1-4eb1-4ebe-9290-example',
      },
      lswUuid: '90853b54-3d5e-4964-aec0-example',
      createDate: 1594150259084,
      responsePortalLink: 'https://example.com/portal/conversation/758108',
      primaryMessage: {
        conversationDisplayId: 758108,
        network: 'facebook',
        networkinstance: 'facebook',
        lswUuid: '332e0364-0b7c-4691-bdd9-470f55cb5ff4',
        author: {
          gdprMarked: false,
          gdprScrubbed: false,
          lswUuid: '61454101-351f-424f-87e4-087b12b76ad9',
        },
        receiveDate: 1594150259000,
        publishDate: 1594150257000,
        postContent: 'This is a message.',
        url: '',
        isPrivate: true,
        tags: [
          {
            creator: { type: 'SYSTEM' },
            tagId: 12,
            lswUuid: 'b52ed1b5-610c-11e4-b829-063c8f57ca44',
          },
        ],
      },
      messages: [
        {
          conversationDisplayId: 758108,
          network: 'facebook',
          networkinstance: 'facebook',
          lswUuid: '332e0364-0b7c-4691-bdd9-470f55cb5ff4',
          author: {
            gdprMarked: false,
            gdprScrubbed: false,
            lswUuid: '61454101-351f-424f-87e4-087b12b76ad9',
          },
          receiveDate: 1594150259000,
          publishDate: 1594150257000,
          postContent: 'This is a message.',
          url: '',
          isPrivate: true,
        },
        {
          conversationDisplayId: 758108,
          network: 'facebook',
          networkinstance: 'facebook',
          lswUuid: 'b1b76e55-8536-4c3d-822d-2feffb21c530',
          author: {
            gdprMarked: false,
            gdprScrubbed: false,
            scopedIds: [],
            lswUuid: 'cf23beb2-0632-4250-b52b-7b3a1ce39e1f',
          },
          publishDate: 1594151644000,
          postContent: 'Hello! This is a response.',
          url: '',
          isPrivate: true,
          respondingAgent: {
            name: 'KH-Ryan Pierson',
            email: 'ryan.pierson@khoros.com',
            lswUuid: '01e638e1-4eb1-4ebe-9290-4b0304f44a55',
          },
          inResponseToDocLswUuid: '332e0364-0b7c-4691-bdd9-470f55cb5ff4',
          responseHandle: 'Ecohaus',
          customerWaitTimeMillis: 1388000,
        },
      ],
      tags: [
        {
          creator: { type: 'SYSTEM' },
          tagId: 361,
          lswUuid: 'f5dd0a38-1e5b-4d98-af93-2b4e3d5a3af9',
        },
      ],
      priority: 2,
      workQueue: { lswUuid: 'e07f302b-c731-4ea7-9a18-7459f4a4680d', id: 19 },
      lswPermalink: 'https://example.com/console/agent/758108',
      totalResponses: 1,
      hasResponse: false,
    },
  ],
}

export const AUTHORS_PAGE = {
  status: 'success',
  data: {
    nextPageUrl: 'https://your_social_response_instance.lithium.com/api/v2/authors?offset=31',
    personList: [
      {
        id: '46193948-5a3d-4836-bea8-e7a5070ab00d',
        displayNumber: 4,
        handles: {
          lithium: [
            {
              '@class': 'LithiumSpecificAuthorData',
              lswUuid: 'f169ce75-82c8-4f5b-8e9b-b99ea64fbdaa',
              displayNumber: 4,
              profileUrl: 'https://nusoap.stage.lithium.com/t5/user/viewprofilepage/user-id/23717',
              providerInstanceId: 'nusoap.stage.lithium.com/',
              name: 'LIA_auto_c90d75c1_9f26',
              id: '23717',
              registrationInstant: 1516816834000,
              screenName: 'LIA_auto_c90d75c1_9f26',
              networkinstance: 'nusoap.stage.lithium.com/',
            },
          ],
        },
        tags: [
          {
            creator: { type: 'SYSTEM' },
            tagId: 1037,
            lswUuid: 'f169ce75-82c8-4f5b-8e9b-b99ea64fbdaa',
          },
        ],
      },
    ],
  },
}

export const AUTHOR_BY_ID = {
  status: 'success',
  data: [
    {
      id: '2134086e-9024-4c3b-ab3b-afc6a36ea61c',
      displayNumber: 13366,
      handles: {
        external: [
          {
            '@class': 'ExternalSpecificAuthorData',
            lswUuid: 'edce6d32-ee19-4740-87b8-a9b69afd677d',
            displayNumber: 77285,
            profileUrl: '',
            id: '73292839-fb73-4b2c-b7b6-32db4b2f855a',
            name: 'Anusuya_user',
            screenName: 'Anusuya_user',
            providerInstanceId: 'smooch',
            networkinstance: 'smooch',
          },
        ],
        twitter: [
          {
            '@class': 'ScrubbedProviderSpecificAuthorData',
            id: '16148233',
            lswUuid: 'b20dc99d-144a-4942-92a9-215e3f2ff864',
            networkinstance: 'twitter',
          },
        ],
      },
      tags: [
        {
          creator: { type: 'AGENT' },
          tagId: 14865,
          lswUuid: 'b8fee328-3676-4dd8-bab5-162c2417650e',
        },
      ],
      notes: [],
      timezone: ['-21600'],
    },
  ],
}

export const TAGS = {
  status: 'success',
  data: [
    {
      updatedMillis: 1453895922415,
      tagId: 2,
      lswUuid: '304f654d-f03f-11e3-a5df-525400201fe1',
      name: 'Laptops',
      hierarchy: 'Computers > Laptops',
      internalHierarchy: '1>2',
      tagColor: 'PURPLE',
      url: '',
      typeValue: 1,
      visibilityValue: 1054,
      tagState: 'ENABLED',
      tagPartition: 'COMPANY',
    },
  ],
}

export const ACTIVE_WORK_QUEUES = {
  data: [
    {
      archived: false,
      description: null,
      id: 5016,
      name: 'Default Work Queue',
      uuid: '8c2063ef-6362-11e3-a5df-525400201fe1',
    },
    {
      archived: false,
      description: 'API Work Queue from OpenConversationReport',
      id: 13194,
      name: 'Twitter Mentions',
      uuid: '1252d4bd-be75-4b65-8762-c44f515e8317',
    },
  ],
}

/**
 * instagram-conversations, trimmed: the conversation's own fields and its
 * first message. Unlike the Facebook example, each message carries both a
 * network `id` and the Care `lswUuid`.
 */
export const INSTAGRAM_CONVERSATION = {
  status: 'success',
  data: [
    {
      displayNumber: 774752,
      encodedCaseDisposition: 2,
      status: 'RESPONDED',
      assignedToAgent: {
        name: 'KH-Ryan Pierson',
        email: 'ryan.pierson@khoros.com',
        lswUuid: 'example-4eb1-4ebe-9290-4b0304f44a55',
      },
      lswUuid: 'example-ae4b-4ad8-af78-33a5533dcac7',
      createDate: 1598042190593,
      primaryMessage: {
        network: 'instagram',
        networkinstance: 'instagram',
        id: '17878449511767098',
        lswUuid: 'example-6ba4-491b-b2c5-6f069a9941ff',
        author: {
          lswUuid: '039205f6-b910-4a0e-b168-4caad30fff66',
          network: 'instagram',
          networkinstance: 'instagram',
          id: 'ryanmpierson',
        },
        receiveDate: 1598042190000,
        publishDate: 1598042169000,
        postContent: 'Well done!',
        url: '',
        isPrivate: false,
        media: [],
      },
      messages: [
        {
          network: 'instagram',
          networkinstance: 'instagram',
          id: '17946188077306953',
          lswUuid: 'example-e767-4a42-8ad1-9f8c2a426771',
          author: {
            lswUuid: 'example-2a1b-470a-8855-189100d1f811',
            network: 'instagram',
            networkinstance: 'instagram',
            id: '17841400692995901',
          },
          receiveDate: 1598042190000,
          publishDate: 1572286840000,
          postContent: 'Look at our new fuse boxes. Available in the next weeks.',
          url: 'https://www.instagram.com/p/B4K_ZRaKjvW/',
          isPrivate: false,
          media: [{ type: 'IMAGE' }],
        },
      ],
      tags: [
        { tagId: 45, lswUuid: 'example-610c-11e4-b829-063c8f57ca44' },
        { tagId: 363, lswUuid: 'example-3929-48d0-9ebb-ff1ae64a0cf8' },
      ],
      priority: 5,
      workQueue: { lswUuid: 'example-2db8-40d1-a617-ef650600c1b5', id: 191 },
    },
  ],
}
