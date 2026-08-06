import { Router } from "express";
import v1Routes from "./v1/v1.routes";
// @aio:route-root-import

const router = Router();

router.use("/v1", v1Routes);
// @aio:route-root-mount

export default router;
