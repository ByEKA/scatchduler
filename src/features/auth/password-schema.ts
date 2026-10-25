import { z } from 'zod';

/** The password policy (P2 spec §5.1): at least 10 characters, with letters and digits. */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

/** The hint under every new-password field (P2 spec §5.5). */
export const PASSWORD_HINT = 'At least 10 characters, with letters and numbers';

/** A new password typed twice (P2 spec §5.5 validation copy). */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .regex(PASSWORD_RULE, 'Use at least 10 characters with letters and numbers'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: "Passwords don't match",
  });

/** First and last name, trimmed, 1–60 characters each (P2 spec §5.5). */
export const personNameSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter your first name')
    .max(60, 'Use 60 characters or fewer'),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60, 'Use 60 characters or fewer'),
});
