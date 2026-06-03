import { create } from "zustand";
import { Node } from "@xyflow/react";

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface AgentSession {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  color: string;
  createdAt: string;
  cwd: string;
  originalCwd?: string; // Mother repo path when using worktrees
  gitBranch?: string;
  status: AgentStatus;
  customName?: string;
  customColor?: string;
  notes?: string;
  isRestored?: boolean;
  // Linear ticket info
  ticketId?: string;
  ticketTitle?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
}

interface AppState {
  // Config
  launchCwd: string;
  setLaunchCwd: (cwd: string) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;

  // Sessions / Nodes
  sessions: Map<string, AgentSession>;
  addSession: (nodeId: string, session: AgentSession) => void;
  updateSession: (nodeId: string, updates: Partial<AgentSession>) => void;
  removeSession: (nodeId: string) => void;

  // Canvas
  nodes: Node[];
  setNodes: (nodes: Node[]) => void;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  removeNode: (nodeId: string) => void;

  // UI State
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  addAgentModalOpen: boolean;
  setAddAgentModalOpen: (open: boolean) => void;
  newSessionModalOpen: boolean;
  setNewSessionModalOpen: (open: boolean) => void;
  newSessionForNodeId: string | null;
  setNewSessionForNodeId: (nodeId: string | null) => void;

  // Canvases
  canvases: { id: string; name: string }[];
  activeCanvasId: string;
  setCanvases: (canvases: { id: string; name: string }[]) => void;
  addCanvas: (canvas: { id: string; name: string }) => void;
  removeCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;
  setActiveCanvasId: (id: string) => void;
  canvasViewports: Record<string, { x: number; y: number; zoom: number }>;
  setCanvasViewport: (id: string, viewport: { x: number; y: number; zoom: number }) => void;
}

// The "Main" canvas is virtual: it always exists but is never persisted to the
// server. Keep it pinned to the front of the list so it shows even when the
// server only returns the canvases the user explicitly created.
export const DEFAULT_CANVAS = { id: "default", name: "Main" };

function withDefaultCanvas(
  canvases: { id: string; name: string }[]
): { id: string; name: string }[] {
  return [DEFAULT_CANVAS, ...canvases.filter((c) => c.id !== "default")];
}

export const useStore = create<AppState>((set) => ({
  // Config
  launchCwd: "",
  setLaunchCwd: (cwd) => set({ launchCwd: cwd }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),

  // Sessions
  sessions: new Map(),
  addSession: (nodeId, session) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(nodeId, session);
      return { sessions: newSessions };
    }),
  updateSession: (nodeId, updates) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(nodeId);
      if (session) {
        newSessions.set(nodeId, { ...session, ...updates });
      }
      return { sessions: newSessions };
    }),
  removeSession: (nodeId) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(nodeId);
      return { sessions: newSessions };
    }),

  // Canvas
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
    })),

  // UI State
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  sidebarWidth: 512,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  addAgentModalOpen: false,
  setAddAgentModalOpen: (open) => set({ addAgentModalOpen: open }),
  newSessionModalOpen: false,
  setNewSessionModalOpen: (open) => set({ newSessionModalOpen: open }),
  newSessionForNodeId: null,
  setNewSessionForNodeId: (nodeId) => set({ newSessionForNodeId: nodeId }),

  // Canvases — "Main" (default) is always present and pinned first.
  canvases: [DEFAULT_CANVAS],
  activeCanvasId: "default",
  setCanvases: (canvases) => set({ canvases: withDefaultCanvas(canvases) }),
  addCanvas: (canvas) =>
    set((state) => ({ canvases: withDefaultCanvas([...state.canvases, canvas]) })),
  removeCanvas: (id) => set((state) => ({
    canvases: withDefaultCanvas(state.canvases.filter((c) => c.id !== id)),
  })),
  renameCanvas: (id, name) => set((state) => ({
    canvases: state.canvases.map((c) => c.id === id ? { ...c, name } : c),
  })),
  setActiveCanvasId: (id) => set({ activeCanvasId: id }),
  canvasViewports: {},
  setCanvasViewport: (id, viewport) => set((state) => ({
    canvasViewports: { ...state.canvasViewports, [id]: viewport },
  })),
}));
