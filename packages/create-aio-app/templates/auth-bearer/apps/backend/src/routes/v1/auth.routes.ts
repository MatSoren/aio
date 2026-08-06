import { Router } from "express";
import authController from "@controllers/auth.controller";
import { validateBody } from "@middlewares/validateBody";
import { jwtAuth } from "@middlewares/jwtAuth";
import { LoginBodySchema, RegisterBodySchema, RefreshBodySchema } from "@{{scope}}/contracts";

const router = Router();

router.post("/login", validateBody(LoginBodySchema), authController.login);
router.post("/register", validateBody(RegisterBodySchema), authController.register);
router.post("/refresh", validateBody(RefreshBodySchema), authController.refresh);
router.post("/logout", jwtAuth, authController.logout);

export default router;
