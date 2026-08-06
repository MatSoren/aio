import type { Endpoint } from "../types/ControllerEndpoint";

export const healthy: Endpoint<{ status: "ok" }> = (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
};
