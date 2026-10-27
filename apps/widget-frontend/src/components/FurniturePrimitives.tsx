import React from 'react';
import { Box, Cylinder, RoundedBox } from '@react-three/drei';
import { useStore } from '../store';

interface FurnitureProps {
    id: string;
    width: number;
    height: number;
    depth: number;
    color: string;
}

export const FurnitureRenderer: React.FC<FurnitureProps> = ({ id, width, height, depth, color }) => {
    const is2D = useStore((state) => state.scene.camera.mode === '2d');

    // Top-down view: draw flat architectural symbols (cheap: a few unlit planes)
    if (is2D && id !== 'spawn_point') {
        return <FlatSymbol id={id} width={width} depth={depth} color={color} />;
    }

    switch (id) {
        // Furniture
        case 'bed_single':
            return <BedDouble width={width} height={height} depth={depth} color={color} single={true} />;
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

// --- Flat 2D architectural symbols (plan view) ---

const SYM = {
    line: '#64748b',      // outline
    fill: '#fdfcfa',      // paper-white body
    detail: '#94a3b8',    // seams, pillows outlines
    soft: '#eef1f4',      // cushions / mattress
    dark: '#334155',      // screens / cooktops
    water: '#dbeafe',     // bath / sink bowls
};

/** Unlit horizontal plane (y-up), the workhorse of the 2D symbol set. */
const FlatRect: React.FC<{
    w: number; d: number; color: string;
    x?: number; z?: number; y?: number;
}> = ({ w, d, color, x = 0, z = 0, y = 0 }) => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]}>
        <planeGeometry args={[Math.max(w, 0.02), Math.max(d, 0.02)]} />
        <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
);

const FlatCircle: React.FC<{
    r: number; color: string;
    x?: number; z?: number; y?: number;
}> = ({ r, color, x = 0, z = 0, y = 0 }) => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]}>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
);

/**
 * Plan-view furniture symbol: outline + white body + a few recognizable
 * details per type. All meshBasicMaterial planes — no lights, no shadows.
 * Y-stacking (0.05..0.08) avoids z-fighting with the floor/plan image.
 */
