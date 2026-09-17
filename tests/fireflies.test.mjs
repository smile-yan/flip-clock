// 萤火虫渲染循环的生命周期测试。
//
// fireflies.js 是自包含的 vanilla 模块，唯一对外契约就是 window.Fireflies
// 的 setEnabled / setCount / setSpeed。这里用一套最小 DOM 桩把它跑起来，
// 统计「真的画了东西的帧」（画了光点才算一帧），而不是排队的回调数——
// 关掉开关后残留的最后一个空回调不是用户能看见的帧。
//
// 之所以需要这套测试：running 标志曾经只被赋值、从没被读过，导致设置里
// 关掉萤火虫后画面照常闪烁，档位与主题的停用逻辑同样失效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', 'frontend', 'js', 'fireflies.js'
);

// 搭一个刚够 fireflies.js 用的浏览器环境，并返回推进帧循环的控制句柄。
function createHarness() {
    let rafQueue = [];
    let now = 0;
    let arcCalls = 0;

    const docListeners = {};
    const winListeners = {};
    const addListener = (map, type, fn) => (map[type] = map[type] || []).push(fn);
    const fire = (map, type) => (map[type] || []).forEach((fn) => fn({ type }));

    const noop = () => {};
    const canvasStub = {
        className: '',
        style: {},
        width: 0,
        height: 0,
        getContext: () => ({
            setTransform: noop,
            clearRect: noop,
            beginPath: noop,
            moveTo: noop,
            lineTo: noop,
            stroke: noop,
            fill: noop,
            arc: () => { arcCalls++; },
            createRadialGradient: () => ({ addColorStop: noop }),
            globalCompositeOperation: 'source-over',
            strokeStyle: '',
            fillStyle: '',
            lineWidth: 1,
            lineCap: ''
        })
    };

    const documentElement = {
        attrs: {},
        getAttribute(name) { return this.attrs[name] === undefined ? null : this.attrs[name]; },
        setAttribute(name, value) { this.attrs[name] = value; }
    };

    const document = {
        readyState: 'complete',
        hidden: false,
        documentElement,
        body: { appendChild: noop },
        createElement: () => canvasStub,
        addEventListener: (t, fn) => addListener(docListeners, t, fn)
    };

    const window = {
        devicePixelRatio: 1,
        innerWidth: 1200,
        innerHeight: 800,
        matchMedia: () => ({ matches: false }),
        addEventListener: (t, fn) => addListener(winListeners, t, fn)
    };

    const sandbox = {
        window,
        document,
        performance: { now: () => now },
        requestAnimationFrame: (cb) => rafQueue.push(cb),
        MutationObserver: class { observe() {} },
        console
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });

    // 推进 ms 毫秒（每步 16ms 约合 60fps），返回其中真正画了光点的帧数。
    function pump(ms, step = 16) {
        let painted = 0;
        for (let t = 0; t < ms; t += step) {
            now += step;
            const pending = rafQueue;
            rafQueue = [];
            pending.forEach((cb) => {
                const before = arcCalls;
                cb(now);
                if (arcCalls > before) painted++;
            });
        }
        return painted;
    }

    return {
        Fireflies: window.Fireflies,
        pump,
        fireResize: () => fire(winListeners, 'resize'),
        fireVisibilityChange: () => fire(docListeners, 'visibilitychange'),
        setTheme: (theme) => documentElement.setAttribute('data-theme', theme),
        setHidden: (hidden) => { document.hidden = hidden; }
    };
}

// 一秒钟约 60 帧；留出余量，只区分「在正常跑」和「没跑」。
const RUNNING = 30;
const HALF_SECOND = 15;

test('开启后正常渲染', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    assert.ok(h.pump(1000) >= RUNNING, '开启后应持续出帧');
});

test('关闭后停止渲染（设置的开关必须真的生效）', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);
    h.Fireflies.setEnabled(false);
    assert.equal(h.pump(1000), 0, '关闭后不应再画任何一帧');
});

test('关闭状态下改变窗口大小不会复活画面', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);
    h.Fireflies.setEnabled(false);
    h.fireResize();
    assert.equal(h.pump(1000), 0, '引擎还在，但不能因为 resize 就重新启动');
});

test('重新开启后恢复渲染', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);
    h.Fireflies.setEnabled(false);
    h.pump(200);
    h.Fireflies.setEnabled(true);
    assert.ok(h.pump(1000) >= RUNNING, '重新开启后应恢复出帧');
});

test('快速关闭再开启只留下一条循环', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);
    h.Fireflies.setEnabled(false);
    h.Fireflies.setEnabled(true);
    const painted = h.pump(500);
    assert.ok(painted >= HALF_SECOND, `半秒内至少应有 ${HALF_SECOND} 帧，实际 ${painted}`);
    assert.ok(painted <= 40, `半秒内不应超过 40 帧（两条循环会翻倍），实际 ${painted}`);
});

test('浅色主题停用，切回深色恢复', () => {
    const h = createHarness();
    h.setTheme('light');
    h.Fireflies.setEnabled(true);
    assert.equal(h.pump(500), 0, '浅色主题下不启动');

    h.setTheme('dark');
    h.Fireflies.setEnabled(true);
    assert.ok(h.pump(500) >= HALF_SECOND, '切回深色应恢复');
});

test('页面隐藏时暂停，切回前台恢复', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);

    h.setHidden(true);
    assert.equal(h.pump(500), 0, '隐藏时不应出帧');

    h.setHidden(false);
    h.fireVisibilityChange();
    assert.ok(h.pump(500) >= HALF_SECOND, '回到前台应恢复');
});

test('关闭状态下调档位不会出帧，重新开启后生效', () => {
    const h = createHarness();
    h.Fireflies.setEnabled(true);
    h.pump(200);
    h.Fireflies.setEnabled(false);

    h.Fireflies.setCount(1);
    h.Fireflies.setSpeed(1);
    assert.equal(h.pump(300), 0, '关闭状态下改档位不应出帧');

    h.Fireflies.setEnabled(true);
    assert.ok(h.pump(500) >= HALF_SECOND, '重新开启后应正常出帧');
});

test('非法档位回落到默认档而不是崩掉', () => {
    const h = createHarness();
    h.Fireflies.setCount(0);
    h.Fireflies.setSpeed(99);
    h.Fireflies.setEnabled(true);
    assert.ok(h.pump(500) >= HALF_SECOND, '脏档位不应影响渲染');
});
