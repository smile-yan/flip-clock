/**
 * 萤火虫背景效果（自包含，无依赖）
 *
 * 在一张全屏固定画布上模拟一群发光的萤火虫：
 *   - 每只萤火虫在「缓慢滑翔」与「急速冲刺」两种状态间随机切换，
 *     转向由多组正弦叠加的平滑噪声驱动，轨迹自然蜿蜒；
 *   - 亮度按各自周期闪烁，大部分时间是微弱余晖，周期性亮起；
 *   - 默认不开启，由设置里的「萤火虫」开关通过 window.Fireflies.setEnabled 控制；
 *   - 浅色主题（light/sepia）下自动停用——就像白天看不到萤火虫；
 *   - prefers-reduced-motion 时完全不启动；
 *   - 页面隐藏时暂停渲染，避免空转耗电。
 */
(function () {
    'use strict';

    var MIN_FIREFLIES = 8;
    var MAX_FIREFLIES = 24;

    // 萤火虫体色（黄绿 → 暖黄，参考真实萤火虫的生物光）
    var COLORS = [
        [200, 255, 120],
        [225, 255, 140],
        [255, 244, 140],
        [170, 255, 160]
    ];

    // 画布引擎：惰性创建，只在真正需要显示时才挂到 DOM 上
    function createEngine() {
        var canvas = document.createElement('canvas');
        canvas.className = 'fireflies-canvas';
        document.body.appendChild(canvas);
        var ctx = canvas.getContext('2d');

        var W = 0;
        var H = 0;
        var flies = [];
        var last = 0;
        var running = false;

        // === 平滑伪噪声：3 组随机正弦叠加，输出约 [-1, 1]，用于转向 ===
        function makeWobble() {
            var parts = [];
            var sum = 0;
            for (var i = 0; i < 3; i++) {
                var amp = 0.4 + Math.random() * 0.6;
                sum += amp;
                parts.push({
                    amp: amp,
                    freq: 0.3 + Math.random() * 1.1,
                    phase: Math.random() * Math.PI * 2
                });
            }
            return function (t) {
                var v = 0;
                for (var i = 0; i < 3; i++) {
                    v += parts[i].amp * Math.sin(t * parts[i].freq + parts[i].phase);
                }
                return v / sum;
            };
        }

        function Firefly() {
            this.wobble = makeWobble();
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.heading = Math.random() * Math.PI * 2;
            this.size = 1.1 + Math.random() * 1.4;            // 亮核半径 px
            this.rgb = COLORS[(Math.random() * COLORS.length) | 0];
            this.flashPeriod = 2000 + Math.random() * 3000;   // 闪烁周期 ms
            this.flashAt = Math.random() * this.flashPeriod;  // 相位错开，避免齐闪
            this.flashDuty = 0.16 + Math.random() * 0.16;     // 亮起时间占比
            this.speed = 10 + Math.random() * 20;
            this.targetSpeed = this.speed;
            this.retargetAt = 0;                              // 首帧即切换一次状态
        }

        Firefly.prototype.update = function (dt, now) {
            // 状态切换：多数时间缓慢滑翔，偶尔急速冲刺一段
            if (now >= this.retargetAt) {
                if (Math.random() < 0.28) {
                    this.targetSpeed = 150 + Math.random() * 150;
                    this.retargetAt = now + 400 + Math.random() * 800;
                    // 冲刺前换个方向
                    this.heading += (Math.random() - 0.5) * 2.2;
                } else {
                    this.targetSpeed = 8 + Math.random() * 26;
                    this.retargetAt = now + 1200 + Math.random() * 2800;
                }
            }

            // 速度朝目标缓入缓出：加速快、减速慢，更像昆虫的爆发式飞行
            if (this.speed < this.targetSpeed) {
                this.speed = Math.min(this.targetSpeed, this.speed + 300 * dt);
            } else {
                this.speed = Math.max(this.targetSpeed, this.speed - 420 * dt);
            }

            // 转向：慢速时蜿蜒游走，冲刺时轨迹更直
            var wander = this.speed > 90 ? 0.6 : 1.5;
            this.heading += this.wobble(now / 1000) * wander * dt;

            this.x += Math.cos(this.heading) * this.speed * dt;
            this.y += Math.sin(this.heading) * this.speed * dt;

            // 越界环绕：飞出一边，再从另一边飞入
            var m = 40;
            if (this.x < -m) this.x = W + m;
            else if (this.x > W + m) this.x = -m;
            if (this.y < -m) this.y = H + m;
            else if (this.y > H + m) this.y = -m;
        };

        // 闪烁曲线：低亮余晖 + 周期内一小段快速亮起再熄灭
        Firefly.prototype.brightness = function (now) {
            var p = ((now - this.flashAt) % this.flashPeriod + this.flashPeriod) % this.flashPeriod;
            p /= this.flashPeriod;
            var b = 0.16;
            if (p < this.flashDuty) {
                b += Math.pow(Math.sin(Math.PI * (p / this.flashDuty)), 1.6) * 0.84;
            }
            // 冲刺时略亮
            b *= 1 + Math.min(this.speed / 300, 1) * 0.35;
            return Math.min(b, 1);
        };

        function rgba(rgb, a) {
            return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' +
                Math.max(0, Math.min(1, a)).toFixed(3) + ')';
        }

        function drawFly(f, b) {
            var r = f.rgb;

            // 冲刺轨迹：沿飞行方向的微弱光痕
            if (f.speed > 90) {
                var len = Math.min(f.speed * 0.07, 20);
                ctx.strokeStyle = rgba(r, 0.12 * b);
                ctx.lineWidth = f.size * 1.1;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(f.x - Math.cos(f.heading) * len, f.y - Math.sin(f.heading) * len);
                ctx.lineTo(f.x, f.y);
                ctx.stroke();
            }

            // 光晕
            var glow = f.size * (6 + 10 * b);
            var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glow);
            g.addColorStop(0, rgba(r, 0.6 * b + 0.08));
            g.addColorStop(0.3, rgba(r, 0.2 * b));
            g.addColorStop(1, rgba(r, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(f.x, f.y, glow, 0, Math.PI * 2);
            ctx.fill();

            // 亮核
            ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * b).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.size * (0.55 + 0.5 * b), 0, Math.PI * 2);
            ctx.fill();
        }

        function syncCount() {
            var want = Math.max(MIN_FIREFLIES,
                Math.min(MAX_FIREFLIES, Math.round(W * H / 40000)));
            while (flies.length < want) flies.push(new Firefly());
            flies.length = Math.min(flies.length, want);
        }

        function resize() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            syncCount();
        }

        function frame(now) {
            if (document.hidden) {
                running = false;
                return;
            }
            requestAnimationFrame(frame);
            var dt = Math.min((now - last) / 1000, 0.05) || 0.016;
            last = now;

            ctx.clearRect(0, 0, W, H);
            // 加色混合，让光点叠加在深色背景上更像真实发光
            ctx.globalCompositeOperation = 'lighter';
            for (var i = 0; i < flies.length; i++) {
                var f = flies[i];
                f.update(dt, now);
                drawFly(f, f.brightness(now));
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        return {
            start: function () {
                resize();
                if (running) return;
                running = true;
                last = performance.now();
                requestAnimationFrame(frame);
            },
            stop: function () {
                running = false;
                ctx.clearRect(0, 0, W, H);
            }
        };
    }

    var engine = null;
    var userEnabled = false;

    // 唯一的启停决策点：开关、主题、页面可见性三者共同决定是否运行
    function sync() {
        var theme = document.documentElement.getAttribute('data-theme') || 'dark';
        var themeOk = !(theme === 'light' || theme === 'sepia');
        if (userEnabled && themeOk && !document.hidden) {
            if (!engine) engine = createEngine();
            engine.start();
        } else if (engine) {
            engine.stop();
        }
    }

    function start() {
        if (window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            // 尊重系统「减弱动态效果」设置：永远不启动
            window.Fireflies = { setEnabled: function () {} };
            return;
        }

        window.Fireflies = {
            setEnabled: function (on) {
                userEnabled = !!on;
                sync();
            }
        };

        window.addEventListener('resize', function () {
            // 画布尺寸跟随窗口；引擎未创建时无需处理
            if (engine) engine.start();
        });
        document.addEventListener('visibilitychange', sync);
        // 主题切换时动态启停（applyTheme 设置 data-theme 后这里会收到通知）
        new MutationObserver(sync).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        sync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
