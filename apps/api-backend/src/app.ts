import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { SceneData, LeadPayload } from '@flat/shared';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream';
import util from 'util';

// Promisify pipeline for async/await usage
const pump = util.promisify(pipeline);
const prisma = new PrismaClient();
const server = fastify({ logger: true });

// Register Plugins
server.register(cors, { origin: '*' });
server.register(multipart);

// Make sure 'uploads' directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads');
console.log('[Backend] Static uploads dir:', UPLOADS_DIR);

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('[Backend] Created uploads dir');
}

server.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
});

import { spawn } from 'child_process';

// Fallback manual file serving if static fails (debugging 404)
server.get('/api/uploads/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const filepath = path.join(UPLOADS_DIR, filename);

    console.log('[Backend] Manual file serve request:', filename, 'Path:', filepath);

    if (fs.existsSync(filepath)) {
        const stream = fs.createReadStream(filepath);
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.glb') mimeType = 'model/gltf-binary';
        if (ext === '.json') mimeType = 'application/json';

        reply.type(mimeType);
        reply.header('Access-Control-Allow-Origin', '*');
        return stream;
    } else {
        console.error('[Backend] File not found:', filepath);
        return reply.code(404).send({ error: 'File not found' });
    }
});

// Serve baked artifacts (GLB, 360 panoramas, manifest)
server.get('/api/uploads/baked/:token/:filename', async (req, reply) => {
    const { token, filename } = req.params as { token: string; filename: string };
    const filepath = path.join(UPLOADS_DIR, 'baked', token, filename);

    if (fs.existsSync(filepath)) {
        const stream = fs.createReadStream(filepath);
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.glb') mimeType = 'model/gltf-binary';
        if (ext === '.json') mimeType = 'application/json';

        reply.type(mimeType);
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        return stream;
    } else {
        return reply.code(404).send({ error: 'Baked file not found' });
    }
});

function getBlenderExecutable(): string {
    const candidates = [
        path.join(process.cwd(), '../../tools/blender/blender.exe'),
        path.join(process.cwd(), '../tools/blender/blender.exe'),
        path.join(process.cwd(), 'tools/blender/blender.exe'),
        'D:\\dev\\flat\\tools\\blender\\blender.exe',
        'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
        'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
        'blender'
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return 'blender';
}

function getBakeScriptPath(): string {
    const candidates = [
        path.join(process.cwd(), '../../scripts/blender_bake_pipeline.py'),
        path.join(process.cwd(), '../scripts/blender_bake_pipeline.py'),
        path.join(process.cwd(), 'scripts/blender_bake_pipeline.py'),
        'D:\\dev\\flat\\scripts\\blender_bake_pipeline.py'
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return path.join(process.cwd(), 'scripts/blender_bake_pipeline.py');
}

// Local file-based fallback store if PostgreSQL is unavailable
const DATA_STORE_FILE = path.join(UPLOADS_DIR, 'scenes_db.json');

interface LocalSceneRecord {
    id: string;
    token: string;
    data: any;
    bakeStatus: string;
    bakeProgress: number;
    bakeError?: string | null;
    bakedGlbUrl?: string | null;
    panoramas?: any;
    bakedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

function getLocalStore(): Record<string, LocalSceneRecord> {
    if (fs.existsSync(DATA_STORE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_STORE_FILE, 'utf-8'));
        } catch (e) {}
    }
    return {};
}

function saveLocalStore(store: Record<string, LocalSceneRecord>) {
    fs.writeFileSync(DATA_STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// Local file-based fallback store for leads if PostgreSQL is unavailable
const LEADS_STORE_FILE = path.join(UPLOADS_DIR, 'leads_db.json');

interface LocalLeadRecord {
    id: string;
    name: string;
    phone: string;
    comment?: string | null;
    sceneId?: string | null;
    createdAt: string;
    scene?: {
        id?: string;
        token?: string;
    } | null;
}

function getLocalLeads(): LocalLeadRecord[] {
    if (fs.existsSync(LEADS_STORE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(LEADS_STORE_FILE, 'utf-8'));
        } catch (e) {}
    }
    return [];
}

function saveLocalLead(lead: LocalLeadRecord) {
    const leads = getLocalLeads();
    leads.unshift(lead);
    fs.writeFileSync(LEADS_STORE_FILE, JSON.stringify(leads, null, 2), 'utf-8');
}

async function findSceneByToken(token: string) {
    try {
        const scene = await prisma.scene.findUnique({ where: { token } });
        if (scene) return scene;
    } catch (e) {
        console.warn('[Backend DB] Prisma unavailable, using local file store');
    }
    const store = getLocalStore();
    return store[token] || null;
}

async function updateSceneByToken(token: string, updates: Partial<LocalSceneRecord>) {
    try {
        await prisma.scene.update({
            where: { token },
            data: updates as any
        });
        return;
    } catch (e) {
        console.warn('[Backend DB] Prisma update failed, updating local file store');
    }
    const store = getLocalStore();
    if (store[token]) {
        store[token] = { ...store[token], ...updates, updatedAt: new Date().toISOString() };
        saveLocalStore(store);
    }
}

server.get('/health', async () => {
    return { status: 'ok' };
});

// --- API Endpoints ---

// Upload Plan Image
server.post('/api/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
    }

    const filename = `${uuidv4()}${path.extname(data.filename)}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await pump(data.file, fs.createWriteStream(filepath));

    const publicBase = process.env.PUBLIC_URL || `${req.protocol}://${req.headers.host}`;
    const fileUrl = `${publicBase}/api/uploads/${filename}`;

    console.log('[Backend] File uploaded, returning URL:', fileUrl);
    return { url: fileUrl };
});

