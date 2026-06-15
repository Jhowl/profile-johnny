// AI chat widget — talks to the backend (/api/chat), streams replies, and
// captures leads via a soft gate (/api/lead). Black/orange theme to match the site.

const API_BASE = '/api';
const STORAGE_KEY = 'jc_chat_session';

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
      <div class="chat-lead" id="chat-lead" hidden>
        <p class="chat-lead-intro">Want Johnny to follow up? Leave your details:</p>
        <input type="text" id="lead-name" placeholder="Your name" />
        <input type="email" id="lead-email" placeholder="your@email.com" />
        <button class="btn btn-primary chat-lead-send" id="lead-send">Send</button>
        <button class="chat-lead-skip" id="lead-skip">Maybe later</button>
        <div class="chat-lead-status" id="lead-status"></div>
      </div>
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
  const leadBox = document.getElementById('chat-lead');

  let greeted = false;

  function openPanel() {
    panel.hidden = false;
    launcher.classList.add('open');
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
        bubble.textContent = visible;
        messagesEl.scrollTop = messagesEl.scrollHeight;

        if (nul !== -1) {
          try {
            promptContact = JSON.parse(acc.slice(nul + 1)).promptContact;
          } catch { /* ignore partial */ }
        }
      }

      if (promptContact && !leadDone) showLeadForm();
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
  function showLeadForm() {
    leadBox.hidden = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  document.getElementById('lead-skip').addEventListener('click', () => {
    leadBox.hidden = true;
  });

  document.getElementById('lead-send').addEventListener('click', async () => {
    const name = document.getElementById('lead-name').value.trim();
    const email = document.getElementById('lead-email').value.trim();
    const status = document.getElementById('lead-status');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.textContent = 'Please enter a valid email.';
      status.className = 'chat-lead-status error';
      return;
    }
    status.textContent = 'Sending…';
    status.className = 'chat-lead-status';
    try {
      const res = await fetch(`${API_BASE}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, name, email, source: 'chat' }),
      });
      if (!res.ok) throw new Error();
      leadDone = true;
      localStorage.setItem(STORAGE_KEY + '_lead', '1');
      leadBox.hidden = true;
      addMessage('assistant', `Thanks${name ? ', ' + name : ''}! Johnny will reach out. Feel free to keep chatting.`);
    } catch {
      status.textContent = 'Something went wrong. Email contact@johnnycosta.dev directly.';
      status.className = 'chat-lead-status error';
    }
  });
}
