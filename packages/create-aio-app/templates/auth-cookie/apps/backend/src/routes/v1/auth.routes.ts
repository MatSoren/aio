import { Router } from "express";
import authController from "@controllers/auth.controller";
import { validateBody } from "@middlewares/validateBody";
import { jwtAuth } from "@middlewares/jwtAuth";
import { LoginBodySchema, RegisterBodySchema } from "@{{scope}}/contracts";

const router = Router();

router.post("/login", validateBody(LoginBodySchema), authController.login);
router.post("/register", validateBody(RegisterBodySchema), authController.register);
// No body: the refresh token is the httpOnly cookie itself.
router.post("/refresh", authController.refresh);
router.post("/logout", jwtAuth, authController.logout);

export default router;
