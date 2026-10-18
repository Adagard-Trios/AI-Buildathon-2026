"use client";

import React, { useState } from "react";
import { ChatMessage } from "./types";
import { SUGGESTED_QUESTIONS } from "./mockData";
import { RichText } from "./RichText";
import { BotIcon, SparklesIcon, ChevronRightIcon, WrenchIcon } from "./icons";

import { ApiError, request } from "@/lib/api/client";
import { LANGS, listen, speak, voiceInputSupported, type Lang } from "@/lib/voice";

// Module-level so they run only from event handlers, never during render.
let seq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now()}_${seq++}`;
const clockLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface Props {
  onNavigateToExplanation: () => void;
}

export function ChatScreen({ onNavigateToExplanation }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);  // every user starts with their own, empty conversation
  const [inputText, setInputText] = useState("");
  const [isSimulatingResponse, setIsSimulatingResponse] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const handleMic = async () => {
    setVoiceNote(null);
    setListening(true);
    try {
      void handleSendMessage(await listen(lang));
    } catch (cause) {
      setVoiceNote(cause instanceof Error ? cause.message : "Voice input failed");
    } finally {
      setListening(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isSimulatingResponse) return;

    const userMsg: ChatMessage = {
      id: newId("usr"),
      sender: "user",
      text: text,
      timestamp: clockLabel(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");
    setIsSimulatingResponse(true);

    try {
      // Call live FastAPI backend at http://localhost:8003/assistant/chat
      const response = await request<{
        answer: string;
        agent_execution?: { tools_used?: string[] };
        evidence?: Array<{ tool: string; result: unknown }>;
      }>("assistant", "/assistant/chat", {
        method: "POST",
        body: { message: `${lang !== "en" ? `[Reply in ${LANGS.find((l) => l.code === lang)?.label}] ` : ""}${text}` },
      });

      const assistantMsg: ChatMessage = {
        id: newId("ast"),
        sender: "assistant",
        text: response.answer || "No response received.",
        timestamp: clockLabel(),
        toolsCalled: response.agent_execution?.tools_used || [],
        evidenceUsed: (response.evidence || []).map((e) => e.tool),
        hasWhyButton: true,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (!speak(assistantMsg.text, lang) && lang !== "en") setVoiceNote("No voice installed for this language; showing text only.");
    } catch (cause) {
      // No invented answer when the assistant is unreachable. A canned reply with figures
      // that no tool produced is exactly what the grounding validator exists to prevent.
      setMessages((prev) => [
        ...prev,
        {
          id: newId("ast"),
          sender: "assistant",
          text: `The assistant is unavailable right now, so there is no answer to show. ${
            cause instanceof ApiError ? cause.message : "Please try again shortly."
          }`,
          timestamp: clockLabel(),
          toolsCalled: [],
          evidenceUsed: [],
          hasWhyButton: false,
        },
      ]);
    } finally {
      setIsSimulatingResponse(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Title & Subtitle Header */}
      <div className="rounded-xl border border-black/10 bg-white p-5 shadow-xs dark:border-white/15 dark:bg-neutral-900">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          How can I help you today?
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ask about your financial decisions, transactions, risk or portfolio.
        </p>
      </div>

      {/* Expandable Agent Activity Panel */}

      {/* Messages Thread Container */}
      <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-xs dark:border-white/15 dark:bg-neutral-900 sm:p-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Sender Label */}
            <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-400">
              {msg.sender === "assistant" ? (
                <>
                  <BotIcon className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-blue-900 dark:text-blue-300">FirstStep</span>
                </>
              ) : (
                <span className="font-medium">You</span>
              )}
              <span>· {msg.timestamp}</span>
            </div>

            {/* Message Bubble */}
            <div
              className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                msg.sender === "user"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "border border-neutral-200 bg-neutral-50 text-neutral-900 shadow-2xs dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
              }`}
            >
              {msg.sender === "assistant" ? <RichText text={msg.text} /> : msg.text}

              {/* Assistant Evidence & Tool Attachments */}
              {msg.sender === "assistant" && (
                <div className="mt-3.5 border-t border-neutral-200/80 pt-3 dark:border-neutral-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Evidence Badges */}
                    {msg.evidenceUsed && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-500">
                          Evidence used:
                        </span>
                        {msg.evidenceUsed.map((ev) => (
                          <span
                            key={ev}
                            className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/60"
                          >
                            ✓ {ev}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tools Called Badge */}
                    {msg.toolsCalled && (
                      <span className="flex items-center gap-1 rounded-full bg-neutral-200/70 px-2.5 py-0.5 text-[11px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        <WrenchIcon className="size-3" />
                        {msg.toolsCalled.length} {msg.toolsCalled.length === 1 ? "tool" : "tools"} called
                      </span>
                    )}
                  </div>

                  {/* View Why? Button */}
                  {msg.hasWhyButton && (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-neutral-400 italic">
                        Written by Gemini from the tool evidence, then checked
                      </span>
                      <button
                        onClick={onNavigateToExplanation}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/20 active:scale-98"
                      >
                        <span>View Why?</span>
                        <ChevronRightIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isSimulatingResponse && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <BotIcon className="size-4 animate-bounce text-blue-600" />
            <span>Agentic LLM is analyzing evidence and calling tools...</span>
          </div>
        )}
      </div>

      {/* Suggested Questions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-500">Suggested:</span>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => handleSendMessage(q)}
            className="flex items-center gap-1 rounded-full border border-blue-200/80 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-900/50 dark:bg-neutral-900 dark:text-blue-300 dark:hover:bg-neutral-800"
          >
            <SparklesIcon className="size-3 text-blue-500" />
            <span>{q}</span>
          </button>
        ))}
      </div>

      {voiceNote && <p className="text-xs text-amber-600">{voiceNote}</p>}

      {/* Chat Input Box */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/15 bg-white p-2 shadow-xs dark:border-white/20 dark:bg-neutral-900">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder="Ask the financial assistant..."
          className="min-w-0 flex-1 basis-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-neutral-400 sm:basis-auto"
        />
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label="Language"
          className="rounded-lg border border-neutral-300 bg-transparent px-2 py-2 text-sm"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        {voiceInputSupported() && (
          <button
            onClick={handleMic}
            disabled={listening || isSimulatingResponse}
            aria-label="Speak"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            {listening ? "Listening…" : "🎤"}
          </button>
        )}
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isSimulatingResponse}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40 sm:ml-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
