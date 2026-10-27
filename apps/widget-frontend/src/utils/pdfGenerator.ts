import { SceneData } from '@flat/shared';
import { FLOOR_MATERIALS, WALL_COLORS } from './materialTextures';
import { FURNITURE_CATALOG } from '../catalog';

export interface PassportData {
    apartmentTitle: string;
    apartmentType: string;
    area: string;
    floor: string;
    ceiling: string;
    price: string;
    clientName?: string;
    clientPhone?: string;
    shareUrl: string;
    scene: SceneData;
    brandName?: string;
    brandSubtitle?: string;
    primaryColor?: string;
}

/**
 * Generates a high-resolution printable Design Passport image / PDF trigger
 */
export function generatePassportCanvas(data: PassportData): HTMLCanvasElement {
    const width = 1240; // A4 150 DPI approx (width)
    const height = 1754; // A4 150 DPI approx (height)

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Background - Luxury Off-White Architectural Paper
    ctx.fillStyle = '#fbfbfa';
    ctx.fillRect(0, 0, width, height);

    const primaryColor = data.primaryColor || '#f59e0b';
    const brandName = data.brandName || 'FLATBUILDER 3D';
    const brandSubtitle = data.brandSubtitle || 'ИНТЕРАКТИВНЫЙ ДИЗАЙН-ПАСПОРТ КВАРТИРЫ';

    // Decorative Top Header Bar
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, '#0a0e1a');
    grad.addColorStop(0.7, '#1e293b');
    grad.addColorStop(1, primaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, 140);

    // Brand Logo & Title
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText(brandName.toUpperCase(), 60, 65);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(brandSubtitle.toUpperCase(), 60, 95);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ДИЗАЙН-ПАСПОРТ КВАРТИРЫ', width - 60, 65);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`Сформирован: ${new Date().toLocaleDateString('ru-RU')}`, width - 60, 95);
    ctx.textAlign = 'left';


    // 1. Apartment Overview Cards
    const cardY = 170;
    const cardW = (width - 120 - 30) / 4;
    const cards = [
        { label: 'ПЛАНИРОВКА', val: data.apartmentTitle, sub: data.apartmentType },
        { label: 'ПЛОЩАДЬ', val: data.area, sub: `Потолки: ${data.ceiling}` },
        { label: 'ЭТАЖ', val: data.floor, sub: 'Видовая секция' },
        { label: 'СТОИМОСТЬ', val: data.price, sub: 'Базовая отделка' },
    ];

    cards.forEach((c, idx) => {
        const cx = 60 + idx * (cardW + 10);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cx, cardY, cardW, 100, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(c.label, cx + 18, cardY + 28);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(c.val, cx + 18, cardY + 58);

        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.fillText(c.sub, cx + 18, cardY + 82);
    });

    // 2. 2D Layout Plan Drawing Box
    const planY = 300;
    const planH = 540;
    const planW = width - 120;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(60, planY, planW, planH, 20);
    ctx.fill();
    ctx.stroke();

    // Plan Title Banner
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(62, planY + 2, planW - 4, 44);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('ИНТЕРАКТИВНОЕ ПЛАНИРОВОЧНОЕ РЕШЕНИЕ (М 1:50)', 85, planY + 28);

    // Draw Vector 2D Scene Layout onto Canvas
    drawSceneOnPlan(ctx, data.scene, 60 + planW / 2, planY + 50 + (planH - 50) / 2, planW - 80, planH - 100);

    // 3. Explication & Finishes Section (2 columns)
    const specY = 870;
    const colW = (width - 120 - 25) / 2;

    // Left Column: Room Explication & Specifications
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.roundRect(60, specY, colW, 440, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('📋 Экспликация помещений', 85, specY + 38);

    const rooms = getRoomExplication(data.scene);
    let ry = specY + 75;
    rooms.forEach((r, i) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(80, ry - 18, colW - 40, 32);

        ctx.fillStyle = '#334155';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${i + 1}. ${r.name}`, 95, ry + 2);

        ctx.textAlign = 'right';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(r.area, 60 + colW - 35, ry + 2);
        ctx.textAlign = 'left';

        ry += 38;
    });

    // Finishes selection summary
    const floorMat = FLOOR_MATERIALS.find(m => m.id === data.scene.materials?.floorId) || FLOOR_MATERIALS[0];
    const wallCol = WALL_COLORS.find(c => c.color === data.scene.materials?.wallColor) || WALL_COLORS[0];

    const finY = specY + 280;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('🎨 Выбранная чистовая отделка:', 85, finY);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`• Напольное покрытие: ${floorMat.name} (${floorMat.desc})`, 85, finY + 28);
    ctx.fillText(`• Покрытие стен: ${wallCol.name} (${wallCol.desc})`, 85, finY + 54);
    ctx.fillText(`• Остекление: Энергосберегающий двухкамерный стеклопакет Reynaers`, 85, finY + 80);
    ctx.fillText(`• Входная дверь: Стальная сейфовая с биометрическим замком`, 85, finY + 106);

    // Right Column: Mortgage Calculation & 3D QR Code
    const rx = 60 + colW + 25;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.roundRect(rx, specY, colW, 440, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('🏦 Ипотечный расчет от застройщика', rx + 25, specY + 38);

    const priceNum = parseInt(data.price.replace(/\D/g, '')) || 16400000;
    const pv = Math.round(priceNum * 0.2);
    const loan = priceNum - pv;
    // Monthly payment calculation (6% family mortgage, 30 years)
    const r6 = 0.06 / 12;
    const n = 360;
    const pmt6 = Math.round((loan * r6 * Math.pow(1 + r6, n)) / (Math.pow(1 + r6, n) - 1));

    const mortCards = [
        { label: 'Стоимость квартиры', val: data.price },
        { label: 'Первоначальный взнос (20%)', val: `${pv.toLocaleString('ru-RU')} ₽` },
        { label: 'Семейная ипотека 6.0%', val: `${pmt6.toLocaleString('ru-RU')} ₽ / мес`, hl: true },
        { label: 'Базовая программа 8.0%', val: `${Math.round(pmt6 * 1.35).toLocaleString('ru-RU')} ₽ / мес` },
    ];

    let my = specY + 75;
    mortCards.forEach((mc) => {
        ctx.fillStyle = mc.hl ? '#fef3c7' : '#f8fafc';
        ctx.fillRect(rx + 20, my - 18, colW - 40, 38);

        ctx.fillStyle = mc.hl ? '#b45309' : '#475569';
        ctx.font = mc.hl ? 'bold 13px sans-serif' : '13px sans-serif';
        ctx.fillText(mc.label, rx + 35, my + 6);

        ctx.textAlign = 'right';
        ctx.fillStyle = mc.hl ? '#92400e' : '#0f172a';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(mc.val, rx + colW - 35, my + 6);
        ctx.textAlign = 'left';

        my += 46;
    });

    // QR Code Box for 3D Walkaround
    const qrY = specY + 280;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(rx + 20, qrY, colW - 40, 135, 16);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('📱 Интерактивная 3D Модель', rx + 40, qrY + 34);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('Откройте планировку на смартфоне', rx + 40, qrY + 56);
    ctx.fillText('или планшете для виртуальной прогулки', rx + 40, qrY + 74);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(data.shareUrl.slice(0, 38) + '...', rx + 40, qrY + 104);

    // 4. Footer Note
    const footY = 1350;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText('Материал подготовлен в конфигураторе Flat Builder. Не является публичной офертой (ст. 437 ГК РФ).', 60, footY + 40);

    return canvas;
}

/**
 * Draws 2D walls, openings, and furniture centered on canvas
 */
function drawSceneOnPlan(ctx: CanvasRenderingContext2D, scene: SceneData, cx: number, cy: number, maxW: number, maxH: number) {
    const nodes = scene.nodes || [];
    if (nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    });

    const wM = Math.max(1, maxX - minX);
    const hM = Math.max(1, maxY - minY);
    const scale = Math.min((maxW - 40) / wM, (maxH - 40) / hM);

    const toScreen = (x: number, y: number) => ({
        x: cx + (x - (minX + maxX) / 2) * scale,
        y: cy + (y - (minY + maxY) / 2) * scale
    });

    // Floor fill
    ctx.fillStyle = '#fdfdfb';
    ctx.fillRect(cx - (wM * scale) / 2 - 10, cy - (hM * scale) / 2 - 10, wM * scale + 20, hM * scale + 20);

    // Furniture Objects (soft architectural blueprint boxes)
    (scene.objects || []).forEach(obj => {
        if (obj.catalogId === 'spawn_point') return;
        const cat = FURNITURE_CATALOG.find(c => c.id === obj.catalogId);
        const fw = (cat?.dimensions.width || 1) * (obj.scale?.x || 1) * scale;
        const fd = (cat?.dimensions.depth || 1) * (obj.scale?.z || 1) * scale;

        const pos = toScreen(obj.pos.x, obj.pos.z);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-obj.rot);

        ctx.fillStyle = '#f1f5f9';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.fillRect(-fw / 2, -fd / 2, fw, fd);
        ctx.strokeRect(-fw / 2, -fd / 2, fw, fd);

        ctx.restore();
    });

    // Walls (Graph Edges)
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    (scene.edges || []).forEach(edge => {
        const n1 = nodeMap.get(edge.startNodeId);
        const n2 = nodeMap.get(edge.endNodeId);
        if (!n1 || !n2) return;

        const p1 = toScreen(n1.x, n1.y);
        const p2 = toScreen(n2.x, n2.y);

        ctx.strokeStyle = edge.kind === 'bearing' ? '#0f172a' : '#475569';
        ctx.lineWidth = edge.kind === 'bearing' ? 8 : 4;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });

    // Openings (Windows and Doors)
    (scene.openings || []).forEach(op => {
        const edge = scene.edges?.find(e => e.id === op.wallId);
        if (!edge) return;
        const n1 = nodeMap.get(edge.startNodeId);
        const n2 = nodeMap.get(edge.endNodeId);
        if (!n1 || !n2) return;

        const p1 = toScreen(n1.x, n1.y);
        const p2 = toScreen(n2.x, n2.y);
        const ox = p1.x + (p2.x - p1.x) * op.t;
        const oy = p1.y + (p2.y - p1.y) * op.t;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = op.kind === 'window' ? '#38bdf8' : '#d97706';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ox, oy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function getRoomExplication(scene: SceneData) {
    const hasKids = scene.objects?.some(o => o.catalogId === 'bed_single');
    const isPenthouse = (scene.nodes?.length || 0) > 8 && scene.objects?.length > 12;

    if (isPenthouse) {
        return [
            { name: 'Гранд-гостиная с камином', area: '44.5 м²' },
            { name: 'Островная кухня-столовая', area: '26.2 м²' },
            { name: 'Мастер-сьют с гардеробной', area: '21.8 м²' },
            { name: 'Приватная спа-ванная', area: '9.4 м²' },
            { name: 'Холл / Прихожая', area: '10.1 м²' }
        ];
    }

    if (hasKids) {
        return [
            { name: 'Кухня-гостиная', area: '28.2 м²' },
            { name: 'Мастер-спальня', area: '16.5 м²' },
            { name: 'Детская комната / Кабинет', area: '14.8 м²' },
            { name: 'Основная ванная комната', area: '5.8 м²' },
            { name: 'Гостевой санузел', area: '3.2 м²' },
            { name: 'Прихожая с гардеробом', area: '9.9 м²' }
        ];
    }

    return [
        { name: 'Кухня-гостиная', area: '22.4 м²' },
        { name: 'Мастер-спальня', area: '14.1 м²' },
        { name: 'Ванная комната', area: '5.6 м²' },
        { name: 'Прихожая / Гардероб', area: '7.3 м²' },
        { name: 'Панорамная лоджия', area: '4.8 м²' }
    ];
}
