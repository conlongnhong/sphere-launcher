// Application state, search engine, and keyboard navigation
// Native app search presented in the reference's satellite-card layout.

let allApps = [];
let filteredApps = [];
let selectedIndex = 0;
let showWhenEmpty = true;

const CARD_IDS = [
    'card-left-0',
    'card-left-1',
    'card-left-2',
    'card-right-0',
    'card-right-1',
    'card-right-2'
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Three.js 3D Globe
    if (typeof window.initGlobe === 'function') {
        window.initGlobe();
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.focus();
    }

    // 2. Request apps from Host
    if (window.__APPS__ && Array.isArray(window.__APPS__)) {
        setApps(window.__APPS__);
    } else {
        requestAppsFromHost();
    }

    // 3. Search input listener
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            showWhenEmpty = true;
            filterApps(e.target.value);
        });
    }

    // 4. Global Keyboard Navigation
    window.addEventListener('keydown', handleKeyDown);

    // 5. Card click handlers
    CARD_IDS.forEach((id, idx) => {
        const card = document.getElementById(id);
        if (card) {
            card.addEventListener('click', () => {
                launchAppAtIndex(idx);
            });
            card.addEventListener('mouseenter', () => {
                selectIndex(idx);
            });
        }
    });

    // 6. Click on backdrop to close
    document.getElementById('app-container').addEventListener('click', (e) => {
        if (!e.target.closest('.satellite-card, .search-capsule, #globe-interaction')) {
            closeLauncher();
        }
    });
});

function setApps(apps) {
    allApps = apps;
    const searchInput = document.getElementById('search-input');
    const val = searchInput ? searchInput.value : '';
    filterApps(val);
}

function requestAppsFromHost() {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.launcher) {
        window.webkit.messageHandlers.launcher.postMessage(JSON.stringify({ action: 'get_apps' }));
    } else {
        // Fallback demo apps for standalone preview in web browsers (e.g. Chrome, Firefox)
        const demoApps = [
            { name: "Terminal", comment: "Terminal Emulator", exec: "ghostty", score: 0 },
            { name: "Web Browser", comment: "Access the Internet", exec: "brave", score: 1 },
            { name: "Code Editor", comment: "Visual Studio Code", exec: "code", score: 2 },
            { name: "Files", comment: "Browse files and folders", exec: "nautilus", score: 3 },
            { name: "Music", comment: "Spotify Music Player", exec: "spotify", score: 4 },
            { name: "Discord", comment: "Voice & Text Chat", exec: "discord", score: 5 }
        ];
        setApps(demoApps);
    }
}

function filterApps(query) {
    const q = (query || '').trim().toLowerCase();
    
    // Exactly matching video: when query is empty, cards are retracted/hidden
    // Unless user explicitly pressed Down Arrow or has showWhenEmpty = true
    if (!q && !showWhenEmpty) {
        filteredApps = [];
        selectedIndex = 0;
        renderCards();
        updateResultCount(0, false);
        return;
    }

    if (!q) {
        filteredApps = allApps.slice(0, 6);
    } else {
        // Multi-field search scoring
        const matches = [];
        allApps.forEach(app => {
            const name = (app.name || '').toLowerCase();
            const comment = (app.comment || '').toLowerCase();
            const id = (app.id || '').toLowerCase();
            const exec = (app.exec || '').toLowerCase();

            let score = -1;
            if (name === q) score = 100;
            else if (name.startsWith(q)) score = 80;
            else if (name.includes(q)) score = 60;
            else if (id.includes(q)) score = 40;
            else if (comment.includes(q)) score = 30;
            else if (exec.includes(q)) score = 20;

            if (score > 0) {
                matches.push({ app, score });
            }
        });

        matches.sort((a, b) => b.score - a.score);
        filteredApps = matches.slice(0, 6).map(m => m.app);
    }

    selectedIndex = 0;
    renderCards();
    updateResultCount(filteredApps.length, true);
}

function updateResultCount(count, show) {
    const el = document.getElementById('result-count');
    if (!el) return;
    if (show && count > 0) {
        el.textContent = `${count} results`;
        el.classList.add('visible');
    } else {
        el.classList.remove('visible');
    }
}

