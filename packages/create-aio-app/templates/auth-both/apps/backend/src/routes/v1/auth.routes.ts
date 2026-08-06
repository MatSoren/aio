import { Router } from "express";
import authController from "@controllers/auth.controller";
import { validateBody } from "@middlewares/validateBody";
import { jwtAuth } from "@middlewares/jwtAuth";
import { LoginBodySchema, RegisterBodySchema, RefreshBodySchema } from "@{{scope}}/contracts";

const router = Router();

router.post("/login", validateBody(LoginBodySchema), authController.login);
router.post("/register", validateBody(RegisterBodySchema), authController.register);
// Body is optional: a cookie client sends none, a bearer client sends { refreshToken }.
router.post("/refresh", validateBody(RefreshBodySchema, false), authController.refresh);
router.post("/logout", jwtAuth, authController.logout);

export default router;
