/**
 * Fixtures built from the documented response schemas and their `examples`
 * in https://public-api.process.st/api/v1.1/docs/openapi.json:
 *   PublicApiUser example: { "id": "vGIRpoq0RIwBoNMM3-V-tw", "email": "jane.doe@example.com", "username": "Jane Doe" }
 *   Task id / workflowRunId example: "lwCLyYLkX-QBoNMM9kN7KA"
 *   Workflow id example (GetWorkflowRunResponse.workflowId): "rVs3zqyXkYQBoNMM9rd9ug"
 *   link href example: "https://api.process.st/api/v1.1/resource/XXX"
 */
import type { RawProcessStreetWorkflow } from '../../../../../../src/verticals/projects/adapters/process-street/transform/project'
import type { RawProcessStreetTask } from '../../../../../../src/verticals/projects/adapters/process-street/transform/task'
import type { RawProcessStreetUser } from '../../../../../../src/verticals/projects/adapters/process-street/transform/user'

export const JANE: RawProcessStreetUser = {
  id: 'vGIRpoq0RIwBoNMM3-V-tw',
  email: 'jane.doe@example.com',
  username: 'Jane Doe',
}

export const WORKFLOW_ID = 'rVs3zqyXkYQBoNMM9rd9ug'
export const RUN_ID = 'lwCLyYLkX-QBoNMM9kN7KA'

export function workflow(over: Partial<RawProcessStreetWorkflow> = {}): RawProcessStreetWorkflow {
  return {
    id: WORKFLOW_ID,
    name: 'Employee Onboarding',
    description: 'Steps to onboard a new employee',
    audit: {
      createdDate: '2024-09-15T14:32:00.000Z',
      createdBy: JANE,
      updatedDate: '2024-09-16T09:00:00.000Z',
      updatedBy: JANE,
    },
    links: [
      {
        name: 'self',
        href: 'https://api.process.st/api/v1.1/resource/XXX',
        rel: 'Workflow',
        type: 'Api',
      },
    ],
    ...over,
  }
}

export function task(over: Partial<RawProcessStreetTask> = {}): RawProcessStreetTask {
  return {
    id: 'tAsKiDxxxxQBoNMM9kN7KA',
    name: 'Send welcome email',
    workflowRunId: RUN_ID,
    status: 'NotCompleted',
    dueDate: '2024-09-20T17:00:00.000Z',
    updatedDate: '2024-09-15T14:32:00.000Z',
    updatedBy: JANE,
    hidden: false,
    stopped: false,
    taskType: 'Standard',
    links: [],
    ...over,
  }
}
