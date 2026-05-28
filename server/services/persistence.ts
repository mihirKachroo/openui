import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { PersistedState, Session } from "../types";

const DATA_DIR = join(homedir(), ".openui");
const LEGACY_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
const STATE_FILE = join(DATA_DIR, "state.json");
const BUFFERS_DIR = join(DATA_DIR, "buffers");

// Ensure directories exist
function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BUFFERS_DIR)) mkdirSync(BUFFERS_DIR, { recursive: true });
}

export function loadState(): PersistedState {
  ensureDirs();
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Loaded state from ${STATE_FILE}`);
      return data;
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return { nodes: [] };
}

export function saveState(sessions: Map<string, Session>) {
  ensureDirs();
  const savedState = loadState();

  // Preserve categories and canvases from existing state
  const state: PersistedState = {
    nodes: [],
    categories: savedState.categories || [],
    canvases: savedState.canvases,
  };

  for (const [sessionId, session] of sessions) {
    // Preserve existing position if we have one
    const existingNode = savedState.nodes.find(n => n.sessionId === sessionId);

    state.nodes.push({
      nodeId: session.nodeId,
      sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      cwd: session.cwd,
      createdAt: session.createdAt,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      icon: session.icon,
      position: session.position || existingNode?.position || { x: 0, y: 0 },
      canvasId: session.canvasId,
      claudeSessionId: session.claudeSessionId,
      autoResumed: session.autoResumed,
    });

    saveBuffer(sessionId, session.outputBuffer);
  }

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export function savePositions(positions: Record<string, { x: number; y: number }>) {
  ensureDirs();
  const state = loadState();

  let updated = 0;
  for (const [nodeId, pos] of Object.entries(positions)) {
    const node = state.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      node.position = pos;
      updated++;
    } else {
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Node ${nodeId} not found in state`);
    }
  }

  if (updated > 0) {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Saved ${updated} positions to ${STATE_FILE}`);
    } catch (e) {
      console.error("Failed to save positions:", e);
    }
  }
}

export function saveBuffer(sessionId: string, buffer: string[]) {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    writeFileSync(bufferFile, buffer.join(""));
  } catch (e) {
    console.error("Failed to save buffer:", e);
  }
}

export function loadBuffer(sessionId: string): string[] {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    if (existsSync(bufferFile)) {
      return [readFileSync(bufferFile, "utf-8")];
    }
  } catch (e) {
    console.error("Failed to load buffer:", e);
  }
  return [];
}

export function saveCanvases(canvases: { id: string; name: string }[]) {
  ensureDirs();
  const state = loadState();
  state.canvases = canvases;
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save canvases:", e);
  }
}

export function migrateLegacyState(): boolean {
  const legacyState = join(LEGACY_DIR, "state.json");
  if (!existsSync(legacyState)) return false;
  if (existsSync(STATE_FILE)) return false;

  console.log(`[persistence] Migrating state from ${LEGACY_DIR} to ${DATA_DIR}`);
  ensureDirs();

  try {
    writeFileSync(STATE_FILE, readFileSync(legacyState, "utf-8"));
    const legacyBuffers = join(LEGACY_DIR, "buffers");
    if (existsSync(legacyBuffers)) {
      for (const file of readdirSync(legacyBuffers)) {
        copyFileSync(join(legacyBuffers, file), join(BUFFERS_DIR, file));
      }
    }
    return true;
  } catch (e) {
    console.error("[persistence] Migration failed:", e);
    return false;
  }
}

export function getDataDir() {
  return DATA_DIR;
}