const FlatSymbol: React.FC<{ id: string; width: number; depth: number; color: string }> = ({ id, width: w, depth: d }) => {
    const Y0 = 0.05, Y1 = 0.06, Y2 = 0.07, Y3 = 0.08;
    const border = 0.05;
    // Architectural plan palette — ignore neon catalog swatches (cheap + readable)
    const accent = SYM.line;
    const wood = '#d6d3d1';

    const base = (
        <>
            <FlatRect w={w + border} d={d + border} color={SYM.line} y={Y0} />
            <FlatRect w={w} d={d} color={SYM.fill} y={Y1} />
        </>
    );

    // Beds: mattress + two pillows at the head (-z) + blanket fold line
    if (id === 'bed_double' || id === 'bed_single') {
        const single = id === 'bed_single';
        return (
            <group>
                {base}
                <FlatRect w={w * 0.92} d={d * 0.92} color={SYM.soft} y={Y2} />
                {single ? (
                    <FlatRect w={w * 0.7} d={d * 0.2} color={SYM.fill} z={-d * 0.32} y={Y3} />
                ) : (
                    <>
                        <FlatRect w={w * 0.38} d={d * 0.2} color={SYM.fill} x={-w * 0.24} z={-d * 0.32} y={Y3} />
                        <FlatRect w={w * 0.38} d={d * 0.2} color={SYM.fill} x={w * 0.24} z={-d * 0.32} y={Y3} />
                    </>
                )}
                <FlatRect w={w * 0.92} d={0.02} color={SYM.detail} z={-d * 0.12} y={Y3} />
            </group>
        );
    }

    // Sofas / armchair: seat + backrest along -z + armrests
    if (id === 'sofa_3' || id === 'sofa_2' || id === 'armchair') {
        const arm = Math.min(0.15, w * 0.15);
        return (
            <group>
                {base}
                <FlatRect w={w} d={d * 0.28} color={accent} z={-d * 0.36} y={Y2} />
                <FlatRect w={arm} d={d} color={accent} x={-w / 2 + arm / 2} y={Y2} />
                <FlatRect w={arm} d={d} color={accent} x={w / 2 - arm / 2} y={Y2} />
                <FlatRect w={w - arm * 2 - 0.04} d={d * 0.6} color={SYM.soft} z={d * 0.12} y={Y2} />
                {id !== 'armchair' && (
                    <FlatRect w={0.02} d={d * 0.58} color={SYM.detail} z={d * 0.12} y={Y3} />
                )}
            </group>
        );
    }

    if (id === 'sofa_corner') {
        const chaise = Math.min(w * 0.45, d * 0.9);
        const mainD = d * 0.45;
        return (
            <group>
                {base}
                <FlatRect w={w} d={mainD} color={accent} z={-d / 2 + mainD / 2} y={Y2} />
                <FlatRect w={chaise} d={d} color={accent} x={-w / 2 + chaise / 2} y={Y2} />
                <FlatRect w={w - chaise - 0.06} d={mainD - 0.1} color={SYM.soft} x={chaise / 2 + 0.01} z={-d / 2 + mainD / 2 + 0.03} y={Y3} />
                <FlatRect w={chaise - 0.1} d={d - mainD - 0.08} color={SYM.soft} x={-w / 2 + chaise / 2} z={mainD / 2} y={Y3} />
            </group>
        );
    }

    // Tables: top with inner rim
    if (id === 'table_dining' || id === 'table_desk' || id === 'bedside_table') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.9} d={d * 0.9} color={wood} y={Y2} />
                <FlatRect w={w * 0.78} d={d * 0.78} color={SYM.fill} y={Y3} />
            </group>
        );
    }

    // Chairs: seat + backrest strip
    if (id === 'chair_dining' || id === 'chair_office') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.85} d={d * 0.25} color={accent} z={-d * 0.3} y={Y2} />
                <FlatRect w={w * 0.7} d={d * 0.5} color={SYM.soft} z={d * 0.12} y={Y2} />
            </group>
        );
    }

    // Wardrobe: double doors + rail (clothes hanger line)
    if (id === 'wardrobe') {
        return (
            <group>
                {base}
                <FlatRect w={0.02} d={d * 0.9} color={SYM.detail} y={Y2} />
                <FlatRect w={w * 0.9} d={0.02} color={SYM.detail} y={Y2} />
                <FlatRect w={w * 0.9} d={0.025} color={accent} z={-d * 0.25} y={Y2} />
            </group>
        );
    }

    if (id === 'tv_stand') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.92} d={d * 0.4} color={wood} z={d * 0.15} y={Y2} />
            </group>
        );
    }

    if (id === 'tv') {
        return (
            <group>
                <FlatRect w={w + border} d={d + border} color={SYM.line} y={Y0} />
                <FlatRect w={w} d={d} color={SYM.dark} y={Y2} />
            </group>
        );
    }

    // Kitchen set: counter + sink circle + burners
    if (id === 'kitchen_set') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.96} d={d * 0.96} color={SYM.soft} y={Y2} />
                <FlatCircle r={Math.min(w, d) * 0.16} color={SYM.water} x={-w * 0.25} y={Y3} />
                {[-0.08, 0.08].map(bx =>
                    [-0.12, 0.12].map(bz => (
                        <FlatCircle key={`${bx}${bz}`} r={0.05} color={SYM.dark} x={w * 0.25 + bx} z={d * bz} y={Y3} />
                    ))
                )}
            </group>
        );
    }

    if (id === 'stove') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.9} d={d * 0.9} color={SYM.dark} y={Y2} />
                {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => (
                    <FlatCircle key={i} r={Math.min(w, d) * 0.16} color={SYM.detail} x={w * 0.22 * sx} z={d * 0.22 * sz} y={Y3} />
                ))}
            </group>
        );
    }

    if (id === 'refrigerator' || id === 'kitchen_module') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.9} d={d * 0.9} color={id === 'refrigerator' ? SYM.soft : wood} y={Y2} />
                <FlatRect w={0.02} d={d * 0.85} color={SYM.detail} y={Y3} />
            </group>
        );
    }

    if (id === 'sink_kitchen' || id === 'sink') {
        return (
            <group>
                {base}
                <FlatCircle r={Math.min(w, d) * 0.32} color={SYM.water} y={Y2} />
                <FlatCircle r={0.02} color={SYM.detail} z={-d * 0.28} y={Y3} />
            </group>
        );
    }

    // Bath: rim + inner tub with rounded look (inset + drain)
    if (id === 'bath') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.86} d={d * 0.72} color={SYM.water} y={Y2} />
                <FlatCircle r={0.035} color={SYM.detail} x={w * 0.3} y={Y3} />
            </group>
        );
    }

    if (id === 'toilet') {
        return (
            <group>
                {base}
                <FlatRect w={w} d={d * 0.28} color={SYM.detail} z={-d * 0.36} y={Y2} />
                <FlatCircle r={Math.min(w, d * 0.6) * 0.42} color={SYM.soft} z={d * 0.12} y={Y2} />
            </group>
        );
    }

    if (id === 'shower') {
        return (
            <group>
                {base}
                <FlatRect w={w * 0.9} d={d * 0.9} color={SYM.water} y={Y2} />
                <FlatCircle r={Math.min(w, d) * 0.12} color={SYM.detail} y={Y3} />
            </group>
        );
    }

    if (id === 'washing_machine') {
        return (
            <group>
                {base}
                <FlatCircle r={Math.min(w, d) * 0.3} color={SYM.soft} y={Y2} />
                <FlatCircle r={Math.min(w, d) * 0.18} color={SYM.detail} y={Y3} />
            </group>
        );
    }

    // Fallback: plain outlined architectural block
    return (
        <group>
            {base}
            <FlatRect w={w * 0.85} d={d * 0.85} color={SYM.soft} y={Y2} />
        </group>
    );
};

