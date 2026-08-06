import { z } from "zod";
import type { PublicUser } from "../user";

// Bearer clients (mobile, ...) need the refresh token to send it back explicitly; cookie clients
// can omit the body entirely since the httpOnly cookie already carries it — the field is
// optional here, unlike the bearer-only variant where it's required.
export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type RefreshBody = z.infer<typeof RefreshBodySchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type LoginResponse = { user: PublicUser } & AuthTokens;
export type RegisterResponse = { user: PublicUser } & AuthTokens;
export type RefreshResponse = AuthTokens;
