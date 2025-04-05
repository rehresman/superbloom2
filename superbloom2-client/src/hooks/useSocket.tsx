import { useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  const connectSocket = useCallback(() => {
    if (!socket) {
      const newSocket = io("http://localhost:3000");
      setSocket(newSocket);
      console.log("Socket connected:", newSocket.id);
    }
  }, [socket]);

  const disconnectSocket = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      console.log("Socket disconnected");
    }
  }, [socket]);

  const emitMIDIEvent = useCallback((event: { type: string; [key: string]: any }) => {
    if (socket) {
      socket.emit("midi", event);
    }
  }, [socket]);

  return {
    socket,
    connectSocket,
    disconnectSocket,
    emitMIDIEvent
  };
}