// --- Airbnb-style Scandinavian Porcelain & Clay 3D Models ---

export const BNB = {
    clayWhite: '#faf8f5',
    clayCream: '#f3eee6',
    clayWarm: '#ece6dc',
    taupeAccent: '#958b7e', // Bed headboard, accent cushion
    taupeMuted: '#ada396',
    lightWood: '#dfd7ca',  // Bleached Nordic wood
    warmWood: '#cbbfb0',
    chrome: '#b8b2a9',     // Faucets, handles
    darkBurner: '#2d2926', // Cooktop burners
    pureWhite: '#ffffff',  // Ceramics (bath, toilet, sink)
    water: '#e0edf7',
};

const BedDouble = ({ width, height, depth, color, single = false }: any) => {
    const headboardH = height * 1.35;
    const baseH = height * 0.35;
    const mattressH = height * 0.5;
    const headboardColor = (color && color !== 'white' && color !== '#c3b09a' && color !== '#b9a58c') ? color : BNB.taupeAccent;

    return (
        <group>
            {/* 1. Upholstered Headboard with rounded top */}
            <RoundedBox
                args={[width, headboardH, 0.12]}
                radius={0.06}
                smoothness={4}
                position={[0, headboardH / 2, -depth / 2 + 0.06]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={headboardColor} roughness={0.75} />
            </RoundedBox>

            {/* 2. Soft Bed Base Frame */}
            <RoundedBox
                args={[width, baseH, depth]}
                radius={0.04}
                smoothness={4}
                position={[0, baseH / 2, 0]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={BNB.clayWarm} roughness={0.7} />
            </RoundedBox>

            {/* 3. Rounded Mattress */}
            <RoundedBox
                args={[width * 0.94, mattressH, depth * 0.92]}
                radius={0.06}
                smoothness={4}
                position={[0, baseH + mattressH / 2, 0.02]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={BNB.clayWhite} roughness={0.65} />
            </RoundedBox>

            {/* 4. Rounded Pillows */}
            {single ? (
                <RoundedBox
                    args={[width * 0.75, 0.12, 0.36]}
                    radius={0.06}
                    smoothness={4}
                    position={[0, baseH + mattressH + 0.06, -depth * 0.28]}
                    rotation={[-0.1, 0, 0]}
                    castShadow
                >
                    <meshStandardMaterial color={BNB.clayCream} roughness={0.6} />
                </RoundedBox>
            ) : (
                [-width * 0.24, width * 0.24].map((px) => (
                    <RoundedBox
                        key={px}
                        args={[width * 0.42, 0.12, 0.36]}
                        radius={0.06}
                        smoothness={4}
                        position={[px, baseH + mattressH + 0.06, -depth * 0.28]}
                        rotation={[-0.1, 0, 0]}
                        castShadow
                    >
                        <meshStandardMaterial color={BNB.clayCream} roughness={0.6} />
                    </RoundedBox>
                ))
            )}

            {/* 5. Cozy Folded Throw Blanket at foot */}
            <RoundedBox
                args={[width * 0.95, 0.03, depth * 0.35]}
                radius={0.02}
                smoothness={2}
                position={[0, baseH + mattressH + 0.02, depth * 0.26]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={BNB.taupeMuted} roughness={0.7} />
            </RoundedBox>
        </group>
    );
};

const SofaBase = ({ width, height, depth, color, seats = 3 }: any) => {
    const seatH = height * 0.45;
    const backH = height;
    const armW = Math.min(0.16, width * 0.15);
    const cushionCount = Math.max(1, seats);
    const availableW = width - armW * 2 - 0.04;
    const cushionW = availableW / cushionCount;
    const sofaColor = (color && color !== 'white' && color !== '#8494a7' && color !== '#8fa0b3') ? color : BNB.clayCream;

    return (
        <group>
            {/* 1. Low Base Platform */}
            <RoundedBox
                args={[width, seatH * 0.55, depth * 0.96]}
                radius={0.05}
                smoothness={4}
                position={[0, (seatH * 0.55) / 2, 0]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={sofaColor} roughness={0.7} />
            </RoundedBox>

            {/* 2. Soft Rounded Backrest */}
            <RoundedBox
                args={[width - 0.04, backH - seatH * 0.55, depth * 0.28]}
                radius={0.08}
                smoothness={4}
                position={[0, seatH * 0.55 + (backH - seatH * 0.55) / 2, -depth / 2 + depth * 0.14]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={sofaColor} roughness={0.7} />
            </RoundedBox>

            {/* 3. Rounded Pillowy Armrests */}
            {[-1, 1].map((side) => (
                <RoundedBox
                    key={side}
                    args={[armW, height * 0.62, depth * 0.92]}
                    radius={0.08}
                    smoothness={4}
                    position={[side * (width / 2 - armW / 2), (height * 0.62) / 2, depth * 0.02]}
                    castShadow
                    receiveShadow
                >
                    <meshStandardMaterial color={sofaColor} roughness={0.7} />
                </RoundedBox>
            ))}

            {/* 4. Deep Rounded Seat Cushions */}
            {Array.from({ length: cushionCount }).map((_, i) => {
                const cx = -availableW / 2 + cushionW * i + cushionW / 2;
                return (
                    <RoundedBox
                        key={i}
                        args={[cushionW - 0.02, seatH * 0.5, depth * 0.65]}
                        radius={0.06}
                        smoothness={4}
                        position={[cx, seatH * 0.55 + (seatH * 0.5) / 2, depth * 0.08]}
                        castShadow
                        receiveShadow
                    >
                        <meshStandardMaterial color={BNB.clayWhite} roughness={0.65} />
                    </RoundedBox>
                );
            })}

            {/* 5. Tapered Wooden Legs */}
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Cylinder
                    key={i}
                    args={[0.025, 0.018, 0.08, 16]}
                    position={[(width / 2 - armW) * x, 0.04, (depth * 0.4) * z]}
                    castShadow
                >
                    <meshStandardMaterial color={BNB.lightWood} roughness={0.6} />
                </Cylinder>
            ))}
        </group>
    );
};

const SofaCorner = ({ width, height, depth, color }: any) => {
    const chaiseW = Math.min(width * 0.45, 1.0);
    const mainW = width - chaiseW;
    const sofaColor = color && color !== 'white' ? color : BNB.clayCream;

    return (
        <group>
            {/* Main sofa part */}
            <group position={[chaiseW / 2, 0, -depth * 0.2]}>
                <SofaBase width={mainW} height={height} depth={depth * 0.65} color={sofaColor} seats={2} />
            </group>
            {/* Chaise part */}
            <group position={[-width / 2 + chaiseW / 2, 0, 0]}>
                <RoundedBox
                    args={[chaiseW, height * 0.5, depth]}
                    radius={0.06}
                    smoothness={4}
                    position={[0, (height * 0.5) / 2, 0]}
                    castShadow
                    receiveShadow
                >
                    <meshStandardMaterial color={BNB.clayWhite} roughness={0.65} />
                </RoundedBox>
                {/* Chaise backrest */}
                <RoundedBox
                    args={[chaiseW, height * 0.5, depth * 0.25]}
                    radius={0.07}
                    smoothness={4}
                    position={[0, height * 0.72, -depth / 2 + depth * 0.125]}
                    castShadow
                >
                    <meshStandardMaterial color={sofaColor} roughness={0.7} />
                </RoundedBox>
            </group>
        </group>
    );
};

const TableDining = ({ width, height, depth, color }: any) => {
    const topH = 0.045;
    const legH = height - topH;
    const tableColor = color && color !== 'white' ? color : BNB.lightWood;

    return (
        <group>
            {/* 1. Rounded Tabletop with soft bevels */}
            <RoundedBox
                args={[width, topH, depth]}
                radius={0.04}
                smoothness={4}
                position={[0, height - topH / 2, 0]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={tableColor} roughness={0.55} />
            </RoundedBox>

            {/* 2. 4 Tapered Cylindrical Wooden Legs */}
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Cylinder
                    key={i}
                    args={[0.032, 0.02, legH, 16]}
                    position={[(width / 2 - 0.08) * x, legH / 2, (depth / 2 - 0.08) * z]}
                    castShadow
                >
                    <meshStandardMaterial color={BNB.warmWood} roughness={0.6} />
                </Cylinder>
            ))}
        </group>
    );
};

const ChairDining = ({ width, height, depth, color }: any) => {
    const seatH = height * 0.48;
    const chairColor = color && color !== 'white' ? color : BNB.clayWarm;

    return (
        <group>
            {/* 1. Rounded Seat Cushion */}
            <RoundedBox
                args={[width * 0.9, 0.045, depth * 0.85]}
                radius={0.04}
                smoothness={4}
                position={[0, seatH - 0.022, 0]}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial color={chairColor} roughness={0.65} />
            </RoundedBox>

            {/* 2. Curved Ergonomic Backrest */}
            <RoundedBox
                args={[width * 0.82, height * 0.42, 0.035]}
                radius={0.04}
                smoothness={4}
                position={[0, seatH + (height * 0.42) / 2, -depth * 0.35]}
                castShadow
            >
                <meshStandardMaterial color={chairColor} roughness={0.65} />
            </RoundedBox>

            {/* 3. 4 Slender Tapered Legs */}
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
                <Cylinder
                    key={i}
                    args={[0.018, 0.012, seatH - 0.045, 12]}
                    position={[(width * 0.36) * x, (seatH - 0.045) / 2, (depth * 0.32) * z]}
                    castShadow
                >
                    <meshStandardMaterial color={BNB.warmWood} roughness={0.6} />
                </Cylinder>
            ))}
        </group>
    );
};

