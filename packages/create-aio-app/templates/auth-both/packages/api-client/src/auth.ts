import { createApiRequester, type ApiClientConfig } from "./http";
import type {
  LoginBody,
  LoginResponse,
  RegisterBody,
  RegisterResponse,
  RefreshBody,
  RefreshResponse,
} from "@{{scope}}/contracts";

export interface AuthClient {
  login: (body: LoginBody) => Promise<LoginResponse>;
  register: (body: RegisterBody) => Promise<RegisterResponse>;
  /** `refreshToken` is optional: pass it for a bearer client (mobile, scripts); omit it for a
   * browser client relying on the `refreshToken` cookie — either way, set
   * `ApiClientConfig.credentials` to `"include"` if you want the cookie path to work too. */
  refresh: (body?: RefreshBody) => Promise<RefreshResponse>;
  logout: (accessToken?: string) => Promise<null>;
}

export const createAuthClient = (config: ApiClientConfig): AuthClient => {
  const request = createApiRequester(config);

  return {
    login: (body) =>
      request<LoginResponse, LoginBody>({ path: "/api/v1/auth/login", method: "POST", body }),
    register: (body) =>
      request<RegisterResponse, RegisterBody>({ path: "/api/v1/auth/register", method: "POST", body }),
    refresh: (body) =>
      request<RefreshResponse, RefreshBody | undefined>({
        path: "/api/v1/auth/refresh",
        method: "POST",
        body,
      }),
    logout: (accessToken) =>
      request<null, undefined>({ path: "/api/v1/auth/logout", method: "POST", accessToken }),
  };
};
