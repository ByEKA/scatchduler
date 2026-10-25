import { z } from 'zod';
import { ROLES } from '@/features/workspaces/roles';

/** The Members dialog's invite form (P2 spec §5.8); new people join as editors by default. */
export const inviteSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
  role: z.enum(ROLES),
});

export type InviteValues = z.output<typeof inviteSchema>;

export const INVITE_DEFAULTS: z.input<typeof inviteSchema> = { email: '', role: 'editor' };