const TableDesk = ({ width, height, depth, color }: any) => {
    return <TableDining width={width} height={height} depth={depth} color={color} />;
};

const BedsideTable = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height, depth]} radius={0.03} smoothness={3} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayWarm} roughness={0.65} />
            </RoundedBox>
            {/* Drawer groove */}
            <Box args={[width * 0.88, 0.005, 0.01]} position={[0, 0, depth / 2 + 0.002]}>
                <meshStandardMaterial color={BNB.taupeMuted} />
            </Box>
            {/* Minimal knob */}
            <Cylinder args={[0.01, 0.01, 0.015, 12]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, depth / 2 + 0.01]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.7} />
            </Cylinder>
        </group>
    );
};

const TVStand = ({ width, height, depth, color }: any) => {
    // Elegant Scandinavian media console / architectural fireplace mantelpiece (as in Airbnb)
    const mantelH = 0.06;
    return (
        <group position={[0, height / 2, 0]}>
            {/* Stepped top mantel */}
            <RoundedBox args={[width, mantelH, depth * 1.05]} radius={0.03} smoothness={3} position={[0, height / 2 - mantelH / 2, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayWarm} roughness={0.65} />
            </RoundedBox>
            {/* Console body */}
            <RoundedBox args={[width * 0.96, height - mantelH, depth * 0.95]} radius={0.03} smoothness={3} position={[0, -mantelH / 2, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.7} />
            </RoundedBox>
            {/* Central architectural niche / hearth */}
            <Box args={[width * 0.45, height * 0.6, depth * 0.5]} position={[0, -mantelH / 2, depth * 0.25]}>
                <meshStandardMaterial color="#35312d" roughness={0.8} />
            </Box>
        </group>
    );
};

const TV = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2 + 0.45, 0]}>
            {/* Beveled display casing */}
            <RoundedBox args={[width, height, depth]} radius={0.01} smoothness={2} castShadow>
                <meshStandardMaterial color="#1a1816" roughness={0.2} metalness={0.8} />
            </RoundedBox>
            {/* OLED screen face */}
            <Box args={[width * 0.96, height * 0.92, 0.002]} position={[0, 0, depth / 2 + 0.002]}>
                <meshStandardMaterial color="#2a2724" roughness={0.1} />
            </Box>
            {/* Stand neck and base */}
            <Cylinder args={[0.018, 0.018, 0.45, 12]} position={[0, -height / 2 - 0.22, 0]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.8} roughness={0.3} />
            </Cylinder>
            <RoundedBox args={[width * 0.35, 0.015, depth * 2.2]} radius={0.008} smoothness={2} position={[0, -height / 2 - 0.44, 0]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.8} roughness={0.3} />
            </RoundedBox>
        </group>
    );
};

