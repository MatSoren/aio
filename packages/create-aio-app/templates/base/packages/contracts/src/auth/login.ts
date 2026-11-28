import { z } from "zod";
import { EmailSchema } from "./email";

export const LoginBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;
