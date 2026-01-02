import { Router } from "express";
import { authenticate } from "../middleware/auth";

const router = Router();

// Protected media routes will be added in Phase 3
router.get("/", authenticate, (_req, res) => {
  res.json({ message: "Media routes coming soon" });
});

export default router;