import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useAgent } from "./AgentContext";
import { sendMessage, type ChatResponse } from "../../api/agent";

export function AgentPanel() {
  const { isOpen, close, messages, setMessages, history, setHistory } = useAgent();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

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
  }, [input, loading, history, setMessages, setHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={close}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-white shadow-2xl
                     border-l border-slate-200 z-50 flex flex-col
                     transition-transform duration-300 ease-in-out
                     ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">AI Advisor</h2>
            <p className="text-xs text-slate-500">Ask about your financial plan</p>
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600
                       hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-center py-12 space-y-3">
              <p className="text-slate-400 text-sm">Start a conversation</p>
              <div className="flex flex-col gap-1.5">
                {[
                  "Am I on track to retire at 65?",
                  "What if I save $1,000 more per month?",
                  "What's my probability of running out of money?",
                  "Compare my base and bear scenarios",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200
                               text-slate-600 rounded-md transition-colors text-left"
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
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
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
              <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
                {" "}Analyzing...
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 p-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-slate-300
                         px-3 py-2 text-sm focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || loading}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium
                         rounded-lg hover:bg-blue-700 disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