const Wardrobe = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height, depth]} radius={0.04} smoothness={3} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.65} />
            </RoundedBox>
            {/* Vertical center door seam */}
            <Box args={[0.004, height * 0.95, 0.005]} position={[0, 0, depth / 2 + 0.002]}>
                <meshStandardMaterial color={BNB.taupeMuted} />
            </Box>
            {/* Slim modern handles */}
            {[-0.03, 0.03].map((hx) => (
                <Cylinder key={hx} args={[0.006, 0.006, 0.35, 12]} position={[hx, 0, depth / 2 + 0.015]}>
                    <meshStandardMaterial color={BNB.chrome} metalness={0.7} />
                </Cylinder>
            ))}
        </group>
    );
};

const KitchenSet = ({ width, height, depth, color }: any) => {
    const counterH = height * 0.92;
    const topH = 0.04;

    return (
        <group position={[0, height / 2, 0]}>
            {/* Base Cabinet Block */}
            <RoundedBox args={[width, counterH, depth]} radius={0.03} smoothness={3} position={[0, -height / 2 + counterH / 2, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.6} />
            </RoundedBox>

            {/* Seamless Porcelain Countertop */}
            <RoundedBox args={[width + 0.02, topH, depth + 0.02]} radius={0.02} smoothness={3} position={[0, -height / 2 + counterH + topH / 2, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayWhite} roughness={0.4} />
            </RoundedBox>

            {/* Inset Sink Bowl */}
            <RoundedBox args={[width * 0.28, 0.02, depth * 0.65]} radius={0.03} smoothness={3} position={[-width * 0.22, height / 2 + 0.005, 0]}>
                <meshStandardMaterial color={BNB.water} roughness={0.3} />
            </RoundedBox>
            {/* Chrome Faucet Tap */}
            <group position={[-width * 0.22, height / 2 + 0.08, -depth * 0.25]}>
                <Cylinder args={[0.012, 0.012, 0.16, 12]} position={[0, 0, 0]}>
                    <meshStandardMaterial color={BNB.chrome} metalness={0.8} roughness={0.2} />
                </Cylinder>
                <Box args={[0.012, 0.012, 0.07]} position={[0, 0.08, 0.035]}>
                    <meshStandardMaterial color={BNB.chrome} metalness={0.8} roughness={0.2} />
                </Box>
            </group>

            {/* Inset 4-Burner Cooktop */}
            <RoundedBox args={[width * 0.32, 0.01, depth * 0.75]} radius={0.02} smoothness={2} position={[width * 0.22, height / 2 + 0.005, 0]}>
                <meshStandardMaterial color="#2d2926" roughness={0.3} />
            </RoundedBox>
            {[-0.07, 0.07].map((bx) =>
                [-0.09, 0.09].map((bz) => (
                    <Cylinder key={`${bx}-${bz}`} args={[0.042, 0.042, 0.004, 16]} position={[width * 0.22 + bx, height / 2 + 0.012, bz]}>
                        <meshStandardMaterial color="#1a1816" metalness={0.6} />
                    </Cylinder>
                ))
            )}
        </group>
    );
};

const KitchenModule = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height * 0.92, depth]} radius={0.03} smoothness={3} position={[0, -height * 0.04, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.6} />
            </RoundedBox>
            <RoundedBox args={[width + 0.02, 0.04, depth + 0.02]} radius={0.02} smoothness={3} position={[0, height * 0.48, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayWhite} roughness={0.4} />
            </RoundedBox>
        </group>
    );
};

