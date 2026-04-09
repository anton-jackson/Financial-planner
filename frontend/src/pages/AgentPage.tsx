import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessage, type ChatResponse } from "../api/agent";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);

    try {
      const res: ChatResponse = await sendMessage(trimmed, history);
      setHistory(res.history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.response },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, history]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      <div className="p-4 border-b border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800">AI Financial Advisor</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask questions about your financial plan, run what-if scenarios, or get insights
          from your simulations.
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center py-16 space-y-4">
            <p className="text-slate-400 text-lg">Start a conversation</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "Am I on track to retire at 65?",
                "What if I save $1,000 more per month?",
                "What's my probability of running out of money?",
                "Compare my base and bear market scenarios",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200
                             text-slate-600 rounded-lg transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg px-4 py-3 text-sm text-slate-500">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
              {" "}Analyzing your finances...
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your financial plan..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300
                       px-4 py-2.5 text-sm focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium
                       rounded-lg hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
