import { MapInfo } from "./info/map-info.model";
import { SongDetails } from "./song-details-cache/song-details-cache.model";

export interface BsmLocalMap {
    hash: string;
    coverUrl: string;
    songUrl: string;
    mapInfo: MapInfo;
    songDetails?: SongDetails;
    path: string;
}

export interface BsmLocalMapsProgress {
    total: number;
    loaded: number;
    maps: BsmLocalMap[];
}

export interface DeleteMapsProgress {
    total: number;
    deleted: number;
}

export interface ScoredMap {
    map: BsmLocalMap;
    score: number;
    recommended: boolean;
}

export interface SimilarMapGroup {
    songName: string;
    authorName: string;
    maps: ScoredMap[];
    totalSize: number;
    similarity: 'exact' | 'high' | 'medium' | 'low';
}

export interface SimilarMapsResult {
    groups: SimilarMapGroup[];
    totalDuplicates: number;
    potentialSpaceSaving: number;
}
