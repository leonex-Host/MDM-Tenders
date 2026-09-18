// ============================================
// LEONEX TENDER — Quick Notes UI Revamp
// Reference: Image Mock (Masonry Grid & ChatGPT style Editor)
// ============================================

const STORAGE_KEY = 'leonex-mdm-notes';

const defaultNotes = [
    {
        id: "proj_" + Date.now().toString(),
        title: "Tender AI Discovery Engine (Phase 1)",
        content: "Overview\nDeveloping an enterprise-grade automated tender discovery pipeline that parses government portals (GEM, BHEL) specifically for Material Codification requirements.\n\nKey Requirements\n1. Real-time DOM parsing utilizing stealth-mode Puppeteer.\n2. Natural Language Processing (LLaMA) to extract 'YES/NO' eligibility.\n3. Daily automated export into dual-purpose Excel dashboards.\n\nTo-Do List\n- Configure proxy rotations.\n- Implement layout reflow handlers.\n- Tune LLM intent parsing.",
        folder: "all",
        updated: new Date().toISOString()
    },
    {
        id: "proj_" + (Date.now() - 86400000).toString(),
        title: "Leonex Premium Dashboard Refactor",
        content: "Architecture Audit\nTransitioning from legacy monolithic styling to a modern, variable-driven glassmorphic UI system tailored for rapid enterprise data processing.\n\nKey Design Tokens\n- Base background: Pure White (#FFFFFF).\n- Typography: Scaled down base sizes for denser data layout.\n\nNext Steps\n- Execute cross-browser Q&A for Masonry CSS Grid.\n- Finalize ChatGPT-style split layout for Notes module.",
        folder: "all",
        updated: new Date(Date.now() - 86400000).toISOString()
    }
];

function _getNotes() {
    try { 
        let raw = localStorage.getItem(STORAGE_KEY);
        let parsed = raw ? JSON.parse(raw) : [];
        if (parsed.length === 0) {
            _saveNotes(defaultNotes);
            return defaultNotes;
        }
        return parsed;
    }
    catch { return defaultNotes; }
}

function _saveNotes(notes) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
        console.error("Failed to save notes:", e);
    }
}

function formatNoteDate(isoString) {
    const d = new Date(isoString);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    // Return like "March 24" or "October 18, 2025" depending on if current year
    return `${month} ${day}${year !== new Date().getFullYear() ? `, ${year}` : ''}`;
}

