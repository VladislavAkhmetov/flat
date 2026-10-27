import * as THREE from 'three';

export interface FloorMaterialInfo {
    id: string;
    name: string;
    category: 'wood' | 'stone' | 'modern';
    desc: string;
    color: string;
    roughness: number;
    metalness: number;
    repeat: [number, number];
}

export interface WallColorInfo {
    id: string;
    name: string;
    color: string;
    desc: string;
}

export const FLOOR_MATERIALS: FloorMaterialInfo[] = [
    {
        id: 'wood_chevron',
        name: 'Французская ёлка',
        category: 'wood',
        desc: 'Премиальный паркет из благородного дуба с укладкой шеврон',
        color: '#c8a87b',
        roughness: 0.55,
        metalness: 0.05,
        repeat: [4, 4],
    },
    {
        id: 'wood_oak',
        name: 'Натуральный дуб',
        category: 'wood',
        desc: 'Классическая однополосная доска теплого медового оттенка',
        color: '#d4b78f',
        roughness: 0.65,
        metalness: 0.02,
        repeat: [3, 3],
    },
    {
        id: 'marble_calacatta',
        name: 'Мрамор Calacatta',
        category: 'stone',
        desc: 'Крупноформатный керамогранит с золотисто-серыми прожилками',
        color: '#f8f8fa',
        roughness: 0.25,
        metalness: 0.1,
        repeat: [3, 3],
    },
    {
        id: 'concrete_loft',
        name: 'Шлифованный бетон',
        category: 'modern',
        desc: 'Микроцемент нейтрального серого тона для современных пространств',
        color: '#a3a8b0',
        roughness: 0.8,
        metalness: 0.05,
        repeat: [4, 4],
    },
    {
        id: 'tile_slate',
        name: 'Графитовый сланец',
        category: 'stone',
        desc: 'Матовая плитка глубокого угольного цвета со структурным рельефом',
        color: '#2d333b',
        roughness: 0.7,
        metalness: 0.08,
        repeat: [4, 4],
    },
];

export const WALL_COLORS: WallColorInfo[] = [
    {
        id: 'white_scandi',
        name: 'Сканди-белый',
        color: '#faf9f6',
        desc: 'Мягкий матовый оттенок чистого хлопка',
    },
    {
        id: 'warm_oat',
        name: 'Теплый овсяный',
        color: '#f3eee7',
        desc: 'Уютный согревающий бежевый подтон',
    },
    {
        id: 'sage_mint',
        name: 'Шалфей / Мята',
        color: '#e0ece3',
        desc: 'Свежий природный пастельно-зеленый оттенок',
    },
    {
        id: 'graphite_accent',
        name: 'Графитовый акцент',
        color: '#334155',
        desc: 'Стильный глубокий акцент для ТВ-зоны или спальни',
    },
    {
        id: 'terracotta_soft',
        name: 'Нежная терракота',
        color: '#ebd6cd',
        desc: 'Трендовый пудрово-глиняный теплый тон',
    },
];

// Texture cache to prevent memory leaks and re-allocations
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Creates procedural high-res canvas textures for floor materials
 */
