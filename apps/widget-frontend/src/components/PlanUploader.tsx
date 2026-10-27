import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { v4 as uuidv4 } from 'uuid';
import { PlanLoadingOverlay, type PlanLoadPhase } from './PlanLoadingOverlay';
import { convertRoomPlanToSceneData, isRoomPlanData } from '@flat/shared';
import { LiDARScanModal } from './LiDARScanModal';

// Uses import.meta.env for Vite or fallback
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
const AI_URL = (import.meta as any).env?.VITE_AI_URL || 'http://localhost:5000';

export const PlanUploader: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const setPlanImage = useStore(state => state.setPlanImage);
    const addWall = useStore(state => state.addWall);
    const clearWalls = useStore(state => state.clearWalls);
    const setEditorMode = useStore(state => state.setEditorMode);
    // Subscribe to store changes
    const detectionThreshold = useStore(state => state.detectionThreshold);
    const thresholdManual = useStore(state => state.thresholdManual);
    const editorMode = useStore(state => state.editorMode);
    const imageProcessing = useStore(state => state.imageProcessing);

    const [isLoading, setIsLoading] = useState(false);
    const [loadPhase, setLoadPhase] = useState<PlanLoadPhase>('upload');
    const [isReprocess, setIsReprocess] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const previewUrlRef = useRef<string | null>(null);
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [isLiDARModalOpen, setIsLiDARModalOpen] = useState(false);

    // Debounce ref. threshold sentinel -1 = auto (do not send threshold to AI).
    const debounceTimer = useRef<NodeJS.Timeout>();
    const lastProcessedParams = useRef({
        fileName: '',
        threshold: -1 as number,
        grayscale: false,
        contrast: 1.0
    });

    // Re-process only when the user changes sensitivity / B&W / HDR — not on initial upload.
    useEffect(() => {
        const effectiveThreshold = thresholdManual ? detectionThreshold : -1;
        console.log(`[PlanUploader] Effect triggered: threshold=${effectiveThreshold} (manual=${thresholdManual}), file=${currentFile?.name || 'null'}, mode=${editorMode}`);

        if (!currentFile) {
            console.log('[PlanUploader] No currentFile - skipping re-process');
            return;
        }
        const inReview = useStore.getState().planReviewActive;
        if (editorMode !== 'walls' && !inReview) {
            console.log('[PlanUploader] Not in walls/review mode - skipping re-process');
            return;
        }

        const currentParams = {
            fileName: currentFile.name,
            threshold: effectiveThreshold,
            grayscale: imageProcessing.grayscale,
            contrast: imageProcessing.contrast
        };

        if (
            lastProcessedParams.current.fileName === currentParams.fileName &&
            lastProcessedParams.current.threshold === currentParams.threshold &&
            lastProcessedParams.current.grayscale === currentParams.grayscale &&
            lastProcessedParams.current.contrast === currentParams.contrast
        ) {
            console.log('[PlanUploader] Parameters unchanged - skipping automatic re-process');
            return;
        }

        // Initial upload already called processWithAI without threshold — don't race a second request.
        if (
            lastProcessedParams.current.fileName === currentParams.fileName &&
            lastProcessedParams.current.threshold === -1 &&
            !thresholdManual &&
            lastProcessedParams.current.grayscale === currentParams.grayscale &&
            lastProcessedParams.current.contrast === currentParams.contrast
        ) {
            return;
        }

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            const thr = thresholdManual ? detectionThreshold : undefined;
            const effective = thr !== undefined ? thr : -1;
            // Re-check after debounce — upload may have already processed with auto.
            if (
                lastProcessedParams.current.fileName === currentFile.name &&
                lastProcessedParams.current.threshold === effective &&
                lastProcessedParams.current.grayscale === imageProcessing.grayscale &&
                lastProcessedParams.current.contrast === imageProcessing.contrast
            ) {
                console.log('[PlanUploader] Debounce skipped — already processed with same params');
                return;
            }
            console.log(`[PlanUploader] Debounce complete, calling processWithAI(threshold=${thr ?? 'auto'})...`);
            processWithAI(currentFile, thr, { showOverlay: true, reprocess: true });
        }, 500);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [detectionThreshold, thresholdManual, currentFile, editorMode, imageProcessing]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Direct import of 3D LiDAR (Apple RoomPlan) or Flat Scene JSON
        if (file.name.endsWith('.json') || file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const content = event.target?.result as string;
                    const parsed = JSON.parse(content);
                    if (isRoomPlanData(parsed) || parsed.walls) {
                        const scene = convertRoomPlanToSceneData(parsed);
                        useStore.getState().loadScene(scene);
                        useStore.getState().setCameraMode('3d');
                    } else if (parsed.schemaVersion === '1.0') {
                        useStore.getState().loadScene(parsed);
                    }
                } catch (err: any) {
                    alert('Не удалось разобрать JSON-скан: ' + (err.message || err));
                }
            };
            reader.readAsText(file);
            return;
        }

        // Cancel any pending re-process from a previous file / slider
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        setCurrentFile(file); // Save for re-processing
        setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            const url = URL.createObjectURL(file);
            previewUrlRef.current = url;
            return url;
        });
        setIsReprocess(false);
        setLoadPhase('upload');
        // Mark auto params early so the effect does not race a second AI call
        lastProcessedParams.current = {
            fileName: file.name,
            threshold: -1,
            grayscale: useStore.getState().imageProcessing.grayscale,
            contrast: useStore.getState().imageProcessing.contrast,
        };
        setIsLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            console.log('[PlanUploader] Uploading to backend...');
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Network response was not ok');

            const data = await res.json();
            console.log('[PlanUploader] Backend response:', data);

            if (data.url) {
                console.log('[PlanUploader] Saving URL to store:', data.url);
                // Save with default dimensions first and add timestamp to bypass cache
                const timestampParams = `?t=${Date.now()}`;
                setPlanImage(`${data.url}${timestampParams}`, 10, 10);

                // Switch to walls mode automatically
                setEditorMode('walls');

                setLoadPhase('recognize');
                await processWithAI(file);
                setLoadPhase('apply');
                await new Promise((r) => setTimeout(r, 500));
            } else {
                console.error('[PlanUploader] No URL in response');
            }
        } catch (err) {
            console.error('[PlanUploader] Upload failed:', err);
            alert('Не удалось загрузить план. Убедитесь, что бэкенд запущен (npm run dev).');
        } finally {
            setIsLoading(false);
        }
    };

    // Helpler function for AI processing
    async function processWithAI(file: File, thresholdVal?: number, opts?: { showOverlay?: boolean; reprocess?: boolean }) {
        // Call AI service to process the plan
        const formData = new FormData();
        formData.append('file', file);
        // Only send threshold when the user explicitly moved the sensitivity slider.
        if (thresholdVal !== undefined) {
            formData.append('threshold', thresholdVal.toString());
        }

        // Add processing flags
        const processing = useStore.getState().imageProcessing;
        if (processing.grayscale) formData.append('grayscale', 'true');
        if (processing.contrast > 1) formData.append('contrast', processing.contrast.toString());

        // Update last processed parameters to prevent redundant runs (-1 = auto)
        lastProcessedParams.current = {
            fileName: file.name,
            threshold: thresholdVal !== undefined ? thresholdVal : -1,
            grayscale: processing.grayscale,
            contrast: processing.contrast
        };

        const showOverlay = !!opts?.showOverlay;
        if (showOverlay) {
            setIsReprocess(!!opts?.reprocess);
            setLoadPhase('recognize');
            setIsLoading(true);
        }

        try {
            console.log(`[PlanUploader] Sending to AI service (threshold=${thresholdVal})...`);

            const res = await fetch(`${AI_URL}/process-plan`, {
                method: 'POST',
                body: formData,
            });

            console.log('[PlanUploader] AI service response status:', res.status);

            if (!res.ok) {
                const errorText = await res.text();
                console.error('[PlanUploader] AI service error:', errorText);
                if (!thresholdVal) {
                    console.warn('AI service failed, falling back to mock');
                    simulateAIRecognition();
                }
                return;
            }

            const data = await res.json();
            console.log('[PlanUploader] AI response data:', data, 'Walls:', data.walls?.length);

            // px -> meters: prefer the backend's calibrated scale (door-based),
            // fall back to the legacy "long side = 10 m" heuristic
            const maxDim = Math.max(data.image_width || 1, data.image_height || 1);
            const scale = (data.px_per_meter && data.px_per_meter > 0)
                ? 1 / data.px_per_meter
                : 10 / maxDim;

            // Always update plan dimensions from AI response
            if (data.image_width && data.image_height) {
                const scaledWidth = data.image_width * scale;
                const scaledHeight = data.image_height * scale;

                console.log('[PlanUploader] Updating plan dimensions:', scaledWidth, 'x', scaledHeight);

                const currentPlanImage = useStore.getState().scene.planImage;
                if (currentPlanImage && typeof currentPlanImage === 'object' && 'url' in currentPlanImage) {
                    // Keep valid URL but update dimensions
                    const currentUrl = (currentPlanImage as any).url;
                    setPlanImage(currentUrl, scaledWidth, scaledHeight);
                }
            }

            // Batch the whole AI import into a SINGLE undo entry
            useStore.getState().beginHistoryBatch();
            // Furniture is deferred until structure confirm (phase 2)
            const pendingFurnitureBatch: Array<{
                id: string;
                catalogId: string;
                pos: { x: number; y: number; z: number };
                rot: number;
                scale: { x: number; y: number; z: number };
            }> = [];
            try {

            // Always clear walls when re-processing (even if new result is empty)
            // This ensures slider to "low sensitivity" actually clears walls
            clearWalls();

            if (data.walls && Array.isArray(data.walls) && data.walls.length > 0) {

                // Dictionary to deduplicate nodes (fuzzy matching)
                const nodeMap = new Map<string, string>(); // "x,y" -> nodeId
                const SNAP_TOLERANCE = 0.1;

                const getOrCreateNode = (x: number, y: number) => {
                    const key = `${Math.round(x / SNAP_TOLERANCE)},${Math.round(y / SNAP_TOLERANCE)}`;
                    if (nodeMap.has(key)) return nodeMap.get(key)!;

                    const id = useStore.getState().addNode(x, y);
                    nodeMap.set(key, id);
                    return id;
                };

                const addEdge = useStore.getState().addEdge;

                data.walls.forEach((wall: any) => {
                    // Coordinates mapping
                    const ax = (wall.start.x - data.image_width / 2) * scale;
                    const ay = (wall.start.y - data.image_height / 2) * scale;
                    const bx = (wall.end.x - data.image_width / 2) * scale;
                    const by = (wall.end.y - data.image_height / 2) * scale;

                    const startNodeId = getOrCreateNode(ax, ay);
                    const endNodeId = getOrCreateNode(bx, by);

                    if (startNodeId !== endNodeId) {
                        const thickness = wall.thickness || 0.15;
                        const kind = wall.kind || (thickness > 0.2 ? 'bearing' : 'partition');
                        addEdge(startNodeId, endNodeId, { thickness, kind });
                    }
                });

                // Stitch near-miss corners (gaps up to ~0.4m) before placing openings
                useStore.getState().healWallGraph();

                // Furniture & Opening Placement
                if (data.furniture && Array.isArray(data.furniture)) {
                    console.log(`[PlanUploader] Placing ${data.furniture.length} furniture & opening items...`);
                    
                    const state = useStore.getState();
                    const edges = state.scene.edges;
                    const nodes = state.scene.nodes;

                    // Pre-pass to extract detected door/window openings
                    const detectedOpenings = data.furniture.filter((item: any) => {
                        const cat = FURNITURE_CATALOG.find(c => c.id === item.id);
                        return cat && cat.category === 'opening';
                    });

                    // Trust the backend's highly sophisticated priority-weighted Bounding Box IoU NMS
                    const filteredFurniture = data.furniture;

                    filteredFurniture.forEach((item: any) => {
                        const x = (item.x - data.image_width / 2) * scale;
                        const y = (item.y - data.image_height / 2) * scale;

                        // Check if catalog item valid
                        const catalogItem = FURNITURE_CATALOG.find(c => c.id === item.id);
                        if (!catalogItem) return;

                        if (catalogItem.category === 'opening') {
                            // Find the nearest wall edge for the door/window
                            let nearestEdge: any = null;
                            let minDist = Infinity;
                            let bestT = 0.5;
                            let bestWidth = catalogItem.dimensions.width;
                            let bestWallLen = 1;

                            const isDoor = catalogItem.id.includes('door');

                            edges.forEach((edge) => {
                                const startNode = nodes.find(n => n.id === edge.startNodeId);
                                const endNode = nodes.find(n => n.id === edge.endNodeId);
                                if (startNode && endNode) {
                                    const ax = startNode.x;
                                    const ay = startNode.y;
                                    const bx = endNode.x;
                                    const by = endNode.y;

                                    const dx = bx - ax;
                                    const dy = by - ay;
                                    const segLengthSq = dx * dx + dy * dy;
                                    if (segLengthSq > 0) {
                                        let t = ((x - ax) * dx + (y - ay) * dy) / segLengthSq;
                                        t = Math.max(0, Math.min(1, t));
                                        const cx = ax + t * dx;
                                        const cy = ay + t * dy;
                                        let dist = Math.hypot(x - cx, y - cy);

                                        const isVertical = Math.abs(dx) < Math.abs(dy);
                                        if (isDoor && isVertical && dist < 0.8) {
                                            dist -= 0.5;
                                        }

                                        if (dist < minDist) {
                                            minDist = dist;
                                            nearestEdge = edge;
                                            bestT = t;
                                            bestWallLen = Math.sqrt(segLengthSq);

                                            const ux = dx / bestWallLen;
                                            const uy = dy / bestWallLen;
                                            const w = Math.abs(item.width * scale * ux) + Math.abs(item.height * scale * uy);
                                            // Door YOLO boxes include the swing arc — use catalog width.
                                            // Gap-sealed windows send along-wall size in width/height.
                                            bestWidth = isDoor
                                                ? catalogItem.dimensions.width
                                                : Math.max(0.9, Math.min(2.8, w || catalogItem.dimensions.width));
                                        }
                                    }
                                }
                            });

                            let kind: 'door' | 'window' = catalogItem.id.includes('door') ? 'door' : 'window';
                            const isPanoramic = catalogItem.id.includes('panoramic') || !!item.panoramic;
                            // Panoramic / balcony glazing can span almost the full wall
                            if (isPanoramic) {
                                bestWidth = Math.max(bestWidth, Math.min(bestWallLen * 0.92, bestWallLen - 0.15));
                            }

                            // Keep the opening fully inside the wall segment
                            bestWidth = Math.min(bestWidth, Math.max(0.5, bestWallLen * 0.85));
                            const halfT = (bestWidth / Math.max(bestWallLen, 0.01)) / 2;
                            bestT = Math.max(halfT, Math.min(1 - halfT, bestT));

                            const snapLimit = isDoor ? 1.6 : 1.2;
                            if (nearestEdge && minDist < snapLimit) {
                                console.log(`[PlanUploader] Placing opening (${kind}${isPanoramic ? '/pano' : ''}) inside wall ${nearestEdge.id} at t=${bestT.toFixed(2)}, width=${bestWidth.toFixed(2)} (dist=${minDist.toFixed(2)}m)`);
                                const openingId = state.addOpening(nearestEdge.id, bestT, kind, bestWidth);
                                if (isPanoramic && openingId) {
                                    state.updateOpening(openingId, {
                                        height: 2.4,
                                        sillHeight: 0.05,
                                    });
                                }
                            } else {
                                console.warn(`[PlanUploader] Opening ${catalogItem.name} found at (${x.toFixed(2)}, ${y.toFixed(2)}), but no close wall segment was found (minDist=${minDist.toFixed(2)}m)`);
                            }
                        } else {
                            // Standard furniture item
                            let finalCatalogId = item.id;

                            // Rule 2: Prefer structural doors/windows over floating furniture
                            // Suppress tables and chairs near doors (to eliminate door-swing tables)
                            const isTableOrChair = ['table_dining', 'armchair', 'chair_dining', 'chair_office'].includes(finalCatalogId);
                            if (isTableOrChair) {
                                let isNearDoor = false;
                                detectedOpenings.forEach((op: any) => {
                                    if (op.id && op.id.includes('door')) {
                                        const opX = (op.x - data.image_width / 2) * scale;
                                        const opY = (op.y - data.image_height / 2) * scale;
                                        if (Math.hypot(x - opX, y - opY) < 1.5) {
                                            isNearDoor = true;
                                        }
                                    }
                                });
                                if (isNearDoor) {
                                    console.warn(`[PlanUploader] Skipping table/chair ${catalogItem.name} because it is too close to a detected door swing`);
                                    return;
                                }
                            }

                            // Rule 3: Convert sinks or armchairs near dining tables into dining chairs
                            if (finalCatalogId === 'sink' || finalCatalogId === 'sink_kitchen' || finalCatalogId === 'armchair') {
                                let nearTable = false;
                                data.furniture.forEach((other: any) => {
                                    if (other.id === 'table_dining') {
                                        const tX = (other.x - data.image_width / 2) * scale;
                                        const tY = (other.y - data.image_height / 2) * scale;
                                        if (Math.hypot(x - tX, y - tY) < 1.5) {
                                            nearTable = true;
                                        }
                                    }
                                });
                                if (nearTable) {
                                    console.log(`[PlanUploader] Converting ${finalCatalogId} at (${x.toFixed(2)}, ${y.toFixed(2)}) near dining table to chair_dining`);
                                    finalCatalogId = 'chair_dining';
                                }
                            }

                            const finalCatalogItem = FURNITURE_CATALOG.find(c => c.id === finalCatalogId);
                            if (!finalCatalogItem) return;

                            // Place standard furniture item
                            let scaleX = 1;
                            let scaleZ = 1;
                            let rotationOffset = 0;

                            const detectedWidth = item.width * scale;
                            const detectedDepth = item.height * scale;

                            if (item.confidence === 0.99) {
                                // Strictly preserve the semantic planner's dimensions!
                                scaleX = detectedWidth / finalCatalogItem.dimensions.width;
                                scaleZ = detectedDepth / finalCatalogItem.dimensions.depth;
                                rotationOffset = 0;
                            } else {
                                // Calculate scale distortion to determine if we should swap width and depth (90-degree rotation)
                                const scaleDistortionNormal = Math.abs(Math.log(detectedWidth / finalCatalogItem.dimensions.width)) +
                                                              Math.abs(Math.log(detectedDepth / finalCatalogItem.dimensions.depth));
                                const scaleDistortionSwapped = Math.abs(Math.log(detectedDepth / finalCatalogItem.dimensions.width)) +
                                                               Math.abs(Math.log(detectedWidth / finalCatalogItem.dimensions.depth));

                                if (scaleDistortionSwapped < scaleDistortionNormal) {
                                    // Swapping aspect ratio provides a much better scale fit
                                    scaleX = detectedDepth / finalCatalogItem.dimensions.width;
                                    scaleZ = detectedWidth / finalCatalogItem.dimensions.depth;
                                    rotationOffset = Math.PI / 2; // Rotate by 90 degrees
                                } else {
                                    scaleX = detectedWidth / finalCatalogItem.dimensions.width;
                                    scaleZ = detectedDepth / finalCatalogItem.dimensions.depth;
                                }
                            }

                            // Clamp scales to prevent crazy dimensions
                            scaleX = Math.max(0.4, Math.min(2.5, scaleX));
                            scaleZ = Math.max(0.4, Math.min(2.5, scaleZ));

                            // Convert degrees (backend) to radians (frontend) and add offset
                            const finalRotation = ((item.rotation || 0) * Math.PI / 180) + rotationOffset;

                            pendingFurnitureBatch.push({
                                id: uuidv4(),
                                catalogId: finalCatalogId,
                                pos: { x, y: 0, z: y },
                                rot: finalRotation,
                                scale: { x: scaleX, y: 1, z: scaleZ }
                            });

                            if (finalCatalogId === 'tv_stand') {
                                pendingFurnitureBatch.push({
                                    id: uuidv4(),
                                    catalogId: 'tv',
                                    pos: { x, y: 0, z: y },
                                    rot: finalRotation,
                                    scale: { x: scaleX, y: 1, z: scaleZ }
                                });
                            }
                        }
                    });
                }
            } else if (!thresholdVal) {
                console.warn('[PlanUploader] No walls in AI response');
                simulateAIRecognition();
            }

            // Hold AI furniture until structure is confirmed
            useStore.setState({ pendingFurniture: pendingFurnitureBatch });

            } finally {
                useStore.getState().endHistoryBatch();
            }

            // Enter 2D QA review: manager fixes walls/openings on the PNG before furniture/3D
            useStore.getState().startPlanReview();
            if (showOverlay) setLoadPhase('apply');
        } catch (err) {
            console.error('[PlanUploader] AI processing failed:', err);
            if (!thresholdVal) {
                alert('AI-сервис недоступен. Используется демо-режим.');
                simulateAIRecognition();
                useStore.getState().startPlanReview();
            }
        } finally {
            if (showOverlay) {
                setLoadPhase('apply');
                setTimeout(() => setIsLoading(false), 450);
            }
        }
    }

    function simulateAIRecognition() {
        // MOCK AI: Generates 4 walls matching the default grid/plan size
        // Fallback when AI service is not available

        const addNode = useStore.getState().addNode;
        const addEdge = useStore.getState().addEdge;

        // Define corners
        const corners = [
            { x: -4, y: -4 },
            { x: 4, y: -4 },
            { x: 4, y: 4 },
            { x: -4, y: 4 }
        ];

        // Create nodes
        const nodeIds = corners.map(c => addNode(c.x, c.y));

        // Create edges (loop)
        addEdge(nodeIds[0], nodeIds[1]);
        addEdge(nodeIds[1], nodeIds[2]);
        addEdge(nodeIds[2], nodeIds[3]);
        addEdge(nodeIds[3], nodeIds[0]);

        alert("ИИ распознал стены! (Демо-режим: сгенерирован базовый контур)");
    }

    const IconUpload = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;

    useEffect(() => {
        return () => {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        };
    }, []);

    return (
        <div className="flex items-center gap-1">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*,.json,application/json"
                className="hidden"
                onChange={handleFileChange}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="h-10 px-2.5 sm:px-3 flex items-center justify-center gap-1.5 rounded-2xl hover:bg-white/60 text-gray-600 transition-all active:scale-95 disabled:opacity-50 min-w-[2.5rem]"
                title="Загрузить 2D-план (PNG/JPG) или файл скана (.json)"
            >
                {isLoading ? (
                    <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                    <IconUpload />
                )}
                <span className="hidden sm:inline text-xs font-bold">
                    {isLoading ? 'ИИ…' : 'План'}
                </span>
            </button>

            <button
                onClick={() => setIsLiDARModalOpen(true)}
                disabled={isLoading}
                className="h-10 px-2.5 sm:px-3 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-rose-500/10 hover:from-amber-500/20 hover:to-rose-500/20 text-slate-700 dark:text-slate-200 border border-rose-500/25 transition-all active:scale-95 disabled:opacity-50 min-w-[2.5rem]"
                title="3D-план по LiDAR-скану с iPhone (Apple RoomPlan, как в Airbnb)"
            >
                <span className="text-sm">📱</span>
                <span className="hidden sm:inline text-xs font-bold text-rose-600 dark:text-rose-400">
                    LiDAR 3D
                </span>
            </button>

            <LiDARScanModal
                isOpen={isLiDARModalOpen}
                onClose={() => setIsLiDARModalOpen(false)}
            />

            <PlanLoadingOverlay
                open={isLoading}
                phase={loadPhase}
                fileName={currentFile?.name}
                fileSize={currentFile?.size}
                previewUrl={previewUrl}
                isReprocess={isReprocess}
            />
        </div>
    );
};
