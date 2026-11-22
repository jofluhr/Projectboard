import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Links in notes open in a new tab, so the board stays open.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown to safe HTML. Raw HTML in the notes is sanitized, scripts never run. */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false, gfm: true, breaks: true })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}
