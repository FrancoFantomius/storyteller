import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORLDS_DIR = path.resolve(__dirname, 'server', 'worlds');
const CAMPAIGNS_DIR = path.resolve(__dirname, 'server', 'campaigns');

// Ensure storage directories exist
if (!fs.existsSync(WORLDS_DIR)) {
  fs.mkdirSync(WORLDS_DIR, { recursive: true });
}
if (!fs.existsSync(CAMPAIGNS_DIR)) {
  fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function findEntityById(dir, id) {
  // 1. Direct filename check
  const directPath = path.join(dir, `${id}.json`);
  if (fs.existsSync(directPath)) {
    try {
      const content = fs.readFileSync(directPath, 'utf-8');
      return { filePath: directPath, data: JSON.parse(content) };
    } catch (e) {}
  }

  // 2. Scan all JSON files in dir by parsed .id
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.id === id) {
        return { filePath: fullPath, data: parsed };
      }
    } catch (e) {}
  }

  return null;
}

function apiPlugin() {
  return {
    name: 'storyteller-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        const method = req.method;

        // Handle CORS preflight
        if (method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        // --- WORLDS API ---
        if (pathname === '/api/worlds') {
          if (method === 'GET') {
            try {
              const files = fs.readdirSync(WORLDS_DIR).filter(f => f.endsWith('.json'));
              const worlds = [];
              for (const file of files) {
                try {
                  const content = fs.readFileSync(path.join(WORLDS_DIR, file), 'utf-8');
                  worlds.push(JSON.parse(content));
                } catch (e) {}
              }
              return sendJson(res, 200, worlds);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }

          if (method === 'POST') {
            try {
              const data = await parseJsonBody(req);
              if (!data.id) {
                data.id = 'world_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
              }
              data.updatedAt = new Date().toISOString();
              if (!data.createdAt) data.createdAt = data.updatedAt;

              const filePath = path.join(WORLDS_DIR, `${data.id}.json`);
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
              return sendJson(res, 201, data);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }
        }

        if (pathname.startsWith('/api/worlds/')) {
          const worldId = pathname.replace('/api/worlds/', '');
          const found = findEntityById(WORLDS_DIR, worldId);

          if (method === 'GET') {
            if (found) {
              return sendJson(res, 200, found.data);
            }
            return sendJson(res, 404, { error: `World not found: ${worldId}` });
          }

          if (method === 'PUT') {
            try {
              const data = await parseJsonBody(req);
              data.id = worldId;
              data.updatedAt = new Date().toISOString();
              const savePath = found ? found.filePath : path.join(WORLDS_DIR, `${worldId}.json`);
              fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf-8');
              return sendJson(res, 200, data);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }

          if (method === 'DELETE') {
            if (found) {
              fs.unlinkSync(found.filePath);
              return sendJson(res, 200, { success: true, id: worldId });
            }
            return sendJson(res, 404, { error: `World not found: ${worldId}` });
          }
        }

        // --- CAMPAIGNS API ---
        if (pathname === '/api/campaigns') {
          if (method === 'GET') {
            try {
              const files = fs.readdirSync(CAMPAIGNS_DIR).filter(f => f.endsWith('.json'));
              const campaigns = [];
              for (const file of files) {
                try {
                  const content = fs.readFileSync(path.join(CAMPAIGNS_DIR, file), 'utf-8');
                  campaigns.push(JSON.parse(content));
                } catch (e) {}
              }
              // Sort by updatedAt descending
              campaigns.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
              return sendJson(res, 200, campaigns);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }

          if (method === 'POST') {
            try {
              const data = await parseJsonBody(req);
              if (!data.id) {
                data.id = 'camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
              }
              data.updatedAt = new Date().toISOString();
              if (!data.createdAt) data.createdAt = data.updatedAt;

              const filePath = path.join(CAMPAIGNS_DIR, `${data.id}.json`);
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
              return sendJson(res, 201, data);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }
        }

        if (pathname.startsWith('/api/campaigns/')) {
          const campId = pathname.replace('/api/campaigns/', '');
          const found = findEntityById(CAMPAIGNS_DIR, campId);

          if (method === 'GET') {
            if (found) {
              return sendJson(res, 200, found.data);
            }
            return sendJson(res, 404, { error: `Campaign not found: ${campId}` });
          }

          if (method === 'PUT') {
            try {
              const data = await parseJsonBody(req);
              data.id = campId;
              data.updatedAt = new Date().toISOString();
              const savePath = found ? found.filePath : path.join(CAMPAIGNS_DIR, `${campId}.json`);
              fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf-8');
              return sendJson(res, 200, data);
            } catch (err) {
              return sendJson(res, 500, { error: err.message });
            }
          }

          if (method === 'DELETE') {
            if (found) {
              fs.unlinkSync(found.filePath);
              return sendJson(res, 200, { success: true, id: campId });
            }
            return sendJson(res, 404, { error: `Campaign not found: ${campId}` });
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [apiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        play: path.resolve(__dirname, 'play.html'),
        worldEditor: path.resolve(__dirname, 'world-editor.html'),
        settings: path.resolve(__dirname, 'settings.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