export function renderNotes(container) {
    container.classList.add('no-scroll-panel'); // Ensures custom overflow handles scrolling

    let notes = _getNotes();
    let state = {
        viewMode: 'grid', // 'grid' | 'chat'
        activeFolder: 'all',
        activeNoteId: null,
        searchQuery: ''
    };

    const folders = [
        { id: 'all', label: 'All Notes', icon: 'layers' },
        { id: 'archive', label: 'Archive', icon: 'archive' }
    ];

    function getFilteredNotes() {
        return notes.filter(n => {
            const nFolder = n.folder || 'uncategorised';
            let matchFolder;
            if (state.activeFolder === 'all') {
                // All Notes: exclude archived notes
                matchFolder = nFolder !== 'archive';
            } else {
                matchFolder = nFolder === state.activeFolder;
            }
            const q = state.searchQuery.toLowerCase();
            const matchSearch = q === '' || (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q);
            return matchFolder && matchSearch;
        });
    }

    function render() {
        if (state.viewMode === 'grid') {
            renderGrid();
        } else {
            renderChat();
        }
    }

    // ──────────────────────────────────────────
    // DASHBOARD / GRID VIEW
    // ──────────────────────────────────────────
    function renderGrid() {
        const filtered = getFilteredNotes();
        const folderName = folders.find(f => f.id === state.activeFolder)?.label || 'Notes';

        container.innerHTML = `
            <div class="qn-layout anim-in">
                <!-- Sidebar -->
                <div class="qn-sidebar">
                    <div class="qn-sidebar-title">
                        <div class="qn-sidebar-title-icon"><i data-lucide="square-pen" style="width:28px; height:28px; color:var(--text-primary);"></i></div> New Project
                    </div>

                    ${state.activeFolder !== 'archive' ? `
                    <button class="qn-create-note-btn" id="btn-create-new">
                        <span class="qn-folder-icon"><i data-lucide="plus" style="width:16px;"></i></span> Create New Note
                    </button>
                    ` : ''}     

                    ${folders.map(f => `
                        <button class="qn-folder-btn ${state.activeFolder === f.id ? 'active' : ''}" data-folder="${f.id}">
                            <span class="qn-folder-icon"><i data-lucide="${f.icon}" style="width:16px;"></i></span> ${f.label}
                        </button>
                    `).join('')}
                </div>

                <!-- Main Grid -->
                <div class="qn-main">
                    <div class="qn-main-header">
                        <div class="qn-header-title">${folderName} (${filtered.length})</div>
                        <div style="display:flex; gap:16px; align-items:center;">
                            <div class="qn-header-search">
                                <i data-lucide="search" style="width:16px;"></i>
                                <input type="text" id="qn-search" placeholder="Search all notes and text..." value="${_esc(state.searchQuery)}">
                            </div>
                            <button class="btn-icon" style="color:var(--text-tertiary);"><i data-lucide="settings" style="width:18px;"></i></button>
                        </div>
                    </div>

                    ${filtered.length === 0 ? `
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-tertiary); gap:16px; opacity:0.6;">
                            <i data-lucide="file-signature" style="width:48px;height:48px;opacity:0.6;"></i>
                            <div>No notes found in this folder.</div>
                        </div>
                    ` : `
                        <div class="qn-grid">
                            ${filtered.map(n => `
                                <div class="qn-card anim-in anim-d1" data-id="${n.id}">
                                    <div class="qn-card-title">
                                        <span>${_esc(n.title || 'Untitled Note')}</span>
                                        <i data-lucide="more-vertical" class="qn-card-dots" style="width:14px;"></i>
                                    </div>
                                    <div class="qn-card-preview">${_esc(n.content || '...').substring(0, 150)}</div>
                                    <div class="qn-card-date">${formatNoteDate(n.updated)}</div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Events
        container.querySelector('#btn-create-new')?.addEventListener('click', createAndOpenNote);

        container.querySelectorAll('.qn-folder-btn[data-folder]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeFolder = btn.getAttribute('data-folder');
                render();
            });
        });

        const searchInp = container.querySelector('#qn-search');
        if (searchInp) {
            searchInp.addEventListener('input', (e) => {
                state.searchQuery = e.target.value;
                renderGridBodyOnly(); 
            });
        }

        container.querySelectorAll('.qn-card').forEach(card => {
            card.addEventListener('click', () => {
                state.activeNoteId = card.getAttribute('data-id');
                state.viewMode = 'chat';
                render();
            });
        });
    }

    // Helper for fast search re-renders without breaking focus
    function renderGridBodyOnly() {
        const filtered = getFilteredNotes();
        const main = container.querySelector('.qn-main');
        if(!main) return;
        
        main.querySelector('.qn-header-title').textContent = `${folders.find(f => f.id === state.activeFolder)?.label || 'Notes'} (${filtered.length})`;
        
        let gridArea = main.querySelector('.qn-grid') || main;
        // Re-inject Grid safely
        const gridHtml = filtered.length === 0 ? `
             <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-tertiary); gap:16px; opacity:0.6;">
                 <i data-lucide="file-signature" style="width:48px;height:48px;opacity:0.6;"></i>
                 <div>No notes found.</div>
             </div>` 
        : `
             <div class="qn-grid">
                 ${filtered.map(n => `
                     <div class="qn-card anim-in anim-d1" data-id="${n.id}">
                         <div class="qn-card-title">
                             <span>${_esc(n.title || 'Untitled Note')}</span>
                             <i data-lucide="more-vertical" class="qn-card-dots" style="width:14px;"></i>
                         </div>
                         <div class="qn-card-preview">${_esc(n.content || '...')}</div>
                         <div class="qn-card-date">${formatNoteDate(n.updated)}</div>
                     </div>
                 `).join('')}
             </div>
        `;
        
        const existingGrid = main.querySelector('.qn-grid');
        if (existingGrid) existingGrid.outerHTML = gridHtml;
        else if (filtered.length === 0) {
           const empty = main.querySelector('.qn-main > div:nth-child(2)');
           if(empty) empty.outerHTML = gridHtml;
        }

        if (window.lucide) window.lucide.createIcons({ root: main });

        // Rebind cards
        container.querySelectorAll('.qn-card').forEach(card => {
            card.addEventListener('click', () => {
                state.activeNoteId = card.getAttribute('data-id');
                state.viewMode = 'chat';
                render();
            });
        });
    }

    // ──────────────────────────────────────────
    // CHATGPT-STYLE EDITOR VIEW
    // ──────────────────────────────────────────
    function renderChat() {
        const active = notes.find(n => n.id === state.activeNoteId) || notes[0];
        if (!active) {
            state.viewMode = 'grid';
            render();
            return;
        }

        container.innerHTML = `
            <div class="qchat-layout anim-fade-in">
                <!-- Left History Sidebar -->
                <div class="qchat-sidebar">
                    <div class="qchat-sidebar-top">
                        <button class="qchat-btn qchat-btn-back" title="Back to Dashboard"><i data-lucide="arrow-left" style="width:18px;"></i></button>
                        <button class="qchat-btn qchat-btn-new"><i data-lucide="edit" style="width:16px;"></i> New Note</button>
                    </div>

                    <div style="font-size:11px; font-weight:700; color:var(--text-tertiary); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:12px; padding:0 4px;">Previous Notes</div>
                    <div class="qchat-history-list">
                        ${notes.map(n => `
                            <div class="qchat-history-item ${n.id === state.activeNoteId ? 'active' : ''}" data-id="${n.id}" title="${_esc(n.title||'Untitled')}">
                                <div class="qchat-hi-title">${_esc(n.title || 'Untitled Note')}</div>
                                <div class="qchat-hi-date">${formatNoteDate(n.updated)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Right Editor -->
                <div class="qchat-editor-area">
                    <div class="qchat-editor-inner">
                        <div class="qchat-meta-bar">
                            <span id="qchat-date">${formatNoteDate(active.updated)}</span>
                            <div class="qchat-meta-actions">
                                ${active.folder === 'archive' ? `
                                    <button id="qchat-restore" style="color:#10B981; font-weight:700;"><i data-lucide="rotate-ccw" style="width:14px;"></i> Restore</button>
                                    <button id="qchat-delete-perm" style="color:#EF4444; font-weight:600;"><i data-lucide="trash-2" style="width:14px;"></i> Delete Permanently</button>
                                ` : `
                                    <button id="qchat-delete"><i data-lucide="trash-2" style="width:14px;"></i> Delete</button>
                                    <button id="qchat-save" style="color: #10B981; font-weight: 700;"><i data-lucide="check" style="width:16px;"></i> Save</button>
                                `}
                            </div>
                        </div>

                        <input type="text" id="qchat-title" class="qchat-title-input" placeholder="Note Title..." value="${_esc(active.title || '')}">
                        <textarea id="qchat-body" class="qchat-body-input" placeholder="Start typing...">${active.content || ''}</textarea>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // View Actions
        container.querySelector('.qchat-btn-back')?.addEventListener('click', () => {
            state.viewMode = 'grid';
            render();
        });
        container.querySelector('#qchat-save')?.addEventListener('click', () => {
            state.viewMode = 'grid';
            render();
        });
        container.querySelector('.qchat-btn-new')?.addEventListener('click', createAndOpenNote);
        
        // Delete → archive (from All Notes view)
        container.querySelector('#qchat-delete')?.addEventListener('click', () => {
            const note = notes.find(n => n.id === state.activeNoteId);
            if (!note) return;
            note.folder = 'archive';
            note.updated = new Date().toISOString();
            _saveNotes(notes);
            // Go back to grid and show All Notes
            state.activeNoteId = null;
            state.activeFolder = 'all';
            state.viewMode = 'grid';
            render();
        });

        // Restore → move back to All Notes
        container.querySelector('#qchat-restore')?.addEventListener('click', () => {
            const note = notes.find(n => n.id === state.activeNoteId);
            if (!note) return;
            note.folder = 'uncategorised';
            note.updated = new Date().toISOString();
            _saveNotes(notes);
            // Stay in archive view, pick next archived note
            const remaining = notes.filter(n => n.id !== state.activeNoteId && n.folder === 'archive');
            if (remaining.length > 0) {
                state.activeNoteId = remaining[0].id;
                render();
            } else {
                state.activeNoteId = null;
                state.viewMode = 'grid';
                render();
            }
        });

        // Permanently delete from archive
        container.querySelector('#qchat-delete-perm')?.addEventListener('click', () => {
            notes = notes.filter(n => n.id !== state.activeNoteId);
            _saveNotes(notes);
            const remaining = notes.filter(n => n.folder === 'archive');
            if (remaining.length > 0) {
                state.activeNoteId = remaining[0].id;
                render();
            } else {
                state.activeNoteId = null;
                state.viewMode = 'grid';
                render();
            }
        });

        // Sidebar History Switching
        container.querySelectorAll('.qchat-history-item').forEach(el => {
            el.addEventListener('click', () => {
                if (state.activeNoteId !== el.dataset.id) {
                    state.activeNoteId = el.dataset.id;
                    render();
                }
            });
        });

        // Editor Auto-save
        const inpTitle = container.querySelector('#qchat-title');
        const inpBody = container.querySelector('#qchat-body');

        if (inpTitle) inpTitle.addEventListener('input', () => saveActiveNote(inpTitle.value, inpBody.value));
        if (inpBody) inpBody.addEventListener('input', () => saveActiveNote(inpTitle.value, inpBody.value));
    }

    // ──────────────────────────────────────────
    // SHARED LOGIC
    // ──────────────────────────────────────────
    function createAndOpenNote() {
        // Block creation inside Archive - archive is read-only
        if (state.activeFolder === 'archive') return;
        const folder = 'uncategorised';
        const newNote = { 
            id: Date.now().toString(), 
            title: '', 
            content: '', 
            folder: folder,
            updated: new Date().toISOString() 
        };
        notes.unshift(newNote);
        _saveNotes(notes);
        state.activeNoteId = newNote.id;
        state.viewMode = 'chat';
        render();
        setTimeout(() => document.getElementById('qchat-title')?.focus(), 50);
    }

    function saveActiveNote(tVal, bVal) {
        let note = notes.find(n => n.id === state.activeNoteId);
        if (note) {
            note.title = tVal;
            note.content = bVal;
            note.updated = new Date().toISOString();
            _saveNotes(notes);

            // Update history sidebar live without full re-render
            const historyItem = container.querySelector(`.qchat-history-item[data-id="${state.activeNoteId}"]`);
            if (historyItem) {
                const titleEl = historyItem.querySelector('.qchat-hi-title');
                const dateEl = historyItem.querySelector('.qchat-hi-date');
                if (titleEl) titleEl.textContent = tVal || 'Untitled Note';
                if (dateEl) dateEl.textContent = formatNoteDate(note.updated);
            }
            const dateSpan = container.querySelector('#qchat-date');
            if (dateSpan) dateSpan.textContent = formatNoteDate(note.updated);
        }
    }

    render();
}

function _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
