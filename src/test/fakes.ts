import type { NewProjectInput } from '@/data/repository';
import type { ID } from '@/data/types';

/** A valid `NewProjectInput`: code `'900'`, name `'Test project'`, every optional value `null`. */
export function makeNewProjectInput(
  workspaceId: ID,
  overrides: Partial<NewProjectInput> = {},
): NewProjectInput {
  return {
    workspaceId,
    code: '900',
    name: 'Test project',
    description: null,
    coverImage: null,
    statusDate: null,
    attributes: { projectType: null, startDate: null, plannedFinishDate: null },
    client: { name: null, contactName: null, contactEmail: null },
    location: { address: null, city: null, country: null },
    ...overrides,
  };
}