function renderCards() {
    const hasResults = filteredApps.length > 0;
    const bottomPill = document.querySelector('.globe-bottom-pill');
    if (bottomPill) bottomPill.classList.toggle('visible', hasResults);

    CARD_IDS.forEach((id, idx) => {
        const card = document.getElementById(id);
        const trace = document.getElementById(`trace-${id.replace('card-', '')}`);
        const dot = document.getElementById(`dot-${id.replace('card-', '')}`);
        const app = filteredApps[idx];

        if (!app) {
            if (card) {
                card.classList.add('empty-slot');
                card.classList.remove('selected', 'visible');
            }
            if (trace) {
                trace.classList.remove('active', 'visible');
            }
            if (dot) {
                dot.classList.remove('active', 'visible');
            }
            return;
        }

        if (card) {
            card.classList.remove('empty-slot');
            requestAnimationFrame(() => {
                card.classList.add('visible');
            });

            if (idx === selectedIndex) {
                card.classList.add('selected');
                if (trace) trace.classList.add('active');
                if (dot) dot.classList.add('active');
            } else {
                card.classList.remove('selected');
                if (trace) trace.classList.remove('active');
                if (dot) dot.classList.remove('active');
            }

            const titleEl = card.querySelector('.card-title');
            const subEl = card.querySelector('.card-subtitle');
            const iconWrapper = card.querySelector('.card-icon-wrapper');

            if (titleEl) titleEl.textContent = app.name || 'Application';
            if (subEl) subEl.textContent = app.comment || app.categories || 'Desktop Application';

            if (iconWrapper) {
                if (app.icon_data) {
                    iconWrapper.innerHTML = `<img src="${app.icon_data}" class="card-icon-img" alt="" />`;
                } else if (app.icon && (app.icon.startsWith('data:') || app.icon.startsWith('/') || app.icon.startsWith('file://'))) {
                    iconWrapper.innerHTML = `<img src="${app.icon}" class="card-icon-img" alt="" />`;
                } else {
                    const letter = (app.name || 'A').charAt(0).toUpperCase();
                    iconWrapper.innerHTML = `<span class="card-icon-fallback">${letter}</span>`;
                }
            }
        }

        requestAnimationFrame(() => {
            if (trace) trace.classList.add('visible');
            if (dot) dot.classList.add('visible');
        });
    });
}

function selectIndex(idx) {
    if (idx < 0 || idx >= filteredApps.length) return;
    selectedIndex = idx;

    CARD_IDS.forEach((id, i) => {
        const card = document.getElementById(id);
        const trace = document.getElementById(`trace-${id.replace('card-', '')}`);
        const dot = document.getElementById(`dot-${id.replace('card-', '')}`);
        if (i === selectedIndex) {
            if (card) card.classList.add('selected');
            if (trace) trace.classList.add('active');
            if (dot) dot.classList.add('active');
        } else {
            if (card) card.classList.remove('selected');
            if (trace) trace.classList.remove('active');
            if (dot) dot.classList.remove('active');
        }
    });
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeLauncher();
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredApps.length > 0) {
            launchAppAtIndex(selectedIndex);
        }
        return;
    }

    // If cards are hidden and user presses ArrowDown or Tab, reveal top apps
    if (filteredApps.length === 0 && (e.key === 'ArrowDown' || e.key === 'Tab')) {
        e.preventDefault();
        showWhenEmpty = true;
        filterApps('');
        return;
    }

    if (filteredApps.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex === 0 && filteredApps.length > 1) selectIndex(1);
        else if (selectedIndex === 1 && filteredApps.length > 2) selectIndex(2);
        else if (selectedIndex === 3 && filteredApps.length > 4) selectIndex(4);
        else if (selectedIndex === 4 && filteredApps.length > 5) selectIndex(5);
        else if (selectedIndex === 2 && filteredApps.length > 3) selectIndex(3);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex === 2) selectIndex(1);
        else if (selectedIndex === 1) selectIndex(0);
        else if (selectedIndex === 5) selectIndex(4);
        else if (selectedIndex === 4) selectIndex(3);
        else if (selectedIndex === 3 && filteredApps.length > 2) selectIndex(2);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (selectedIndex < 3 && selectedIndex + 3 < filteredApps.length) {
            selectIndex(selectedIndex + 3);
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (selectedIndex >= 3) {
            selectIndex(selectedIndex - 3);
        }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        const next = (selectedIndex + (e.shiftKey ? -1 : 1) + filteredApps.length) % filteredApps.length;
        selectIndex(next);
    }
}

function launchAppAtIndex(idx) {
    const app = filteredApps[idx];
    if (!app) return;

    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.launcher) {
        window.webkit.messageHandlers.launcher.postMessage(JSON.stringify({
            action: 'launch',
            name: app.name,
            exec: app.exec,
            desktop_file: app.desktop_file
        }));
    } else {
        console.log("[SphereLauncher Preview] Launching:", app.name, "| Exec:", app.exec);
    }
}

function closeLauncher() {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.launcher) {
        window.webkit.messageHandlers.launcher.postMessage(JSON.stringify({ action: 'close' }));
    } else {
        console.log("[SphereLauncher Preview] Close requested");
    }
}

window.loadAppsFromHost = function(appsJson) {
    try {
        const apps = typeof appsJson === 'string' ? JSON.parse(appsJson) : appsJson;
        setApps(apps);
    } catch (err) {
        console.error("Failed to parse apps from host:", err);
    }
};

window.onLauncherShown = function() {
    const input = document.getElementById('search-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    showWhenEmpty = true;

    // Reset card and trace visible classes so the branching entrance plays freshly
    CARD_IDS.forEach(id => {
        const card = document.getElementById(id);
        const trace = document.getElementById(`trace-${id.replace('card-', '')}`);
        const dot = document.getElementById(`dot-${id.replace('card-', '')}`);
        if (card) card.classList.remove('visible', 'selected');
        if (trace) trace.classList.remove('visible', 'active');
        if (dot) dot.classList.remove('visible', 'active');
    });

    // Release branches right as the 3D globe reaches its reveal scale
    setTimeout(() => {
        filterApps('');
    }, 240);
};
