import { Router } from "express";
import { aiChat, aiSearchMedia } from "../controllers/ai.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

// AI Chat Routes
router.post("/chat", authenticate, aiChat); // Get AI recommendations
router.post("/search", authenticate, aiSearchMedia); // Search based on AI recommendations

export default router;