/**
 * Fixtures copied from the Webdox CLM v2 API reference
 * (https://doc.webdoxclm.com/docs/v2/en/index.html).
 *
 * The published examples are TRIMMED, not reproduced whole:
 *   - workflowInfoExample() keeps the first of the three documented steps and
 *     drops the documented `current_step` object;
 *   - stepsExample() keeps both documented steps and drops the
 *     trailing "..." that stands for more steps.
 * The published signer example's `email` is rendered by Cloudflare's e-mail
 * obfuscation as "[email protected]"; it is replaced here by a placeholder
 * address. Every value that is kept is the documented value, verbatim, and
 * nothing a transform reads was altered.
 */

/** "Workflow Info" — GET /api/v2/decision_workflows/:id */
export function workflowInfoExample() {
  return {
    id: 78,
    name: 'Workflow name',
    decision_name: 'test workflow',
    status: 'started',
    current_step_type: null,
    steps: [
      {
        id_number: 1,
        id_parallel: 0,
        name: '1',
        step_type: null,
        created_at: '2021-01-27T15:28:50.092-03:00',
        limit_date: '2021-01-28T15:29:04.426-03:00',
      },
    ],
    documents: [
      {
        id: '721111e8ba7847589648e0d2e4efe058',
        name: 'My-Documnet.pdf',
        type: 'document',
        in_repository: true,
        signable: true,
        signed: false,
        created_at: '2023-05-15T15:53:35.768-04:00',
      },
    ],
  }
}

/** "List steps" — GET /api/v2/decision_workflows/<ID>/steps (a bare array). */
export function stepsExample() {
  return [
    {
      id_number: 1,
      id_parallel: 0,
      name: 'Electronic Signature',
      id_workflow: 94,
      assigned_to: [{ id: '7faf7ca5-46a7-4ad2-a283-cecb5dd78566', name: 'John Doe' }],
      step_attributes: [],
      step_type: 'signature',
      is_signature_step: true,
      created_at: '2021-01-27T15:28:50.092-03:00',
      limit_date: null,
    },
    {
      id_number: 2,
      id_parallel: 0,
      name: 'Cassification',
      id_workflow: 94,
      assigned_to: [],
      step_attributes: [],
      step_type: null,
      created_at: '2021-01-27T15:28:50.092-03:00',
      limit_date: null,
    },
  ]
}

/**
 * "Get all signers from a decision workflow step" —
 * GET /api/v2/decision_workflows/<WF_ID>/steps/<STEP_NUMBER>/signers?parallel_number=<P>
 * (a bare array).
 */
export function signerExample() {
  return {
    id: 'c1c86feb-f806-4897-b8e5-5360b00f5302',
    step_number: 1,
    step_parallel_number: 0,
    kind: 'external',
    status: 'pending',
    user_id: null,
    country_code: 'CHL',
    name: 'Sample User',
    email: 'sample.user@example.com',
    national_identification_number: '20000000-1',
    national_identification_kind_id: '94bfbabc-9971-4cc8-bb6b-80c62aa2887d',
    signature_id: null,
    envelope_id: 8,
    signed_at: null as string | null,
    signed_difference: null,
    phone_number: null,
    has_valid_positioned_signatures: false,
    cc_email: null,
    use_notification_method_whatsapp: false,
  }
}
