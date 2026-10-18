"use client";

import React from "react";
import { ChevronRightIcon } from "./icons";

export function ResearchBanner() {
  const steps = [
    { label: "Gemini", desc: "Understands the question" },
    { label: "Agent", desc: "Plans which checks to run" },
    { label: "Tools", desc: "Scam, fraud, audit, portfolio" },
    { label: "Evidence", desc: "What the tools returned" },
    { label: "Grounding", desc: "No invented figures" },
    { label: "Explanation", desc: "Your language" },
    { label: "Safety checks", desc: "Privacy and advice limits" },
    { label: "Trust Panel", desc: "Nothing happens without you" },
  ];

  return (
    <section className="mb-6 rounded-xl border border-blue-200/80 bg-white p-4 shadow-xs dark:border-blue-900/50 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-blue-600"></span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
            How an answer is made
          </h3>
        </div>
        <span className="text-[11px] text-neutral-500">Every step is logged</span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {steps.map((step, idx) => (
          <React.Fragment key={step.label}>
            <div className="flex shrink-0 flex-col rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-neutral-800 dark:bg-neutral-800/60">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">{step.label}</span>
              <span className="text-[10px] text-neutral-500">{step.desc}</span>
            </div>
            {idx < steps.length - 1 && (
              <ChevronRightIcon className="size-3.5 shrink-0 text-blue-500 opacity-60" />
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
