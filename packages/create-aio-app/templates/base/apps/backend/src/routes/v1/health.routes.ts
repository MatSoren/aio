import { Router } from "express";
import { healthy } from "@controllers/health.controller";

const router = Router();

router.get("/", healthy);

export default router;