export function getFloorTexture(materialId: string): THREE.CanvasTexture | null {
    if (textureCache.has(materialId)) {
        return textureCache.get(materialId)!;
    }

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    switch (materialId) {
        case 'wood_chevron': {
            // Background wood tone
            ctx.fillStyle = '#c5a374';
            ctx.fillRect(0, 0, size, size);

            // Draw Chevron Planks (45 degree herringbone)
            const plankW = 40;
            const plankH = 120;
            ctx.strokeStyle = 'rgba(70, 45, 20, 0.35)';
            ctx.lineWidth = 2;

            for (let x = -plankW; x < size + plankW; x += plankW * 2) {
                for (let y = -plankH; y < size + plankH; y += plankH) {
                    // Left slant
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(plankW, plankH / 2);
                    ctx.stroke();

                    // Subtle wood grain variations
                    const shade = (Math.sin(x * 0.1) * Math.cos(y * 0.1)) * 15;
                    ctx.fillStyle = `rgba(${195 + shade}, ${160 + shade}, ${115 + shade}, 0.3)`;
                    ctx.fillRect(0, 0, plankW, plankH / 2);

                    // Right slant
                    ctx.beginPath();
                    ctx.moveTo(plankW * 2, 0);
                    ctx.lineTo(plankW, plankH / 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            break;
        }

        case 'wood_oak': {
            ctx.fillStyle = '#d1b287';
            ctx.fillRect(0, 0, size, size);

            const plankHeight = 64;
            ctx.strokeStyle = 'rgba(80, 50, 20, 0.4)';
            ctx.lineWidth = 2;

            for (let y = 0; y < size; y += plankHeight) {
                // Horizontal plank seam
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(size, y);
                ctx.stroke();

                // Staggered vertical seams
                const xOffset = ((y / plankHeight) % 3) * (size / 3);
                for (let x = xOffset; x < size + size; x += size / 2) {
                    ctx.beginPath();
                    ctx.moveTo(x % size, y);
                    ctx.lineTo(x % size, y + plankHeight);
                    ctx.stroke();
                }

                // Grain noise
                for (let g = 0; g < 6; g++) {
                    ctx.fillStyle = 'rgba(90, 55, 25, 0.07)';
                    ctx.fillRect(0, y + (g * plankHeight) / 6, size, 2);
                }
            }
            break;
        }

        case 'marble_calacatta': {
            ctx.fillStyle = '#f6f6f8';
            ctx.fillRect(0, 0, size, size);

            // Large tile grid (2x2)
            ctx.strokeStyle = 'rgba(180, 180, 190, 0.5)';
            ctx.lineWidth = 3;
            ctx.strokeRect(0, 0, size, size);
            ctx.beginPath();
            ctx.moveTo(size / 2, 0);
            ctx.lineTo(size / 2, size);
            ctx.moveTo(0, size / 2);
            ctx.lineTo(size, size / 2);
            ctx.stroke();

            // Elegant marble veins
            ctx.strokeStyle = 'rgba(170, 150, 120, 0.35)'; // Warm gold vein
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(30, 0);
            ctx.bezierCurveTo(120, 160, 200, 120, 320, 300);
            ctx.bezierCurveTo(400, 420, 460, 480, size, 500);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(130, 135, 145, 0.25)'; // Soft gray vein
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 280);
            ctx.bezierCurveTo(140, 240, 260, 380, 480, 260);
            ctx.stroke();
            break;
        }

        case 'concrete_loft': {
            ctx.fillStyle = '#9da3ab';
            ctx.fillRect(0, 0, size, size);

            // Micro-aggregate speckles
            for (let i = 0; i < 2500; i++) {
                const px = Math.random() * size;
                const py = Math.random() * size;
                const r = Math.random() * 1.5;
                const alpha = Math.random() * 0.15;
                ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Large architectural slab seams (4x4)
            ctx.strokeStyle = 'rgba(50, 55, 65, 0.3)';
            ctx.lineWidth = 2;
            const slab = size / 2;
            ctx.strokeRect(0, 0, slab, slab);
            ctx.strokeRect(slab, 0, slab, slab);
            ctx.strokeRect(0, slab, slab, slab);
            ctx.strokeRect(slab, slab, slab, slab);
            break;
        }

        case 'tile_slate': {
            ctx.fillStyle = '#262a30';
            ctx.fillRect(0, 0, size, size);

            // Square tile grid (4x4)
            const tileSize = size / 4;
            ctx.strokeStyle = 'rgba(15, 17, 21, 0.8)';
            ctx.lineWidth = 3;

            for (let x = 0; x < size; x += tileSize) {
                for (let y = 0; y < size; y += tileSize) {
                    ctx.strokeRect(x, y, tileSize, tileSize);
                    // Slate surface texture variation
                    const v = (Math.sin(x) + Math.cos(y)) * 8;
                    ctx.fillStyle = `rgba(${40 + v}, ${44 + v}, ${50 + v}, 0.25)`;
                    ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
                }
            }
            break;
        }

        default:
            return null;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    textureCache.set(materialId, texture);
    return texture;
}
