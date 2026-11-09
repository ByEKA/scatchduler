import { describe, expect, it } from 'vitest';
import type { UpdateProjectInput } from '@/data/repository';
import {
  mapMember,
  mapProjectSummary,
  mapSharedRow,
  toProjectInsert,
  toProjectUpdate,
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
      status: 'on_hold',
      stage: 'construction',
      sector: 'public',
      location_lat: 41.0151,
      location_lng: 28.9795,
      schedule_count: 2,
      total_schedule_count: 2,
      current_schedule_id: null,
      current_schedule_name: null,
    };
    expect(mapProjectSummary(row, 'https://signed/url')).toEqual({
      id: 'p1',
      workspaceId: 'w1',
      code: '001',
      name: 'Pier',
      description: null,
      coverImageUrl: 'https://signed/url',
      statusDate: '2026-10-12',
      attributes: {
        status: 'on_hold',
        stage: 'construction',
        projectType: 'building',
        sector: 'public',
        startDate: null,
        plannedFinishDate: null,
      },
      client: { name: 'Acme', contactName: null, contactEmail: null },
      location: {
        address: null,
        city: 'Izmir',
        country: 'TR',
        latitude: 41.0151,
        longitude: 28.9795,
      },
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

  it('writes the attributes and coordinates into the insert', () => {
    const input = makeNewProjectInput('w1', {
      attributes: {
        status: 'cancelled',
        stage: 'closeout',
        projectType: 'water',
        sector: 'private',
        startDate: null,
        plannedFinishDate: null,
      },
      location: {
        address: null,
        city: null,
        country: null,
        latitude: -33.8688,
        longitude: 151.2093,
      },
    });
    expect(toProjectInsert(input, null)).toMatchObject({
      status: 'cancelled',
      stage: 'closeout',
      project_type: 'water',
      sector: 'private',
      location_lat: -33.8688,
      location_lng: 151.2093,
    });
  });

  it('builds a project update that leaves out what the input keeps', () => {
    const input: UpdateProjectInput = {
      projectId: 'p1',
      code: ' 008 ',
      name: ' Pier ',
      description: '',
      cover: 'keep',
      attributes: {
        status: 'on_hold',
        stage: null,
        projectType: 'water',
        sector: 'public',
        startDate: null,
        plannedFinishDate: null,
      },
      client: { name: null, contactName: null, contactEmail: null },
      location: {
        address: null,
        city: 'Bursa',
        country: null,
        latitude: 40.1828,
        longitude: 29.0663,
      },
    };
    const update = toProjectUpdate(input, undefined);
    expect(update).toMatchObject({
      code: '008',
      name: 'Pier',
      description: null,
      status: 'on_hold',
      project_type: 'water',
      sector: 'public',
      location_city: 'Bursa',
      location_lat: 40.1828,
      location_lng: 29.0663,
    });
    expect(update).not.toHaveProperty('status_date');
    expect(update).not.toHaveProperty('cover_image_path');
    expect(toProjectUpdate({ ...input, statusDate: null }, null)).toMatchObject({
      status_date: null,
      cover_image_path: null,
    });
  });
});
