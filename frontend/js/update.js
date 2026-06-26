// Update functionality for flip-clock
// Handles checking for updates, downloading, and installing

let updateModal = null;
let progressBar = null;
let progressText = null;
let downloadedUpdate = null;

// Initialize update modal
function initUpdateModal() {
    if (updateModal) return;

    const modalHtml = `
        <div id="update-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <h3 id="update-title">检查更新</h3>
                <p id="update-message">正在检查更新...</p>
                <div id="update-progress-container" style="display: none;">
                    <div class="progress-bar">
                        <div id="update-progress-bar" class="progress-fill" style="width: 0%;"></div>
                    </div>
                    <p id="update-progress-text">0%</p>
                </div>
                <div class="modal-buttons" id="update-buttons" style="display: none;">
                    <button id="update-download-btn" class="btn btn-primary">下载更新</button>
                    <button id="update-install-btn" class="btn btn-success" style="display: none;">安装并重启</button>
                    <button id="update-cancel-btn" class="btn btn-secondary">取消</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    updateModal = document.getElementById('update-modal');
    progressBar = document.getElementById('update-progress-bar');
    progressText = document.getElementById('update-progress-text');

    // Button event listeners
    document.getElementById('update-download-btn').addEventListener('click', downloadUpdate);
    document.getElementById('update-install-btn').addEventListener('click', installUpdate);
    document.getElementById('update-cancel-btn').addEventListener('click', closeUpdateModal);
}

// Show update modal
function showUpdateModal() {
    initUpdateModal();
    resetUpdateModal();
    updateModal.style.display = 'flex';
}

// Reset modal to initial state
function resetUpdateModal() {
    document.getElementById('update-title').textContent = '检查更新';
    document.getElementById('update-message').textContent = '正在检查更新...';
    document.getElementById('update-progress-container').style.display = 'none';
    document.getElementById('update-buttons').style.display = 'none';
    document.getElementById('update-download-btn').style.display = 'none';
    document.getElementById('update-install-btn').style.display = 'none';
    document.getElementById('update-cancel-btn').style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
}

// Close update modal
function closeUpdateModal() {
    if (updateModal) {
        updateModal.style.display = 'none';
    }
}

// Check for updates
async function checkForUpdates() {
    showUpdateModal();

    try {
        const update = await window.__TAURI__.updater.check();
        downloadedUpdate = update;

        if (update) {
            document.getElementById('update-title').textContent = '发现新版本';
            document.getElementById('update-message').textContent = `新版本: ${update.version}\n\n${update.body || '点击下载更新'}`;
            document.getElementById('update-download-btn').style.display = 'block';
            document.getElementById('update-cancel-btn').textContent = '稍后';
        } else {
            document.getElementById('update-title').textContent = '已是最新版本';
            document.getElementById('update-message').textContent = '当前版本已是最新，无需更新。';
            document.getElementById('update-cancel-btn').textContent = '确定';
        }
        document.getElementById('update-buttons').style.display = 'flex';
    } catch (error) {
        console.error('Check update error:', error);
        document.getElementById('update-title').textContent = '检查更新失败';
        document.getElementById('update-message').textContent = `无法检查更新: ${error.message || error}`;
        document.getElementById('update-cancel-btn').textContent = '确定';
        document.getElementById('update-buttons').style.display = 'flex';
    }
}

// Download update
async function downloadUpdate() {
    if (!downloadedUpdate) {
        closeUpdateModal();
        return;
    }

    document.getElementById('update-message').textContent = '正在下载更新...';
    document.getElementById('update-download-btn').style.display = 'none';
    document.getElementById('update-cancel-btn').style.display = 'none';
    document.getElementById('update-progress-container').style.display = 'block';

    try {
        // Listen for download progress
        const unlisten = await window.__TAURI__.event.listen('tauri://update-download-progress', (event) => {
            const progress = event.payload;
            if (progress.contentLength) {
                const percent = Math.round((progress.chunkLength / progress.contentLength) * 100);
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `${percent}%`;
            }
        });

        await downloadedUpdate.downloadAndInstall();

        unlisten();

        document.getElementById('update-title').textContent = '下载完成';
        document.getElementById('update-message').textContent = '更新已下载完成，是否现在安装？';
        document.getElementById('update-install-btn').style.display = 'block';
        document.getElementById('update-cancel-btn').style.display = 'block';
        document.getElementById('update-cancel-btn').textContent = '取消';
        document.getElementById('update-progress-container').style.display = 'none';

    } catch (error) {
        console.error('Download error:', error);
        document.getElementById('update-title').textContent = '下载失败';
        document.getElementById('update-message').textContent = `下载更新失败: ${error.message || error}`;
        document.getElementById('update-cancel-btn').style.display = 'block';
        document.getElementById('update-cancel-btn').textContent = '确定';
    }
}

// Install update
async function installUpdate() {
    closeUpdateModal();
    // The updater plugin will handle the restart
    // User will be prompted to restart by the system
}

// Export for use in menu events
window.checkForUpdates = checkForUpdates;