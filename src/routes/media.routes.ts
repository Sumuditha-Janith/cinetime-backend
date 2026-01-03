import { Router } from "express";
import {
  searchMedia,
  getMediaDetails,
  addToWatchlist,
  getWatchlist,
  updateWatchStatus,
  removeFromWatchlist,
  getWatchlistStats,
  getTrending,
  getPopularMovies,
} from "../controllers/media.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

// Public routes (no authentication required)
router.get("/search", searchMedia);
router.get("/details/:type/:tmdbId", getMediaDetails);
router.get("/trending", getTrending);
router.get("/popular", getPopularMovies);

// Protected routes (authentication required)
router.post("/watchlist", authenticate, addToWatchlist);
router.get("/watchlist", authenticate, getWatchlist);
router.get("/watchlist/stats", authenticate, getWatchlistStats);
router.put("/watchlist/:mediaId/status", authenticate, updateWatchStatus);
router.delete("/watchlist/:mediaId", authenticate, removeFromWatchlist);

export default router;