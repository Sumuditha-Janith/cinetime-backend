import mongoose, { Document, Schema, Model } from "mongoose";
import { Media } from "./Media";

export interface IEpisode extends Document {
    _id: mongoose.Types.ObjectId;
    tmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle: string;
    airDate: string;
    overview?: string;
    runtime: number;
    stillPath?: string;
    addedBy: mongoose.Types.ObjectId;
    watchStatus: "unwatched" | "watched" | "skipped";
    watchedAt?: Date;
    rating?: number;
    formattedAirDate?: string;
    episodeIdentifier?: string;
    watchTimeHours?: number;
}

export interface IEpisodeModel extends Model<IEpisode> {
    deleteByTmdbIdAndUser(tmdbId: number, userId: mongoose.Types.ObjectId): Promise<{ deletedCount: number }>;
    findOrphanedEpisodes(): Promise<Array<{
        addedBy: mongoose.Types.ObjectId;
        tmdbId: number;
        count: number;
    }>>;
    cleanupEpisodesForTVShow(tmdbId: number, userId: mongoose.Types.ObjectId): Promise<{ deletedCount: number }>;
}

const episodeSchema = new Schema<IEpisode, IEpisodeModel>(
    {
        tmdbId: { type: Number, required: true, index: true },
        seasonNumber: { type: Number, required: true },
        episodeNumber: { type: Number, required: true },
        episodeTitle: { type: String, required: true },
        airDate: { type: String },
        overview: { type: String },
        runtime: { type: Number, default: 45 }, // Default 45 minutes per episode
        stillPath: { type: String },
        addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        watchStatus: {
            type: String,
            enum: ["unwatched", "watched", "skipped"],
            default: "unwatched"
        },
        watchedAt: { type: Date },
        rating: { type: Number, min: 1, max: 5 }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

episodeSchema.index({
    addedBy: 1,
    tmdbId: 1,
    seasonNumber: 1,
    episodeNumber: 1
}, { unique: true });

episodeSchema.index({ addedBy: 1, watchStatus: 1 });
episodeSchema.index({ addedBy: 1, tmdbId: 1 });
episodeSchema.index({ tmdbId: 1 });

// Static method to delete episodes by TMDB ID and user
episodeSchema.statics.deleteByTmdbIdAndUser = async function(
    tmdbId: number,
    userId: mongoose.Types.ObjectId
): Promise<{ deletedCount: number }> {
    try {
        const result = await this.deleteMany({
            tmdbId: tmdbId,
            addedBy: userId
        });

        console.log(`🗑️ Deleted ${result.deletedCount} episodes for TMDB ID: ${tmdbId}, User: ${userId}`);
        return { deletedCount: result.deletedCount || 0 };
    } catch (error: any) {
        console.error(`Error deleting episodes for TMDB ID ${tmdbId}, User ${userId}:`, error);
        throw error;
    }
};

// Static method to find orphaned episodes (episodes without corresponding TV shows)
episodeSchema.statics.findOrphanedEpisodes = async function(): Promise<Array<{
    addedBy: mongoose.Types.ObjectId;
    tmdbId: number;
    count: number;
}>> {
    try {
        // Get all episodes grouped by user and TMDB ID
        const episodesByUserAndTmdb = await this.aggregate([
            {
                $group: {
                    _id: {
                        addedBy: "$addedBy",
                        tmdbId: "$tmdbId"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    addedBy: "$_id.addedBy",
                    tmdbId: "$_id.tmdbId",
                    count: 1,
                    _id: 0
                }
            }
        ]);

        // Check each group for corresponding TV shows
        const orphanedEpisodes = [];

        for (const episodeGroup of episodesByUserAndTmdb) {
            const tvShowExists = await Media.exists({
                addedBy: episodeGroup.addedBy,
                tmdbId: episodeGroup.tmdbId,
                type: "tv"
            });

            if (!tvShowExists) {
                orphanedEpisodes.push({
                    addedBy: episodeGroup.addedBy,
                    tmdbId: episodeGroup.tmdbId,
                    count: episodeGroup.count
                });
            }
        }

        return orphanedEpisodes;
    } catch (error: any) {
        console.error("Error finding orphaned episodes:", error);
        throw error;
    }
};

// Static method to clean up episodes when a TV show is deleted
episodeSchema.statics.cleanupEpisodesForTVShow = async function(
    tmdbId: number,
    userId: mongoose.Types.ObjectId
): Promise<{ deletedCount: number }> {
    try {
        const result = await this.deleteMany({
            tmdbId: tmdbId,
            addedBy: userId
        });

        if (result.deletedCount > 0) {
            console.log(`🧹 Cleaned up ${result.deletedCount} episodes for TV show ID: ${tmdbId}, User: ${userId}`);
        }

        return { deletedCount: result.deletedCount || 0 };
    } catch (error: any) {
        console.error(`Error cleaning up episodes for TV show ${tmdbId}:`, error);
        throw error;
    }
};

// Instance method to mark episode as watched
episodeSchema.methods.markAsWatched = function(): void {
    this.watchStatus = "watched";
    this.watchedAt = new Date();
};

// Instance method to mark episode as unwatched
episodeSchema.methods.markAsUnwatched = function(): void {
    this.watchStatus = "unwatched";
    this.watchedAt = undefined;
};

// Instance method to mark episode as skipped
episodeSchema.methods.markAsSkipped = function(): void {
    this.watchStatus = "skipped";
    this.watchedAt = undefined;
};

// Virtual for formatted air date
episodeSchema.virtual("formattedAirDate").get(function(this: IEpisode) {
    if (!this.airDate) return "Unknown";
    return new Date(this.airDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
});

// Virtual for episode identifier (S01E01 format)
episodeSchema.virtual("episodeIdentifier").get(function(this: IEpisode) {
    return `S${this.seasonNumber.toString().padStart(2, '0')}E${this.episodeNumber.toString().padStart(2, '0')}`;
});

// Virtual for total watch time in hours
episodeSchema.virtual("watchTimeHours").get(function(this: IEpisode) {
    return (this.runtime || 45) / 60;
});

// Pre-save middleware to validate episode data
episodeSchema.pre("save", function(this: IEpisode, next) {
    // Validate episode number is positive
    if (this.episodeNumber < 1) {
        throw new Error("Episode number must be at least 1");
    }

    // Validate season number is positive
    if (this.seasonNumber < 0) {
        throw new Error("Season number must be at least 0 (for specials)");
    }

    // Ensure watchedAt is set when marked as watched
    if (this.watchStatus === "watched" && !this.watchedAt) {
        this.watchedAt = new Date();
    }

    // Clear watchedAt if not watched
    if (this.watchStatus !== "watched" && this.watchedAt) {
        this.watchedAt = undefined;
    }

    next();
});

// Post-save middleware to update TV show stats
episodeSchema.post("save", async function(this: IEpisode) {
    try {
        // Update the corresponding TV show's stats
        await updateTVShowStats(this.addedBy, this.tmdbId);

        console.log(`✅ Updated stats for TV show ID: ${this.tmdbId} after episode save`);
    } catch (error) {
        console.error("Error updating TV show stats after episode save:", error);
    }
});

// Helper function to update TV show stats (same as in controller)
const updateTVShowStats = async (userId: mongoose.Types.ObjectId, tmdbId: number) => {
    try {
        const Episode = mongoose.model<IEpisode>("Episode");

        // Get all episodes for this TV show
        const episodes = await Episode.find({
            addedBy: userId,
            tmdbId
        });

        if (episodes.length === 0) return;

        // Calculate stats
        const totalEpisodes = episodes.length;
        const watchedEpisodes = episodes.filter(e => e.watchStatus === "watched").length;
        const skippedEpisodes = episodes.filter(e => e.watchStatus === "skipped").length;
        const totalWatchedEpisodes = watchedEpisodes + skippedEpisodes;

        // Calculate total watch time (only from watched episodes)
        const totalWatchTime = episodes
            .filter(e => e.watchStatus === "watched")
            .reduce((sum, ep) => sum + (ep.runtime || 45), 0);

        // Update TV show in Media collection
        const tvShow = await Media.findOne({
            addedBy: userId,
            tmdbId,
            type: "tv"
        });

        if (tvShow) {
            tvShow.totalEpisodesWatched = totalWatchedEpisodes;
            tvShow.totalWatchTime = totalWatchTime;

            // Update watch status based on watched episodes
            if (totalWatchedEpisodes === 0) {
                tvShow.watchStatus = "planned";
            } else if (totalWatchedEpisodes === totalEpisodes) {
                tvShow.watchStatus = "completed";
            } else {
                tvShow.watchStatus = "watching";
            }

            await tvShow.save();
        }
    } catch (error) {
        console.error("Update TV show stats error:", error);
    }
};

// Post-remove middleware to clean up if needed
episodeSchema.post("deleteOne", { document: true, query: false }, async function(this: IEpisode) {
    console.log(`🗑️ Episode deleted: ${(this as any).episodeIdentifier} - ${this.episodeTitle}`);

    // Update TV show stats after episode deletion
    try {
        await updateTVShowStats(this.addedBy, this.tmdbId);
    } catch (error) {
        console.error("Error updating TV show stats after episode deletion:", error);
    }
});

export const Episode = mongoose.model<IEpisode, IEpisodeModel>("Episode", episodeSchema);

// Export cleanup function for external use
export const cleanupAllOrphanedEpisodes = async (): Promise<{ totalDeleted: number }> => {
    try {
        console.log("🔍 Starting cleanup of orphaned episodes...");

        // Get all episodes grouped by user and TMDB ID
        const episodesByUserAndTmdb = await Episode.aggregate([
            {
                $group: {
                    _id: {
                        addedBy: "$addedBy",
                        tmdbId: "$tmdbId"
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalDeleted = 0;

        // Check each group for corresponding TV shows
        for (const episodeGroup of episodesByUserAndTmdb) {
            const tvShowExists = await Media.exists({
                addedBy: episodeGroup._id.addedBy,
                tmdbId: episodeGroup._id.tmdbId,
                type: "tv"
            });

            if (!tvShowExists) {
                // Delete orphaned episodes
                const result = await Episode.deleteMany({
                    addedBy: episodeGroup._id.addedBy,
                    tmdbId: episodeGroup._id.tmdbId
                });

                totalDeleted += result.deletedCount || 0;
                console.log(`🗑️ Cleaned ${result.deletedCount} orphaned episodes for user ${episodeGroup._id.addedBy}, TV show ${episodeGroup._id.tmdbId}`);
            }
        }

        console.log(`✅ Cleanup complete. Removed ${totalDeleted} orphaned episodes.`);
        return { totalDeleted };
    } catch (error) {
        console.error("Cleanup error:", error);
        throw error;
    }
};