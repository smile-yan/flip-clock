// Update functionality for flip-clock
//
// Silent updates: once the user opts in, the package is downloaded and installed
// in the background while the clock keeps running. Progress is reported by a
// slim bar pinned to the bottom of the window; when the install finishes the app
// prompts the user to restart, which is when the new version takes effect.
//
// Platform note: `install()` replaces the bundle in place on macOS/Linux, so the
// "restart to apply" prompt is reachable there. On Windows `install()` hands off
// to the NSIS installer and exits the process, which relaunches the app itself —
// in that case the ready prompt simply never gets a chance to render.

const RELEASE_PAGE_URL = 'https://github.com/smile-yan/flip-clock/releases/latest';

// Minimum time the "checking" state stays on screen so it doesn't just flicker.
const MIN_CHECKING_MS = 600;

let updateModal = null;
let progressEl = null;

// The Update resource returned by check(). Held at module scope for the whole
// session: install() reads the bytes that download() stored on the Rust side,
// so the object must outlive the download call.
let pendingUpdate = null;

// In-flight download promise. Guards against a second "立即更新" click starting
// a duplicate download, and lets callers join an update already underway.
let activeDownload = null;

const state = {
    // idle | available | downloading | installing | ready | restarting | error
    status: 'idle',
    version: '',
    downloaded: 0,
    total: 0,
    error: null,
};

// ---------------------------------------------------------------------------
// DOM setup
// ---------------------------------------------------------------------------

