// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import { notFound } from "next/navigation"
import type { Metadata } from "next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { GUIDES } from "@/content/guide"
import { DocsLayout } from "@/components/docs/DocsLayout"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const guide = GUIDES.find((g) => g.slug === slug)
  if (!guide) return {}
  return {
    title: `${guide.title} — NestFleet Docs`,
    description: guide.description,
  }
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const idx = GUIDES.findIndex((g) => g.slug === slug)
  if (idx === -1) notFound()

  const guide = GUIDES[idx]
  const prev = idx > 0 ? GUIDES[idx - 1] : undefined
  const next = idx < GUIDES.length - 1 ? GUIDES[idx + 1] : undefined

  return (
    <DocsLayout
      prev={prev ? { label: prev.title, href: `/docs/${prev.slug}` } : undefined}
      next={next ? { label: next.title, href: `/docs/${next.slug}` } : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2 mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-gray-900 mt-6 mb-2">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-gray-600 leading-relaxed mb-4 text-sm">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-4 text-sm leading-relaxed">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-indigo-600 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-800">{children}</strong>
          ),
          code: ({ children, className }) => {
            // inline code vs fenced code block
            const isBlock = className?.startsWith("language-")
            if (isBlock) {
              return (
                <code className="block bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono text-gray-800 overflow-x-auto whitespace-pre">
                  {children}
                </code>
              )
            }
            return (
              <code className="bg-gray-100 px-1 rounded text-xs font-mono text-gray-800">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono text-gray-800 overflow-x-auto mb-4 whitespace-pre">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-300 pl-4 py-1 my-4 text-gray-600 italic text-sm">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="even:bg-gray-50">{children}</tr>,
          th: ({ children }) => (
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="border-gray-200 my-8" />,
        }}
      >
        {guide.content}
      </ReactMarkdown>
    </DocsLayout>
  )
}
