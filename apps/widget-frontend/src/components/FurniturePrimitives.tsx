import React from 'react';
import { Box, Cylinder } from '@react-three/drei';
import { useStore } from '../store';

interface FurnitureProps {
    id: string;
    width: number;
    height: number;
    depth: number;
    color: string;
}

export const FurnitureRenderer: React.FC<FurnitureProps> = ({ id, width, height, depth, color }) => {
    switch (id) {
        // Furniture
        case 'bed_double':
            return <BedDouble width={width} height={height} depth={depth} color={color} />;
        case 'sofa_3':
            return <SofaBase width={width} height={height} depth={depth} color={color} seats={3} />;
        case 'sofa_2':
            return <SofaBase width={width} height={height} depth={depth} color={color} seats={2} />;
        case 'sofa_corner':
            return <SofaCorner width={width} height={height} depth={depth} color={color} />;
        case 'armchair':
            return <SofaBase width={width} height={height} depth={depth} color={color} seats={1} />;
        case 'bedside_table':
            return <BedsideTable width={width} height={height} depth={depth} color={color} />;
        case 'chair_dining':
            return <ChairDining width={width} height={height} depth={depth} color={color} />;
        case 'table_dining':
            return <TableDining width={width} height={height} depth={depth} color={color} />;
        case 'table_desk':
            return <TableDesk width={width} height={height} depth={depth} color={color} />;
        case 'tv_stand':
            return <TVStand width={width} height={height} depth={depth} color={color} />;
        case 'tv':
            return <TV width={width} height={height} depth={depth} color={color} />;
        case 'wardrobe':
            return <Wardrobe width={width} height={height} depth={depth} color={color} />;
        case 'kitchen_module':
            return <KitchenModule width={width} height={height} depth={depth} color={color} />;
        case 'stove':
            return <Stove width={width} height={height} depth={depth} color={color} />;
        case 'refrigerator':
            return <Refrigerator width={width} height={height} depth={depth} color={color} />;
        case 'kitchen_set':
            return <KitchenSet width={width} height={height} depth={depth} color={color} />;

        // Plumbing
        case 'bath':
            return <Bath width={width} height={height} depth={depth} color={color} />;
        case 'toilet':
            return <Toilet width={width} height={height} depth={depth} color={color} />;
        case 'shower':
            return <Shower width={width} height={height} depth={depth} color={color} />;
        case 'washing_machine':
            return <WashingMachine width={width} height={height} depth={depth} color={color} />;
        case 'sink':
            return <Sink width={width} height={height} depth={depth} color={color} />;

        // Special Spawn Anchor for Walk Mode
        case 'spawn_point':
            return <SpawnPointPrimitive width={width} height={height} depth={depth} color={color} />;

        // Openings
        case 'door_standard':
            return <Door width={width} height={height} depth={depth} color={color} />;
        case 'window_standard':
            return <Window width={width} height={height} depth={depth} color={color} />;

        default:
            return (
                <Box args={[width, height, depth]} position={[0, height / 2, 0]}>
                    <meshStandardMaterial color={color} />
                </Box>
            );
    }
};

// --- Models ---

const KitchenSet = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* 1. Main Base Cabinet Block (sleek modern slate charcoal) */}
            <Box args={[width, height, depth]} position={[0, 0, 0]}>
                <meshStandardMaterial color="#1e293b" roughness={0.5} />
            </Box>
            
            {/* 2. Premium White Marble Countertop */}
            <Box args={[width + 0.02, 0.04, depth + 0.02]} position={[0, height / 2 + 0.02, 0]}>
                <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.1} />
            </Box>
            
            {/* 3. Integrated Sink Bowl (Inset on the left side) */}
            <Box args={[width * 0.25, 0.01, depth * 0.7]} position={[-width * 0.2, height / 2 + 0.041, 0]}>
                <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.2} />
            </Box>
            {/* Metal Faucet Tap */}
            <group position={[-width * 0.2, height / 2 + 0.1, -depth * 0.3]}>
                <Cylinder args={[0.012, 0.012, 0.15, 8]} position={[0, 0, 0]}>
                    <meshStandardMaterial color="#94a3b8" metalness={0.9} />
                </Cylinder>
                <Box args={[0.012, 0.012, 0.06]} position={[0, 0.07, 0.03]}>
                    <meshStandardMaterial color="#94a3b8" metalness={0.9} />
                </Box>
            </group>
            
            {/* 4. Integrated Stove Induction Cooktop (Inset on the right side) */}
            <Box args={[width * 0.3, 0.01, depth * 0.8]} position={[width * 0.2, height / 2 + 0.041, 0]}>
                <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.1} />
            </Box>
            {/* 4 burners */}
            {[-0.08, 0.08].map(bx => 
                [-0.1, 0.1].map(bz => (
                    <Cylinder 
                        key={`${bx}-${bz}`} 
                        args={[0.04, 0.04, 0.002, 16]} 
                        position={[width * 0.2 + bx, height / 2 + 0.047, bz]}
                    >
                        <meshStandardMaterial color="#334155" metalness={0.9} />
                    </Cylinder>
                ))
            )}
        </group>
    );
};