function initUpdateModal() {
    if (updateModal) return;

    const modalHtml = `
        <div id="update-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <h3 id="update-title">检查更新</h3>
                <div id="update-checking" class="update-checking">
                    <div class="spinner"></div>
                    <p id="update-spinner-text">正在检查更新...</p>
                </div>
                <p id="update-message"></p>
                <div id="update-progress-row" class="update-progress-row">
                    <div class="progress-bar"><div class="progress-fill" id="update-modal-fill"></div></div>
                    <span id="update-progress-label" class="update-progress-label"></span>
                </div>
                <div class="modal-buttons" id="update-buttons">
                    <button id="update-release-btn" class="btn btn-secondary">打开发布页面</button>
                    <button id="update-later-btn" class="btn btn-secondary">关闭</button>
                    <button id="update-primary-btn" class="btn btn-primary">立即更新</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    updateModal = document.getElementById('update-modal');

    document.getElementById('update-later-btn').addEventListener('click', onLaterClick);
    document.getElementById('update-primary-btn').addEventListener('click', onPrimaryClick);
    document.getElementById('update-release-btn').addEventListener('click', openReleasePage);
}

// Bottom-of-window progress bar. Created lazily so the clock stays untouched
// until there is actually something to report.
function initProgressBar() {
    if (progressEl) return;

    const barHtml = `
        <div id="update-progress" class="update-progress" role="status" aria-live="polite" hidden>
            <div class="update-progress-track">
                <div class="update-progress-fill" id="update-progress-fill"></div>
            </div>
            <span class="update-progress-text" id="update-progress-text"></span>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', barHtml);
    progressEl = document.getElementById('update-progress');
    progressEl.addEventListener('click', openUpdateModal);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function progressPercent() {
    if (!state.total) return 0;
    return Math.min(100, Math.round((state.downloaded / state.total) * 100));
}

function setState(patch) {
    Object.assign(state, patch);
    renderProgressBar();
    renderModal();
}

// Download progress events arrive far faster than the UI can usefully show them
// (and the modal rebuild is not free), which would stutter the clock. Progress
// bytes are accumulated immediately; the repaint is coalesced to ~10fps.
const PROGRESS_RENDER_INTERVAL_MS = 100;
let lastProgressRenderAt = 0;
let progressRenderTimer = null;

function setProgressState(patch) {
    Object.assign(state, patch);

    const now = Date.now();
    const elapsed = now - lastProgressRenderAt;
    if (elapsed >= PROGRESS_RENDER_INTERVAL_MS) {
        lastProgressRenderAt = now;
        renderProgressBar();
        renderModal();
        return;
    }

    if (progressRenderTimer) return;
    progressRenderTimer = setTimeout(() => {
        progressRenderTimer = null;
        lastProgressRenderAt = Date.now();
        renderProgressBar();
        renderModal();
    }, PROGRESS_RENDER_INTERVAL_MS - elapsed);
}

function renderProgressBar() {
    initProgressBar();

    const s = state.status;
    const visible = s === 'downloading' || s === 'installing' || s === 'ready' || s === 'error';
    progressEl.hidden = !visible;
    if (!visible) {
        // Drop the transition-suppressing class so the next download animates.
        progressEl.classList.remove('is-indeterminate', 'is-ready', 'is-error', 'is-done');
        return;
    }

    const fill = document.getElementById('update-progress-fill');
    const text = document.getElementById('update-progress-text');
    const pct = progressPercent();

    progressEl.classList.toggle('is-ready', s === 'ready');
    progressEl.classList.toggle('is-error', s === 'error');
    progressEl.classList.toggle('is-done', s === 'installing');
    // Without a Content-Length we cannot compute a percentage, so fall back to
    // an indeterminate animation rather than showing a frozen 0%.
    progressEl.classList.toggle('is-indeterminate', s === 'downloading' && !state.total);

    switch (s) {
        case 'downloading':
            fill.style.width = state.total ? pct + '%' : '100%';
            text.textContent = state.total
                ? `正在后台下载新版本 v${state.version}… ${pct}%`
                : `正在后台下载新版本 v${state.version}…`;
            break;
        case 'installing':
            fill.style.width = '100%';
            text.textContent = '正在安装更新…';
            break;
        case 'ready':
            fill.style.width = '100%';
            text.textContent = '更新已就绪，重启应用后生效 · 点此立即重启';
            break;
        case 'error':
            fill.style.width = '100%';
            text.textContent = '更新失败 · 点此查看详情';
            break;
    }
}

function renderModal() {
    initUpdateModal();

    const title = document.getElementById('update-title');
    const checking = document.getElementById('update-checking');
    const spinnerText = document.getElementById('update-spinner-text');
    const message = document.getElementById('update-message');
    const progressRow = document.getElementById('update-progress-row');
    const modalFill = document.getElementById('update-modal-fill');
    const progressLabel = document.getElementById('update-progress-label');
    const releaseBtn = document.getElementById('update-release-btn');
    const laterBtn = document.getElementById('update-later-btn');
    const primaryBtn = document.getElementById('update-primary-btn');

    // Reset every variable piece, then let the state below turn back on what it needs.
    checking.style.display = 'none';
    message.style.display = 'none';
    message.textContent = '';
    progressRow.style.display = 'none';
    releaseBtn.style.display = 'none';
    primaryBtn.style.display = 'none';
    laterBtn.textContent = '关闭';
    laterBtn.style.display = 'block';

    switch (state.status) {
        case 'checking':
            title.textContent = '检查更新';
            checking.style.display = 'flex';
            spinnerText.textContent = '正在检查更新...';
            laterBtn.textContent = '取消';
            break;

        case 'available':
            title.textContent = `发现新版本 v${state.version}`;
            message.style.display = 'block';
            message.textContent = '点击"立即更新"将在后台下载并安装，期间可以继续使用，完成后重启即可生效。';
            primaryBtn.style.display = 'block';
            primaryBtn.textContent = '立即更新';
            primaryBtn.disabled = false;
            primaryBtn.className = 'btn btn-primary';
            laterBtn.textContent = '稍后';
            break;

        case 'downloading': {
            title.textContent = `正在更新到 v${state.version}`;
            const pct = progressPercent();
            progressRow.style.display = 'block';
            modalFill.style.width = state.total ? pct + '%' : '100%';
            progressLabel.textContent = state.total
                ? `${pct}%`
                : '已下载 ' + formatBytes(state.downloaded);
            message.style.display = 'block';
            message.textContent = '更新在后台进行，可以关闭此窗口继续使用。';
            primaryBtn.style.display = 'block';
            primaryBtn.textContent = '后台继续';
            primaryBtn.disabled = false;
            primaryBtn.className = 'btn btn-primary';
            // A single dismiss action — both buttons would do the same thing here.
            laterBtn.style.display = 'none';
            break;
        }

        case 'installing':
            title.textContent = `正在更新到 v${state.version}`;
            checking.style.display = 'flex';
            spinnerText.textContent = '正在安装更新，应用可能自动重启...';
            break;

        case 'ready':
            title.textContent = '更新已完成';
            message.style.display = 'block';
            message.textContent =
                `新版本 v${state.version} 已安装完成，重启应用后即可使用。`;
            primaryBtn.style.display = 'block';
            primaryBtn.textContent = '立即重启';
            primaryBtn.disabled = false;
            primaryBtn.className = 'btn btn-success';
            laterBtn.textContent = '稍后';
            break;

        case 'restarting':
            title.textContent = '正在重启';
            checking.style.display = 'flex';
            spinnerText.textContent = '正在重启应用...';
            break;

        case 'uptodate':
            title.textContent = '已是最新版本';
            message.style.display = 'block';
            message.textContent = '当前版本已是最新，无需更新。';
            laterBtn.textContent = '确定';
            break;

        case 'error':
            title.textContent = '更新失败';
            message.style.display = 'block';
            message.textContent = `${describeError(state.error)}\n\n可以稍后重试，或前往发布页面手动下载。`;
            releaseBtn.style.display = 'block';
            primaryBtn.style.display = 'block';
            primaryBtn.textContent = '重试';
            primaryBtn.disabled = false;
            primaryBtn.className = 'btn btn-primary';
            laterBtn.textContent = '关闭';
            break;
    }
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function describeError(error) {
    const raw = (error && (error.message || error.toString())) || String(error);
    if (/signature/i.test(raw)) {
        return `更新包签名校验失败: ${raw}`;
    }
    if (/network|timed? ?out|request|connect|dns|fetch/i.test(raw)) {
        return `网络请求失败: ${raw}`;
    }
    return raw;
}

// ---------------------------------------------------------------------------
// Modal visibility
// ---------------------------------------------------------------------------

function openUpdateModal() {
    initUpdateModal();
    renderModal();
    updateModal.style.display = 'flex';
}

function closeUpdateModal() {
    if (updateModal) updateModal.style.display = 'none';
}

// Release the previous check's Rust-side resource so repeated "检查更新" clicks
// don't accumulate them. Skipped while a download is in flight, since the bytes
// live behind that resource until install() consumes them.
function disposePendingUpdate() {
    if (!pendingUpdate || activeDownload) return;

    const stale = pendingUpdate;
    pendingUpdate = null;
    if (typeof stale.close === 'function') {
        stale.close().catch((err) => console.warn('Failed to close update resource:', err));
    }
}

// The secondary button doubles as cancel / close / confirm depending on state.
function onLaterClick() {
    switch (state.status) {
        case 'checking':
            closeUpdateModal();
            break;
        case 'downloading':
            // Download keeps running; the bottom bar stays as the progress report.
            closeUpdateModal();
            break;
        case 'ready':
            // Keep the bottom bar visible so there is still a one-click path to
            // restart — quitting and reopening applies the update either way.
            closeUpdateModal();
            break;
        case 'error':
            // Terminal state: dismissing clears the bar.
            closeUpdateModal();
            setState({ status: 'idle', error: null });
            break;
        default:
            closeUpdateModal();
            break;
    }
}

function onPrimaryClick() {
    switch (state.status) {
        case 'available':
            closeUpdateModal();
            startBackgroundUpdate();
            break;
        case 'downloading':
            closeUpdateModal();
            break;
        case 'ready':
            restartToApply();
            break;
        case 'error':
            closeUpdateModal();
            startBackgroundUpdate();
            break;
    }
}

// ---------------------------------------------------------------------------
// Update flows
// ---------------------------------------------------------------------------

// Check for updates; entry point for the "检查更新" menu item.
async function checkForUpdates() {
    // An update already in flight owns the UI — show it instead of re-checking.
    if (activeDownload || state.status === 'ready' || state.status === 'installing') {
        openUpdateModal();
        return;
    }

    openUpdateModal();
    setState({ status: 'checking', error: null });

    const startedAt = Date.now();

    try {
        const update = await window.__TAURI__.updater.check();
        await waitForMinChecking(startedAt);

        if (update) {
            disposePendingUpdate();
            pendingUpdate = update;
            setState({ status: 'available', version: update.version });
        } else {
            disposePendingUpdate();
            setState({ status: 'uptodate' });
        }
    } catch (error) {
        await waitForMinChecking(startedAt);
        console.error('Check update error:', error);
        disposePendingUpdate();
        setState({ status: 'error', error });
    }
}

function waitForMinChecking(startedAt) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= MIN_CHECKING_MS) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, MIN_CHECKING_MS - elapsed));
}

