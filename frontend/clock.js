/**
 * flip-clock - Pure CSS/JS Flip Clock
 * A minimalist flip clock implementation without external dependencies
 */

// Default configuration
const DEFAULT_CONFIG = {
    motto: '君子三思而后行',
    theme: 'dark',
    style: 'with-seconds',
    timeFormat: '24h',
    showDate: true,
    showSeconds: true,
    showLunar: false,
    showMotto: true,
    color: ''
};

const WIDTH = 600;
const HEIGHT = 300;

// Current state
let currentConfig = { ...DEFAULT_CONFIG };
let saveTimer = null;
let currentTime = { h1: 0, h2: 0, m1: 0, m2: 0, s1: 0, s2: 0 };
let clockInterval = null;

// DOM elements
const clockElement = document.getElementById('clock');
const meridiem = document.getElementById('meridiem');
const dateDisplay = document.getElementById('dateDisplay');
const lunarDisplay = document.getElementById('lunarDisplay');
const mottoDisplay = document.getElementById('mottoDisplay');
const overlay = document.getElementById('settingsOverlay');
const modal = document.getElementById('settingsModal');

// Lunar calendar data (1900-2100)
const lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0
];

const lunarMonths = '正二三四五六七八九十冬腊';
const lunarDays = '初一初二初三初四初五初六初七初八初九初十十一十二十三十四十五十六十七十八十九二十廿一廿二廿三廿四廿五廿六廿七廿八廿九三十';

// ============================================
// Lunar Calendar Functions
// ============================================

function lYearDays(y) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
        sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    }
    return sum + leapDays(y);
}

function leapDays(y) {
    if (leapMonth(y)) {
        return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
    }
    return 0;
}

function leapMonth(y) {
    return lunarInfo[y - 1900] & 0xf;
}

function monthDays(y, m) {
    return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

function solarDays(y, m) {
    if (m === 1 || m === 3 || m === 5 || m === 7 || m === 8 || m === 10 || m === 12) return 31;
    if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
}

function getLunarDate(date) {
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    if (y < 1900 || y > 2100) return '';

    let offsetDays = 0;
    for (let i = 1900; i < y; i++) {
        offsetDays += ((i % 4 === 0 && i % 100 !== 0) || i % 400 === 0) ? 366 : 365;
    }
    for (let i = 1; i < m; i++) {
        offsetDays += solarDays(y, i);
    }
    offsetDays += d - 1;
    offsetDays -= 30;

    let lunarY = 1900;
    while (offsetDays >= lYearDays(lunarY)) {
        offsetDays -= lYearDays(lunarY);
        lunarY++;
    }

    let leap = leapMonth(lunarY);
    let isLeap = false;
    let lunarM = 1;
    while (true) {
        if (leap === lunarM && !isLeap) {
            let leapMonthDay = leapDays(lunarY);
            if (offsetDays >= leapMonthDay) {
                offsetDays -= leapMonthDay;
                isLeap = true;
                continue;
            }
        }
        let md = monthDays(lunarY, lunarM);
        if (offsetDays < md) break;
        offsetDays -= md;
        lunarM++;
        isLeap = false;
    }

    let lunarD = offsetDays + 1;
    let monthStr = lunarMonths[lunarM - 1] + '月';
    if (isLeap) monthStr = '闰' + monthStr;
    let dayStr = lunarDays.substr((lunarD - 1) * 2, 2);
    return monthStr + dayStr;
}

// ============================================
// Date Formatting
// ============================================

function getFormattedDate() {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const day = days[now.getDay()];
    return `${year}-${month}-${date} ${day}`;
}

// ============================================
// Clock Rendering
// ============================================

function createDigit(value, id) {
    const digit = document.createElement('div');
    digit.className = 'flip-digit';
    digit.id = id;

    const card = document.createElement('div');
    card.className = 'flip-card';

    const topHalf = document.createElement('div');
    topHalf.className = 'flip-card-inner top';

    const topValue = document.createElement('div');
    topValue.className = 'value';
    topValue.textContent = value;
    topValue.style.color = '#EEE';
    topValue.style.backgroundColor = '#222';
    topHalf.appendChild(topValue);

    const bottomHalf = document.createElement('div');
    bottomHalf.className = 'flip-card-inner bottom';

    const bottomValue = document.createElement('div');
    bottomValue.className = 'value';
    bottomValue.textContent = value;
    bottomValue.style.color = '#EEE';
    bottomValue.style.backgroundColor = '#222';
    bottomHalf.appendChild(bottomValue);

    card.appendChild(topHalf);
    card.appendChild(bottomHalf);
    digit.appendChild(card);

    return digit;
}

function createSeparator() {
    const separator = document.createElement('div');
    separator.className = 'clock-separator';

    const dot1 = document.createElement('div');
    dot1.className = 'separator-dot';

    const dot2 = document.createElement('div');
    dot2.className = 'separator-dot';

    separator.appendChild(dot1);
    separator.appendChild(dot2);

    return separator;
}

function buildClockFace() {
    clockElement.innerHTML = '';

    const is12h = currentConfig.timeFormat === '12h';
    const showSeconds = currentConfig.style === 'with-seconds';

    // Hour group
    const hourGroup = document.createElement('div');
    hourGroup.className = 'clock-group';

    const hourDigits = document.createElement('div');
    hourDigits.className = 'digit-pair';

    const h1 = createDigit('0', 'digit-h1');
    const h2 = createDigit('0', 'digit-h2');
    hourDigits.appendChild(h1);
    hourDigits.appendChild(h2);
    hourGroup.appendChild(hourDigits);

    clockElement.appendChild(hourGroup);

    // Separator
    clockElement.appendChild(createSeparator());

    // Minute group
    const minuteGroup = document.createElement('div');
    minuteGroup.className = 'clock-group';

    const minuteDigits = document.createElement('div');
    minuteDigits.className = 'digit-pair';

    const m1 = createDigit('0', 'digit-m1');
    const m2 = createDigit('0', 'digit-m2');
    minuteDigits.appendChild(m1);
    minuteDigits.appendChild(m2);
    minuteGroup.appendChild(minuteDigits);

    clockElement.appendChild(minuteGroup);

    // Seconds (if enabled)
    if (showSeconds) {
        clockElement.appendChild(createSeparator());

        const secondGroup = document.createElement('div');
        secondGroup.className = 'clock-group';

        const secondDigits = document.createElement('div');
        secondDigits.className = 'digit-pair';

        const s1 = createDigit('0', 'digit-s1');
        const s2 = createDigit('0', 'digit-s2');
        secondDigits.appendChild(s1);
        secondDigits.appendChild(s2);
        secondGroup.appendChild(secondDigits);

        clockElement.appendChild(secondGroup);
    }

    // Meridiem indicator for 12h mode
    meridiem.className = 'meridiem' + (is12h ? ' visible' : '');
    meridiem.textContent = 'AM';
}

function getTimeDigits() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const is12h = currentConfig.timeFormat === '12h';
    let meridiemText = '';

    if (is12h) {
        meridiemText = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
    }

    return {
        h1: Math.floor(hours / 10),
        h2: hours % 10,
        m1: Math.floor(minutes / 10),
        m2: minutes % 10,
        s1: Math.floor(seconds / 10),
        s2: seconds % 10,
        meridiem: meridiemText
    };
}

