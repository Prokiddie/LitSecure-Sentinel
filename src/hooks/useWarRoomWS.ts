/**
 * LitSecure Sentinel — useWarRoomWS React Hook
 * Provides a live WebSocket connection to the War Room server.
 * Handles auto-reconnect with exponential backoff.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface WSIncident {
  id: string;
  title: string;
  severity: string;
  category: string;
  priorityScore?: number;
  priorityLevel?: string;
  priorityFactors?: string[];
}

export interface WSChatMsg {
  sender: string;
  org: string;
  text: string;
  time: string;
}

export interface WarRoomWSState {
  isConnected: boolean;
  lastIncident: WSIncident | null;
  lastThreat: any | null;
  lastChatMsg: WSChatMsg | null;
  connectedCount: number;
  sendChatMessage: (text: string, sender?: string, org?: string) => void;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS  = 30_000;

export function useWarRoomWS(): WarRoomWSState {
  const [isConnected,    setIsConnected]    = useState(false);
  const [lastIncident,   setLastIncident]   = useState<WSIncident | null>(null);
  const [lastThreat,     setLastThreat]     = useState<any | null>(null);
  const [lastChatMsg,    setLastChatMsg]    = useState<WSChatMsg | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);

  const wsRef      = useRef<WebSocket | null>(null);
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted  = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const token = sessionStorage.getItem("sentinel_token");
    if (!token) return; // Not authenticated yet — skip

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url   = `${proto}://${window.location.host}/ws/warroom?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      setIsConnected(true);
      backoffRef.current = BASE_BACKOFF_MS; // reset backoff on success
    };

    ws.onmessage = (ev) => {
      if (unmounted.current) return;
      try {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "CONNECTED":
            setConnectedCount(msg.payload?.clientCount ?? 0);
            break;
          case "NEW_INCIDENT":
            setLastIncident(msg.payload?.incident ?? null);
            break;
          case "THREAT_UPDATE":
            setLastThreat(msg.payload?.threat ?? null);
            break;
          case "CHAT_MSG":
            setLastChatMsg(msg.payload ?? null);
            break;
          case "SYSTEM_UPDATE":
            setConnectedCount(msg.payload?.clientCount ?? 0);
            break;
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setIsConnected(false);
      wsRef.current = null;
      // Exponential backoff reconnect
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      retryRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendChatMessage = useCallback((text: string, sender = "SOC-Analyst", org = "LitSecure SOC") => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CHAT", text, sender, org }));
    }
  }, []);

  return { isConnected, lastIncident, lastThreat, lastChatMsg, connectedCount, sendChatMessage };
}
