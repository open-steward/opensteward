/**
 * Fixtures built from Yellow.ai's documented examples (docs.yellow.ai/api,
 * the OpenAPI objects shipped in the page bundles).
 */

/**
 * "GET /api/agents/public/v1/agents/concurrency" — the documented 200
 * example, verbatim (https://docs.yellow.ai/api/agent-chat-concurrency).
 */
export const DOC_AGENT = {
  agentId: 'agent1',
  currentChatConcurrency: 2,
  maxChatConcurrency: 50,
  status: 'available',
  groups: ['support', 'billing'],
  agentProfile: {
    email: 'agent1@feg.eu',
    name: 'Agent One',
    description: 'Support Agent',
    aliasname: 'Al',
    languages: ['en'],
    signature: 'Thanks,\nAl',
  },
}

export const DOC_AGENTS_RESPONSE = { agents: [DOC_AGENT] }

/**
 * "GET /cdp/api/v1/user/{userId}" (https://docs.yellow.ai/api/get-user-details):
 * `{ message, data }`, where every property of `data` is
 * `{ value, propertyType }`. The documented example is `"message":
 * "Fetched user successfully"` and a `data` property whose example is
 * `"value": "test@yellow.com", "propertyType": "Custom"` (used here as
 * `email`, a user property documented on Add user).
 *
 * The other properties are the Add user 200 example, verbatim
 * (https://docs.yellow.ai/api/add-user): userId "12395", lastName "Rohit3",
 * phone "919876543211" and country "IN", each with propertyType "System".
 * The docs give no firstName example, so none is included; tests that need
 * one add their own and say so.
 */
export const DOC_USER_DETAILS = {
  message: 'Fetched user successfully',
  data: {
    userId: { value: '12395', propertyType: 'System' },
    lastName: { value: 'Rohit3', propertyType: 'System' },
    email: { value: 'test@yellow.com', propertyType: 'Custom' },
    phone: { value: '919876543211', propertyType: 'System' },
    country: { value: 'IN', propertyType: 'System' },
  },
}
