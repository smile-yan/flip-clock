// Update functionality for flip-clock
// Handles checking for updates. When a new version is found, the user can
// open the GitHub release page in their browser to download and install it.

let updateModal = null;

// Initialize update modal
function initUpdateModal() {
    if (updateModal) return;

    const modalHtml = `
        <div id="update-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <h3 id="update-title">检查更新</h3>
                <div id="update-checking" class="update-checking">
                    <div class="spinner"></div>
                    <p id="update-message">正在检查更新...</p>
                </div>
                <div class="modal-buttons" id="update-buttons">
                    <button id="update-cancel-btn" class="btn btn-secondary">取消</button>
                    <button id="update-download-btn" class="btn btn-primary" style="display: none;">前往下载</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    updateModal = document.getElementById('update-modal');

    document.getElementById('update-download-btn').addEventListener('click', openReleasePage);
    document.getElementById('update-cancel-btn').addEventListener('click', closeUpdateModal);
}

function showUpdateModal() {
    initUpdateModal();
    resetUpdateModal();
    updateModal.style.display = 'flex';
}

function resetUpdateModal() {
    document.getElementById('update-title').textContent = '检查更新';
    document.getElementById('update-message').textContent = '正在检查更新...';
    document.getElementById('update-checking').style.display = 'flex';
    document.getElementById('update-buttons').style.display = 'flex';
    document.getElementById('update-download-btn').style.display = 'none';
    document.getElementById('update-cancel-btn').style.display = 'block';
    document.getElementById('update-cancel-btn').textContent = '取消';
}

function finishCheckingState() {
    const checking = document.getElementById('update-checking');
    if (checking) checking.style.display = 'none';
}

function closeUpdateModal() {
    if (updateModal) updateModal.style.display = 'none';
}

// Check for updates
async function checkForUpdates() {
    showUpdateModal();
    const startedAt = Date.now();
    const minVisibleMs = 600; // ensure the user actually sees the "checking" state

    try {
        const update = await window.__TAURI__.updater.check();

        const elapsed = Date.now() - startedAt;
        if (elapsed < minVisibleMs) {
            await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
        }
        finishCheckingState();

        if (update) {
            document.getElementById('update-title').textContent = '发现新版本';
            document.getElementById('update-message').textContent =
                `新版本: ${update.version}\n\n${update.body || '点击"前往下载"在浏览器中打开发布页面。'}`;
            document.getElementById('update-download-btn').style.display = 'block';
            document.getElementById('update-cancel-btn').textContent = '稍后';
        } else {
            document.getElementById('update-title').textContent = '已是最新版本';
            document.getElementById('update-message').textContent = '当前版本已是最新，无需更新。';
            document.getElementById('update-cancel-btn').textContent = '确定';
        }
    } catch (error) {
        const elapsed = Date.now() - startedAt;
        if (elapsed < minVisibleMs) {
            await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
        }
        finishCheckingState();
        console.error('Check update error:', error);
        document.getElementById('update-title').textContent = '检查更新失败';
        document.getElementById('update-message').textContent =
            `无法检查更新: ${error.message || error}\n\n点击"前往下载"可在浏览器中打开发布页面。`;
        document.getElementById('update-download-btn').style.display = 'block';
        document.getElementById('update-cancel-btn').textContent = '关闭';
    }
}

// Open the GitHub release page in the user's default browser.
// Uses Tauri shell plugin when available; falls back to window.open otherwise.
async function openReleasePage() {
    let url = 'https://github.com/smile-yan/flip-clock/releases/latest';
    try {
        if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
            const configured = await window.__TAURI__.core.invoke('get_release_url');
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
