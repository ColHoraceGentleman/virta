// SSE Service — manages client connections and broadcasts events
const clients = new Map(); // clientId -> response

let clientCounter = 0;

export function addClient(res) {
  const clientId = ++clientCounter;
  clients.set(clientId, res);
  console.log(`[SSE] Client connected: ${clientId}. Total: ${clients.size}`);
  return clientId;
}

export function removeClient(clientId) {
  clients.delete(clientId);
  console.log(`[SSE] Client disconnected: ${clientId}. Total: ${clients.size}`);
}

export function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const [, res] of clients) {
    try {
      res.write(payload);
    } catch (err) {
      console.error('[SSE] Failed to write to client:', err.message);
    }
  }
}

export function getClientCount() {
  return clients.size;
}