import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { v4 as uuidv4 } from 'uuid';

// Uses import.meta.env for Vite or fallback
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

export const PlanUploader: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const setPlanImage = useStore(state => state.setPlanImage);
    const addWall = useStore(state => state.addWall);
    const clearWalls = useStore(state => state.clearWalls);
    const setEditorMode = useStore(state => state.setEditorMode);
    const addObject = useStore(state => state.addObject);

    // Subscribe to store changes
    const detectionThreshold = useStore(state => state.detectionThreshold);
    const editorMode = useStore(state => state.editorMode);
    const imageProcessing = useStore(state => state.imageProcessing);

    const [isLoading, setIsLoading] = useState(false);
    const [currentFile, setCurrentFile] = useState<File | null>(null);

    // Debounce ref
    const debounceTimer = useRef<NodeJS.Timeout>();
    const lastProcessedParams = useRef({
        fileName: '',
        threshold: -1,
        grayscale: false,
        contrast: 1.0
    });

    // Re-process when threshold changes
    useEffect(() => {
        console.log(`[PlanUploader] Effect triggered: threshold=${detectionThreshold}, file=${currentFile?.name || 'null'}, mode=${editorMode}`);

        if (!currentFile) {
            console.log('[PlanUploader] No currentFile - skipping re-process');
            return;
        }
        if (editorMode !== 'walls') {
            console.log('[PlanUploader] Not in walls mode - skipping re-process');
            return;
        }

        // Check if parameters actually changed from what we last processed
        const currentParams = {
            fileName: currentFile.name,
            threshold: detectionThreshold,
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

        // Debounce logic
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            console.log(`[PlanUploader] Debounce complete, calling processWithAI(threshold=${detectionThreshold})...`);
            processWithAI(currentFile, detectionThreshold);
        }, 500); // 500ms debounce

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [detectionThreshold, currentFile, editorMode, imageProcessing]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCurrentFile(file); // Save for re-processing
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

                // Process with AI (default threshold first)
                await processWithAI(file);
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
    async function processWithAI(file: File, thresholdVal?: number) {
        // Call AI service to process the plan
        const formData = new FormData();
        formData.append('file', file);
        if (thresholdVal !== undefined) {
            formData.append('threshold', thresholdVal.toString());
        }

        // Add processing flags
        const processing = useStore.getState().imageProcessing;
        if (processing.grayscale) formData.append('grayscale', 'true');
        if (processing.contrast > 1) formData.append('contrast', processing.contrast.toString());

        // Update last processed parameters to prevent redundant runs
        lastProcessedParams.current = {
            fileName: file.name,
            threshold: thresholdVal !== undefined ? thresholdVal : useStore.getState().detectionThreshold,
            grayscale: processing.grayscale,
            contrast: processing.contrast
        };

        try {
            console.log(`[PlanUploader] Sending to AI service (threshold=${thresholdVal})...`);

            // Assume AI service is on 5000 (proxied or direct)
            // Note: In docker setup this might be different, but for localhost dev it's 5000
            const res = await fetch('http://localhost:5000/process-plan', {
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

            // Always update plan dimensions from AI response
            if (data.image_width && data.image_height) {
                const maxDim = Math.max(data.image_width, data.image_height);
                const scale = 10 / maxDim;
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

            // Always clear walls when re-processing (even if new result is empty)
            // This ensures slider to "low sensitivity" actually clears walls
            clearWalls();

            if (data.walls && Array.isArray(data.walls) && data.walls.length > 0) {
                // Calculate scale factor from actual image dimensions
                const maxDim = Math.max(data.image_width, data.image_height);
                const scale = 10 / maxDim;

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

                                        // Prioritize vertical walls for doors if they are close
                                        const isVertical = Math.abs(dx) < Math.abs(dy); // Vertical segment
                                        if (isDoor && isVertical && dist < 0.8) {
                                            dist -= 0.5; // Give significant boost to vertical walls for door snapping
                                        }

                                        if (dist < minDist) {
                                            minDist = dist;
                                            nearestEdge = edge;
                                            bestT = t;

                                            // Calculate opening width along the wall direction
                                            const len = Math.sqrt(segLengthSq);
                                            const ux = dx / len;
                                            const uy = dy / len;
                                            // Project bounding box size along wall direction
                                            const w = Math.abs(item.width * scale * ux) + Math.abs(item.height * scale * uy);
                                            bestWidth = Math.max(0.6, Math.min(3.0, w));
                                        }
                                    }
                                }
                            });

                            // Rule 1: No windows in internal partition walls (only on bearing/outer walls)
                            const kind = catalogItem.id.includes('door') ? 'door' : 'window';
                            if (kind === 'window' && nearestEdge && nearestEdge.kind === 'partition') {
                                console.warn(`[PlanUploader] Skipping window on internal partition wall ${nearestEdge.id}`);
                                return;
                            }

                            // Threshold: must be within 1.0 meter of a wall
                            if (nearestEdge && minDist < 1.0) {
                                console.log(`[PlanUploader] Placing opening (${kind}) inside wall ${nearestEdge.id} at t=${bestT.toFixed(2)}, width=${bestWidth.toFixed(2)} (dist=${minDist.toFixed(2)}m)`);
                                state.addOpening(nearestEdge.id, bestT, kind, bestWidth);
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

                            addObject({
                                id: uuidv4(),
                                catalogId: finalCatalogId,
                                pos: { x, y: 0, z: y },
                                rot: finalRotation,
                                scale: { x: scaleX, y: 1, z: scaleZ }
                            });

                            if (finalCatalogId === 'tv_stand') {
                                addObject({
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
        } catch (err) {
            console.error('[PlanUploader] AI processing failed:', err);
            if (!thresholdVal) {
                alert('AI-сервис недоступен. Используется демо-режим.');
                simulateAIRecognition();
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

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/60 text-gray-600 transition-all active:scale-95 disabled:opacity-30"
                title="Загрузить план (AI)"
            >
                <IconUpload />
            </button>
        </>
    );
};
