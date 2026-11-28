import { z } from "zod";
import { EmailSchema } from "./email";

export const RegisterBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;
