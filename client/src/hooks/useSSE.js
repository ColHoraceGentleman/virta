import { useEffect, useRef } from 'react';

export function useSSE(onEvent) {
  const esRef = useRef(null);
  const onEventRef = useRef(onEvent);

  // Keep onEventRef current without causing reconnect on every render
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let reconnectTimer = null;

    function connect() {
      const es = new EventSource('/api/v1/events');
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEventRef.current(event);
        } catch (err) {
          console.error('[SSE] Failed to parse event:', err);
        }
      };

      es.onerror = () => {
        console.warn('[SSE] Connection lost, retrying in 3s...');
        es.close();
        esRef.current = null;
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []); // run once — onEvent changes are handled via ref
}