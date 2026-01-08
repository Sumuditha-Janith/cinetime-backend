import { Router } from "express";
import {
    getMyDetails,
    handleRefreshToken,
    login,
    register,
    verifyOTP,
    updateProfile,
    changePassword,
    deleteAccount
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/refresh", handleRefreshToken);
router.get("/me", authenticate, getMyDetails);
router.put("/me", authenticate, updateProfile);
router.put("/me/change-password", authenticate, changePassword);
router.delete("/me", authenticate, deleteAccount);

export default router;