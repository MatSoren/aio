import { createApiRequester, type ApiClientConfig } from "./http";
import type { LoginBody, LoginResponse, RegisterBody, RegisterResponse, RefreshResponse } from "@{{scope}}/contracts";

export interface AuthClient {
  login: (body: LoginBody) => Promise<LoginResponse>;
  register: (body: RegisterBody) => Promise<RegisterResponse>;
  /** No token to pass — the browser sends the `refreshToken` cookie on its own. Make sure
   * `ApiClientConfig.credentials` is `"include"` (see createAuthClient's caller) or the browser
   * won't attach it on a cross-origin request. */
  refresh: () => Promise<RefreshResponse>;
  logout: () => Promise<null>;
}

export const createAuthClient = (config: ApiClientConfig): AuthClient => {
  const request = createApiRequester(config);

  return {
    login: (body) =>
      request<LoginResponse, LoginBody>({ path: "/api/v1/auth/login", method: "POST", body }),
    register: (body) =>
      request<RegisterResponse, RegisterBody>({ path: "/api/v1/auth/register", method: "POST", body }),
    refresh: () => request<RefreshResponse, undefined>({ path: "/api/v1/auth/refresh", method: "POST" }),
    logout: () => request<null, undefined>({ path: "/api/v1/auth/logout", method: "POST" }),
  };
};