// Download the pending update in the background, then install it.
// Safe to call repeatedly: subsequent calls join the in-flight download.
function startBackgroundUpdate() {
    if (activeDownload) return activeDownload;

    if (!pendingUpdate) {
        // Nothing staged (e.g. the resource was dropped) — re-check first.
        activeDownload = (async () => {
            try {
                const update = await window.__TAURI__.updater.check();
                if (!update) {
                    setState({ status: 'uptodate' });
                    return;
                }
                pendingUpdate = update;
                await runDownload(update);
            } catch (error) {
                setState({ status: 'error', error });
            } finally {
                activeDownload = null;
            }
        })();
        return activeDownload;
    }

    activeDownload = runDownload(pendingUpdate).finally(() => {
        activeDownload = null;
    });
    return activeDownload;
}

async function runDownload(update) {
    setState({
        status: 'downloading',
        version: update.version,
        downloaded: 0,
        total: 0,
        error: null,
    });

    try {
        await update.download((event) => {
            if (!event || !event.event) return;
            if (event.event === 'Started') {
                setProgressState({ total: (event.data && event.data.contentLength) || 0 });
            } else if (event.event === 'Progress') {
                if (!event.data) return;
                setProgressState({ downloaded: state.downloaded + event.data.chunkLength });
            }
            // 'Finished' needs no handling: the awaited promise resolves next.
        });
    } catch (error) {
        console.error('Update download error:', error);
        setState({ status: 'error', error });
        return;
    }

    await installUpdate(update);
}

