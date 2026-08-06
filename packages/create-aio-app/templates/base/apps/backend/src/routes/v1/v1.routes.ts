import { Router } from "express";
import healthRoutes from "./health.routes";
// @aio:route-v1-import

const router = Router();

router.use("/health", healthRoutes);
// @aio:route-v1-mount

export default router;
