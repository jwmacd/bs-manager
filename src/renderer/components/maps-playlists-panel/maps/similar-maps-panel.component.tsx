import React, { useEffect, useState } from "react";
import { BSVersion } from "shared/bs-version.interface";
import { useService } from "renderer/hooks/use-service.hook";
import { MapAnalysisService } from "renderer/services/map-analysis.service";
import { BsmLocalMap, SimilarMapGroup, SimilarMapsResult } from "shared/models/maps/bsm-local-map.interface";
import { BsmButton } from "../../shared/bsm-button.component";
import { MapsManagerService } from "renderer/services/maps-manager.service";
import { useTranslation } from "renderer/hooks/use-translation.hook";
import { lastValueFrom } from "rxjs";
import { MAP_DIFFICULTIES_COLORS } from "shared/models/maps/difficulties-colors";
import { FileSizeText } from "renderer/components/shared/file-size-text.component";

/**
 * Panel for displaying and managing similar/duplicate maps
 * Allows users to view, compare, and selectively delete duplicate maps
 */
type Props = {
    /** Collection of maps to analyze for similarities */
    maps: BsmLocalMap[];
    /** Current Beat Saber version */
    version: BSVersion;
    /** Optional CSS class name */
    className?: string;
    /** Callback triggered after maps are successfully deleted */
    onMapsDeleted?: () => void;
};