// Save Scene
server.post<{ Body: { data: SceneData } }>('/api/scenes', async (request, reply) => {
    const { data } = request.body;
    if (!data || !data.walls) {
        return reply.code(400).send({ error: 'Invalid scene data' });
    }
    const shareToken = uuidv4().slice(0, 8);
    const sceneId = uuidv4();
    try {
        const scene = await prisma.scene.create({
            data: {
                token: shareToken,
                data: data as any,
            }
        });
        return { sceneId: scene.id, shareToken: scene.token };
    } catch (e) {
        console.warn('[Backend DB] Prisma create failed, saving to local file store');
        const store = getLocalStore();
        store[shareToken] = {
            id: sceneId,
            token: shareToken,
            data: data as any,
            bakeStatus: 'none',
            bakeProgress: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        saveLocalStore(store);
        return { sceneId, shareToken };
    }
});

// Load Scene
server.get<{ Params: { token: string } }>('/api/scenes/:token', async (request, reply) => {
    const { token } = request.params;
    const scene = await findSceneByToken(token);
    if (!scene) return reply.code(404).send({ error: 'Scene not found' });
    return {
        data: scene.data,
        bakeStatus: scene.bakeStatus,
        bakedGlbUrl: scene.bakedGlbUrl,
        panoramas: scene.panoramas,
        bakeError: scene.bakeError,
        shareToken: scene.token
    };
});

// Trigger Baking & Rendering
server.post<{ Params: { token: string }; Body: { mode?: string; samples?: number } }>(
    '/api/scenes/:token/bake',
    async (request, reply) => {
        const { token } = request.params;
        const { mode = 'both', samples = 128 } = request.body || {};

        const scene = await findSceneByToken(token);
        if (!scene) return reply.code(404).send({ error: 'Scene not found' });

        const bakedDir = path.join(UPLOADS_DIR, 'baked', token);
        if (!fs.existsSync(bakedDir)) {
            fs.mkdirSync(bakedDir, { recursive: true });
        }

        const sceneJsonPath = path.join(bakedDir, 'scene_input.json');
        fs.writeFileSync(sceneJsonPath, JSON.stringify(scene.data, null, 2), 'utf-8');

        // Mark scene as processing in DB / store
        await updateSceneByToken(token, {
            bakeStatus: 'processing',
            bakeProgress: 15,
            bakeError: null
        });

        const blenderExe = getBlenderExecutable();
        const bakeScript = getBakeScriptPath();

        console.log(`[Bake Server] Launching Blender bake for scene ${token}...`);
        console.log(`[Bake Server] Blender: ${blenderExe}, Script: ${bakeScript}`);

        const publicBase = process.env.PUBLIC_URL || `${request.protocol}://${request.headers.host}`;

        // Launch Blender asynchronously
        const proc = spawn(
            blenderExe,
            [
                '-b',
                '-P',
                bakeScript,
                '--',
                '--scene',
                sceneJsonPath,
                '--output',
                bakedDir,
                '--mode',
                mode,
                '--samples',
                String(samples)
            ],
            {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            }
        );

        let stdoutLog = '';
        let stderrLog = '';

        proc.stdout?.on('data', (d) => {
            const str = d.toString();
            stdoutLog += str;
            console.log(`[Blender stdout] ${str.trim()}`);
        });

        proc.stderr?.on('data', (d) => {
            const str = d.toString();
            stderrLog += str;
            console.error(`[Blender stderr] ${str.trim()}`);
        });

        proc.on('close', async (code) => {
            console.log(`[Bake Server] Blender process exited with code ${code}`);
            if (code === 0) {
                try {
                    const manifestPath = path.join(bakedDir, 'manifest.json');
                    let manifest: any = {};
                    if (fs.existsSync(manifestPath)) {
                        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    }

                    const bakedGlbUrl = manifest.bakedGlb
                        ? `${publicBase}/api/uploads/baked/${token}/${manifest.bakedGlb}`
                        : null;

                    const panoramasWithUrls = (manifest.panoramas || []).map((p: any) => ({
                        ...p,
                        url: `${publicBase}/api/uploads/baked/${token}/${p.file}`
                    }));

                    await updateSceneByToken(token, {
                        bakeStatus: 'ready',
                        bakeProgress: 100,
                        bakedGlbUrl,
                        panoramas: panoramasWithUrls as any,
                        bakedAt: new Date().toISOString()
                    });
                    console.log(`[Bake Server] Scene ${token} marked READY.`);
                } catch (e: any) {
                    console.error('[Bake Server] Error saving bake output:', e);
                    await updateSceneByToken(token, {
                        bakeStatus: 'error',
                        bakeError: e.message || 'Error processing manifest'
                    });
                }
            } else {
                console.error(`[Bake Server] Bake failed with code ${code}. Log:\n${stderrLog || stdoutLog}`);
                await updateSceneByToken(token, {
                    bakeStatus: 'error',
                    bakeError: stderrLog.slice(-500) || `Blender exited with code ${code}`
                });
            }
        });

        return {
            status: 'processing',
            message: 'Bake task started successfully'
        };
    }
);

// Get Baking Status
server.get<{ Params: { token: string } }>('/api/scenes/:token/bake-status', async (request, reply) => {
    const { token } = request.params;
    const scene = await findSceneByToken(token);
    if (!scene) return reply.code(404).send({ error: 'Scene not found' });

    return {
        status: scene.bakeStatus,
        progress: scene.bakeProgress,
        bakedGlbUrl: scene.bakedGlbUrl,
        panoramas: scene.panoramas,
        error: scene.bakeError,
        bakedAt: scene.bakedAt
    };
});

// Submit Lead
server.post<{ Body: LeadPayload }>('/api/leads', async (request, reply) => {
    const { name, phone, comment, sceneId, shareToken, brand, sourceUrl, webhookUrl } = request.body;
    if (!phone || !name) return reply.code(400).send({ error: 'Name and phone are required' });

    try {
        // Resolve sceneId: accept a real scene id, or resolve via shareToken,
        // otherwise store the lead without a scene (demo presets are not DB scenes)
        let resolvedSceneId: string | null = null;
        if (sceneId) {
            try {
                const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
                if (scene) resolvedSceneId = scene.id;
            } catch (e) {}
        }
        if (!resolvedSceneId && shareToken) {
            try {
                const scene = await prisma.scene.findUnique({ where: { token: shareToken } });
                if (scene) resolvedSceneId = scene.id;
            } catch (e) {}
            if (!resolvedSceneId) {
                const localStore = getLocalStore();
                if (localStore[shareToken]) {
                    resolvedSceneId = localStore[shareToken].id;
                }
            }
        }

        const enrichedComment = [
            comment || '',
            brand ? `[ЖК / Бренд: ${brand}]` : '',
            sourceUrl ? `[URL: ${sourceUrl}]` : ''
        ].filter(Boolean).join(' | ');

        let leadId = uuidv4();
        try {
            const lead = await prisma.lead.create({
                data: { name, phone, comment: enrichedComment, sceneId: resolvedSceneId }
            });
            leadId = lead.id;
        } catch (e) {
            console.warn('[Backend DB] Prisma lead create failed, saving to local file store');
            const localLead: LocalLeadRecord = {
                id: leadId,
                name,
                phone,
                comment: enrichedComment,
                sceneId: resolvedSceneId,
                createdAt: new Date().toISOString(),
                scene: shareToken ? { token: shareToken } : null
            };
            saveLocalLead(localLead);
        }

        // Webhook forwarding (Bitrix24 / AmoCRM / Developer Custom CRM)
        const targetWebhook = webhookUrl || process.env.BITRIX_WEBHOOK_URL;
        if (targetWebhook) {
            request.log.info(`Forwarding lead ${leadId} to webhook: ${targetWebhook}`);
            fetch(targetWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId,
                    name,
                    phone,
                    comment: enrichedComment,
                    brand: brand || null,
                    sourceUrl: sourceUrl || null,
                    sceneId: resolvedSceneId,
                    shareToken: shareToken || null,
                    createdAt: new Date().toISOString()
                })
            }).catch(err => {
                request.log.error(`Webhook forward error: ${err.message}`);
            });
        }

        return { success: true, leadId };
    } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: 'Failed to submit lead' });
    }
});

