/**
 * Response examples copied verbatim from Teamhood's own OpenAPI document
 * ("Teamhood API v1"), https://api-demo.teamhood.com/swagger/v1/swagger.json,
 * fetched 2026-09-25. Each constant names the operation whose example it is.
 */

/** GET /api/v1/items/{itemId} ("Get Item by id"), 200 example. */
export const DOC_ITEM = {
  id: '1bb95843-bb02-45f2-9f02-2db134b33fb2',
  displayId: 'ABCD-1234',
  workspaceId: 'b6229379-3529-4372-b238-d96d4e702820',
  boardId: 'eda68c12-2514-4c80-ac19-c2445ba2153c',
  rowId: '47f5f9da-05d7-448d-92ec-c10df5da52a3',
  title: 'Very important item',
  statusId: '7c05c47d-6d4c-4a57-8b68-2c372b3fd55b',
  ownerId: 'c021dbd7-ae79-496b-92e8-cfcf42a62ea3',
  assignedUserId: 'a81fe286-3aeb-40b4-a2c1-a33356221197',
  color: 1,
  startDate: '2026-09-25T01:28:17.769059Z',
  dueDate: '2026-09-26T01:28:17.7690593Z',
  isScheduleLocked: false,
  completedOn: '2026-09-25T13:28:17.7690599Z',
  description: 'Description of very important item',
  budget: 10,
  estimation: 10,
  estimationType: 'Hours',
  completed: false,
  archived: false,
  modifiedDate: '2026-09-24T01:28:17.7690568Z',
  createdDate: '0001-01-01T00:00:00Z',
  totalLoggedTime: 0,
  milestone: false,
  isSuspended: true,
  suspendReason: 'Item is suspended',
  parentId: 'd1384d67-f072-4e9e-aa26-5e2f435e4717',
  tags: ['Tag1', 'Tag2'],
  customFields: [
    { name: 'Priority', value: 'P1' },
    { name: 'Customer Name', value: 'Northwind' },
  ],
  relations: {
    children: ['97c0ea6f-8cca-4d43-a67a-72d070fb8155'],
    waiting: ['8bbe5dd5-feb8-4439-8077-0afa194e8b0e', '28c574cf-9c00-4ca7-bcb3-70c32cca579a'],
    blocking: ['6ecd0bdd-fe58-46e8-929d-cc323d827026'],
    syncCopies: ['3ccb3c5b-a025-47e4-8b48-ed4c57f7774c'],
    waitingDependencyDirections: [
      { itemId: '254c75fb-a1bc-4d06-ad22-a666370beb33', direction: 'FinishToStart' },
    ],
    blockingDependencyDirections: [
      { itemId: '8122957a-bce2-4c8e-81ae-9b4c040c0b04', direction: 'StartToFinish' },
    ],
  },
  aggregates: {
    budget: { value: 55.5 },
    estimation: { value: 7 },
    totalLoggedTime: { value: 3600 },
  },
  url: 'https://company.teamhood.com/EXMPL/Board/EXMPL/ABCD-1234',
  hasAttachments: false,
  sortOrder: 1024,
  parentRelativeSortOrder: 1024,
  baselines: [
    {
      startDate: '2026-09-15T01:28:17.7690727Z',
      dueDate: '2026-09-30T01:28:17.7690731Z',
      estimation: 8,
      budget: 500,
      duration: 10,
    },
  ],
}

/** GET /api/v1/items ("Query items"), 200 example: GetItemsResponse. */
export const DOC_ITEMS_RESPONSE = {
  items: [{ ...DOC_ITEM, id: '5d821771-cfc6-4963-84c5-631749337df3' }],
  nextPageUrl:
    'https://tenant-name.teamhood.com/api/v1/items?WorkspaceId=a5fb8867-7f99-46b3-9159-95b45b7e727f?Skip=5&Take=5',
}

/** GET /api/v1/workspaces ("List all Workspaces"), 200 example. */
export const DOC_WORKSPACES_RESPONSE = {
  workspaces: [
    { id: 'c2043582-4e71-4ba9-9a94-2f95048973b8', displayId: 'WRKSPCE', title: 'Workspace title' },
  ],
}

/** GET /api/v1/workspaces/{workspaceId}/boards ("List Boards by Workspace Id"), 200 example. */
export const DOC_BOARDS_RESPONSE = {
  boards: [{ id: 'bb98ce99-391c-4746-9ef6-5558bf9fa41f', displayId: 'BRD1', title: 'Board title' }],
}

/**
 * GET /api/v1/users ("List all Users"), 200 example. The example leaves out
 * `accessibleWorkspaces`, which Entities.User declares required (uuid[],
 * nullable); tests that need it add it.
 */
export const DOC_USERS_RESPONSE = {
  users: [
    {
      id: '2466ba93-0b3a-436e-a495-50767c5b1a10',
      firstName: 'John',
      lastName: 'Hood',
      email: 'john@teamhood.com',
      status: 'Active',
      lastActivityDate: '2026-09-20T01:28:17.7737985Z',
    },
  ],
}
