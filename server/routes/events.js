import { Router } from 'express';
import { addClient, removeClient } from '../services/sseService.js';

const router = Router();

router.get('/', (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: 'connected', data: { timestamp: new Date().toISOString() } })}\n\n`);

  const clientId = addClient(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { timestamp: new Date().toISOString() } })}\n\n`);
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });

  req.on('error', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });
});

export default router;