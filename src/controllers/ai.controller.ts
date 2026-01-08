import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import TMDBService from "../services/tmdb.service";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export const aiChat = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message } = req.body;
        
        if (!message || typeof message !== "string") {
            res.status(400).json({ message: "Message is required" });
            return;
        }

        console.log("🤖 AI Chat Request:", message);

        // Get model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // Create prompt for movie/TV show recommendations
        const prompt = `
        You are a movie and TV show expert assistant. Analyze the user's query and return relevant movie/TV show recommendations.
        
        User Query: "${message}"
        
        Please provide:
        1. If the user is looking for specific content (like a movie/show), identify it and recommend similar content
        2. If the user describes a plot/character, try to identify the actual movie/show
        
        Return ONLY a JSON array in this exact format:
        [
          {
            "title": "Movie/TV Show Title",
            "type": "movie" or "tv",
            "reason": "Why you're recommending this (similar genre/plot/theme)",
            "year": "Release year if known",
            "keywords": ["keyword1", "keyword2", "keyword3"] for searching
          }
        ]
        
        Return maximum 5 recommendations. If you can't identify or don't have recommendations, return empty array [].
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("🤖 AI Response:", text);

        // Parse JSON from response
        const recommendations = JSON.parse(text);
        
        res.status(200).json({
            message: "AI recommendations generated",
            data: recommendations
        });
    } catch (err: any) {
        console.error("AI Chat Error:", err);
        res.status(500).json({ 
            message: "Failed to process AI request", 
            error: err.message 
        });
    }
};

export const aiSearchMedia = async (req: Request, res: Response): Promise<void> => {
    try {
        const { keywords, type } = req.body;
        
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            res.status(400).json({ message: "Keywords array is required" });
            return;
        }

        // Combine keywords for search
        const searchQuery = keywords.join(" ");
        const page = 1;

        console.log("🔍 AI Media Search:", { searchQuery, type });

        // Search TMDB
        const tmdbResponse = await TMDBService.search(searchQuery, page);

        // Filter by type if specified
        let filteredResults = tmdbResponse.results;
        if (type && (type === "movie" || type === "tv")) {
            filteredResults = tmdbResponse.results.filter((item: any) => 
                item.media_type === type
            );
        }

        // Transform TMDB data
        const results = filteredResults.map((item: any) => ({
            id: item.id,
            title: "title" in item ? item.title : item.name,
            overview: item.overview,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: "release_date" in item ? item.release_date : item.first_air_date,
            vote_average: item.vote_average,
            vote_count: item.vote_count,
            type: "title" in item ? "movie" : "tv",
            media_type: item.media_type,
            genre_ids: item.genre_ids,
        }));

        // Sort by relevance (vote_average)
        results.sort((a: any, b: any) => b.vote_average - a.vote_average);

        res.status(200).json({
            message: "AI search results",
            data: results.slice(0, 10), // Return top 10
            pagination: {
                page: tmdbResponse.page,
                total_pages: tmdbResponse.total_pages,
                total_results: tmdbResponse.total_results,
            },
        });
    } catch (err: any) {
        console.error("AI Search Error:", err);
        res.status(500).json({ 
            message: "Failed to search media", 
            error: err.message 
        });
    }
};