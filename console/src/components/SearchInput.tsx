"use client";
import { useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={`relative flex items-center ${className}`}>
      <svg className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-48 rounded-lg border border-gray-300 bg-white pl-8 pr-7 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-label={placeholder}
      />
      {value && (
        <button
          onClick={() => { onChange(""); ref.current?.focus(); }}
          className="absolute right-2 text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="Clear search"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
