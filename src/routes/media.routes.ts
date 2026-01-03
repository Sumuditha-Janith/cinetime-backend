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
  debugWatchlist,

} from "../controllers/media.controller";
import { authenticate } from "../middleware/auth";
import { testStats } from "../controllers/media.controller";

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
router.get("/watchlist/debug", authenticate, debugWatchlist);
router.put("/watchlist/:mediaId/status", authenticate, updateWatchStatus);
router.delete("/watchlist/:mediaId", authenticate, removeFromWatchlist);
router.get("/watchlist/test", authenticate, testStats);

export default router;