const BedDouble = ({ width, height, depth, color }: any) => {
    const mattressHeight = height * 0.6;
    const baseHeight = height * 0.4;
    return (
        <group>
            <Box args={[width, baseHeight, depth]} position={[0, baseHeight / 2, 0]}>
                <meshStandardMaterial color="#333" />
            </Box>
            <Box args={[width * 0.95, mattressHeight, depth * 0.95]} position={[0, baseHeight + mattressHeight / 2, 0]}>
                <meshStandardMaterial color="white" />
            </Box>
            <Box args={[width, height * 1.5, 0.1]} position={[0, height * 0.75, -depth / 2 + 0.05]}>
                <meshStandardMaterial color={color} />
            </Box>
        </group>
    );
};

const SofaBase = ({ width, height, depth, color, seats }: any) => {
    const seatHeight = height * 0.5;
    const backHeight = height;
    const armWidth = 0.15;
    return (
        <group>
            <Box args={[width, seatHeight, depth]} position={[0, seatHeight / 2, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[width, backHeight - seatHeight, 0.2]} position={[0, seatHeight + (backHeight - seatHeight) / 2, -depth / 2 + 0.1]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[armWidth, height * 0.7, depth]} position={[-width / 2 + armWidth / 2, height * 0.35, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[armWidth, height * 0.7, depth]} position={[width / 2 - armWidth / 2, height * 0.35, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
        </group>
    );
};

const TableDining = ({ width, height, depth, color }: any) => {
    const legW = 0.08;
    const topH = 0.05;
    return (
        <group>
            <Box args={[width, topH, depth]} position={[0, height - topH / 2, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Box key={i} args={[legW, height - topH, legW]} position={[(width / 2 - legW) * x, (height - topH) / 2, (depth / 2 - legW) * z]}>
                    <meshStandardMaterial color="#444" />
                </Box>
            ))}
        </group>
    );
};

const TVStand = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <Box args={[width, height, depth]} position={[0, 0, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[width * 0.9, height * 0.8, 0.02]} position={[0, 0, depth / 2 + 0.01]}>
                <meshStandardMaterial color="#222" />
            </Box>
        </group>
    );
};

const TV = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2 + 0.5, 0]}>
            {/* Flat Screen Panel */}
            <Box args={[width, height, depth]} position={[0, 0, 0]}>
                <meshStandardMaterial color="#090d16" roughness={0.15} metalness={0.8} />
            </Box>
            {/* Inner display bezel / screen face */}
            <Box args={[width * 0.96, height * 0.92, 0.01]} position={[0, 0, depth / 2 + 0.002]}>
                <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.9} />
            </Box>
            {/* Table Stand Base */}
            <Box args={[width * 0.3, 0.02, depth * 2]} position={[0, -height / 2 - 0.49, 0]}>
                <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </Box>
            {/* Table Stand neck */}
            <Cylinder args={[0.02, 0.02, 0.5, 8]} position={[0, -height / 2 - 0.25, 0]}>
                <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </Cylinder>
        </group>
    );
};

const Wardrobe = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <Box args={[width, height, depth]} position={[0, 0, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[0.01, height * 0.9, depth + 0.01]} position={[0, 0, 0]}>
                <meshStandardMaterial color="#000" opacity={0.1} transparent />
            </Box>
        </group>
    );
};

const KitchenModule = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <Box args={[width, height, depth]} position={[0, 0, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[width + 0.02, 0.05, depth + 0.02]} position={[0, height / 2, 0]}>
                <meshStandardMaterial color="#e5e7eb" />
            </Box>
        </group>
    );
};

const Bath = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Outer Shell */}
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color="white" />
            </Box>
            {/* Inner Water */}
            <Box args={[width - 0.2, height - 0.1, depth - 0.2]} position={[0, 0.1, 0]}>
                <meshStandardMaterial color={color} opacity={0.6} transparent />
            </Box>
        </group>
    );
};

const Toilet = ({ width, height, depth, color }: any) => {
    return (
        <group>
            {/* Tank */}
            <Box args={[width, height, 0.2]} position={[0, height / 2, -depth / 2 + 0.1]}>
                <meshStandardMaterial color="white" />
            </Box>
            {/* Bowl */}
            <Box args={[width * 0.9, height * 0.6, depth * 0.7]} position={[0, height * 0.3, 0.1]}>
                <meshStandardMaterial color="white" />
            </Box>
        </group>
    );
};