function updateDigit(id, newValue, oldValue) {
    const digit = document.getElementById(id);
    if (!digit) return;

    if (String(newValue) === String(oldValue)) return;

    const card = digit.querySelector('.flip-card');
    if (!card) return;

    const topHalf = card.querySelector('.flip-card-inner.top');
    const bottomHalf = card.querySelector('.flip-card-inner.bottom');
    if (!topHalf || !bottomHalf) return;

    const topValue = topHalf.querySelector('.value');
    const bottomValue = bottomHalf.querySelector('.value');
    if (!topValue || !bottomValue) return;

    // Simple update without complex animation
    topValue.textContent = newValue;
    bottomValue.textContent = newValue;

    // Add a quick flash effect
    digit.style.transition = 'none';
    digit.style.transform = 'scale(1.05)';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            digit.style.transition = 'transform 0.15s ease-out';
            digit.style.transform = 'scale(1)';
        });
    });
}

function updateClock() {
    const newTime = getTimeDigits();

    updateDigit('digit-h1', newTime.h1, currentTime.h1);
    updateDigit('digit-h2', newTime.h2, currentTime.h2);
    updateDigit('digit-m1', newTime.m1, currentTime.m1);
    updateDigit('digit-m2', newTime.m2, currentTime.m2);

    if (currentConfig.style === 'with-seconds') {
        updateDigit('digit-s1', newTime.s1, currentTime.s1);
        updateDigit('digit-s2', newTime.s2, currentTime.s2);
    }

    // Update meridiem
    if (currentConfig.timeFormat === '12h') {
        meridiem.textContent = newTime.meridiem;
    }

    currentTime = newTime;
}

function startClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
    }

    // Initial update
    const initial = getTimeDigits();
    currentTime = initial;

    // Set initial values without animation
    const h1 = document.getElementById('digit-h1');
    const h2 = document.getElementById('digit-h2');
    const m1 = document.getElementById('digit-m1');
    const m2 = document.getElementById('digit-m2');

    if (h1) h1.querySelectorAll('.value').forEach(el => el.textContent = initial.h1);
    if (h2) h2.querySelectorAll('.value').forEach(el => el.textContent = initial.h2);
    if (m1) m1.querySelectorAll('.value').forEach(el => el.textContent = initial.m1);
    if (m2) m2.querySelectorAll('.value').forEach(el => el.textContent = initial.m2);

    if (currentConfig.style === 'with-seconds') {
        const s1 = document.getElementById('digit-s1');
        const s2 = document.getElementById('digit-s2');
        if (s1) s1.querySelectorAll('.value').forEach(el => el.textContent = initial.s1);
        if (s2) s2.querySelectorAll('.value').forEach(el => el.textContent = initial.s2);
    }

    if (currentConfig.timeFormat === '12h') {
        meridiem.textContent = initial.meridiem;
    }

    // Start interval
    clockInterval = setInterval(updateClock, 1000);
}

// ============================================
// Theme Management
// ============================================

function applyTheme(theme) {
    const validThemes = ['dark', 'light', 'sepia', 'blue', 'forest', 'sunset', 'midnight', 'ocean', 'rose', 'slate'];
    if (!validThemes.includes(theme)) {
        theme = 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    currentConfig.theme = theme;
}

// ============================================
// Display Updates
// ============================================

function applyDisplays() {
    // Date
    if (dateDisplay) {
        dateDisplay.style.display = currentConfig.showDate ? '' : 'none';
        dateDisplay.textContent = getFormattedDate();
    }

    // Lunar
    if (lunarDisplay) {
        lunarDisplay.style.display = currentConfig.showLunar ? '' : 'none';
        if (currentConfig.showLunar) {
            lunarDisplay.textContent = getLunarDate(new Date());
        }
    }

    // Motto
    if (mottoDisplay) {
        if (currentConfig.showMotto) {
            mottoDisplay.style.display = '';
            mottoDisplay.textContent = currentConfig.motto && currentConfig.motto.trim()
                ? currentConfig.motto
                : ' ';
        } else {
            mottoDisplay.style.display = 'none';
        }
    }
}

// ============================================
// Configuration Application
// ============================================

function applyConfig(cfg) {
    // Normalize showSeconds based on style
    let normalized = { ...DEFAULT_CONFIG, ...cfg };
    if (normalized.style === 'with-seconds') {
        normalized.showSeconds = true;
    } else if (normalized.style === 'without-seconds') {
        normalized.showSeconds = false;
    }

    currentConfig = normalized;

    applyTheme(currentConfig.theme);
    buildClockFace();
    startClock();
    applyDisplays();
    resize();
}

// ============================================
// Settings Modal
// ============================================

function openSettings() {
    // Populate form with current config
    document.querySelectorAll('input[name="style"]').forEach(r => {
        r.checked = r.value === currentConfig.style;
    });
    document.getElementById('timeFormatSelect').value = currentConfig.timeFormat;
    document.getElementById('themeSelect').value = currentConfig.theme;
    document.getElementById('showDateCheck').checked = currentConfig.showDate;
    document.getElementById('showLunarCheck').checked = currentConfig.showLunar;
    document.getElementById('showMottoCheck').checked = currentConfig.showMotto;
    document.getElementById('mottoInput').value = currentConfig.motto || '';

    overlay.classList.add('visible');
    modal.classList.add('visible');
}

function closeSettings() {
    overlay.classList.remove('visible');
    modal.classList.remove('visible');
    flushSave(true);
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushSave(false), 300);
}

function flushSave(immediate) {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    persistConfig(immediate);
}

async function persistConfig(immediate) {
    const payload = collectPayload();
    console.log('[frontend] Persisting config:', payload);

    try {
        // Use Tauri invoke if available, otherwise fallback to localStorage
        if (window.__TAURI__) {
            await window.__TAURI__.core.invoke('save_settings', { payload });
            console.log('[frontend] Settings saved via Tauri');
        } else {
            // Fallback for browser testing
            localStorage.setItem('flip-clock-config', JSON.stringify(payload));
            console.log('[frontend] Settings saved to localStorage');
        }
    } catch (err) {
        console.error('[frontend] Failed to save settings:', err);
    }
}

