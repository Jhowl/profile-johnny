// AI chat widget — talks to the backend (/api/chat), streams replies, and
// captures leads via a soft gate (/api/lead). Black/orange theme to match the site.

const API_BASE = '/api';
const STORAGE_KEY = 'jc_chat_session';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline formatting on an already-escaped string: code, bold, italic, links.
function renderInline(s) {
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<em>$2</em>');
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

// Minimal, XSS-safe Markdown -> HTML for chat replies. HTML is escaped first,
// then only a whitelisted set of tags is produced. Handles bold/italic/code,
// links, bullet/numbered lists, headings (as bold), and paragraphs.
function renderMarkdown(md) {
  const lines = escapeHtml(md).split('\n');
  let html = '';
  let list = null; // 'ul' | 'ol'
  let inCode = false;
  let code = '';
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) { html += `<pre><code>${code}</code></pre>`; code = ''; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { code += line + '\n'; continue; }

    const h = line.match(/^\s*#{1,4}\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);

    if (h) {
      closeList();
      html += `<strong class="chat-h">${renderInline(h[1])}</strong>`;
    } else if (ul) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${renderInline(ul[1])}</li>`;
    } else if (ol) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${renderInline(ol[1])}</li>`;
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${renderInline(line)}</p>`;
    }
  }
  if (inCode) html += `<pre><code>${code}</code></pre>`;
  closeList();
  return html;
}

function getSessionId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = 'sess-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
    id = id.slice(0, 60);
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function initChat() {
  const root = document.getElementById('chat-root');
  if (!root) return;

  const sessionId = getSessionId();
  let leadDone = localStorage.getItem(STORAGE_KEY + '_lead') === '1';
  let busy = false;

  root.innerHTML = `
    <div class="chat-cta" id="chat-cta" hidden>
      <button class="chat-cta-close" id="chat-cta-close" aria-label="Dismiss">&times;</button>
      <span class="chat-cta-wave">👋</span>
      <div class="chat-cta-text">
        <strong>Have a question?</strong>
        <span>Chat with my AI assistant</span>
      </div>
    </div>

    <button class="chat-launcher" id="chat-launcher" aria-label="Open chat">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </button>

    <div class="chat-panel" id="chat-panel" hidden>
      <div class="chat-header">
        <div class="chat-header-title">
          <span class="chat-dot"></span> Johnny's AI
        </div>
        <button class="chat-close" id="chat-close" aria-label="Close chat">&times;</button>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <form class="chat-input" id="chat-input">
        <input type="text" id="chat-text" placeholder="Ask about Johnny's services…" autocomplete="off" maxlength="2000" />
        <button type="submit" aria-label="Send" id="chat-send">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
      <div class="chat-disclaimer">Conversations may be stored. Powered by a local AI model.</div>
    </div>
  `;

  const panel = document.getElementById('chat-panel');
  const launcher = document.getElementById('chat-launcher');
  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-input');
  const textInput = document.getElementById('chat-text');
  const sendBtn = document.getElementById('chat-send');
  const cta = document.getElementById('chat-cta');

  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  let greeted = false;
  let contactPromptShown = false;

  function hideCta(persist) {
    cta.hidden = true;
    if (persist) localStorage.setItem(STORAGE_KEY + '_cta', '1');
  }

  function openPanel() {
    panel.hidden = false;
    launcher.classList.add('open');
    hideCta(true);
    textInput.focus();
    if (!greeted) {
      greeted = true;
      addMessage('assistant', "Hi! I'm Johnny's AI assistant. Ask me about his services, projects, or how he can help with your project.");
    }
  }
  function closePanel() {
    panel.hidden = true;
    launcher.classList.remove('open');
  }

  launcher.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  document.getElementById('chat-close').addEventListener('click', closePanel);

  // Call-to-action nudge: appears once, a few seconds after load, until dismissed
  // or the chat is opened. Clicking it opens the chat.
  if (localStorage.getItem(STORAGE_KEY + '_cta') !== '1') {
    setTimeout(() => {
      if (panel.hidden) cta.hidden = false;
    }, 4000);
  }
  cta.addEventListener('click', (e) => {
    if (e.target.closest('#chat-cta-close')) return;
    openPanel();
  });
  document.getElementById('chat-cta-close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideCta(true);
  });

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = `chat-msg chat-msg-${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-assistant chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    textInput.value = '';
    addMessage('user', text);

    // If the visitor typed contact details, capture them in the background.
    if (!leadDone) {
      const match = text.match(EMAIL_RE);
      if (match) captureLead(match[0], text);
    }

    const typing = showTyping();

    let bubble = null;
    let acc = '';
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      typing.remove();
      bubble = addMessage('assistant', '');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let promptContact = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });

        // The server appends a NUL + JSON metadata frame at the very end.
        const nul = acc.indexOf('\0');
        const visible = nul === -1 ? acc : acc.slice(0, nul);
        bubble.innerHTML = renderMarkdown(visible);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        if (nul !== -1) {
          try {
            promptContact = JSON.parse(acc.slice(nul + 1)).promptContact;
          } catch { /* ignore partial */ }
        }
      }

      if (promptContact && !leadDone && !contactPromptShown) {
        contactPromptShown = true;
        addMessage('note', "💬 Enjoying the chat? If you'd like Johnny to personally follow up, just type your email (or any contact details) here and I'll pass them along.");
      }
    } catch (err) {
      if (typing.isConnected) typing.remove();
      if (bubble) {
        bubble.textContent = bubble.textContent || 'The assistant is offline right now. Please email contact@johnnycosta.dev.';
      } else {
        addMessage('assistant', 'The assistant is offline right now. Please email contact@johnnycosta.dev.');
      }
    } finally {
      busy = false;
      sendBtn.disabled = false;
      textInput.focus();
    }
  });

  // ---- Lead capture ----
  // Save contact details the visitor typed into the chat. Fire-and-forget so it
  // never interrupts the conversation; a short note confirms it landed.
  async function captureLead(email, note) {
    leadDone = true; // optimistic — avoid double-capture on the next message
    try {
      const res = await fetch(`${API_BASE}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email, message: note, source: 'chat' }),
      });
      if (!res.ok) throw new Error();
      localStorage.setItem(STORAGE_KEY + '_lead', '1');
      addMessage('note', `✅ Got it — Johnny will follow up at ${email}.`);
    } catch {
      leadDone = false; // allow a retry on a later message
    }
  }
}
