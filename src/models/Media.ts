import mongoose, { Document, Schema } from "mongoose";

export interface IMedia extends Document {
  _id: mongoose.Types.ObjectId;
  tmdbId: number;
  title: string;
  type: "movie" | "tv";
  posterPath?: string;
  releaseDate?: string;
  addedBy: mongoose.Types.ObjectId;
  watchStatus: "planned" | "watching" | "completed";
  rating?: number;
  watchTimeMinutes: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    tmdbId: { type: Number, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ["movie", "tv"], required: true },
    posterPath: { type: String },
    releaseDate: { type: String },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    watchStatus: {
      type: String,
      enum: ["planned", "watching", "completed"],
      default: "planned"
    },
    rating: { type: Number, min: 1, max: 5 },
    watchTimeMinutes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const Media = mongoose.model<IMedia>("Media", mediaSchema);