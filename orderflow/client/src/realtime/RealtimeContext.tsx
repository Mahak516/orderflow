import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { Socket, io } from 'socket.io-client';
import { getAccessToken } from '../api/http';
import { useAuth } from '../auth/AuthContext';

const RealtimeContext = createContext<Socket | null>(null);

/** Keeps one authenticated WebSocket open while the user is logged in. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const connection = io({
      path: '/socket.io',
      // A function, so every (re)connect sends the CURRENT access token, not a stale one.
      auth: (callback) => callback({ token: getAccessToken() }),
    });
    setSocket(connection);

    return () => {
      connection.disconnect();
      setSocket(null);
    };
  }, [userId]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

/** Run `handler` whenever the server pushes `event`. Unsubscribes automatically. */
export function useRealtimeEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const socket = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => latest.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
