import { z } from "zod";

/** The user shape returned to clients — never includes the password hash or anything else
 * sensitive. The backend's Prisma singleton also `omit`s `password` globally as a second,
 * independent layer (see `apps/backend/src/config/database.ts`); this schema is the one that
 * actually shapes what a response body contains. */
export const PublicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PublicUser = z.infer<typeof PublicUserSchema>;
