"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  displayText?: string;
  className?: string;
}

export default function CopyButton({ text, displayText, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`group inline-flex items-center gap-2 font-mono text-sm hover:text-[var(--pink-500)] transition-colors ${className}`}
      title="Click to copy"
    >
      <span className="truncate">{displayText || text}</span>
      <svg
        className={`w-4 h-4 flex-shrink-0 transition-all ${
          copied ? "text-green-400 scale-110" : "opacity-50 group-hover:opacity-100"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {copied ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        )}
      </svg>
    </button>
  );
}
