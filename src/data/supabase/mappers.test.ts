import { describe, expect, it } from 'vitest';
import {
  mapMember,
  mapProjectSummary,
  mapSharedRow,
  toProjectInsert,
} from '@/data/supabase/mappers';
import { makeNewProjectInput } from '@/test/fakes';

describe('mappers', () => {
  it('maps a project summary, nesting groups and normalizing timestamps', () => {
    const row = {
      id: 'p1',
      workspace_id: 'w1',
      code: '001',
      name: 'Pier',
      description: null,
      cover_image_path: 'w1/c.jpg',
      status_date: '2026-10-12',
      project_type: 'building',
      start_date: null,
      planned_finish_date: null,
      client_name: 'Acme',
      client_contact_name: null,
      client_contact_email: null,
      location_address: null,
      location_city: 'Izmir',
      location_country: 'TR',
      created_at: '2026-10-14T09:30:00.123456+00:00',
      updated_at: '2026-10-14T09:31:00+00:00',
      schedule_count: 2,
    };
    expect(mapProjectSummary(row, 'https://signed/url')).toEqual({
      id: 'p1',
      workspaceId: 'w1',
      code: '001',
      name: 'Pier',
      description: null,
      coverImageUrl: 'https://signed/url',
      statusDate: '2026-10-12',
      attributes: { projectType: 'building', startDate: null, plannedFinishDate: null },
      client: { name: 'Acme', contactName: null, contactEmail: null },
      location: { address: null, city: 'Izmir', country: 'TR' },
      createdAt: '2026-10-14T09:30:00.123Z',
      updatedAt: '2026-10-14T09:31:00.000Z',
      scheduleCount: 2,
    });
  });

  it('maps a member with their profile', () => {
    expect(
      mapMember({
        user_id: 'u1',
        role: 'editor',
        joined_at: '2026-10-01T00:00:00+00:00',
        profiles: { first_name: 'Mert', last_name: 'Demir', email: 'mert@example.com' },
      }),
    ).toEqual({
      userId: 'u1',
      firstName: 'Mert',
      lastName: 'Demir',
      email: 'mert@example.com',
      role: 'editor',
      joinedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('maps a shared row with its sharer', () => {
    expect(
      mapSharedRow({
        share_id: 's1',
        schedule_id: 'sc1',
        schedule_name: 'Baseline rev. 3',
        status_date: null,
        project_id: 'p1',
        project_name: 'Tunnel',
        workspace_id: 'w1',
        shared_by_id: 'u2',
        shared_by_first_name: 'Mert',
        shared_by_last_name: 'Demir',
        shared_by_avatar_url: null,
        shared_at: '2026-10-13T10:00:00+00:00',
      }),
    ).toEqual({
      shareId: 's1',
      scheduleId: 'sc1',
      scheduleName: 'Baseline rev. 3',
      statusDate: null,
      projectId: 'p1',
      projectName: 'Tunnel',
      workspaceId: 'w1',
      sharedBy: { id: 'u2', firstName: 'Mert', lastName: 'Demir', avatarUrl: null },
      sharedAt: '2026-10-13T10:00:00.000Z',
    });
  });

  it('builds a project insert from the form input', () => {
    const input = makeNewProjectInput('w1', {
      code: ' 007 ',
      name: ' Pier ',
      description: '',
      client: { name: ' Acme ', contactName: '', contactEmail: null },
    });
    expect(toProjectInsert(input, 'w1/c.jpg')).toMatchObject({
      workspace_id: 'w1',
      code: '007',
      name: 'Pier',
      description: null,
      cover_image_path: 'w1/c.jpg',
      client_name: 'Acme',
      client_contact_name: null,
    });
  });
});
