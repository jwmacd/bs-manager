import { Observable, from, of } from "rxjs";
import { map } from "rxjs/operators";
import { BsmLocalMap, ScoredMap, SimilarMapGroup, SimilarMapsResult } from "shared/models/maps/bsm-local-map.interface";

/**
 * Service for analyzing maps and finding duplicates/similar maps
 */
export class MapAnalysisService {
    private static instance: MapAnalysisService;

    public static getInstance(): MapAnalysisService {
        if (!MapAnalysisService.instance) {
            MapAnalysisService.instance = new MapAnalysisService();
        }
        return MapAnalysisService.instance;
    }
    
    // Add any static constants at the class level (if needed)
    // public static readonly SOME_CONSTANT = "value";

    /**
     * Find similar maps within a collection, including true duplicates and fuzzy matches
     * Groups maps based on exact hash matches and fuzzy name/artist matching
     * Ranks maps within each group and marks highest quality version as recommended
     * 
     * @param maps Collection of maps to analyze for similarities
     * @returns Observable that emits analysis results containing similar map groups
     */
    public findSimilarMaps(maps: BsmLocalMap[]): Observable<SimilarMapsResult> {
        return of(maps).pipe(
            map(maps => {
                // First tier: Group exact hash duplicates
                const hashGroups = this.groupByHash(maps);
                
                // Second tier: Group by similar song name and artist
                const songGroups = this.groupBySimilarSong(maps);
                
                // Combine groups, prioritizing exact matches
                const combinedGroups = [...hashGroups, ...songGroups];
                
                // Rank each version within groups and mark recommendations
                const analyzedGroups = this.rankMapGroups(combinedGroups);
                
                // Calculate totals
                const totalDuplicates = analyzedGroups.reduce(
                    (count, group) => count + group.maps.filter(m => !m.recommended).length, 
                    0
                );
                
                const potentialSpaceSaving = analyzedGroups.reduce(
                    (size, group) => size + group.maps.filter(m => !m.recommended)
                        .reduce((mapSize, m) => mapSize + this.estimateMapSize(m.map), 0),
                    0
                );
                
                return {
                    groups: analyzedGroups,
                    totalDuplicates,
                    potentialSpaceSaving
                };
            })
        );
    }

    /**
     * Group maps by exact hash matches (true duplicates)
     */
    private groupByHash(maps: BsmLocalMap[]): SimilarMapGroup[] {
        const groups: SimilarMapGroup[] = [];
        const hashMap = Object.groupBy(maps, m => m.hash);
        
        for (const [hash, hashMaps] of Object.entries(hashMap)) {
            if (!Array.isArray(hashMaps) || hashMaps.length <= 1) continue;
            
            const scoredMaps: ScoredMap[] = hashMaps.map(map => ({
                map,
                score: 0, // Will be calculated later
                recommended: false
            }));
            
            groups.push({
                songName: hashMaps[0].mapInfo.songName,
                authorName: hashMaps[0].mapInfo.songAuthorName,
                maps: scoredMaps,
                totalSize: 0, // Will be calculated later
                similarity: 'exact'
            });
        }
        
        return groups;
    }