function collectPayload() {
    const style = (document.querySelector('input[name="style"]:checked') || {}).value || currentConfig.style;
    const timeFormat = document.getElementById('timeFormatSelect').value;

    return {
        motto: document.getElementById('mottoInput').value || '',
        showInDock: currentConfig.showInDock || false,
        theme: document.getElementById('themeSelect').value,
        style: style,
        timeFormat: timeFormat,
        showDate: document.getElementById('showDateCheck').checked,
        showSeconds: style === 'with-seconds',
        showLunar: document.getElementById('showLunarCheck').checked,
        showMotto: document.getElementById('showMottoCheck').checked,
        color: currentConfig.color || ''
    };
}

// ============================================
// Tauri Integration
// ============================================

async function loadConfig() {
    try {
        if (window.__TAURI__) {
            const config = await window.__TAURI__.core.invoke('get_config');
            console.log('[frontend] Loaded config from Tauri:', config);
            return config;
        } else {
            // Fallback for browser testing
            const stored = localStorage.getItem('flip-clock-config');
            if (stored) {
                return JSON.parse(stored);
            }
        }
    } catch (err) {
        console.error('[frontend] Failed to load config:', err);
    }
    return DEFAULT_CONFIG;
}

// ============================================
// Window Resize / Zoom
// ============================================

function resize() {
    const container = document.querySelector('.container');
    const scaleX = window.innerWidth / WIDTH;
    const scaleY = window.innerHeight / HEIGHT;
    let scale;

    if (window.innerHeight / window.innerWidth > 0.3) {
        scale = scaleX;
    } else {
        scale = Math.min(scaleX, scaleY);
    }

    container.style.setProperty('--zoom-level', scale);
}

let resizeTimeout;

function debounceResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resize, 100);
}

// ============================================
// Event Bindings
// ============================================

function bindSettingsEvents() {
    // Close on overlay click
    overlay.addEventListener('click', closeSettings);

    // Close on red dot click
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettings);
    }

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeSettings();
        }
    });

    // Style toggle
    document.querySelectorAll('input[name="style"]').forEach(r => {
        r.addEventListener('change', () => {
            currentConfig.style = r.value;
            currentConfig.showSeconds = (r.value === 'with-seconds');
            buildClockFace();
            startClock();
            scheduleSave();
        });
    });

    // Time format
    document.getElementById('timeFormatSelect').addEventListener('change', (e) => {
        currentConfig.timeFormat = e.target.value;
        buildClockFace();
        startClock();
        scheduleSave();
    });

    // Theme
    document.getElementById('themeSelect').addEventListener('change', (e) => {
        applyTheme(e.target.value);
        scheduleSave();
    });

    // Checkboxes
    ['showDateCheck', 'showLunarCheck', 'showMottoCheck'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('change', () => {
            const map = {
                showDateCheck: 'showDate',
                showLunarCheck: 'showLunar',
                showMottoCheck: 'showMotto'
            };
            currentConfig[map[id]] = el.checked;
            applyDisplays();
            scheduleSave();
        });
    });

    // Motto input
    const mottoInput = document.getElementById('mottoInput');
    mottoInput.addEventListener('input', () => {
        currentConfig.motto = mottoInput.value;
        applyDisplays();
        scheduleSave();
    });
    mottoInput.addEventListener('blur', () => {
        flushSave(true);
    });

    // Prevent closing on modal click
    modal.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function bindGlobalEvents() {
    // Window resize
    window.addEventListener('resize', debounceResize);

    // Visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Coming back from background
            buildClockFace();
            startClock();
            if (dateDisplay) dateDisplay.textContent = getFormattedDate();
            if (lunarDisplay) lunarDisplay.textContent = getLunarDate(new Date());
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', async (e) => {
        // F11 - Toggle fullscreen
        if (e.key === 'F11') {
            e.preventDefault();
            try {
                if (window.__TAURI__) {
                    await window.__TAURI__.core.invoke('toggle_fullscreen');
                }
            } catch (err) {
                console.error('[frontend] Toggle fullscreen failed:', err);
            }
        }

        // Ctrl/Cmd + , - Open settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            openSettings();
        }
    });

    // Listen for Tauri events
    if (window.__TAURI__) {
        window.__TAURI__.event.listen('open-settings', () => {
            openSettings();
        });
    }
}

// ============================================
// Initialization
// ============================================

async function init() {
    console.log('[frontend] Initializing flip-clock');
    console.log('[frontend] clockElement:', clockElement);

    // Build initial clock with default config
    buildClockFace();
    console.log('[frontend] After buildClockFace, clockElement.innerHTML:', clockElement.innerHTML.substring(0, 200));
    applyDisplays();
    resize();

    // Bind events
    bindSettingsEvents();
    bindGlobalEvents();

    // Load persisted config
    const cfg = await loadConfig();
    applyConfig(cfg);

    // Start the clock
    startClock();

    console.log('[frontend] Initialization complete');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