const Shower = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Tray */}
            <Box args={[width, 0.1, depth]} position={[0, -height / 2 + 0.05, 0]}>
                <meshStandardMaterial color="white" />
            </Box>
            {/* Glass Walls (Corner style) */}
            <Box args={[width, height, 0.05]} position={[0, 0, -depth / 2 + 0.025]}>
                <meshStandardMaterial color="white" opacity={0.3} transparent />
            </Box>
            <Box args={[0.05, height, depth]} position={[-width / 2 + 0.025, 0, 0]}>
                <meshStandardMaterial color="white" opacity={0.3} transparent />
            </Box>
        </group>
    );
};

const Door = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <Box args={[width, height, depth * 0.5]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Frame/Jambs implied by being placed in wall */}
            {/* Handle */}
            <Box args={[0.05, 0.15, 0.1]} position={[width * 0.35, 0, 0]}>
                <meshStandardMaterial color="silver" />
            </Box>
        </group>
    );
};

const Window = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2 + 0.8, 0]}> {/* Default window height from floor 0.8m */}
            {/* Glass */}
            <Box args={[width - 0.1, height - 0.1, 0.05]}>
                <meshStandardMaterial color="#93c5fd" opacity={0.4} transparent />
            </Box>
            {/* Frame */}
            <Box args={[width, height, depth * 0.5]}>
                <meshStandardMaterial color="white" wireframe />
            </Box>
        </group>
    );
};

const Stove = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Body */}
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color={color} roughness={0.5} />
            </Box>
            {/* Surface Top (Glass/Ceramic) */}
            <Box args={[width * 0.95, 0.01, depth * 0.95]} position={[0, height / 2 + 0.005, 0]}>
                <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.1} />
            </Box>
            {/* Burners */}
            {[[-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]].map(([x, z], i) => (
                <Cylinder key={i} args={[0.08, 0.08, 0.002, 16]} position={[x * width, height / 2 + 0.01, z * depth]}>
                    <meshStandardMaterial color="#475569" metalness={0.9} />
                </Cylinder>
            ))}
        </group>
    );
};

const Refrigerator = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Main Body */}
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color={color} metalness={0.2} roughness={0.3} />
            </Box>
            {/* Doors Separator Line */}
            <Box args={[0.01, height * 0.95, 0.01]} position={[0, 0, depth / 2 + 0.005]}>
                <meshStandardMaterial color="#475569" />
            </Box>
            {/* Door Handle */}
            <Box args={[0.03, height * 0.2, 0.02]} position={[-width / 2 + 0.05, 0, depth / 2 + 0.02]}>
                <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
            </Box>
        </group>
    );
};

const WashingMachine = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Main Body */}
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color="white" roughness={0.5} />
            </Box>
            {/* Control Panel Block */}
            <Box args={[width * 0.9, height * 0.15, 0.05]} position={[0, height / 2 - height * 0.1, depth / 2 + 0.005]}>
                <meshStandardMaterial color="#e2e8f0" />
            </Box>
            {/* Circular Door Glass */}
            <Cylinder args={[width * 0.25, width * 0.25, 0.04, 32]} rotation={[Math.PI / 2, 0, 0]} position={[0, -height * 0.1, depth / 2 + 0.01]}>
                <meshStandardMaterial color="#94a3b8" opacity={0.6} transparent roughness={0.1} />
            </Cylinder>
        </group>
    );
};

const Sink = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Cabinet Countertop */}
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
            </Box>
            {/* Washbasin Bowl */}
            <Box args={[width * 0.7, 0.02, depth * 0.6]} position={[0, height / 2 + 0.005, 0]}>
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.2} />
            </Box>
            {/* Faucet */}
            <group position={[0, height / 2 + 0.1, -depth * 0.2]}>
                <Cylinder args={[0.015, 0.015, 0.15, 8]} position={[0, 0, 0]}>
                    <meshStandardMaterial color="#94a3b8" metalness={0.9} />
                </Cylinder>
                <Box args={[0.015, 0.015, 0.06]} position={[0, 0.07, 0.03]}>
                    <meshStandardMaterial color="#94a3b8" metalness={0.9} />
                </Box>
            </group>
        </group>
    );
};
 