const Refrigerator = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Tall cabinet with soft rounded corners */}
            <RoundedBox args={[width, height, depth]} radius={0.05} smoothness={4} position={[0, 0, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.5} />
            </RoundedBox>
            {/* Horizontal door split groove */}
            <Box args={[width * 0.95, 0.005, 0.005]} position={[0, height * 0.15, depth / 2 + 0.002]}>
                <meshStandardMaterial color={BNB.taupeMuted} />
            </Box>
            {/* Slender vertical chrome handle */}
            <Cylinder args={[0.01, 0.01, height * 0.32, 12]} position={[width * 0.36, height * 0.1, depth / 2 + 0.02]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.7} roughness={0.3} />
            </Cylinder>
        </group>
    );
};

const Stove = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height * 0.92, depth]} radius={0.03} smoothness={3} position={[0, -height * 0.04, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.clayCream} roughness={0.6} />
            </RoundedBox>
            <RoundedBox args={[width + 0.02, 0.04, depth + 0.02]} radius={0.02} smoothness={3} position={[0, height * 0.48, 0]} castShadow receiveShadow>
                <meshStandardMaterial color="#2d2926" roughness={0.3} />
            </RoundedBox>
            {[-0.1, 0.1].map((bx) =>
                [-0.1, 0.1].map((bz) => (
                    <Cylinder key={`${bx}-${bz}`} args={[0.055, 0.055, 0.004, 16]} position={[bx, height * 0.5 + 0.003, bz]}>
                        <meshStandardMaterial color="#1a1816" metalness={0.8} />
                    </Cylinder>
                ))
            )}
        </group>
    );
};

