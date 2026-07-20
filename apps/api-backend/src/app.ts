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

        reply.type(mimeType);
        reply.header('Access-Control-Allow-Origin', '*');
        return stream;
    } else {
        console.error('[Backend] File not found:', filepath);
        return reply.code(404).send({ error: 'File not found' });
    }
});

server.get('/health', async () => {
    return { status: 'ok', db: 'connected' };
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

    // Return full URL (using manual API route to be safe)
    // const fileUrl = `http://localhost:3000/uploads/${filename}`;
    // Using manual route to avoid static middleware issues
    const fileUrl = `http://localhost:3000/api/uploads/${filename}`;

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
    try {
        const scene = await prisma.scene.create({
            data: {
                token: shareToken,
                data: data as any,
            }
        });
        return { sceneId: scene.id, shareToken: scene.token };
    } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: 'Failed to save scene' });
    }
});

// Load Scene
server.get<{ Params: { token: string } }>('/api/scenes/:token', async (request, reply) => {
    const { token } = request.params;
    const scene = await prisma.scene.findUnique({ where: { token } });
    if (!scene) return reply.code(404).send({ error: 'Scene not found' });
    return scene.data;
});

// Submit Lead
server.post<{ Body: LeadPayload }>('/api/leads', async (request, reply) => {
    const { name, phone, comment, sceneId, shareToken } = request.body;
    if (!phone || !name) return reply.code(400).send({ error: 'Name and phone are required' });

    try {
        const lead = await prisma.lead.create({
            data: { name, phone, comment, sceneId }
        });
        const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
        if (webhookUrl) {
            request.log.info(`Sending lead to Bitrix: ${lead.id}`);
        }
        return { success: true, leadId: lead.id };
    } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: 'Failed to submit lead' });
    }
});

const start = async () => {
    try {
        await server.listen({ port: 3000, host: '0.0.0.0' });
    } catch (err) {
        // If address in use, we exit, but nodemon/ts-node should handle restarts or user needs to kill old process
        server.log.error(err);
        process.exit(1);
    }
};

start();
