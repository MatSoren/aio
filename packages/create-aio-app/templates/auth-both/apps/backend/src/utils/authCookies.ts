import type { Response } from "express";
import { appEnv } from "@config/envs";

const isProd = appEnv.app.nodeEnv === "production";

/** Sets both auth cookies for clients that use them — a bearer client simply ignores them and
 * uses the tokens returned in the response body instead. The refresh cookie is scoped to the one
 * route that reads it (`path: "/api/v1/auth/refresh"`) instead of `/`. */
export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  res.cookie("accessToken", tokens.accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: appEnv.auth.accessExpiration * 1000,
    path: "/",
  });
  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: appEnv.auth.refreshExpiration * 1000,
    path: "/api/v1/auth/refresh",
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/api/v1/auth/refresh" });
};