const Bath = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            {/* Outer smooth porcelain tub */}
            <RoundedBox args={[width, height, depth]} radius={0.09} smoothness={5} position={[0, 0, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.25} />
            </RoundedBox>
            {/* Inner basin */}
            <RoundedBox args={[width * 0.88, height * 0.82, depth * 0.78]} radius={0.08} smoothness={5} position={[0, 0.09, 0]}>
                <meshStandardMaterial color={BNB.water} roughness={0.2} transparent opacity={0.75} />
            </RoundedBox>
            {/* Chrome mixer tap on end */}
            <Cylinder args={[0.012, 0.012, 0.14, 12]} position={[width * 0.42, height / 2 + 0.05, 0]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.8} />
            </Cylinder>
        </group>
    );
};

const Toilet = ({ width, height, depth, color }: any) => {
    return (
        <group>
            {/* Cistern tank with flush button */}
            <RoundedBox args={[width * 0.9, height * 0.48, depth * 0.32]} radius={0.04} smoothness={3} position={[0, height * 0.76, -depth * 0.3]} castShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.25} />
            </RoundedBox>
            <Cylinder args={[0.015, 0.015, 0.008, 16]} position={[0, height + 0.004, -depth * 0.3]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.8} />
            </Cylinder>
            {/* Contoured bowl */}
            <RoundedBox args={[width * 0.8, height * 0.44, depth * 0.62]} radius={0.07} smoothness={4} position={[0, height * 0.22, depth * 0.12]} castShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.25} />
            </RoundedBox>
        </group>
    );
};

