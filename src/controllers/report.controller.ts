import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import PDFDocument from "pdfkit";
import { Media } from "../models/Media";
import { Episode } from "../models/Episode";
import { User } from "../models/User";

export const generateMediaReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const userId = req.user.sub;
        const { period } = req.query; // Optional: 'week', 'month', 'year', 'all'

        // Fetch user data
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Calculate date range based on period
        const dateFilter: any = {};
        if (period && period !== 'all') {
            const now = new Date();
            let startDate = new Date();
            
            switch (period) {
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
            dateFilter.createdAt = { $gte: startDate };
        }

        // Fetch media data
        const mediaItems = await Media.find({ 
            addedBy: userId,
            ...dateFilter 
        }).sort({ createdAt: -1 });

        // Fetch episode data
        const episodes = await Episode.find({ 
            addedBy: userId,
            ...dateFilter 
        });

        // Calculate statistics
        const stats = await calculateMediaStats(mediaItems, episodes, period as string);

        // Generate PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Cinetime_Report_${Date.now()}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Generate PDF content
        await generatePDFContent(doc, user, stats, period as string);

        // Finalize PDF
        doc.end();
    } catch (err: any) {
        console.error("Report generation error:", err);
        res.status(500).json({ message: err?.message || "Failed to generate report" });
    }
};

// Helper function to calculate statistics
const calculateMediaStats = async (mediaItems: any[], episodes: any[], period: string) => {
    const stats: any = {
        period: period || 'all',
        generatedAt: new Date(),
        totals: {
            movies: 0,
            tvShows: 0,
            episodes: episodes.length,
            totalWatchTime: 0
        },
        byStatus: {
            planned: { movies: 0, tvShows: 0, time: 0 },
            watching: { movies: 0, tvShows: 0, time: 0 },
            completed: { movies: 0, tvShows: 0, time: 0 }
        },
        byGenre: {},
        monthlyActivity: {},
        topGenres: [],
        topMovies: [],
        topTVShows: []
    };

    // Calculate basic statistics
    mediaItems.forEach(item => {
        if (item.type === "movie") {
            stats.totals.movies++;
            stats.byStatus[item.watchStatus].movies++;
            stats.byStatus[item.watchStatus].time += item.watchTimeMinutes || 0;
            
            if (item.watchStatus === "completed") {
                stats.totals.totalWatchTime += item.watchTimeMinutes || 0;
            }

            // Add to top movies if completed and rated
            if (item.watchStatus === "completed" && item.rating) {
                stats.topMovies.push({
                    title: item.title,
                    rating: item.rating,
                    watchTime: item.watchTimeMinutes || 0,
                    date: item.updatedAt
                });
            }
        } else if (item.type === "tv") {
            stats.totals.tvShows++;
            stats.byStatus[item.watchStatus].tvShows++;
            
            // TV show watch time from episodes
            const showEpisodes = episodes.filter(ep => ep.tmdbId === item.tmdbId);
            const showWatchTime = showEpisodes
                .filter(ep => ep.watchStatus === "watched")
                .reduce((sum, ep) => sum + (ep.runtime || 45), 0);
            
            stats.byStatus[item.watchStatus].time += showWatchTime;
            
            if (item.watchStatus === "completed") {
                stats.totals.totalWatchTime += showWatchTime;
            }

            // Add to top TV shows if completed
            if (item.watchStatus === "completed") {
                stats.topTVShows.push({
                    title: item.title,
                    episodesWatched: showEpisodes.filter(ep => ep.watchStatus === "watched").length,
                    totalEpisodes: item.episodeCount || showEpisodes.length,
                    watchTime: showWatchTime,
                    date: item.updatedAt
                });
            }
        }
    });

    // Calculate episode statistics
    const watchedEpisodes = episodes.filter(ep => ep.watchStatus === "watched");
    const skippedEpisodes = episodes.filter(ep => ep.watchStatus === "skipped");
    
    stats.episodeStats = {
        total: episodes.length,
        watched: watchedEpisodes.length,
        skipped: skippedEpisodes.length,
        averageRating: watchedEpisodes.length > 0 
            ? watchedEpisodes.reduce((sum, ep) => sum + (ep.rating || 0), 0) / watchedEpisodes.length
            : 0,
        totalWatchTime: watchedEpisodes.reduce((sum, ep) => sum + (ep.runtime || 45), 0)
    };

    // Calculate monthly activity
    const monthlyData: Record<string, { movies: number, episodes: number, time: number }> = {};
    
    [...mediaItems, ...episodes].forEach(item => {
        const date = new Date(item.createdAt);
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { movies: 0, episodes: 0, time: 0 };
        }
        
        if ('type' in item) {
            if (item.type === "movie" && item.watchStatus === "completed") {
                monthlyData[monthYear].movies++;
                monthlyData[monthYear].time += item.watchTimeMinutes || 0;
            }
        } else if (item.watchStatus === "watched") {
            monthlyData[monthYear].episodes++;
            monthlyData[monthYear].time += item.runtime || 45;
        }
    });
    
    stats.monthlyActivity = monthlyData;

    // Sort top lists
    stats.topMovies.sort((a: any, b: any) => b.rating - a.rating || b.watchTime - a.watchTime);
    stats.topTVShows.sort((a: any, b: any) => b.episodesWatched - a.episodesWatched || b.watchTime - a.watchTime);
    
    // Limit to top 5
    stats.topMovies = stats.topMovies.slice(0, 5);
    stats.topTVShows = stats.topTVShows.slice(0, 5);

    return stats;
};

