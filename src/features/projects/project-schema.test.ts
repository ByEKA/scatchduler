import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROJECT_FORM,
  projectFormSchema,
  projectFormValues,
  toNewProjectInput,
  toUpdateProjectInput,
  type ProjectFormValues,
} from '@/features/projects/project-schema';
import { createTestDataLayer } from '@/test/fakes';

const valid: ProjectFormValues = { ...EMPTY_PROJECT_FORM, name: 'Pier 9', code: '007' };
const issues = (values: ProjectFormValues) => {
  const result = projectFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('project form schema', () => {
  it('requires a non-blank name and a well-formed ID', () => {
    expect(issues(valid)).toEqual([]);
    expect(issues({ ...valid, name: '   ' })).toEqual(['Enter a project name']);
    expect(issues({ ...valid, code: '' })).toEqual(['Enter a project ID']);
    expect(issues({ ...valid, code: 'a b' })).toEqual(['Use letters, numbers, - or _']);
    expect(issues({ ...valid, code: 'x'.repeat(17) })).toEqual(['Use 16 characters or fewer']);
  });

  it('limits the description and the photo', () => {
    expect(issues({ ...valid, description: 'x'.repeat(501) })).toEqual([
      'Use 500 characters or fewer',
    ]);
    expect(
      issues({ ...valid, coverImage: new File(['x'], 'a.gif', { type: 'image/gif' }) }),
    ).toEqual(['Use a JPG or PNG image']);
    const big = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    expect(issues({ ...valid, coverImage: big })).toEqual(['Image must be 5 MB or smaller']);
  });

  it('checks date order and email', () => {
    expect(issues({ ...valid, startDate: '2026-11-01', plannedFinishDate: '2026-10-01' })).toEqual([
      'Finish must be on or after the start date',
    ]);
    expect(issues({ ...valid, contactEmail: 'nope' })).toEqual(['Enter a valid email address']);
  });

  it('reports a date that is not YYYY-MM-DD (D12)', () => {
    // A native date input accepts a five-digit year.
    expect(issues({ ...valid, statusDate: '20260-01-01' })).toEqual(['Enter a valid date']);
    expect(issues({ ...valid, plannedFinishDate: '2026-02-30' })).toEqual(['Enter a valid date']);
    // An unreadable start date gives no order error on top.
    expect(issues({ ...valid, startDate: '20260-01-01', plannedFinishDate: '2026-10-01' })).toEqual(
      ['Enter a valid date'],
    );
  });

  it('maps form values to NewProjectInput with trimmed strings and nulls', () => {
    expect(
      toNewProjectInput(
        { ...valid, name: '  Pier 9  ', city: '  ', clientName: 'Port Authority' },
        'w1',
      ),
    ).toEqual({
      workspaceId: 'w1',
      code: '007',
      name: 'Pier 9',
      description: null,
      coverImage: null,
      statusDate: null,
      attributes: {
        status: 'active',
        stage: null,
        projectType: null,
        sector: null,
        startDate: null,
        plannedFinishDate: null,
      },
      client: { name: 'Port Authority', contactName: null, contactEmail: null },
      location: { address: null, city: null, country: null, latitude: null, longitude: null },
    });
  });

  it('checks coordinates as a pair, in range and to 6 decimals', () => {
    expect(issues({ ...valid, latitude: '41.0151', longitude: '' })).toEqual([
      'Enter both latitude and longitude',
    ]);
    expect(issues({ ...valid, latitude: '', longitude: '28.9795' })).toEqual([
      'Enter both latitude and longitude',
    ]);
    expect(issues({ ...valid, latitude: '95', longitude: '28' })).toEqual([
      'Enter a latitude between -90 and 90',
    ]);
    expect(issues({ ...valid, latitude: '41', longitude: '-181' })).toEqual([
      'Enter a longitude between -180 and 180',
    ]);
    expect(issues({ ...valid, latitude: 'north', longitude: '28' })).toEqual([
      'Enter a latitude between -90 and 90',
    ]);
    expect(issues({ ...valid, latitude: '41.1234567', longitude: '28' })).toEqual([
      'Use up to 6 decimal places',
    ]);
    expect(issues({ ...valid, latitude: '41,0151', longitude: '-28,9795' })).toEqual([]);
    expect(EMPTY_PROJECT_FORM).toMatchObject({
      status: 'active',
      stage: '',
      sector: '',
      latitude: '',
      longitude: '',
    });
  });

  it('maps the attributes and coordinates', () => {
    expect(
      toNewProjectInput(
        {
          ...valid,
          status: 'on_hold',
          stage: 'pursuit',
          projectType: 'water',
          sector: 'public',
          latitude: '41,0151',
          longitude: ' -28.9795 ',
        },
        'w1',
      ),
    ).toMatchObject({
      attributes: { status: 'on_hold', stage: 'pursuit', projectType: 'water', sector: 'public' },
      location: { latitude: 41.0151, longitude: -28.9795 },
    });
  });

  it('round-trips a project through the edit form', () => {
    const project = createTestDataLayer()
      .store.read()
      .projects.find((p) => p.code === '001')!;
    const values = projectFormValues(project);
    expect(values).toMatchObject({
      name: 'Riverside Office Tower',
      code: '001',
      status: 'active',
      stage: 'construction',
      sector: 'private',
      latitude: '41.0151',
      longitude: '28.9795',
      keepCover: true,
      coverImage: null,
    });
    expect(toUpdateProjectInput(values, project.id, { includeStatusDate: true })).toMatchObject({
      projectId: project.id,
      cover: 'keep',
      statusDate: project.statusDate,
      location: { city: 'Istanbul', latitude: 41.0151, longitude: 28.9795 },
    });
    expect(
      toUpdateProjectInput({ ...values, keepCover: false }, project.id, {
        includeStatusDate: false,
      }),
    ).not.toHaveProperty('statusDate');
    expect(
      toUpdateProjectInput({ ...values, keepCover: false }, project.id, {
        includeStatusDate: false,
      }).cover,
    ).toBe('remove');
  });
});
