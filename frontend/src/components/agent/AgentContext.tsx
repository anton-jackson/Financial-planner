import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentContextValue {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  messages: AgentMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
  history: Record<string, unknown>[];
  setHistory: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AgentContext.Provider
      value={{ isOpen, toggle, open, close, messages, setMessages, history, setHistory }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
