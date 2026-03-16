/**
 * Chat response formatting utilities for mobile.
 * Mirrors web implementation: processInlineFormatting, normalizeDenseListMarkdown,
 * parseNestedLists, block-level formatting.
 */

/** Inline formatting regex: bold, italic, inline code, bare URLs */
export const INLINE_FORMAT_REGEX =
  /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s]+)/g;

export type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'url'; text: string; raw: string };

/**
 * Split text into inline segments (bold, italic, code, bare URLs).
 * Matches web processInlineFormatting pattern.
 */
export function processInlineFormatting(text: string): InlineSegment[] {
  if (!text) return [];
  const parts = text.split(INLINE_FORMAT_REGEX);
  const segments: InlineSegment[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      segments.push({ type: 'bold', text: part.slice(2, -2) });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 1) {
      segments.push({ type: 'italic', text: part.slice(1, -1) });
    } else if (part.startsWith('`') && part.endsWith('`')) {
      segments.push({ type: 'code', text: part.slice(1, -1) });
    } else if (/^https?:\/\//i.test(part)) {
      segments.push({ type: 'url', text: part, raw: part });
    } else {
      segments.push({ type: 'text', text: part });
    }
  }
  return segments.length ? segments : [{ type: 'text', text }];
}

/**
 * Normalize run-on list text into proper bullets.
 * Same as web normalizeDenseListMarkdown.
 */
export function normalizeDenseListMarkdown(text: string): string {
  let s = text || '';
  s = s.replace(/\.\s*-\s*\*\*/g, '\n- **');
  s = s.replace(/\.\s+-\s+\*\*/g, '\n- **');
  s = s.replace(/:\s*-\s*\*\*/g, ':\n\n- **');
  s = s.replace(/(["'])\s*-\s*\*\*/g, '$1\n- **');
  return s;
}

export interface NestedListItem {
  level: number;
  content: string;
  isNumbered: boolean;
  number?: number;
}

/**
 * Parse nested bullet and numbered lists with indentation.
 * Bullet: ^[-*•]\s+(.*)$
 * Numbered: ^(\d+)\.\s+(.*)$
 * Indentation: Math.floor(indent / 2) for nesting level
 */
export function parseNestedLists(lines: string[]): NestedListItem[] {
  const items: NestedListItem[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const level = Math.floor(indent / 2);

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      items.push({
        level,
        content: bulletMatch[1],
        isNumbered: false,
      });
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      items.push({
        level,
        content: numberedMatch[2],
        isNumbered: true,
        number: parseInt(numberedMatch[1], 10),
      });
      continue;
    }
  }
  return items;
}

/** Markdown link pattern [text](url) */
export const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

export interface ParsedMarkdownLink {
  fullMatch: string;
  text: string;
  url: string;
  start: number;
  end: number;
}

export function parseMarkdownLinks(text: string): ParsedMarkdownLink[] {
  const links: ParsedMarkdownLink[] = [];
  let m: RegExpExecArray | null;
  MARKDOWN_LINK_REGEX.lastIndex = 0;
  while ((m = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    links.push({
      fullMatch: m[0],
      text: m[1],
      url: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return links;
}

/** Block types for block-level formatting */
export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'code_block'
  | 'ul'
  | 'ol';

export interface FormattedBlock {
  type: BlockType;
  content: string;
  /** For lists: parsed items */
  items?: NestedListItem[];
  /** For code blocks: language hint if present */
  language?: string;
}

/**
 * Parse content into block-level elements: headers, code blocks, lists, paragraphs.
 */
export function parseBlocks(content: string): FormattedBlock[] {
  const blocks: FormattedBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Headers
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      blocks.push({ type: 'h1', content: h1Match[1] });
      i++;
      continue;
    }
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      blocks.push({ type: 'h2', content: h2Match[1] });
      i++;
      continue;
    }
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      blocks.push({ type: 'h3', content: h3Match[1] });
      i++;
      continue;
    }

    // Code block
    const codeStartMatch = trimmed.match(/^```(\w*)\s*$/);
    if (codeStartMatch) {
      const lang = codeStartMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const codeLine = lines[i];
        if (codeLine.trim() === '```') {
          i++;
          break;
        }
        codeLines.push(codeLine);
        i++;
      }
      blocks.push({
        type: 'code_block',
        content: codeLines.join('\n'),
        language: lang,
      });
      continue;
    }

    // Bullet list
    if (/^[-*•]\s+\S/.test(trimmed) || /^-\s*\*\*/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (!t) {
          i++;
          break;
        }
        if (/^[-*•]\s+\S/.test(t) || /^-\s*\*\*/.test(t) || /^\d+\.\s+\S/.test(t)) {
          listLines.push(l);
          i++;
        } else {
          // Continuation line - append to last item if short/indented
          const lastIdx = listLines.length - 1;
          if (lastIdx >= 0 && (l.startsWith('  ') || t.length < 80)) {
            listLines[lastIdx] = listLines[lastIdx] + '\n' + l;
            i++;
          } else {
            break;
          }
        }
      }
      const items = parseNestedLists(listLines);
      blocks.push({
        type: items.some((it) => it.isNumbered) ? 'ol' : 'ul',
        content: '',
        items,
      });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+\S/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (!t) {
          i++;
          break;
        }
        if (/^\d+\.\s+\S/.test(t) || /^[-*•]\s+\S/.test(t)) {
          listLines.push(l);
          i++;
        } else {
          const lastIdx = listLines.length - 1;
          if (lastIdx >= 0 && (l.startsWith('  ') || t.length < 80)) {
            listLines[lastIdx] = listLines[lastIdx] + '\n' + l;
            i++;
          } else {
            break;
          }
        }
      }
      const items = parseNestedLists(listLines);
      blocks.push({ type: 'ol', content: '', items });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (!t) {
        i++;
        break;
      }
      if (
        /^#\s+/.test(t) ||
        /^##\s+/.test(t) ||
        /^###\s+/.test(t) ||
        t.startsWith('```') ||
        /^[-*•]\s+\S/.test(t) ||
        /^\d+\.\s+\S/.test(t)
      ) {
        break;
      }
      paraLines.push(l);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}