    /**
     * Normalize song info for comparison
     */
    private normalizeSongInfo(title: string, artist: string): string {
        // Normalize song info for comparison
        const normalizeText = (text: string) => {
            if (!text) return '';
            
            return text
                .toLowerCase()
                .replace(/[^\w\s]/g, '') // Remove special chars
                .replace(/\s+(feat|ft|featuring|prod|produced by)\s+.*/i, '') // Remove featuring
                .replace(/\s+(remix|edit|version|mix|vip|cover).*/i, '') // Standardize versions
                .trim();
        };
        
        return `${normalizeText(title)} ${normalizeText(artist)}`;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    private getSimilarity(str1: string, str2: string): number {
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1.0;
        
        // Calculate Levenshtein distance
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - distance / maxLength;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(s1: string, s2: string): number {
        const len1 = s1.length;
        const len2 = s2.length;
        
        // Create a matrix of size (len1+1) x (len2+1)
        const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
        
        // Initialize first row and column
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        
        // Fill the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1, // deletion
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        return matrix[len1][len2];
    }

    /**
     * Group maps by similar song name and artist using fuzzy matching
     */
    private groupBySimilarSong(maps: BsmLocalMap[]): SimilarMapGroup[] {
        const groups: SimilarMapGroup[] = [];
        const processedHashes = new Set<string>();
        
        // Process each map
        for (let i = 0; i < maps.length; i++) {
            const map = maps[i];
            if (processedHashes.has(map.hash)) continue;
            
            const normalizedSource = this.normalizeSongInfo(
                map.mapInfo.songName, 
                map.mapInfo.songAuthorName
            );
            
            // Find similar songs
            const similarMaps: ScoredMap[] = [{ map, score: 0, recommended: false }];
            processedHashes.add(map.hash);
            
            // Compare with remaining maps
            for (let j = i + 1; j < maps.length; j++) {
                const compareMap = maps[j];
                if (processedHashes.has(compareMap.hash)) continue;
                
                const normalizedTarget = this.normalizeSongInfo(
                    compareMap.mapInfo.songName, 
                    compareMap.mapInfo.songAuthorName
                );
                
                const similarity = this.getSimilarity(normalizedSource, normalizedTarget);
                
                // Determine similarity level and threshold
                let similarityLevel: 'high' | 'medium' | 'low' | null = null;
                
                if (similarity > 0.9) {
                    similarityLevel = 'high';
                } else if (similarity > 0.8) {
                    similarityLevel = 'medium';
                } else if (similarity > 0.7) {
                    similarityLevel = 'low';
                }
                
                if (!similarityLevel) continue;
                
                // Additional checks to confirm similarity
                let isSimilar = true;
                
                // If BPM is available, use it as a secondary check
                if (map.mapInfo.beatsPerMinute && compareMap.mapInfo.beatsPerMinute) {
                    const bpmDiff = Math.abs(map.mapInfo.beatsPerMinute - compareMap.mapInfo.beatsPerMinute);
                    // Allow some BPM variation (for remixes, etc.)
                    if (bpmDiff > 10 && (bpmDiff / map.mapInfo.beatsPerMinute) > 0.1) {
                        // For high similarity text matches, we'll still consider it potentially similar
                        // For lower similarity matches, this is a strong signal they're different songs
                        if (similarityLevel !== 'high') {
                            isSimilar = false;
                        }
                    }
                }
                
                // If duration is available, use it as another check
                if (isSimilar && map.songDetails?.duration && compareMap.songDetails?.duration) {
                    const durationDiff = Math.abs(map.songDetails.duration - compareMap.songDetails.duration);
                    // Allow 15-second difference or 15% difference, whichever is greater
                    const threshold = Math.max(15, map.songDetails.duration * 0.15);
                    if (durationDiff > threshold) {
                        // For high similarity text matches, we'll still consider it potentially similar
                        if (similarityLevel !== 'high') {
                            isSimilar = false;
                        }
                    }
                }
                
                if (isSimilar) {
                    similarMaps.push({ map: compareMap, score: 0, recommended: false });
                    processedHashes.add(compareMap.hash);
                }
            }
            
            // Only add groups with multiple maps
            if (similarMaps.length > 1) {
                // Determine group similarity level (using the minimum level for all maps)
                let groupSimilarity: SimilarMapGroup['similarity'] = 'high';
                
                // We'll use the highest confidence level since these are already filtered
                
                groups.push({
                    songName: map.mapInfo.songName,
                    authorName: map.mapInfo.songAuthorName,
                    maps: similarMaps,
                    totalSize: 0,  // Will be calculated later
                    similarity: groupSimilarity
                });
            }
        }
        
        return groups;
    }

    /**
     * Rank maps within each group and mark recommended versions
     */
    private rankMapGroups(groups: SimilarMapGroup[]): SimilarMapGroup[] {
        // Calculate score for each map and mark the best as recommended
        for (const group of groups) {
            for (const item of group.maps) {
                const map = item.map;
                // Base score calculation
                let score = 0;
                
                if (map.songDetails) {
                    // Community metrics - ensure they're numbers
                    const upVotes = typeof map.songDetails.upVotes === 'number' ? map.songDetails.upVotes : 0;
                    const downVotes = typeof map.songDetails.downVotes === 'number' ? map.songDetails.downVotes : 0;
                    const downloads = typeof map.songDetails.downloads === 'number' ? map.songDetails.downloads : 0;
                    
                    score += (upVotes - downVotes) * 2;
                    score += downloads / 20;
                    
                    // Quality indicators
                    if (map.songDetails.ranked || map.songDetails.blRanked) score += 500;
                    if (map.songDetails.curated) score += 100;
                    if (map.songDetails.uploader?.verified) score += 50;
                    
                    // Penalize auto-mapped content
                    if (map.songDetails.automapper) score -= 300;
                }
                
                // Award points for full difficulty spread
                if (map.mapInfo.difficulties.length >= 5) score += 100;
                
                // Ensure score is a valid number
                item.score = isNaN(score) ? 0 : score;
            }
            
            // Sort by score descending
            group.maps.sort((a, b) => {
                // Handle NaN values (they should be treated as 0)
                const scoreA = isNaN(a.score) ? 0 : a.score;
                const scoreB = isNaN(b.score) ? 0 : b.score;
                return scoreB - scoreA;
            });
            
            // Mark highest score as recommended
            if (group.maps.length > 0) {
                group.maps[0].recommended = true;
            }
            
            // Calculate total size
            group.totalSize = group.maps.reduce((size, m) => size + this.estimateMapSize(m.map), 0);
        }
        
        return groups;
    }

    /**
     * Estimate map size based on complexity
     */
    public estimateMapSize(map: BsmLocalMap): number {
        // Estimate map size based on complexity
        const baseSize = 200; // KB
        const difficultyMultiplier = map.mapInfo.difficulties.length * 50;
        
        return baseSize + difficultyMultiplier;
    }
}