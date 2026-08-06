import type { PublicUser } from "../user";

// Tokens travel as httpOnly cookies (Set-Cookie) — never in the response body, and the client
// never sends the refresh token back explicitly either, so there's no RefreshBodySchema here: the
// refresh endpoint reads its cookie itself.
export type LoginResponse = { user: PublicUser };
export type RegisterResponse = { user: PublicUser };
export type RefreshResponse = { user: PublicUser };
