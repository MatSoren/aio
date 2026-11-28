import { z } from "zod";

/** Email as an account identifier: trimmed and lowercased *before* the format check, so
 * `" Juan@Mail.com "` and `"juan@mail.com"` are the same account on register, login and every
 * lookup by email. The backend only ever sees the normalized value (it reads `res.locals.input`),
 * so its `findUnique({ where: { email } })` never has to care about case. Order matters:
 * `z.email().trim()` would run the format check on the untrimmed string and reject it. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
