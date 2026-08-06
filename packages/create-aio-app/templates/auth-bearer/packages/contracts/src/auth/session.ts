import { z } from "zod";
import type { PublicUser } from "../user";

// Tokens travel in the response body (never as cookies), so refresh has to be told which one to
// rotate — there's no cookie for the server to read it from.
export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshBody = z.infer<typeof RefreshBodySchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type LoginResponse = { user: PublicUser } & AuthTokens;
export type RegisterResponse = { user: PublicUser } & AuthTokens;
export type RefreshResponse = AuthTokens;
