// content-scripts/utils/emptyPageHandler.js - Lightweight Module
(function (global) {
    'use strict';

    const COOLDOWN_DURATION = 20000;
    let actionCooldown = false, cooldownTimer = null;

    const setCooldown = () => {
        actionCooldown = true;
        localStorage.setItem('bls_cooldown_end', (Date.now() + COOLDOWN_DURATION).toString());
        if (cooldownTimer) clearTimeout(cooldownTimer);
        cooldownTimer = setTimeout(() => {
            actionCooldown = false;
            localStorage.removeItem('bls_cooldown_end');
        }, COOLDOWN_DURATION);
    };

    const checkStoredCooldown = () => {
        const cooldownEnd = localStorage.getItem('bls_cooldown_end');
        if (!cooldownEnd) return false;
        const endTime = parseInt(cooldownEnd), now = Date.now();
        if (endTime <= now) {
            localStorage.removeItem('bls_cooldown_end');
            return false;
        }
        actionCooldown = true;
        cooldownTimer = setTimeout(() => {
            actionCooldown = false;
            localStorage.removeItem('bls_cooldown_end');
        }, endTime - now);
        return true;
    };

    const handleWebSocketBroadcast = (data) => {
        if (!data || data.message !== 'TSIGNAL_CALENDAR_OPEN' || actionCooldown) return;
        if (document.querySelector('header') || document.querySelector('footer')) return;
        console.log('EmptyPageHandler: Calendar signal received, refreshing');
        setCooldown();
        window.location.reload();
    };

    class EmptyPageHandler {
        constructor() {
            this.state = { active: false, timer: null };
            this.timeSyncData = null;
            this.extensionSettings = null;
            this.isTooMany = document.querySelector('h1')?.textContent.includes('Too Many') || document.querySelector('h1')?.textContent.includes('Temporarily Restricted');
            if (this.isTooMany) {
                document.documentElement.style.backgroundColor = 'rgb(var(--bs-danger-rgb))';
                document.body.style.backgroundColor = 'rgb(var(--bs-danger-rgb))';
            }
            checkStoredCooldown();
            this.setupWebSocketListeners();

            this.timeSyncFunctions = {
                getSyncedTime() {
                    // Always use offset from Infos.js - NO FALLBACK
                    if (typeof window.currentTimeOffset === 'undefined' || window.currentTimeOffset === false) {
                        alert('sa3a ghalta, clicki bach tjib misajour');
                        throw new Error('No time sync available');
                    }

                    const timeOffset = window.currentTimeOffset;
                    const timestamp = Date.now() + timeOffset;
                    return {
                        timestamp,
                        date: new Date(timestamp),
                        offset: timeOffset,
                        precision: {
                            milliseconds: Math.floor(timestamp % 1000),
                            microseconds: Math.floor((timestamp % 1) * 1000)
                        }
                    };
                },
                calculateDelayForTargetTime(targetSecond, targetMillisecond = 0) {
                    const syncedTime = this.getSyncedTime(), now = syncedTime.date;
                    const currentMs = now.getSeconds() * 1000 + now.getMilliseconds();
                    const targetMs = targetSecond * 1000 + targetMillisecond;
                    let delay = targetMs - currentMs;
                    if (delay <= 0) delay += 60000;
                    delay -= syncedTime.precision.microseconds / 1000;
                    console.log('[EmptyPageHandler] Delay calculation:', {
                        currentTime: `${now.getSeconds()}s ${now.getMilliseconds()}ms`,
                        targetTime: `${targetSecond}s ${targetMillisecond}ms`,
                        finalDelay: delay,
                        nextRunAt: new Date(now.getTime() + delay).toLocaleTimeString()
                    });
                    return Math.max(0, delay);
                }
            };
        }

        async loadExtensionData() {
            try {
                if (!window.getExtensionData) return;
                const data = await window.getExtensionData();
                if (data.timeSyncData) {
                    this.timeSyncData = data.timeSyncData;
                    console.log('[EmptyPageHandler] Time sync loaded:', data.timeSyncData.offset.toFixed(3) + 'ms');
                }
                this.extensionSettings = data.settings?.emptyPage || null;
                console.log('[EmptyPageHandler] Settings:', this.extensionSettings || 'none');
            } catch (e) {
                console.warn('[EmptyPageHandler] Failed to load data:', e);
                this.extensionSettings = null;
            }
        }

        setupWebSocketListeners() {
            window.addEventListener('message', (e) => {
                if (e.source !== window) return;
                const msg = e.data;
                if (msg?.type === 'FROM_EXTENSION_TO_PAGE' && msg.action === 'webSocketBroadcast' && msg.data) {
                    handleWebSocketBroadcast(msg.data);
                }
            });
            if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
                chrome.runtime.onMessage.addListener((msg) => {
                    if (msg.action === 'webSocketBroadcast' && msg.data) handleWebSocketBroadcast(msg.data);
                    return false;
                });
            }
        }

        async init() {
            if (document.getElementById('reloadControls')) return;
            console.log('[EmptyPageHandler] Initializing...');
            await this.loadExtensionData();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.createControls();
                    this.attachEvents();
                    this.checkAutoStart();
                });
            } else {
                this.createControls();
                this.attachEvents();
                this.checkAutoStart();
            }
        }

        createControls() {
            const o = this.extensionSettings || {};
            const m = o.mode?.toLowerCase() || '';
            const div = document.createElement('div');
            div.innerHTML = `
                <div id="reloadControls" class="position-fixed start-0 end-0 p-3 ${this.isTooMany ? 'bg-danger' : 'bg-white'} w-100">
                    <div class="container-fluid" style="max-width:380px">
                        <h5 class="text-center text-uppercase fw-bold mb-3 ${this.isTooMany ? 'text-white' : 'text-dark'}">
                            ${this.isTooMany ? '!! TOO MANY !!' : 'AUTO REQUEST'}
                        </h5>

                    <div class="d-flex gap-2 mb-2">
                        <button id="grBtn" class="btn ${localStorage.getItem('grEnabled') === '1' ? 'btn-success' : 'btn-danger'} fw-semibold w-50 mb-0" style="height:50px;font-size:12px">GR</button>
                        <button id="modeToggleBtn" class="btn btn-primary fw-normal w-50 mb-0" style="height:50px;font-size:16px">${m === 'scheduled' ? '<i class="fa-solid fa-clock"></i>' : '<i class="fa-solid fa-bolt"></i>'}</button>
                        <input type="hidden" id="mode" value="${m === 'scheduled' ? 'scheduled' : 'simple'}">
                    </div>

                    <div id="simpleOpts" class="d-flex gap-2 mb-2 ${m === 'scheduled' ? 'd-none' : ''}">
                        <input type="number" id="interval" value="${m === 'simple' ? o.milliseconds : ''}" min="500" placeholder="5000" class="form-control-sm w-100 border border-secondary" style="height:50px;font-size:14px">
                    </div>

                    <div id="scheduledOpts" class="d-flex gap-2 mb-2 ${m === 'scheduled' ? '' : 'd-none'}">
                        <input type="number" id="second" value="${m === 'scheduled' ? o.seconds : ''}" min="0" max="59" placeholder="sec" class="form-control-sm w-50 border border-secondary" style="height:50px;font-size:14px">
                        <input type="number" id="millisecond" value="${m === 'scheduled' ? o.milliseconds : ''}" min="0" max="999" placeholder="ms" class="form-control-sm w-50 border border-secondary" style="height:50px;font-size:14px">
                    </div>

                    <div class="form-check small mb-2">
                        <input type="checkbox" id="autoStartEnabled" ${o.autoStart ? 'checked' : ''} class="form-check-input">
                        <label class="form-check-label" for="autoStartEnabled">Auto-start on page load</label>
                    </div>

                    <div class="d-flex gap-2 mb-2">
                        <button id="startBtn" class="btn btn-sm text-white flex-fill" style="background:#28a745;border:none;padding:20px 0">START</button>
                        <button id="stopBtn" class="btn btn-sm text-white flex-fill" style="background:#ff3b30;border:none;padding:20px 0">STOP</button>
                        <button id="refreshBtn" class="btn btn-sm text-white flex-fill" style="background:#ff9f0a;border:none;padding:20px 0">REFRESH</button>
                    </div>

                    <div class="d-flex gap-2 mb-2">
                        <input type="number" id="groupRefreshDelay" value="${localStorage.getItem('groupRefreshDelay') || '1'}" min="0" class="form-control-sm w-50 border border-secondary" style="height:50px;font-size:14px">
                        <button id="GroupRefreshTrigger" class="btn text-white w-50 mb-0" style="height:50px;font-size:12px;background:#6c757d" disabled>DISCONNECTED</button>
                    </div>

                    <div id="status" class="alert alert-info py-2 text-center small mb-0">Ready</div>
                    </div>
                </div>`;
            document.body.prepend(div);

            // Call Infos.js to add client info to the h5
            if (typeof window.initializeInfoDisplay === 'function') {
                window.initializeInfoDisplay();
            }
        }

        attachEvents() {
            const els = ['mode', 'interval', 'second', 'millisecond', 'autoStartEnabled', 'startBtn', 'stopBtn', 'refreshBtn', 'status']
                .reduce((a, id) => ({ ...a, [id]: document.getElementById(id) }), {});

            const modeToggleBtn = document.getElementById('modeToggleBtn');
            const grBtn = document.getElementById('grBtn');

            modeToggleBtn.onclick = () => {
                const isScheduled = els.mode.value === 'scheduled';
                els.mode.value = isScheduled ? 'simple' : 'scheduled';
                modeToggleBtn.innerHTML = isScheduled ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-clock"></i>';
                document.getElementById('simpleOpts').classList.toggle('d-none', !isScheduled);
                document.getElementById('scheduledOpts').classList.toggle('d-none', isScheduled);
                this.saveOptions();
            };

            grBtn.onclick = () => {
                const isActive = grBtn.classList.contains('btn-success');
                grBtn.classList.toggle('btn-success', !isActive);
                grBtn.classList.toggle('btn-danger', isActive);
                localStorage.setItem('grEnabled', !isActive ? '1' : '0');
            };

            els.startBtn.onclick = () => this.start(els);
            els.stopBtn.onclick = () => this.stop(els);
            els.refreshBtn.onclick = () => this.refresh();

            const groupRefreshBtn = document.getElementById('GroupRefreshTrigger');
            const groupRefreshDelay = document.getElementById('groupRefreshDelay');
            const gsBtn = document.getElementById('btn-groupsubmit');

            groupRefreshDelay.onchange = () => localStorage.setItem('groupRefreshDelay', groupRefreshDelay.value);

            const updateGrBtn = (connected) => {
                groupRefreshBtn.textContent = connected ? 'GROUP REFRESH' : 'DISCONNECTED';
                groupRefreshBtn.style.background = connected ? '#8e44ad' : '#6c757d';
                groupRefreshBtn.disabled = !connected;
            };
            if (gsBtn) gsBtn.onclick = () => window.postMessage({ type: 'GROUPSUBMIT_REQUEST', source: 'emptyPageHandler', subscribe: 'refresh' }, '*');
            if (groupRefreshBtn) {
                groupRefreshBtn.onclick = () => {
                    const delay = groupRefreshDelay?.value || 1;
                    window.postMessage({ type: 'GROUPSUBMIT_TRIGGER', triggerDelay: delay, submitType: 'grouprefresh', timestamp: Date.now() + (window.currentTimeOffset || 0) }, '*');
                };
                window.addEventListener('message', (e) => {
                    if (e.data?.type === 'GROUPSUBMIT_STATUS') {
                        updateGrBtn(e.data.connected);
                        if (e.data.targetTime && window.currentTimeOffset) {
                            const countdownInterval = setInterval(() => {
                                const left = e.data.targetTime - (Date.now() + window.currentTimeOffset);
                                if (left <= 0) {
                                    clearInterval(countdownInterval);
                                    window.location.reload();
                                } else {
                                    els.status.textContent = `Group Refresh in ${(left / 1000).toFixed(1)}s`;
                                }
                            }, 100);
                        }
                    }
                });
                // Load initial status from storage
                window.getExtensionData?.().then(d => {
                    const gs = d?.websocketGroup;
                    updateGrBtn(!!gs);
                    if (gs && gs.subscribe && gs.subscribe !== 'refresh') {
                        window.postMessage({ type: 'GROUPSUBMIT_REQUEST', source: 'emptyPageHandler', subscribe: 'refresh' }, '*');
                    }
                }).catch(() => {});
            }
            [els.interval, els.second, els.millisecond, els.autoStartEnabled].forEach(el =>
                el && (el.onchange = () => this.saveOptions()));
        }

        async saveOptions() {
            try {
                const mode = document.getElementById('mode').value;
                const autoStart = document.getElementById('autoStartEnabled')?.checked || false;
                const emptyPageSettings = {
                    mode,
                    milliseconds: mode === 'simple' ?
                        (parseInt(document.getElementById('interval').value) || 0) :
                        (parseInt(document.getElementById('millisecond').value) || 0),
                    seconds: mode === 'scheduled' ? (parseInt(document.getElementById('second').value) || 0) : 0,
                    autoStart
                };

                if (window.setExtensionData) {
                    await window.setExtensionData('emptyPage', emptyPageSettings);
                    console.log('[EmptyPageHandler] Saved:', emptyPageSettings);
                    this.extensionSettings = emptyPageSettings;
                }

                localStorage.setItem('autoOpts', JSON.stringify({
                    mode,
                    interval: parseInt(document.getElementById('interval').value) || 5000,
                    second: parseInt(document.getElementById('second').value) || 0,
                    millisecond: parseInt(document.getElementById('millisecond').value) || 0,
                    autoStartEnabled: autoStart
                }));
            } catch (e) {
                console.error('[EmptyPageHandler] Save error:', e);
            }
        }

        async start(els) {
            if (this.state.active) return;
            const mode = els.mode.value;
            const valid = mode === 'simple' ?
                parseInt(els.interval.value) >= 500 :
                !isNaN(parseInt(els.second.value)) && parseInt(els.second.value) >= 0 && parseInt(els.second.value) <= 59;

            if (!valid) return alert('Invalid settings');

            await this.saveOptions();
            this.state.active = true;
            localStorage.setItem('autoRunning', '1');

            els.startBtn.disabled = true;
            els.status.textContent = 'Running...';
            els.status.className = 'alert alert-info py-2 text-center small mb-0';

            mode === 'simple' ? this.runSimple(els) : this.runScheduled(els);
        }

        stop(els) {
            if (!this.state.active) return;
            clearTimeout(this.state.timer);
            clearInterval(this.state.timer);
            this.state.active = false;
            localStorage.setItem('autoRunning', '0');

            els.startBtn.disabled = false;
            els.status.textContent = 'Stopped';
            els.status.className = 'alert alert-info py-2 text-center small mb-0';
        }

        runSimple(els) {
            if (!this.state.active) return;
            const interval = parseInt(els.interval.value);
            els.status.textContent = `Next reload in ${interval}ms`;
            this.state.timer = setTimeout(() => {
                // Clear active state before reload
                this.state.active = false;
                localStorage.setItem('autoRunning', '0');

                // Reload the page
                this.reload();

                // Auto-start will handle restarting if enabled
            }, interval);
        }

        runScheduled(els) {
            if (!this.state.active) return;
            const targetSec = parseInt(els.second.value) || 0;
            const targetMs = parseInt(els.millisecond.value) || 0;

            const schedule = () => {
                const delay = this.timeSyncFunctions.calculateDelayForTargetTime(targetSec, targetMs);
                els.status.textContent = `Target: :${targetSec.toString().padStart(2, '0')}.${targetMs.toString().padStart(3, '0')} | Wait: ${(delay / 1000).toFixed(1)}s`;
                this.state.timer = setTimeout(() => {
                    // Clear active state before reload
                    this.state.active = false;
                    localStorage.setItem('autoRunning', '0');

                    // Reload the page
                    this.reload();

                }, delay);
            };
            schedule();
        }

        reload() {
            const grBtn = document.getElementById('grBtn');
            if (grBtn?.classList.contains('btn-success')) {
                document.getElementById('GroupRefreshTrigger')?.click();
            } else {
                window.location.reload();
            }
        }
        refresh() { localStorage.setItem('manualRefresh', '1'); this.reload(); }

        checkAutoStart() {
            setTimeout(() => {
                const els = ['mode', 'interval', 'second', 'millisecond', 'autoStartEnabled', 'startBtn', 'stopBtn', 'status']
                    .reduce((a, id) => ({ ...a, [id]: document.getElementById(id) }), {});
                const wasRunning = localStorage.getItem('autoRunning') === '1';
                const autoStartEnabled = this.extensionSettings?.autoStart === true;
                if (autoStartEnabled || wasRunning) {
                    console.log('[EmptyPageHandler] Auto-starting...');
                    this.start(els);
                }
            }, 100);
        }
    }

    global.EmptyPageHandler = EmptyPageHandler;
    global.emptyPageHandlerInstance = null;
    global.getEmptyPageHandler = () => global.emptyPageHandlerInstance || (global.emptyPageHandlerInstance = new EmptyPageHandler());

    if (!document.querySelector('header') && !document.querySelector('footer') &&
        !window.location.href.toLowerCase().includes('/appointment/slotselection')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => global.getEmptyPageHandler().init());
        } else {
            global.getEmptyPageHandler().init();
        }
    }
})(window);