export const SimilarMapsPanel = React.memo(({ maps, version, className, onMapsDeleted }: Props) => {
    const mapAnalysis = useService(MapAnalysisService);
    const mapsManager = useService(MapsManagerService);
    const [analysisResult, setAnalysisResult] = useState<SimilarMapsResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    // Track individually selected maps (groupIndex_mapIndex)
    const [selectedMaps, setSelectedMaps] = useState<Set<string>>(new Set());
    const t = useTranslation();

    // Only run analysis once when component initially mounts
    useEffect(() => {
        if (maps.length > 0 && !analysisResult && !isAnalyzing) {
            analyzeMaps();
        }
    }, []);

    /**
     * Analyze maps to find similar groups and duplicates
     * Sets loading state and clears previous selections
     */
    const analyzeMaps = async () => {
        setIsAnalyzing(true);
        setSelectedGroups(new Set());
        setExpandedGroups(new Set());
        setSelectedMaps(new Set());
        
        try {
            const result = await lastValueFrom(mapAnalysis.findSimilarMaps(maps));
            setAnalysisResult(result);
        } catch (error) {
            console.error("Error analyzing maps:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    /**
     * Toggle selection of a map group for deletion
     * When a group is selected, all non-recommended maps will be deleted
     * 
     * @param groupIndex Index of the group to toggle
     */
    const toggleGroupSelection = (groupIndex: number) => {
        const newSelection = new Set(selectedGroups);
        if (newSelection.has(groupIndex)) {
            newSelection.delete(groupIndex);
            
            // Also remove any individually selected maps from this group
            const newMapSelection = new Set(selectedMaps);
            Array.from(newMapSelection).forEach(id => {
                if (id.startsWith(`${groupIndex}_`)) {
                    newMapSelection.delete(id);
                }
            });
            setSelectedMaps(newMapSelection);
        } else {
            newSelection.add(groupIndex);
        }
        setSelectedGroups(newSelection);
    };
    
    /**
     * Toggle selection of an individual map
     * Allows selecting specific maps to delete, overriding group-level selection
     * 
     * @param groupIndex Index of the group containing the map
     * @param mapIndex Index of the map within its group
     */
    const toggleMapSelection = (groupIndex: number, mapIndex: number) => {
        const mapId = `${groupIndex}_${mapIndex}`;
        const newSelection = new Set(selectedMaps);
        
        if (newSelection.has(mapId)) {
            newSelection.delete(mapId);
        } else {
            newSelection.add(mapId);
        }
        
        setSelectedMaps(newSelection);
    };

    const toggleGroupExpansion = (groupIndex: number) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupIndex)) {
            newExpanded.delete(groupIndex);
        } else {
            newExpanded.add(groupIndex);
        }
        setExpandedGroups(newExpanded);
    };

    const selectAllGroups = () => {
        if (analysisResult) {
            const allIndices = new Set<number>(
                analysisResult.groups.map((_, index) => index)
            );
            setSelectedGroups(allIndices);
        }
    };

    const unselectAllGroups = () => {
        setSelectedGroups(new Set());
    };

    const expandAllGroups = () => {
        if (analysisResult) {
            const allIndices = new Set<number>(
                analysisResult.groups.map((_, index) => index)
            );
            setExpandedGroups(allIndices);
        }
    };

    const collapseAllGroups = () => {
        setExpandedGroups(new Set());
    };

    /**
     * Delete selected duplicates based on group and individual map selections
     * For group selections, deletes all non-recommended maps
     * For individual map selections, deletes exactly those maps
     * Individual selections override group selections
     */
    const deleteSelectedDuplicates = async () => {
        if (!analysisResult) return;

        const mapsToDelete: BsmLocalMap[] = [];
        
        // Handle group selections (delete all non-recommended maps in the group)
        selectedGroups.forEach(groupIndex => {
            const group = analysisResult.groups[groupIndex];
            // Filter out the recommended map
            const duplicates = group.maps
                .filter((map, mapIndex) => {
                    // Skip if this specific map is individually selected 
                    // (individual selections override group selections)
                    if (selectedMaps.has(`${groupIndex}_${mapIndex}`)) {
                        return false;
                    }
                    // Only include non-recommended maps
                    return !map.recommended;
                })
                .map(map => map.map);
            
            mapsToDelete.push(...duplicates);
        });
        
        // Handle individual map selections
        selectedMaps.forEach(mapId => {
            const [groupIndex, mapIndex] = mapId.split('_').map(Number);
            // Only include if the parent group is not already selected
            if (!selectedGroups.has(groupIndex) && analysisResult.groups[groupIndex]) {
                const map = analysisResult.groups[groupIndex].maps[mapIndex]?.map;
                if (map) {
                    mapsToDelete.push(map);
                }
            }
        });
        
        if (mapsToDelete.length > 0) {
            const deleted = await mapsManager.deleteMaps(mapsToDelete, version);
            if (deleted && onMapsDeleted) {
                onMapsDeleted();
            }
        }
    };

    const getSimilarityColor = (similarity: SimilarMapGroup['similarity']) => {
        switch (similarity) {
            case 'exact': return "bg-green-100 dark:bg-green-900";
            case 'high': return "bg-blue-100 dark:bg-blue-900";
            case 'medium': return "bg-yellow-100 dark:bg-yellow-900";
            case 'low': return "bg-orange-100 dark:bg-orange-900";
            default: return "bg-gray-100 dark:bg-gray-800";
        }
    };

    const getSimilarityLabel = (similarity: SimilarMapGroup['similarity']) => {
        switch (similarity) {
            case 'exact': return t("maps.similarity.exact");
            case 'high': return t("maps.similarity.high");
            case 'medium': return t("maps.similarity.medium");
            case 'low': return t("maps.similarity.low");
            default: return t("maps.similarity.unknown");
        }
    };

    const renderDuplicateMapCount = (totalDuplicates: number) => {
        return (
            <div className="stat-card p-3 rounded-md bg-yellow-100 dark:bg-yellow-900">
                <div className="text-xl font-bold">{totalDuplicates}</div>
                <div>{t("maps.duplicate-maps.duplicate-count")}</div>
            </div>
        );
    };

    const renderPotentialSaving = (potentialSaving: number) => {
        return (
            <div className="stat-card p-3 rounded-md bg-green-100 dark:bg-green-900">
                <div className="text-xl font-bold"><FileSizeText fileSize={potentialSaving * 1024} /></div>
                <div>{t("maps.duplicate-maps.potential-saving")}</div>
            </div>
        );
    };

    const renderGroupCount = (groupCount: number) => {
        return (
            <div className="stat-card p-3 rounded-md bg-blue-100 dark:bg-blue-900">
                <div className="text-xl font-bold">{groupCount}</div>
                <div>{t("maps.duplicate-maps.similar-groups")}</div>
            </div>
        );
    };

    if (isAnalyzing) {
        return (
            <div className={`${className} flex items-center justify-center`}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-800 dark:text-gray-200 text-lg">{t("maps.duplicate-maps.analyzing")}</p>
                </div>
            </div>
        );
    }

    if (!analysisResult || analysisResult.groups.length === 0) {
        return (
            <div className={`${className} flex flex-col items-center justify-center`}>
                <p className="mb-6 text-gray-800 dark:text-gray-200 text-lg">{t("maps.duplicate-maps.no-duplicates")}</p>
                <BsmButton
                    className="rounded-md px-4 py-2"
                    text="maps.duplicate-maps.analyze-again"
                    typeColor="primary"
                    withBar={true}
                    onClick={analyzeMaps}
                />
            </div>
        );
    }

    return (
        <div className={`${className} p-4 overflow-auto`}>
            <div className="stats-summary mb-6 grid grid-cols-2 gap-4">
                <div className="stat-card p-3 rounded-md bg-light-main-color-2 dark:bg-main-color-2 text-gray-800 dark:text-gray-200 flex items-center justify-between">
                    <div className="text-sm">Similar Maps:</div>
                    <div className="text-xl font-bold">{analysisResult.groups.length}</div>
                </div>
                <div className="stat-card p-3 rounded-md bg-light-main-color-2 dark:bg-main-color-2 text-gray-800 dark:text-gray-200 flex items-center justify-between">
                    <div className="text-sm">Potential Duplicates:</div>
                    <div className="text-xl font-bold">{analysisResult.totalDuplicates}</div>
                </div>
            </div>
            
            <div className="flex justify-between mb-4">
                <div className="flex space-x-2">
                    <BsmButton
                        className="rounded-md px-3 py-1 text-sm"
                        text="maps.duplicate-maps.select-all"
                        typeColor="none"
                        withBar={false}
                        onClick={selectAllGroups}
                    />
                    <BsmButton
                        className="rounded-md px-3 py-1 text-sm"
                        text="maps.duplicate-maps.unselect-all"
                        typeColor="none"
                        withBar={false}
                        onClick={unselectAllGroups}
                    />
                    <BsmButton
                        className="rounded-md px-3 py-1 text-sm"
                        text="maps.duplicate-maps.expand-all"
                        typeColor="none"
                        withBar={false}
                        onClick={expandAllGroups}
                    />
                    <BsmButton
                        className="rounded-md px-3 py-1 text-sm"
                        text="maps.duplicate-maps.collapse-all"
                        typeColor="none"
                        withBar={false}
                        onClick={collapseAllGroups}
                    />
                </div>
                <BsmButton
                    className="rounded-md px-3 py-1 font-bold"
                    text="maps.duplicate-maps.delete-selected"
                    typeColor="error"
                    withBar={true}
                    onClick={deleteSelectedDuplicates}
                    disabled={selectedGroups.size === 0 && selectedMaps.size === 0}
                />
            </div>
            
            <div className="similar-groups space-y-4">
                {analysisResult.groups.map((group, groupIndex) => (
                    <div 
                        key={`${group.songName}-${group.authorName}-${groupIndex}`} 
                        className="group-card border rounded-md overflow-hidden"
                    >
                        <div 
                            className={`group-header px-2 py-2 flex justify-between items-center cursor-pointer transition-colors duration-200 ${
                                selectedGroups.has(groupIndex) ? 'bg-primary text-white' : 'bg-light-main-color-2 dark:bg-main-color-2 text-gray-800 dark:text-gray-200'
                            }`}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleGroupExpansion(groupIndex);
                            }}
                        >
                            <div className="flex items-center">
                                <div 
                                    className="mr-3 h-5 w-5 flex-shrink-0 flex items-center justify-center cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleGroupSelection(groupIndex);
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 pointer-events-none"
                                        checked={selectedGroups.has(groupIndex)}
                                        readOnly
                                    />
                                </div>
                                <div className="flex-grow">
                                    <div className="font-bold text-lg">{group.songName}</div>
                                    <div className="text-sm">by {group.authorName}</div>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <span className={`px-2 py-1 rounded-md text-xs mr-3 ${getSimilarityColor(group.similarity)}`}>
                                    {getSimilarityLabel(group.similarity)}
                                </span>
                                <span className="text-sm mr-3">
                                    {group.maps.length} Versions
                                </span>
                                <span className="ml-2">
                                    {expandedGroups.has(groupIndex) ? '▼' : '►'}
                                </span>
                            </div>
                        </div>
                        
                        {expandedGroups.has(groupIndex) && (
                            <div className="group-maps px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                {group.maps.map((scoredMap, mapIndex) => (
                                    <div 
                                        key={`${scoredMap.map.hash}-${mapIndex}`}
                                        className={`map-item px-2 py-2 my-2 rounded-md transition-colors duration-200 hover:brightness-[1.05] ${
                                            scoredMap.recommended 
                                                ? 'bg-green-100 dark:bg-green-900 border-l-4 border-green-500' 
                                                : selectedMaps.has(`${groupIndex}_${mapIndex}`) 
                                                    ? 'bg-gray-200 dark:bg-gray-700 border-l-4 border-primary'
                                                    : 'bg-gray-200 dark:bg-gray-700'
                                        }`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div className="flex-grow">
                                                <div className="flex items-center">
                                                    <div 
                                                        className="mr-3 h-5 w-5 flex-shrink-0 flex items-center justify-center cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleMapSelection(groupIndex, mapIndex);
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="h-5 w-5 pointer-events-none"
                                                            checked={selectedMaps.has(`${groupIndex}_${mapIndex}`)}
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium flex items-center">
                                                            <span>Mapper: {scoredMap.map.mapInfo.levelMappers.join(', ')}</span>
                                                            <span className="ml-3 text-blue-600 dark:text-blue-400 text-sm">
                                                                (Score: {isNaN(scoredMap.score) ? 0 : Math.round(scoredMap.score)})
                                                            </span>
                                                        </div>
                                                        {scoredMap.recommended && (
                                                            <div className="text-green-600 dark:text-green-400">
                                                                {t("maps.duplicate-maps.recommended")} ★
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-sm mt-1">
                                                    {scoredMap.map.mapInfo.beatsPerMinute} BPM
                                                    {scoredMap.map.songDetails?.duration && (
                                                        <> · {new Date(scoredMap.map.songDetails.duration * 1000)
                                                                .toISOString().substr(14, 5)} min</>
                                                    )}
                                                </div>
                                                <div className="text-sm mt-2 mb-1 flex items-center">
                                                    <span className="mr-2">Difficulties:</span>
                                                    <div className="flex">
                                                        {scoredMap.map.mapInfo.difficulties.map((diff, i) => (
                                                            <span 
                                                                key={`${diff.difficulty}-${i}`}
                                                                className="w-5 h-5 mx-0.5 rounded-sm inline-block"
                                                                style={{ backgroundColor: MAP_DIFFICULTIES_COLORS[diff.difficulty] }}
                                                                title={diff.difficulty}
                                                            ></span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {scoredMap.map.songDetails && (
                                                    <div className="flex mt-1 text-sm">
                                                        {scoredMap.map.songDetails.ranked && (
                                                            <span className="bg-blue-200 dark:bg-blue-800 text-xs px-2 py-0.5 rounded-md mr-1">
                                                                ScoreSaber
                                                            </span>
                                                        )}
                                                        {scoredMap.map.songDetails.blRanked && (
                                                            <span className="bg-purple-200 dark:bg-purple-800 text-xs px-2 py-0.5 rounded-md mr-1">
                                                                BeatLeader
                                                            </span>
                                                        )}
                                                        {scoredMap.map.songDetails.curated && (
                                                            <span className="bg-yellow-200 dark:bg-yellow-800 text-xs px-2 py-0.5 rounded-md mr-1">
                                                                {t("maps.duplicate-maps.curated")}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-4 flex items-center justify-center h-full">
                                                <div className="mr-3">
                                                    <div className="text-sm">
                                                        {scoredMap.map.songDetails && scoredMap.map.songDetails.upVotes != null ? (
                                                            <>{scoredMap.map.songDetails.upVotes} Likes</>
                                                        ) : (
                                                            <><span className="text-gray-500">No data</span> Likes</>
                                                        )}
                                                    </div>
                                                    <div className="text-sm">
                                                        {scoredMap.map.songDetails && scoredMap.map.songDetails.downloads != null ? (
                                                            <>{scoredMap.map.songDetails.downloads} Downloads</>
                                                        ) : (
                                                            <><span className="text-gray-500">No data</span> Downloads</>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Cover image */}
                                                {scoredMap.map.coverUrl && (
                                                    <img 
                                                        src={scoredMap.map.coverUrl} 
                                                        alt="Cover" 
                                                        className="h-[80px] w-[80px] rounded-md object-cover mr-3 my-auto"
                                                    />
                                                )}
                                                
                                                {/* Score breakdown tooltip */}
                                                <div className="text-xs p-2 bg-light-main-color-3 dark:bg-main-color-3 rounded-md shadow-sm w-[280px] my-auto">
                                                    <div className="font-bold text-gray-800 dark:text-gray-200 mb-1 text-left">Score Breakdown:</div>
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                                        {scoredMap.map.songDetails && (
                                                            <>
                                                                {scoredMap.map.songDetails.upVotes != null && 
                                                                 scoredMap.map.songDetails.downVotes != null &&
                                                                 (scoredMap.map.songDetails.upVotes - scoredMap.map.songDetails.downVotes) !== 0 && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">Net Votes: <span className="font-bold">{(scoredMap.map.songDetails.upVotes - scoredMap.map.songDetails.downVotes) * 2}</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.downloads != null && 
                                                                 scoredMap.map.songDetails.downloads > 0 && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">Downloads: <span className="font-bold">{Math.round(scoredMap.map.songDetails.downloads / 20)}</span></div>
                                                                )}
                                                                {(scoredMap.map.songDetails.ranked === true || scoredMap.map.songDetails.blRanked === true) && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">Ranked: <span className="font-bold text-green-600 dark:text-green-400">+500</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.curated === true && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">Curated: <span className="font-bold text-green-600 dark:text-green-400">+100</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.uploader?.verified === true && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">Verified: <span className="font-bold text-green-600 dark:text-green-400">+50</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.automapper === true && (
                                                                    <div className="text-gray-800 dark:text-gray-200 text-left">AI Generated: <span className="font-bold text-red-600 dark:text-red-400">-300</span></div>
                                                                )}
                                                            </>
                                                        )}
                                                        {scoredMap.map.mapInfo.difficulties.length >= 5 && (
                                                            <div className="text-gray-800 dark:text-gray-200 text-left">Full Difficulty Spread: <span className="font-bold text-green-600 dark:text-green-400">+100</span></div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
});