const SofaCorner = ({ width, height, depth, color }: any) => {
    const seatHeight = height * 0.5;
    const backHeight = height;
    const armWidth = 0.15;
    
    // Proportional dimensions inside the bounding box
    const chaiseWidth = Math.min(width * 0.45, depth * 0.9);
    const mainDepth = depth * 0.45;
    
    return (
        <group>
            {/* Main horizontal seating cushion (right side) */}
            <Box args={[width - chaiseWidth, seatHeight, mainDepth]} position={[chaiseWidth / 2, seatHeight / 2, -depth / 2 + mainDepth / 2]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Chaise cushion (extending forward on the left side) */}
            <Box args={[chaiseWidth, seatHeight, depth]} position={[-width / 2 + chaiseWidth / 2, seatHeight / 2, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Backrest along the main wall */}
            <Box args={[width, backHeight - seatHeight, 0.15]} position={[0, seatHeight + (backHeight - seatHeight) / 2, -depth / 2 + 0.075]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Backrest along the L-extension wall (left side) */}
            <Box args={[0.15, backHeight - seatHeight, depth - 0.15]} position={[-width / 2 + 0.075, seatHeight + (backHeight - seatHeight) / 2, 0.075]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Armrest on the right side */}
            <Box args={[armWidth, height * 0.7, mainDepth]} position={[width / 2 - armWidth / 2, height * 0.35, -depth / 2 + mainDepth / 2]}>
                <meshStandardMaterial color={color} />
            </Box>
        </group>
    );
};
 
const ChairDining = ({ width, height, depth, color }: any) => {
    const legW = 0.04;
    const seatH = 0.05;
    const seatLevel = height * 0.5;
    
    return (
        <group>
            {/* Seat cushion */}
            <Box args={[width, seatH, depth]} position={[0, seatLevel - seatH / 2, 0]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* Backrest */}
            <Box args={[width, height - seatLevel, 0.05]} position={[0, seatLevel + (height - seatLevel) / 2, -depth / 2 + 0.025]}>
                <meshStandardMaterial color={color} />
            </Box>
            {/* 4 thin legs */}
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Box key={i} args={[legW, seatLevel - seatH, legW]} position={[(width / 2 - legW) * x, (seatLevel - seatH) / 2, (depth / 2 - legW) * z]}>
                    <meshStandardMaterial color="#444" />
                </Box>
            ))}
        </group>
    );
};

const BedsideTable = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <Box args={[width, height, depth]}>
                <meshStandardMaterial color={color} roughness={0.7} />
            </Box>
            <Box args={[width * 0.9, 0.02, 0.01]} position={[0, height * 0.15, depth / 2 + 0.005]}>
                <meshStandardMaterial color="#333" />
            </Box>
            <Box args={[width * 0.9, 0.02, 0.01]} position={[0, -height * 0.15, depth / 2 + 0.005]}>
                <meshStandardMaterial color="#333" />
            </Box>
            <Box args={[0.08, 0.02, 0.015]} position={[0, height * 0.15, depth / 2 + 0.01]}>
                <meshStandardMaterial color="silver" metalness={0.9} />
            </Box>
            <Box args={[0.08, 0.02, 0.015]} position={[0, -height * 0.15, depth / 2 + 0.01]}>
                <meshStandardMaterial color="silver" metalness={0.9} />
            </Box>
        </group>
    );
};

const TableDesk = ({ width, height, depth, color }: any) => {
    const legW = 0.06;
    const topH = 0.04;
    return (
        <group>
            <Box args={[width, topH, depth]} position={[0, height - topH / 2, 0]}>
                <meshStandardMaterial color={color} roughness={0.6} />
            </Box>
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Box key={i} args={[legW, height - topH, legW]} position={[(width / 2 - legW) * x, (height - topH) / 2, (depth / 2 - legW) * z]}>
                    <meshStandardMaterial color="#222" />
                </Box>
            ))}
            <Box args={[width - legW * 2, height * 0.4, 0.02]} position={[0, height - topH - height * 0.2, -depth / 2 + legW]}>
                <meshStandardMaterial color={color} roughness={0.6} />
            </Box>
        </group>
    );
};

const SpawnPointPrimitive = ({ width, height, depth, color }: any) => {
    const cameraMode = useStore((state) => state.scene.camera.mode);
    if (cameraMode === 'walk') return null; // Hide in walk mode!

    return (
        <group>
            {/* Outer neon green spatial ring on the floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <ringGeometry args={[width / 2 - 0.06, width / 2, 32]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.85} />
            </mesh>
            {/* Center target circle */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <circleGeometry args={[width * 0.15, 16]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.9} />
            </mesh>
            {/* Directional arrow pointing forward (+Z) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, width * 0.2]} >
                <coneGeometry args={[width * 0.12, depth * 0.35, 4]} />
                <meshBasicMaterial color="#10b981" />
            </mesh>
            {/* Vertical holographic pillar/figure (1.6m tall) */}
            <mesh position={[0, 0.8, 0]}>
                <cylinderGeometry args={[width * 0.25, width * 0.3, 1.6, 16]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.25} wireframe />
            </mesh>
            {/* Holographic human-like head sphere */}
            <mesh position={[0, 1.5, 0]}>
                <sphereGeometry args={[width * 0.18, 16, 16]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.3} />
            </mesh>
        </group>
    );
};