// Helper function to generate PDF content
const generatePDFContent = async (doc: PDFKit.PDFDocument, user: any, stats: any, period: string) => {
    const { email } = user;
    const periodText = period === 'all' ? 'All Time' : `Last ${period.charAt(0).toUpperCase() + period.slice(1)}`;

    // Helper function to format time
    const formatTime = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        
        if (days > 0) {
            return `${days}d ${remainingHours}h ${mins}m`;
        } else if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    // Header
    doc.fontSize(24)
       .fillColor('#dc2626') // Rose color from theme
       .text('CINETIME', 50, 50)
       .moveDown(0.5);
    
    doc.fontSize(16)
       .fillColor('#374151') // Slate-700
       .text('Media Activity Report', { underline: true })
       .moveDown(1);

    // User info
    doc.fontSize(12)
       .fillColor('#4b5563') // Slate-600
       .text(`User: ${email}`, { continued: true })
       .text(`  |  Period: ${periodText}`, { continued: true })
       .text(`  |  Generated: ${stats.generatedAt.toLocaleDateString()}`)
       .moveDown(2);

    // Summary Section
    doc.fontSize(14)
       .fillColor('#1f2937') // Slate-800
       .text('📊 Summary Statistics', { underline: true })
       .moveDown(0.5);

    const summaryY = doc.y;
    
    // Left column - Totals
    doc.fontSize(11)
       .fillColor('#374151')
       .text('Total Items:', 50, summaryY)
       .fillColor('#111827')
       .text(`${stats.totals.movies + stats.totals.tvShows}`, 150, summaryY);
    
    doc.fillColor('#374151')
       .text('Movies:', 50, summaryY + 20)
       .fillColor('#111827')
       .text(`${stats.totals.movies}`, 150, summaryY + 20);
    
    doc.fillColor('#374151')
       .text('TV Shows:', 50, summaryY + 40)
       .fillColor('#111827')
       .text(`${stats.totals.tvShows}`, 150, summaryY + 40);
    
    doc.fillColor('#374151')
       .text('Episodes:', 50, summaryY + 60)
       .fillColor('#111827')
       .text(`${stats.totals.episodes}`, 150, summaryY + 60);
    
    doc.fillColor('#374151')
       .text('Total Watch Time:', 50, summaryY + 80)
       .fillColor('#dc2626') // Rose color
       .text(formatTime(stats.totals.totalWatchTime), 150, summaryY + 80);

    // Right column - Status breakdown
    const statusY = summaryY;
    
    doc.fillColor('#374151')
       .text('Status Breakdown:', 300, statusY)
       .fillColor('#111827');
    
    const statuses = ['planned', 'watching', 'completed'];
    let statusOffset = 20;
    
    statuses.forEach(status => {
        const movies = stats.byStatus[status].movies;
        const tvShows = stats.byStatus[status].tvShows;
        const time = formatTime(stats.byStatus[status].time);
        
        doc.fillColor('#6b7280')
           .text(`${status.charAt(0).toUpperCase() + status.slice(1)}:`, 300, statusY + statusOffset)
           .fillColor('#111827')
           .text(`Movies: ${movies}, TV: ${tvShows}, Time: ${time}`, 380, statusY + statusOffset);
        
        statusOffset += 20;
    });

    doc.moveDown(4);

    // Episode Statistics
    if (stats.totals.tvShows > 0) {
        doc.fontSize(14)
           .fillColor('#1f2937')
           .text('📺 Episode Statistics', { underline: true })
           .moveDown(0.5);
        
        const episodeY = doc.y;
        
        doc.fontSize(11)
           .fillColor('#374151')
           .text('Total Episodes:', 50, episodeY)
           .fillColor('#111827')
           .text(`${stats.episodeStats.total}`, 200, episodeY);
        
        doc.fillColor('#374151')
           .text('Watched Episodes:', 50, episodeY + 20)
           .fillColor('#111827')
           .text(`${stats.episodeStats.watched} (${((stats.episodeStats.watched / stats.episodeStats.total) * 100).toFixed(1)}%)`, 200, episodeY + 20);
        
        doc.fillColor('#374151')
           .text('Skipped Episodes:', 50, episodeY + 40)
           .fillColor('#111827')
           .text(`${stats.episodeStats.skipped}`, 200, episodeY + 40);
        
        doc.fillColor('#374151')
           .text('Average Episode Rating:', 50, episodeY + 60)
           .fillColor('#111827')
           .text(`${stats.episodeStats.averageRating.toFixed(1)}/5`, 200, episodeY + 60);
        
        doc.fillColor('#374151')
           .text('Total Episode Watch Time:', 50, episodeY + 80)
           .fillColor('#dc2626')
           .text(formatTime(stats.episodeStats.totalWatchTime), 200, episodeY + 80);
        
        doc.moveDown(5);
    }

    // Top Movies Section
    if (stats.topMovies.length > 0) {
        doc.fontSize(14)
           .fillColor('#1f2937')
           .text('🏆 Top Rated Movies', { underline: true })
           .moveDown(0.5);
        
        let movieY = doc.y;
        
        stats.topMovies.forEach((movie: any, index: number) => {
            doc.fontSize(10)
               .fillColor('#374151')
               .text(`${index + 1}. ${movie.title}`, 50, movieY)
               .fillColor('#dc2626')
               .text(`⭐ ${movie.rating}/5`, 300, movieY)
               .fillColor('#6b7280')
               .text(`⏱️ ${formatTime(movie.watchTime)}`, 350, movieY)
               .text(`📅 ${new Date(movie.date).toLocaleDateString()}`, 420, movieY);
            
            movieY += 18;
        });
        
        doc.moveDown(stats.topMovies.length / 3);
    }

    // Top TV Shows Section
    if (stats.topTVShows.length > 0) {
        doc.fontSize(14)
           .fillColor('#1f2937')
           .text('🏆 Most Watched TV Shows', { underline: true })
           .moveDown(0.5);
        
        let tvY = doc.y;
        
        stats.topTVShows.forEach((show: any, index: number) => {
            const completion = show.totalEpisodes > 0 
                ? ((show.episodesWatched / show.totalEpisodes) * 100).toFixed(1)
                : '0';
            
            doc.fontSize(10)
               .fillColor('#374151')
               .text(`${index + 1}. ${show.title}`, 50, tvY)
               .fillColor('#dc2626')
               .text(`${show.episodesWatched}/${show.totalEpisodes} eps`, 300, tvY)
               .fillColor('#6b7280')
               .text(`${completion}%`, 380, tvY)
               .text(`⏱️ ${formatTime(show.watchTime)}`, 420, tvY);
            
            tvY += 18;
        });
        
        doc.moveDown(stats.topTVShows.length / 3);
    }

    // Monthly Activity Chart
    if (Object.keys(stats.monthlyActivity).length > 0) {
        doc.addPage();
        
        doc.fontSize(14)
           .fillColor('#1f2937')
           .text('📈 Monthly Activity', { underline: true })
           .moveDown(1);
        
        const months = Object.keys(stats.monthlyActivity).sort();
        const chartY = doc.y;
        const barWidth = 20;
        const maxHeight = 100;
        
        // Find max value for scaling
        const maxValue = Math.max(...months.map(m => 
            stats.monthlyActivity[m].movies + stats.monthlyActivity[m].episodes
        ));
        
        months.forEach((month, index) => {
            const x = 50 + (index * 60);
            const activity = stats.monthlyActivity[month];
            const total = activity.movies + activity.episodes;
            const height = (total / maxValue) * maxHeight;
            
            // Draw bar
            doc.rect(x, chartY + maxHeight - height, barWidth, height)
               .fill('#dc2626');
            
            // Month label
            doc.fontSize(8)
               .fillColor('#374151')
               .text(month.substring(5), x, chartY + maxHeight + 10, {
                   width: barWidth,
                   align: 'center'
               });
            
            // Value label
            doc.fontSize(7)
               .fillColor('#6b7280')
               .text(total.toString(), x, chartY + maxHeight - height - 15, {
                   width: barWidth,
                   align: 'center'
               });
        });
        
        // Legend
        doc.fontSize(10)
           .fillColor('#374151')
           .text('Legend:', 50, chartY + maxHeight + 40)
           .moveDown(0.5);
        
        doc.fontSize(8)
           .fillColor('#dc2626')
           .text('█ Movies & Episodes watched per month', 70, doc.y - 10);
    }

    // Footer
    const totalPages = doc.bufferedPageRange().count;
    
    for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        
        doc.fontSize(8)
           .fillColor('#6b7280')
           .text(
               `Page ${i + 1} of ${totalPages} • Cinetime Media Report • ${new Date().toLocaleDateString()}`,
               50,
               doc.page.height - 50,
               { align: 'center' }
           );
    }
};