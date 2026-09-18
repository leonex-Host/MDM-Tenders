import { getApiBase, authFetch } from '../utils/api.js';

function parseMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    const blocks = html.split(/\n\n+/);
    return blocks.map(block => {
        if (block.trim().startsWith('â€¢') || block.trim().startsWith('-')) {
            const listItems = block.split('\n').filter(l => l.trim().length > 0)
                .map(l => `<li>${l.replace(/^[-â€¢]\s*/, '')}</li>`).join('');
            return `<ul>${listItems}</ul>`;
        }
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');
}

export function renderAIOverview(container) {
    container.classList.add('no-scroll-panel');
    let sessionId = null;

    container.innerHTML = `
        <div class="ai-chat-layout is-empty anim-in" id="ai-chat-layout">
            

            <div class="ai-chat-history" id="ai-chat-history">
                <div class="chat-history-inner" id="chat-messages-container">
                    <!-- Original Empty State -->
                    <div class="chat-hero-empty anim-in anim-d1" id="chat-hero">
                        <div class="chat-hero-header">
                            <h1>âœ¦ Hi, I'm Leonex AI</h1>
                        </div>
                        <p>How can I help you today?</p>
                        <div class="chat-quick-actions anim-in anim-d2" id="quick-actions">
                            <button class="chat-pill" data-prompt="Find fast tenders"><i data-lucide="zap" style="width:14px; height:14px;"></i> Fast</button>
                            <button class="chat-pill" data-prompt="Show in-depth analysis"><i data-lucide="lightbulb" style="width:14px; height:14px;"></i> In-depth</button>
                            <button class="chat-pill" data-prompt="Show technical tenders"><i data-lucide="code-xml" style="width:14px; height:14px;"></i> Technical</button>
                            <button class="chat-pill" data-prompt="Holistic view of tenders"><i data-lucide="box" style="width:14px; height:14px;"></i> Holistic</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ai-chat-bottom-bar anim-in anim-d3">
                <div class="chat-prompt-box">
                    <div class="chat-input-wrapper">
                        <textarea id="chat-input" placeholder="Ask anything..." rows="1"></textarea>
                        <div class="chat-status-dot" style="display:none;"></div>
                    </div>
                    <div class="chat-prompt-actions">
                        <button class="chat-action-btn icon-only" aria-label="Attach File">
                            <i data-lucide="paperclip" style="width:16px;" stroke-width="1.5"></i>
                        </button>
                        <button class="chat-action-btn with-text">
                            <i data-lucide="search" style="width:16px;" stroke-width="1.5"></i> Deep search
                        </button>
                        <button class="chat-action-btn with-text">
                            <i data-lucide="globe" style="width:16px;" stroke-width="1.5"></i> Search
                        </button>
                        <div style="flex:1;"></div>
                        <button class="cw-send-btn" id="chat-send-btn" aria-label="Send Message">
                            <i data-lucide="arrow-up" style="width:16px;" stroke-width="1.5"></i>
                        </button>
                    </div>
                </div>
                <div class="chat-disclaimer">Leonex AI can make mistakes. Consider verifying important information.</div>
            </div>
        </div>
    `;

    lucide.createIcons({ root: container });

    // â”€â”€ Chat Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const msgContainer = document.getElementById('chat-messages-container');
    const heroEl       = document.getElementById('chat-hero');
    const inputEl      = document.getElementById('chat-input');
    const sendBtn      = document.getElementById('chat-send-btn');
    const historyPanel = document.getElementById('ai-chat-history');
    const layoutEl     = document.getElementById('ai-chat-layout');
    const splineBg     = document.getElementById('spline-bg-wrapper');
    let isWaiting = false;

    // Check backend health
    authFetch('${getApiBase()}/ai/health', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            const statusEl = document.getElementById('ai-status-indicator');
            if (!statusEl) return;
            if (data.ollama_connected) {
                statusEl.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-google-blue);"></div> DeepSeek Active`;
            } else {
                statusEl.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-orange);"></div> Basic Mode`;
            }
        }).catch(() => {});

    function scrollToBottom() {
        requestAnimationFrame(() => { historyPanel.scrollTop = historyPanel.scrollHeight; });
    }

    function removeHero() {
        if (heroEl && heroEl.parentNode) {
            heroEl.parentNode.removeChild(heroEl);
            layoutEl.classList.remove('is-empty');
            if (splineBg) {
                splineBg.style.opacity = '0';
                setTimeout(() => { splineBg.style.display = 'none'; }, 600);
            }
        }
    }

    function appendMessage(role, text) {
        removeHero();
        const row = document.createElement('div');
        row.className = `chat-msg-row ${role} anim-in`;
        const content = role === 'assistant'
            ? parseMarkdown(text)
            : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        row.innerHTML = `<div class="chat-bubble">${content}</div>`;
        msgContainer.appendChild(row);
        scrollToBottom();
    }

    function appendTypingIndicator() {
        removeHero();
        const row = document.createElement('div');
        row.className = 'chat-msg-row assistant typing-indicator-row';
        row.innerHTML = `
            <div class="chat-bubble" style="padding:10px 16px;">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>`;
        msgContainer.appendChild(row);
        scrollToBottom();
        return row;
    }

    async function sendMessage(text) {
        if (!text.trim() || isWaiting) return;
        isWaiting = true;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        appendMessage('user', text);
        const typingEl = appendTypingIndicator();

        try {
            const response = await authFetch('${getApiBase()}/ai/chat', {
                cache: 'no-store', method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, session_id: sessionId })
            });
            typingEl.remove();
            if (!response.body) throw new Error('ReadableStream not supported');

            const row = document.createElement('div');
            row.className = 'chat-msg-row assistant anim-in';
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble';
            bubble.innerHTML = `<div class="typing-indicator" style="margin:5px 0;"><div class="typing-dot"></div></div>`;
            row.appendChild(bubble);
            msgContainer.appendChild(row);

            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedText = '', buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (let line of parts) {
                    if (line.trim().startsWith('data:')) {
                        try {
                            const payload = JSON.parse(line.substring(line.indexOf('{')));
                            if (payload.type === 'meta' && payload.session_id) sessionId = payload.session_id;
                            else if (payload.type === 'chunk') {
                                accumulatedText += payload.text;
                                bubble.innerHTML = parseMarkdown(accumulatedText);
                                scrollToBottom();
                            }
                        } catch(e) { console.error('Stream parse error:', e); }
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            if (typingEl && typingEl.parentNode) typingEl.remove();
            appendMessage('assistant', 'âš ï¸ Sorry, I encountered an error communicating with the AI. Ensure the engine is running.');
        } finally {
            isWaiting = false;
            inputEl.focus();
        }
    }

    inputEl.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
        if (this.value === '') this.style.height = 'auto';
    });
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
    });
    sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

    container.querySelectorAll('.chat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const prompt = pill.getAttribute('data-prompt');
            if (prompt) sendMessage(prompt);
        });
    });
}