// GET /api/leads — List of submitted leads with associated scenes
server.get('/api/leads', async (request, reply) => {
    try {
        const leads = await prisma.lead.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { scene: true }
        });
        return { leads };
    } catch (e) {
        console.warn('[Backend DB] Prisma leads findMany failed, reading local store');
        const leads = getLocalLeads();
        return { leads: leads.slice(0, 50) };
    }
});

// GET /api/analytics — Lead and scene analytics
server.get('/api/analytics', async (request, reply) => {
    try {
        let totalLeads = 0;
        let totalScenes = 0;
        try {
            totalLeads = await prisma.lead.count();
            totalScenes = await prisma.scene.count();
        } catch (e) {
            console.warn('[Backend DB] Prisma analytics count failed, reading local store');
            totalLeads = getLocalLeads().length;
            totalScenes = Object.keys(getLocalStore()).length;
        }

        const conversionRate = totalScenes > 0 ? ((totalLeads / totalScenes) * 100).toFixed(1) : '0.0';

        return {
            totalLeads,
            totalScenes,
            conversionRate: `${conversionRate}%`
        };
    } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: 'Failed to fetch analytics' });
    }
});

// GET /api/leads/export — CSV Export for CRM
server.get('/api/leads/export', async (request, reply) => {
    try {
        let leads: any[] = [];
        try {
            leads = await prisma.lead.findMany({
                orderBy: { createdAt: 'desc' },
                include: { scene: true }
            });
        } catch (e) {
            console.warn('[Backend DB] Prisma leads export failed, reading local store');
            leads = getLocalLeads();
        }

        let csv = 'ID,Дата,Имя,Телефон,Комментарий_и_Бренд,Ссылка_на_3D\n';
        leads.forEach(l => {
            const date = new Date(l.createdAt).toISOString();
            const cleanComment = (l.comment || '').replace(/"/g, '""');
            const sceneLink = l.scene?.token ? `http://localhost:5173/client.html?s=${l.scene.token}` : '-';
            csv += `"${l.id}","${date}","${l.name}","${l.phone}","${cleanComment}","${sceneLink}"\n`;
        });

        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="leads_export.csv"');
        return csv;
    } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: 'Failed to export CSV' });
    }
});

const start = async () => {
    try {
        const port = Number(process.env.FLAT_API_PORT || process.env.PORT || 3000);
        await server.listen({ port, host: '0.0.0.0' });
    } catch (err) {
        // If address in use, we exit, but nodemon/ts-node should handle restarts or user needs to kill old process
        server.log.error(err);
        process.exit(1);
    }
};

start();