const Sink = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height * 0.9, depth]} radius={0.04} smoothness={3} position={[0, -height * 0.05, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.25} />
            </RoundedBox>
            <RoundedBox args={[width * 0.8, 0.02, depth * 0.7]} radius={0.04} smoothness={3} position={[0, height * 0.42, 0]}>
                <meshStandardMaterial color={BNB.water} roughness={0.3} />
            </RoundedBox>
            <Cylinder args={[0.012, 0.012, 0.15, 12]} position={[0, height * 0.52, -depth * 0.28]}>
                <meshStandardMaterial color={BNB.chrome} metalness={0.8} />
            </Cylinder>
        </group>
    );
};

const Shower = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, 0.08, depth]} radius={0.03} smoothness={3} position={[0, -height / 2 + 0.04, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.3} />
            </RoundedBox>
            <Box args={[width, height, 0.03]} position={[0, 0, -depth / 2 + 0.015]}>
                <meshStandardMaterial color="#94a3b8" opacity={0.3} transparent roughness={0.1} />
            </Box>
            <Box args={[0.03, height, depth]} position={[-width / 2 + 0.015, 0, 0]}>
                <meshStandardMaterial color="#94a3b8" opacity={0.3} transparent roughness={0.1} />
            </Box>
        </group>
    );
};

const WashingMachine = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height, depth]} radius={0.04} smoothness={3} position={[0, 0, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={BNB.pureWhite} roughness={0.3} />
            </RoundedBox>
            {/* Glass Porthole Door */}
            <Cylinder args={[width * 0.25, width * 0.25, 0.03, 32]} rotation={[Math.PI / 2, 0, 0]} position={[0, -height * 0.08, depth / 2 + 0.01]}>
                <meshStandardMaterial color="#94a3b8" opacity={0.6} transparent roughness={0.1} />
            </Cylinder>
        </group>
    );
};

const Door = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2, 0]}>
            <RoundedBox args={[width, height, depth * 0.5]} radius={0.01} smoothness={2} castShadow>
                <meshStandardMaterial color={BNB.clayWarm} roughness={0.7} />
            </RoundedBox>
        </group>
    );
};

const Window = ({ width, height, depth, color }: any) => {
    return (
        <group position={[0, height / 2 + 0.9, 0]}>
            <Box args={[width - 0.08, height - 0.08, 0.03]}>
                <meshStandardMaterial color="#93c5fd" opacity={0.4} transparent roughness={0.1} />
            </Box>
            <RoundedBox args={[width, height, depth * 0.4]} radius={0.01} smoothness={2}>
                <meshStandardMaterial color={BNB.clayWarm} roughness={0.7} />
            </RoundedBox>
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