async function installUpdate(update) {
    setState({ status: 'installing', downloaded: state.total || state.downloaded });

    try {
        // Verifies the signature and swaps the bundle in place. On Windows this
        // exits the process and the installer relaunches the app.
        await update.install();
    } catch (error) {
        console.error('Update install error:', error);
        setState({ status: 'error', error });
        return;
    }

    // Reached on macOS/Linux only: the new version is on disk but this process
    // is still running the old one.
    setState({ status: 'ready' });
    openUpdateModal();
}

async function restartToApply() {
    setState({ status: 'restarting' });

    try {
        const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
        if (typeof invoke !== 'function') throw new Error('Tauri invoke is unavailable');
        await invoke('restart_app');
    } catch (error) {
        // The command only rejects when the restart could not be scheduled.
        console.error('Restart failed:', error);
        setState({ status: 'ready' });
        const message = document.getElementById('update-message');
        if (message) {
            message.textContent = '自动重启失败，请手动退出并重新打开应用以完成更新。';
        }
    }
}

// Open the GitHub release page in the user's default browser.
// Used as a manual fallback when an update cannot be applied in-app.
async function openReleasePage() {
    let url = RELEASE_PAGE_URL;
    try {
        const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
        if (typeof invoke === 'function') {
            const configured = await invoke('get_release_url');
            if (typeof configured === 'string' && configured.length > 0) url = configured;
        }
    } catch (e) {
        // fall through to default url
    }

    try {
        if (window.__TAURI__ && window.__TAURI__.shell && typeof window.__TAURI__.shell.open === 'function') {
            await window.__TAURI__.shell.open(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    } catch (e) {
        console.error('Failed to open release URL:', e);
    } finally {
        closeUpdateModal();
    }
}

window.checkForUpdates = checkForUpdates;
window.startBackgroundUpdate = startBackgroundUpdate;
