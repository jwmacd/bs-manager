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

type Props = {
    maps: BsmLocalMap[];
    version: BSVersion;
    className?: string;
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

    const analyzeMaps = async () => {
        setIsAnalyzing(true);
        setSelectedGroups(new Set());
        setExpandedGroups(new Set());
        
        try {
            const result = await lastValueFrom(mapAnalysis.findSimilarMaps(maps));
            setAnalysisResult(result);
        } catch (error) {
            console.error("Error analyzing maps:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

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
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-2"></div>
                    <p>{t("maps.duplicate-maps.analyzing")}</p>
                </div>
            </div>
        );
    }

    if (!analysisResult || analysisResult.groups.length === 0) {
        return (
            <div className={`${className} flex flex-col items-center justify-center`}>
                <p className="mb-4">{t("maps.duplicate-maps.no-duplicates")}</p>
                <BsmButton
                    className="font-bold rounded-md p-2"
                    text="maps.duplicate-maps.analyze-again"
                    typeColor="primary"
                    withBar={false}
                    onClick={analyzeMaps}
                />
            </div>
        );
    }

    return (
        <div className={`${className} p-4 overflow-auto`}>
            <div className="stats-summary mb-6 grid grid-cols-3 gap-4">
                {renderGroupCount(analysisResult.groups.length)}
                {renderDuplicateMapCount(analysisResult.totalDuplicates)}
                {renderPotentialSaving(analysisResult.potentialSpaceSaving)}
            </div>
            
            <div className="flex justify-between mb-4">
                <div>
                    <BsmButton
                        className="mr-2 font-bold rounded-md p-1 text-sm"
                        text="maps.duplicate-maps.select-all"
                        typeColor="secondary"
                        withBar={false}
                        onClick={selectAllGroups}
                    />
                    <BsmButton
                        className="mr-2 font-bold rounded-md p-1 text-sm"
                        text="maps.duplicate-maps.unselect-all"
                        typeColor="secondary"
                        withBar={false}
                        onClick={unselectAllGroups}
                    />
                    <BsmButton
                        className="mr-2 font-bold rounded-md p-1 text-sm"
                        text="maps.duplicate-maps.expand-all"
                        typeColor="secondary"
                        withBar={false}
                        onClick={expandAllGroups}
                    />
                    <BsmButton
                        className="font-bold rounded-md p-1 text-sm"
                        text="maps.duplicate-maps.collapse-all"
                        typeColor="secondary"
                        withBar={false}
                        onClick={collapseAllGroups}
                    />
                </div>
                <BsmButton
                    className="font-bold rounded-md p-2"
                    text="maps.duplicate-maps.delete-selected"
                    typeColor="danger"
                    withBar={false}
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
                            className={`group-header p-3 flex justify-between items-center cursor-pointer ${
                                selectedGroups.has(groupIndex) ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'
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
                                <div>
                                    <div className="font-bold text-lg">{group.songName}</div>
                                    <div className="text-sm">{t("maps.duplicate-maps.by", { author: group.authorName })}</div>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <span className={`px-2 py-1 rounded-md text-xs mr-3 ${getSimilarityColor(group.similarity)}`}>
                                    {getSimilarityLabel(group.similarity)}
                                </span>
                                <span className="text-sm">
                                    {group.maps.length} {t("maps.duplicate-maps.versions")} · <FileSizeText fileSize={group.totalSize * 1024} />
                                </span>
                                <span className="ml-2">
                                    {expandedGroups.has(groupIndex) ? '▼' : '►'}
                                </span>
                            </div>
                        </div>
                        
                        {expandedGroups.has(groupIndex) && (
                            <div className="group-maps p-3" onClick={(e) => e.stopPropagation()}>
                                {group.maps.map((scoredMap, mapIndex) => (
                                    <div 
                                        key={`${scoredMap.map.hash}-${mapIndex}`}
                                        className={`map-item p-3 my-2 rounded-md ${
                                            scoredMap.recommended 
                                                ? 'bg-green-100 dark:bg-green-900 border-l-4 border-green-500' 
                                                : selectedMaps.has(`${groupIndex}_${mapIndex}`) 
                                                    ? 'bg-red-100 dark:bg-red-900 border-l-4 border-red-500'
                                                    : 'bg-gray-100 dark:bg-gray-800'
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
                                                    <span className="font-medium">
                                                        {t("maps.duplicate-maps.mapper", { mapper: scoredMap.map.mapInfo.levelMappers.join(', ') })}
                                                    </span>
                                                    {scoredMap.recommended && (
                                                        <span className="ml-2 text-green-600 dark:text-green-400">
                                                            ★ {t("maps.duplicate-maps.recommended")}
                                                        </span>
                                                    )}
                                                    <span className="ml-2 text-blue-600 dark:text-blue-400 text-sm">
                                                        (Score: {isNaN(scoredMap.score) ? 0 : Math.round(scoredMap.score)})
                                                    </span>
                                                </div>
                                                <div className="text-sm mt-1">
                                                    {t("maps.duplicate-maps.bpm", { bpm: scoredMap.map.mapInfo.beatsPerMinute })}
                                                    {scoredMap.map.songDetails?.duration && (
                                                        <> · {t("maps.duplicate-maps.duration", { 
                                                            duration: new Date(scoredMap.map.songDetails.duration * 1000)
                                                                .toISOString().substr(14, 5) 
                                                        })}</>
                                                    )}
                                                </div>
                                                <div className="text-sm mt-1">
                                                    {t("maps.duplicate-maps.difficulties", { count: scoredMap.map.mapInfo.difficulties.length })}
                                                    <span className="ml-2 flex">
                                                        {scoredMap.map.mapInfo.difficulties.map((diff, i) => (
                                                            <span 
                                                                key={`${diff.difficulty}-${i}`}
                                                                className="w-5 h-5 mx-0.5 rounded-sm"
                                                                style={{ backgroundColor: MAP_DIFFICULTIES_COLORS[diff.difficulty] }}
                                                                title={diff.difficulty}
                                                            ></span>
                                                        ))}
                                                    </span>
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
                                            <div className="text-right">
                                                <div className="text-sm">
                                                    {scoredMap.map.songDetails && (
                                                        <>{scoredMap.map.songDetails.upVotes} {t("maps.duplicate-maps.likes")}</>
                                                    )}
                                                </div>
                                                <div className="text-sm">
                                                    {scoredMap.map.songDetails && (
                                                        <>{scoredMap.map.songDetails.downloads} {t("maps.duplicate-maps.downloads")}</>
                                                    )}
                                                </div>
                                                <div className="text-sm font-semibold mt-1">
                                                    <FileSizeText fileSize={mapAnalysis.estimateMapSize(scoredMap.map) * 1024} />
                                                </div>
                                                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400 truncate max-w-md" title={scoredMap.map.path}>
                                                    {scoredMap.map.path.split('/').pop()}
                                                </div>
                                                
                                                {/* Score breakdown tooltip */}
                                                <div className="mt-2 text-xs p-1 bg-gray-200 dark:bg-gray-700 rounded">
                                                    <div className="font-semibold">Score breakdown:</div>
                                                    <div className="grid grid-cols-2 gap-x-2">
                                                        {scoredMap.map.songDetails && (
                                                            <>
                                                                {scoredMap.map.songDetails.upVotes != null && 
                                                                 scoredMap.map.songDetails.downVotes != null &&
                                                                 (scoredMap.map.songDetails.upVotes - scoredMap.map.songDetails.downVotes) !== 0 && (
                                                                    <div>Net votes: <span className="font-medium">{(scoredMap.map.songDetails.upVotes - scoredMap.map.songDetails.downVotes) * 2}</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.downloads != null && 
                                                                 scoredMap.map.songDetails.downloads > 0 && (
                                                                    <div>Downloads: <span className="font-medium">{Math.round(scoredMap.map.songDetails.downloads / 20)}</span></div>
                                                                )}
                                                                {(scoredMap.map.songDetails.ranked === true || scoredMap.map.songDetails.blRanked === true) && (
                                                                    <div>Ranked: <span className="font-medium text-green-600">+500</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.curated === true && (
                                                                    <div>Curated: <span className="font-medium text-green-600">+300</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.uploader?.verified === true && (
                                                                    <div>Verified mapper: <span className="font-medium text-green-600">+200</span></div>
                                                                )}
                                                                {scoredMap.map.songDetails.automapper === true && (
                                                                    <div>AI generated: <span className="font-medium text-red-600">-300</span></div>
                                                                )}
                                                            </>
                                                        )}
                                                        {scoredMap.map.mapInfo.difficulties.length >= 5 && (
                                                            <div>Full difficulty spread: <span className="font-medium text-green-600">+100</span></div>
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