import { useState, useRef, useEffect } from "react";
import { Plus, Folder, Settings, X } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";

export function Header() {
  const {
    setAddAgentModalOpen,
    launchCwd,
    canvases,
    activeCanvasId,
    setActiveCanvasId,
    addCanvas,
    removeCanvas,
    renameCanvas,
    sessions,
    nodes,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleAddCanvas = () => {
    const id = `canvas-${Date.now()}`;
    // Pick the lowest free "Canvas N" so names don't collide after deletes.
    const used = new Set(
      canvases
        .map((c) => /^Canvas (\d+)$/.exec(c.name)?.[1])
        .filter((n): n is string => !!n)
        .map(Number)
    );
    let n = 2;
    while (used.has(n)) n++;
    const name = `Canvas ${n}`;
    addCanvas({ id, name });
    setActiveCanvasId(id);
    fetch("/api/canvases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }).catch(console.error);
  };

  const handleDeleteCanvas = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === "default") return; // Main is pinned and can't be deleted
    const hasNodes = nodes.some((n) => (n.data?.canvasId || "default") === id);
    if (hasNodes && !window.confirm("This canvas has agents on it. Delete anyway?")) return;
    removeCanvas(id);
    if (activeCanvasId === id) {
      const remaining = canvases.filter((c) => c.id !== id);
      setActiveCanvasId(remaining[0]?.id || "default");
    }
    fetch(`/api/canvases/${id}`, { method: "DELETE" }).catch(console.error);
  };

  const handleDoubleClick = (id: string, name: string) => {
    if (id === "default") return; // Main is pinned and can't be renamed
    setEditingId(id);
    setEditValue(name);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameCanvas(editingId, editValue.trim());
      fetch(`/api/canvases/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editValue.trim() }),
      }).catch(console.error);
    }
    setEditingId(null);
  };

  const agentCount = (canvasId: string) => {
    let count = 0;
    for (const [nodeId] of sessions) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && (node.data?.canvasId || "default") === canvasId) count++;
    }
    return count;
  };

  return (
    <header className="h-14 px-4 flex items-center border-b border-border bg-canvas-dark gap-3">
      {/* Logo */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>
        <span className="text-sm font-semibold text-white">OpenUI</span>
      </div>

      <div className="h-4 w-px bg-border flex-shrink-0" />

      <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-shrink-0">
        <Folder className="w-3 h-3" />
        <span className="font-mono truncate max-w-[150px]">{launchCwd || "~"}</span>
      </div>

      <div className="h-4 w-px bg-border flex-shrink-0" />

      {/* Canvas tabs */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-hide">
        {canvases.map((canvas) => {
          const isActive = canvas.id === activeCanvasId;
          const isPinned = canvas.id === "default";
          const count = agentCount(canvas.id);
          return (
            <button
              key={canvas.id}
              onClick={() => setActiveCanvasId(canvas.id)}
              onDoubleClick={() => handleDoubleClick(canvas.id, canvas.name)}
              title={isPinned ? "Main canvas" : "Double-click to rename"}
              className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                isActive
                  ? "bg-surface-active text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-surface"
              }`}
            >
              {editingId === canvas.id ? (
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="bg-transparent border-b border-zinc-500 text-white text-xs w-20 outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate max-w-[120px]">{canvas.name}</span>
              )}
              {count > 0 && (
                <span className={`text-[10px] px-1 rounded-full ${
                  isActive ? "bg-zinc-600 text-zinc-300" : "bg-zinc-800 text-zinc-500"
                }`}>
                  {count}
                </span>
              )}
              {!isPinned && editingId !== canvas.id && (
                <X
                  className="w-3 h-3 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                />
              )}
              {isActive && (
                <span className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-orange-500" />
              )}
            </button>
          );
        })}
        <button
          onClick={handleAddCanvas}
          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-surface transition-colors flex-shrink-0"
          title="New canvas"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </motion.button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
