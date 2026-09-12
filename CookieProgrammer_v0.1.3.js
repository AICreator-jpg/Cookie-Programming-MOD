/*
 * Cookie Programmer MOD v0.1.3
 * Cookie Clicker JavaScript console mini-game
 *
 * Usage:
 *   1. Paste this file into Cookie Clicker's JavaScript console once.
 *   2. The mini-game is installed into the Javascript console building.
 *   3. It is also shown at level 0 during development.
 *
 * v0.1:
 *   - Mini-game style window inside Cookie Clicker
 *   - Add/save/load programs
 *   - Individual auto-load setting
 *   - Four initial blocks
 *   - Touch/tap placement + drag movement
 *   - Click block A, then block B to create a directed connection
 *   - Multiple outgoing/incoming connections
 *   - "ずっと" returns to its first child after its contents finish
 *   - Per-frame execution budget to reduce freeze risk
 *   - 500x500 grid workspace
 *   - Swipe/pan and pinch/wheel/button zoom
 *   - Building minigame expand/hide toggle
 *   - Block palette categories: control/operator/action
 *   - Palette sub-pages: page 1/page 2
 *   - If block and arithmetic/comparison blocks
 */
(function () {
    'use strict';

    var MOD_ID = 'CookieProgrammerMod';
    var VERSION = '0.1.3';
    var STORAGE_KEY = 'CookieProgrammerMod.v01';
    var ROOT_ID = 'cp-root';
    var STYLE_ID = 'cp-style';
    var JS_CONSOLE_NAME = 'Javascript console';
    var minigameDiv = null;
    var GRID_CELL_SIZE = 24;
    var GRID_COUNT = 500;
    var WORLD_SIZE = GRID_CELL_SIZE * GRID_COUNT;

    var state = {
        programs: [],
        currentId: null,
        nextBlockId: 1,
        nextProgramId: 1
    };

    var runtime = {
        running: false,
        programId: null,
        currentBlockId: null,
        loopStack: [],
        frameToken: null,
        connectionFrom: null,
        drag: null,
        view: { x: 40, y: 40, zoom: 1 },
        viewPointers: {},
        pinch: null,
        pan: null,
        paletteCategory: 'control',
        palettePage: 1,
        lastValue: 0,
        lastCondition: false
    };

    var BLOCK_TYPES = {
        running: { label: 'このプログラムを実行中', kind: 'start', color: '#f0a64b', category: 'control', page: 1 },
        forever: { label: 'ずっと', kind: 'control', color: '#70a6d8', category: 'control', page: 1 },
        if: { label: 'もし〜なら', kind: 'control', color: '#65a6d9', category: 'control', page: 1 },
        stop: { label: 'プログラムを停止', kind: 'stop', color: '#8d72b5', category: 'control', page: 1 },

        add: { label: '足し算', kind: 'operator', color: '#d8a84e', category: 'operator', page: 1 },
        subtract: { label: '引き算', kind: 'operator', color: '#d8a84e', category: 'operator', page: 1 },
        multiply: { label: '掛け算', kind: 'operator', color: '#d8a84e', category: 'operator', page: 1 },
        divide: { label: '割り算', kind: 'operator', color: '#d8a84e', category: 'operator', page: 1 },
        greater: { label: 'より大きい', kind: 'comparison', color: '#c9933f', category: 'operator', page: 2 },
        less: { label: 'より小さい', kind: 'comparison', color: '#c9933f', category: 'operator', page: 2 },
        equal: { label: '等しい', kind: 'comparison', color: '#c9933f', category: 'operator', page: 2 },

        click: { label: 'クリック対象をクリックする', kind: 'action', color: '#d96c6c', category: 'action', page: 1 }
    };

    var PALETTE_CATEGORIES = {
        control: { label: '制御', pages: 2 },
        operator: { label: '演算', pages: 2 },
        action: { label: '動作', pages: 2 }
    };

    function uid(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function defaultProgram(name) {
        return {
            id: 'p' + (state.nextProgramId++),
            name: name || '新しいプログラム',
            autoLoad: false,
            blocks: [],
            connections: []
        };
    }

    function defaultBlock(type, x, y) {
        var block = {
            id: 'b' + (state.nextBlockId++),
            type: type,
            x: x,
            y: y
        };
        if (type === 'if') { block.left = '0'; block.op = '>'; block.right = '0'; }
        if (['add','subtract','multiply','divide','greater','less','equal'].indexOf(type) >= 0) {
            block.a = '0';
            block.b = '0';
        }
        return block;
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[CookieProgrammer] 保存に失敗しました。', e);
        }
    }

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.programs)) return;

            state.programs = parsed.programs;
            state.currentId = parsed.currentId || null;
            state.nextBlockId = Number(parsed.nextBlockId) || 1;
            state.nextProgramId = Number(parsed.nextProgramId) || 1;

            if (!state.programs.length) state.currentId = null;
            if (state.currentId && !state.programs.some(function (p) { return p.id === state.currentId; })) {
                state.currentId = state.programs[0] ? state.programs[0].id : null;
            }
        } catch (e) {
            console.warn('[CookieProgrammer] 保存データを読み込めませんでした。', e);
        }
    }

    function getCurrentProgram() {
        return state.programs.find(function (p) { return p.id === state.currentId; }) || null;
    }

    function getBlock(program, id) {
        return program && program.blocks.find(function (b) { return b.id === id; }) || null;
    }

    function outgoing(program, id) {
        return program.connections
            .filter(function (c) { return c.from === id; })
            .sort(function (a, b) { return a.order - b.order; });
    }

    function incoming(program, id) {
        return program.connections.filter(function (c) { return c.to === id; });
    }

    function blockElement(id) {
        return document.querySelector('.cp-block[data-block-id="' + id + '"]');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID}{position:relative;width:100%;height:100%;min-height:260px;z-index:1;display:flex;font-family:Arial,"Trebuchet MS",sans-serif;color:#333;touch-action:none;box-sizing:border-box}
#${ROOT_ID} .cp-dim{display:none}
#${ROOT_ID} .cp-window{position:relative;width:100%;height:100%;min-height:260px;background:#eee;border:0;border-radius:0;box-shadow:none;overflow:hidden;display:flex;flex-direction:column}
#${ROOT_ID} .cp-title{height:48px;background:#555;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 16px;font-weight:bold}
#${ROOT_ID} .cp-title button,#${ROOT_ID} button{font:inherit}
#${ROOT_ID} .cp-close{background:#a33;color:#fff;border:2px solid #ddd;border-radius:5px;padding:4px 12px;cursor:pointer}
#${ROOT_ID} .cp-body{flex:1;min-height:0;display:flex}
#${ROOT_ID} .cp-sidebar{width:270px;background:#ddd;border-right:3px solid #aaa;padding:10px;box-sizing:border-box;overflow:auto}
#${ROOT_ID} .cp-editor{flex:1;min-width:0;display:flex;flex-direction:column}
#${ROOT_ID} .cp-programs{display:flex;gap:5px;margin-bottom:8px}
#${ROOT_ID} .cp-programs select{flex:1;min-width:0;padding:7px}
#${ROOT_ID} .cp-btn{padding:7px 10px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer}
#${ROOT_ID} .cp-btn:active{transform:translateY(1px)}
#${ROOT_ID} .cp-palette-tabs,#${ROOT_ID} .cp-palette-pages{display:flex;gap:4px;margin:6px 0;flex-wrap:wrap}
#${ROOT_ID} .cp-palette-tab,#${ROOT_ID} .cp-palette-page{flex:1;min-width:0;padding:6px 4px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer;font-size:12px}
#${ROOT_ID} .cp-palette-tab.active,#${ROOT_ID} .cp-palette-page.active{background:#bbb;font-weight:bold}
#${ROOT_ID} .cp-block-palette-title{font-weight:bold;margin:10px 0 6px}
#${ROOT_ID} .cp-palette-block{margin:7px 0;padding:10px;border:2px solid #888;border-radius:7px;cursor:pointer;user-select:none;touch-action:manipulation}
#${ROOT_ID} .cp-palette-block[data-type="running"]{background:#f0a64b}
#${ROOT_ID} .cp-palette-block[data-type="click"]{background:#d96c6c}
#${ROOT_ID} .cp-palette-block[data-type="forever"]{background:#70a6d8}
#${ROOT_ID} .cp-palette-block[data-type="stop"]{background:#8d72b5;color:#fff}
#${ROOT_ID} .cp-help{font-size:12px;line-height:1.45;background:#eee;border:1px solid #aaa;border-radius:6px;padding:8px;margin-top:10px}
#${ROOT_ID} .cp-canvas-wrap{position:relative;flex:1;min-height:0;background:#f7f1df;overflow:hidden;touch-action:none;cursor:grab}
#${ROOT_ID} .cp-canvas-wrap.panning{cursor:grabbing}
#${ROOT_ID} .cp-world{position:absolute;left:0;top:0;width:${WORLD_SIZE}px;height:${WORLD_SIZE}px;transform-origin:0 0;will-change:transform}
#${ROOT_ID} .cp-grid{position:absolute;left:0;top:0;width:${WORLD_SIZE}px;height:${WORLD_SIZE}px;background-image:linear-gradient(rgba(100,100,100,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(100,100,100,.08) 1px,transparent 1px);background-size:${GRID_CELL_SIZE}px ${GRID_CELL_SIZE}px}
#${ROOT_ID} .cp-lines{position:absolute;left:0;top:0;width:${WORLD_SIZE}px;height:${WORLD_SIZE}px;pointer-events:none;overflow:visible}
#${ROOT_ID} .cp-canvas{position:absolute;left:0;top:0;width:${WORLD_SIZE}px;height:${WORLD_SIZE}px}
#${ROOT_ID} .cp-block{position:absolute;min-width:185px;max-width:235px;padding:9px 12px;border:3px solid #555;border-radius:9px;box-sizing:border-box;box-shadow:2px 3px 4px rgba(0,0,0,.2);cursor:grab;user-select:none;touch-action:none}
#${ROOT_ID} .cp-block:active{cursor:grabbing}
#${ROOT_ID} .cp-block.selected{outline:4px solid #ffdd55;z-index:10}
#${ROOT_ID} .cp-block.connect-source{outline:4px solid #55ff88;z-index:11}
#${ROOT_ID} .cp-block .cp-handle{display:block;text-align:center;font-size:11px;opacity:.65;margin-bottom:3px}
#${ROOT_ID} .cp-block .cp-field{width:62px;box-sizing:border-box;padding:3px;border:1px solid #777;border-radius:3px;background:#fff}
#${ROOT_ID} .cp-block .cp-operator-row{display:flex;align-items:center;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:4px}
#${ROOT_ID} .cp-block .cp-condition-select{padding:3px;border:1px solid #777;border-radius:3px;background:#fff}
#${ROOT_ID} .cp-footer{height:48px;background:#ccc;border-top:3px solid #aaa;display:flex;align-items:center;gap:7px;padding:0 9px}
#${ROOT_ID} .cp-status{margin-left:auto;font-size:12px;max-width:45%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${ROOT_ID} .cp-zoom{font-size:12px;min-width:58px;text-align:center}
#${ROOT_ID} .cp-run{background:#79b957}
#${ROOT_ID} .cp-stop{background:#d66}
#${ROOT_ID} .cp-modal{position:absolute;z-index:100;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
#${ROOT_ID} .cp-modal.show{display:flex}
#${ROOT_ID} .cp-dialog{width:min(420px,90%);background:#eee;border:3px solid #555;border-radius:9px;padding:14px;box-shadow:0 8px 25px rgba(0,0,0,.4)}
#${ROOT_ID} .cp-dialog input{width:100%;box-sizing:border-box;padding:8px;margin:8px 0}
#${ROOT_ID} .cp-dialog .row{display:flex;gap:8px;justify-content:flex-end}
@media(max-width:720px){
#${ROOT_ID} .cp-window{width:100vw;height:100vh;border-radius:0;border-width:0}
#${ROOT_ID} .cp-sidebar{width:170px}
#${ROOT_ID} .cp-block{min-width:150px;max-width:200px;font-size:13px}
#${ROOT_ID} .cp-status{display:none}
}
`;
        document.head.appendChild(style);
    }

    function ensureRoot(parent) {
        var root = document.getElementById(ROOT_ID);
        if (root) {
            if (parent && root.parentNode !== parent) parent.appendChild(root);
            return root;
        }

        root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
<div class="cp-dim"></div>
<div class="cp-window">
  <div class="cp-title">
    <span>Cookie Programmer v${VERSION}</span>
    <button class="cp-close">×</button>
  </div>
  <div class="cp-body">
    <aside class="cp-sidebar">
      <div class="cp-programs">
        <select class="cp-program-select"></select>
        <button class="cp-btn cp-add-program">＋</button>
      </div>
      <button class="cp-btn cp-rename-program">名前変更</button>
      <button class="cp-btn cp-delete-program">削除</button>
      <label style="display:block;margin-top:9px;font-size:13px">
        <input type="checkbox" class="cp-auto-load"> このプログラムを自動ロード
      </label>
      <div class="cp-block-palette-title">ブロック</div>
      <div class="cp-palette-tabs">
        <button class="cp-palette-tab active" data-category="control">制御</button>
        <button class="cp-palette-tab" data-category="operator">演算</button>
        <button class="cp-palette-tab" data-category="action">動作</button>
      </div>
      <div class="cp-palette-pages">
        <button class="cp-palette-page active" data-page="1">ページ1</button>
        <button class="cp-palette-page" data-page="2">ページ2</button>
      </div>
      <div class="cp-palette-list"></div>
      <div class="cp-help">
        <b>配置：</b>ブロックをタップ/クリックすると追加。追加後はドラッグで移動できます。<br><br>
        <b>接続：</b>先に実行するブロックをクリック → 後に実行するブロックをクリック。複数接続できます。<br><br>
        <b>もし〜なら：</b>1本目の接続が条件成立時、2本目の接続が条件不成立時です。<br><br>
        <b>演算：</b>数値欄を入力して実行すると、計算結果を内部に保持します。<br><br>
        <b>ページ：</b>制御・演算・動作それぞれにページ1/2があります。今後ブロックを増やすときに分類できます。
      </div>
    </aside>
    <section class="cp-editor">
      <div class="cp-canvas-wrap">
        <div class="cp-world">
          <div class="cp-grid"></div>
          <svg class="cp-lines" preserveAspectRatio="none"></svg>
          <div class="cp-canvas"></div>
        </div>
      </div>
    </section>
  </div>
  <div class="cp-footer">
    <button class="cp-btn cp-run">▶ 実行</button>
    <button class="cp-btn cp-stop">■ 停止</button>
    <button class="cp-btn cp-save">保存</button>
    <button class="cp-btn cp-load">ロード</button>
    <button class="cp-btn cp-clear-connections">接続選択解除</button>
    <button class="cp-btn cp-zoom-out">－</button>
    <span class="cp-zoom">100%</span>
    <button class="cp-btn cp-zoom-in">＋</button>
    <button class="cp-btn cp-zoom-reset">100%</button>
    <span class="cp-status"></span>
  </div>
  <div class="cp-modal">
    <div class="cp-dialog">
      <b class="cp-dialog-title"></b>
      <input class="cp-dialog-input">
      <div class="row">
        <button class="cp-btn cp-dialog-cancel">キャンセル</button>
        <button class="cp-btn cp-dialog-ok">OK</button>
      </div>
    </div>
  </div>
</div>`;
        (parent || document.body).appendChild(root);
        bindEvents(root);
        return root;
    }

    function setStatus(text) {
        var root = document.getElementById(ROOT_ID);
        if (root) root.querySelector('.cp-status').textContent = text || '';
    }

    function renderPrograms() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        var select = root.querySelector('.cp-program-select');
        select.innerHTML = '';
        state.programs.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
        if (state.currentId) select.value = state.currentId;

        var p = getCurrentProgram();
        root.querySelector('.cp-auto-load').checked = !!(p && p.autoLoad);
    }

    function renderCanvas() {
        var root = document.getElementById(ROOT_ID);
        var canvas = root.querySelector('.cp-canvas');
        canvas.innerHTML = '';
        var p = getCurrentProgram();
        if (!p) {
            drawLines();
            return;
        }

        p.blocks.forEach(function (b) {
            var el = document.createElement('div');
            var def = BLOCK_TYPES[b.type];
            el.className = 'cp-block';
            el.dataset.blockId = b.id;
            el.dataset.type = b.type;
            el.style.left = b.x + 'px';
            el.style.top = b.y + 'px';
            el.style.background = def.color;
            el.innerHTML = blockInnerHtml(b);
            canvas.appendChild(el);
            bindBlockFields(el, b);
            attachBlockPointer(el);
        });

        updateSelectionVisuals();
        applyView();
    }

    function blockInnerHtml(b) {
        var def = BLOCK_TYPES[b.type];
        var head = '<span class="cp-handle">●</span>';
        if (b.type === 'if') {
            return head + '<div><b>もし</b></div><div class="cp-operator-row"><input class="cp-field" data-field="left" value="' + escapeHtml(b.left == null ? '0' : b.left) + '"><select class="cp-condition-select" data-field="op"><option value=">&gt;</option><option value="<">&lt;</option><option value="==">=</option><option value=">=">≧</option><option value="<=">≦</option><option value="!=">≠</option></select><input class="cp-field" data-field="right" value="' + escapeHtml(b.right == null ? '0' : b.right) + '"></div><div style="text-align:center;margin-top:3px">なら</div>';
        }
        if (def.kind === 'operator' || def.kind === 'comparison') {
            var symbol = {add:'＋',subtract:'−',multiply:'×',divide:'÷',greater:'＞',less:'＜',equal:'＝'}[b.type] || '';
            return head + '<div style="text-align:center"><b>' + escapeHtml(def.label) + '</b></div><div class="cp-operator-row"><input class="cp-field" data-field="a" value="' + escapeHtml(b.a == null ? '0' : b.a) + '"><span>' + symbol + '</span><input class="cp-field" data-field="b" value="' + escapeHtml(b.b == null ? '0' : b.b) + '"></div>';
        }
        return head + escapeHtml(def.label);
    }

    function bindBlockFields(el, block) {
        el.querySelectorAll('[data-field]').forEach(function (field) {
            if (field.tagName === 'SELECT' && block.type === 'if') field.value = block.op || '>';
            field.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
            field.addEventListener('click', function (ev) { ev.stopPropagation(); });
            field.addEventListener('change', function () {
                block[this.dataset.field] = this.value;
                saveState();
            });
            field.addEventListener('input', function () {
                block[this.dataset.field] = this.value;
                saveState();
            });
        });
    }

    function renderPalette() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.cp-palette-tab').forEach(function (el) {
            el.classList.toggle('active', el.dataset.category === runtime.paletteCategory);
        });
        root.querySelectorAll('.cp-palette-page').forEach(function (el) {
            el.classList.toggle('active', Number(el.dataset.page) === runtime.palettePage);
        });
        var list = root.querySelector('.cp-palette-list');
        list.innerHTML = '';
        Object.keys(BLOCK_TYPES).forEach(function (type) {
            var def = BLOCK_TYPES[type];
            if (def.category !== runtime.paletteCategory || def.page !== runtime.palettePage) return;
            var el = document.createElement('div');
            el.className = 'cp-palette-block';
            el.dataset.type = type;
            el.style.background = def.color;
            if (def.kind === 'stop') el.style.color = '#fff';
            el.textContent = def.label;
            list.appendChild(el);
            el.addEventListener('click', function () {
                var wrap = root.querySelector('.cp-canvas-wrap');
                var rect = wrap.getBoundingClientRect();
                var center = canvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                addBlock(this.dataset.type, center.x, center.y);
            });
        });
        if (!list.children.length) {
            var empty = document.createElement('div');
            empty.className = 'cp-help';
            empty.textContent = 'このページにはまだブロックがありません。今後ここに追加できます。';
            list.appendChild(empty);
        }
    }

    function canvasPoint(clientX, clientY) {
        var root = document.getElementById(ROOT_ID);
        var rect = root.querySelector('.cp-canvas-wrap').getBoundingClientRect();
        return {
            x: (clientX - rect.left - runtime.view.x) / runtime.view.zoom,
            y: (clientY - rect.top - runtime.view.y) / runtime.view.zoom
        };
    }

    function clampView() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        var wrap = root.querySelector('.cp-canvas-wrap');
        if (!wrap) return;
        var w = wrap.clientWidth;
        var h = wrap.clientHeight;
        var scaledW = WORLD_SIZE * runtime.view.zoom;
        var scaledH = WORLD_SIZE * runtime.view.zoom;
        var margin = 40;
        if (scaledW + margin * 2 <= w) runtime.view.x = (w - scaledW) / 2;
        else runtime.view.x = Math.min(margin, Math.max(w - scaledW - margin, runtime.view.x));
        if (scaledH + margin * 2 <= h) runtime.view.y = (h - scaledH) / 2;
        else runtime.view.y = Math.min(margin, Math.max(h - scaledH - margin, runtime.view.y));
    }

    function applyView() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        clampView();
        var world = root.querySelector('.cp-world');
        world.style.transform = 'translate(' + runtime.view.x + 'px,' + runtime.view.y + 'px) scale(' + runtime.view.zoom + ')';
        root.querySelector('.cp-zoom').textContent = Math.round(runtime.view.zoom * 100) + '%';
        drawLines();
    }

    function setZoom(zoom, centerX, centerY) {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        var wrap = root.querySelector('.cp-canvas-wrap');
        var rect = wrap.getBoundingClientRect();
        var cx = centerX == null ? rect.width / 2 : centerX - rect.left;
        var cy = centerY == null ? rect.height / 2 : centerY - rect.top;
        zoom = Math.max(0.25, Math.min(3, zoom));
        var worldX = (cx - runtime.view.x) / runtime.view.zoom;
        var worldY = (cy - runtime.view.y) / runtime.view.zoom;
        runtime.view.zoom = zoom;
        runtime.view.x = cx - worldX * zoom;
        runtime.view.y = cy - worldY * zoom;
        applyView();
    }

    function resetView() {
        runtime.view.zoom = 1;
        runtime.view.x = 40;
        runtime.view.y = 40;
        applyView();
    }

    function addBlock(type, x, y) {
        var p = getCurrentProgram();
        if (!p) return;
        var b = defaultBlock(type, Math.max(5, Math.min(WORLD_SIZE - 240, x - 90)), Math.max(5, Math.min(WORLD_SIZE - 80, y - 20)));
        p.blocks.push(b);
        saveState();
        renderCanvas();
        setStatus('ブロックを追加しました');
    }

    function removeConnection(from, to) {
        var p = getCurrentProgram();
        if (!p) return false;
        var before = p.connections.length;
        p.connections = p.connections.filter(function (c) {
            return !(c.from === from && c.to === to);
        });
        return before !== p.connections.length;
    }

    function connectBlocks(from, to) {
        var p = getCurrentProgram();
        if (!p || from === to) return;

        if (removeConnection(from, to)) {
            saveState();
            setStatus('接続を解除しました');
            drawLines();
            return;
        }

        var maxOrder = -1;
        p.connections.forEach(function (c) {
            if (c.from === from && c.order > maxOrder) maxOrder = c.order;
        });

        p.connections.push({
            id: uid('c'),
            from: from,
            to: to,
            order: maxOrder + 1
        });

        saveState();
        setStatus('接続しました');
        drawLines();
    }

    function updateSelectionVisuals() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.cp-block').forEach(function (el) {
            el.classList.toggle('connect-source', el.dataset.blockId === runtime.connectionFrom);
        });
    }

    function selectConnectionBlock(id) {
        if (!runtime.connectionFrom) {
            runtime.connectionFrom = id;
            setStatus('次に「後に実行するブロック」をクリックしてください');
        } else if (runtime.connectionFrom === id) {
            runtime.connectionFrom = null;
            setStatus('接続選択を解除しました');
        } else {
            connectBlocks(runtime.connectionFrom, id);
            runtime.connectionFrom = null;
        }
        updateSelectionVisuals();
    }

    function attachBlockPointer(el) {
        el.addEventListener('pointerdown', function (ev) {
            if (ev.button !== undefined && ev.button !== 0) return;
            ev.preventDefault();

            var p = getCurrentProgram();
            var b = getBlock(p, el.dataset.blockId);
            if (!b) return;

            var start = canvasPoint(ev.clientX, ev.clientY);
            runtime.drag = {
                id: b.id,
                startX: start.x,
                startY: start.y,
                origX: b.x,
                origY: b.y,
                moved: false,
                pointerId: ev.pointerId
            };
            try { el.setPointerCapture(ev.pointerId); } catch (e) {}
        });

        el.addEventListener('pointermove', function (ev) {
            var d = runtime.drag;
            if (!d || d.id !== el.dataset.blockId || d.pointerId !== ev.pointerId) return;
            var pt = canvasPoint(ev.clientX, ev.clientY);
            var dx = pt.x - d.startX;
            var dy = pt.y - d.startY;

            if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
            if (!d.moved) return;

            var p = getCurrentProgram();
            var b = getBlock(p, d.id);
            if (!b) return;

            b.x = Math.max(0, Math.min(WORLD_SIZE - 240, d.origX + dx));
            b.y = Math.max(0, Math.min(WORLD_SIZE - 80, d.origY + dy));
            el.style.left = b.x + 'px';
            el.style.top = b.y + 'px';
            drawLines();
        });

        el.addEventListener('pointerup', function (ev) {
            var d = runtime.drag;
            if (!d || d.id !== el.dataset.blockId || d.pointerId !== ev.pointerId) return;
            runtime.drag = null;

            if (d.moved) {
                saveState();
                return;
            }

            selectConnectionBlock(el.dataset.blockId);
        });

        el.addEventListener('pointercancel', function () {
            runtime.drag = null;
        });
    }

    function drawLines() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        var svg = root.querySelector('.cp-lines');
        var p = getCurrentProgram();
        svg.innerHTML = '';
        if (!p) return;

        var ns = 'http://www.w3.org/2000/svg';
        var defs = document.createElementNS(ns, 'defs');
        var marker = document.createElementNS(ns, 'marker');
        marker.setAttribute('id', 'cp-arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '7');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('orient', 'auto-start-reverse');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', '#555');
        marker.appendChild(path);
        defs.appendChild(marker);
        svg.appendChild(defs);

        p.connections.forEach(function (c) {
            var a = getBlock(p, c.from);
            var b = getBlock(p, c.to);
            var ae = blockElement(c.from);
            var be = blockElement(c.to);
            if (!a || !b || !ae || !be) return;

            var x1 = a.x + ae.offsetWidth / 2;
            var y1 = a.y + ae.offsetHeight;
            var x2 = b.x + be.offsetWidth / 2;
            var y2 = b.y;

            var curve = Math.max(25, Math.abs(y2 - y1) * .45);
            var d = 'M ' + x1 + ' ' + y1 +
                    ' C ' + x1 + ' ' + (y1 + curve) + ', ' +
                    x2 + ' ' + (y2 - curve) + ', ' +
                    x2 + ' ' + y2;

            var line = document.createElementNS(ns, 'path');
            line.setAttribute('d', d);
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', '#555');
            line.setAttribute('stroke-width', '3');
            line.setAttribute('marker-end', 'url(#cp-arrow)');
            svg.appendChild(line);
        });
    }

    function openNameDialog(title, initial, callback) {
        var root = document.getElementById(ROOT_ID);
        var modal = root.querySelector('.cp-modal');
        var input = root.querySelector('.cp-dialog-input');
        root.querySelector('.cp-dialog-title').textContent = title;
        input.value = initial || '';
        modal.classList.add('show');
        input.focus();

        function close() {
            modal.classList.remove('show');
            ok.removeEventListener('click', accept);
            cancel.removeEventListener('click', close);
            input.removeEventListener('keydown', key);
        }
        function accept() {
            var value = input.value.trim();
            if (value) callback(value);
            close();
        }
        function key(e) {
            if (e.key === 'Enter') accept();
            if (e.key === 'Escape') close();
        }

        var ok = root.querySelector('.cp-dialog-ok');
        var cancel = root.querySelector('.cp-dialog-cancel');
        ok.addEventListener('click', accept);
        cancel.addEventListener('click', close);
        input.addEventListener('keydown', key);
    }

    function addProgram() {
        openNameDialog('新しいプログラム名', '新しいプログラム', function (name) {
            var p = defaultProgram(name);
            state.programs.push(p);
            state.currentId = p.id;
            runtime.connectionFrom = null;
            saveState();
            renderPrograms();
            renderCanvas();
            setStatus('プログラムを追加しました');
        });
    }

    function deleteCurrentProgram() {
        var p = getCurrentProgram();
        if (!p) return;
        if (!confirm('「' + p.name + '」を削除しますか？')) return;

        stopProgram();
        state.programs = state.programs.filter(function (x) { return x.id !== p.id; });
        state.currentId = state.programs[0] ? state.programs[0].id : null;
        runtime.connectionFrom = null;
        saveState();
        renderPrograms();
        renderCanvas();
    }

    function renameCurrentProgram() {
        var p = getCurrentProgram();
        if (!p) return;
        openNameDialog('プログラム名を変更', p.name, function (name) {
            p.name = name;
            saveState();
            renderPrograms();
            setStatus('名前を変更しました');
        });
    }

    function seedFirstProgram() {
        if (state.programs.length) return;
        var p = defaultProgram('自動クリック・テスト');
        var a = defaultBlock('running', 80, 70);
        var b = defaultBlock('forever', 80, 190);
        var c = defaultBlock('click', 80, 310);
        p.blocks.push(a, b, c);
        p.connections.push(
            { id: uid('c'), from: a.id, to: b.id, order: 0 },
            { id: uid('c'), from: b.id, to: c.id, order: 0 }
        );
        state.programs.push(p);
        state.currentId = p.id;
        saveState();
    }

    function clickBigCookie() {
        try {
            if (typeof Game !== 'undefined' && Game.ClickCookie) {
                Game.ClickCookie();
                return true;
            }
        } catch (e) {}
        return false;
    }

    function readNumber(value) {
        value = String(value == null ? '0' : value).trim();
        if (value === '結果') return Number(runtime.lastValue) || 0;
        if (value === 'クッキー') {
            return (typeof Game !== 'undefined' && typeof Game.cookies === 'number') ? Game.cookies : 0;
        }
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function evaluateCondition(b) {
        var a = readNumber(b.left);
        var c = readNumber(b.right);
        switch (b.op || '>') {
            case '<': return a < c;
            case '==': return a === c;
            case '>=': return a >= c;
            case '<=': return a <= c;
            case '!=': return a !== c;
            default: return a > c;
        }
    }

    function executeOperator(b) {
        var a = readNumber(b.a);
        var c = readNumber(b.b);
        var result = 0;
        if (b.type === 'add') result = a + c;
        if (b.type === 'subtract') result = a - c;
        if (b.type === 'multiply') result = a * c;
        if (b.type === 'divide') result = c === 0 ? 0 : a / c;
        if (b.type === 'greater') result = a > c ? 1 : 0;
        if (b.type === 'less') result = a < c ? 1 : 0;
        if (b.type === 'equal') result = a === c ? 1 : 0;
        runtime.lastValue = result;
        runtime.lastCondition = !!result;
        return result;
    }

    function runProgram() {
        var p = getCurrentProgram();
        if (!p) {
            setStatus('プログラムがありません');
            return;
        }

        stopProgram();
        runtime.running = true;
        runtime.programId = p.id;

        var starts = p.blocks.filter(function (b) { return b.type === 'running'; });
        if (!starts.length) {
            runtime.running = false;
            setStatus('「このプログラムを実行中」ブロックがありません');
            return;
        }

        runtime.currentBlockId = starts[0].id;
        runtime.loopStack = [];
        setStatus('実行中: ' + p.name);
        scheduleFrame();
    }

    function stopProgram() {
        runtime.running = false;
        runtime.programId = null;
        runtime.currentBlockId = null;
        runtime.loopStack = [];
        if (runtime.frameToken !== null) {
            cancelAnimationFrame(runtime.frameToken);
            runtime.frameToken = null;
        }
        if (document.getElementById(ROOT_ID)) {
            setStatus('停止しました');
        }
    }

    function scheduleFrame() {
        if (!runtime.running) return;
        runtime.frameToken = requestAnimationFrame(function () {
            runtime.frameToken = null;
            executeFrame();
            if (runtime.running) scheduleFrame();
        });
    }

    /*
     * One frame never runs an unbounded loop.
     * "ずっと" is represented by a loop frame. When its child chain ends,
     * the next frame starts again at the first child.
     */
    function executeFrame() {
        var p = state.programs.find(function (x) { return x.id === runtime.programId; });
        if (!p) {
            stopProgram();
            return;
        }

        var budget = 64;
        var steps = 0;

        while (runtime.running && steps < budget) {
            var b = getBlock(p, runtime.currentBlockId);
            if (!b) {
                if (!returnFromLoopOrStop(p)) stopProgram();
                break;
            }

            steps++;

            if (b.type === 'running') {
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) stopProgram();
                continue;
            }

            if (b.type === 'click') {
                clickBigCookie();
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'add' || b.type === 'subtract' || b.type === 'multiply' || b.type === 'divide' || b.type === 'greater' || b.type === 'less' || b.type === 'equal') {
                executeOperator(b);
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'if') {
                var condition = evaluateCondition(b);
                runtime.lastCondition = condition;
                var branches = outgoing(p, b.id);
                runtime.currentBlockId = condition ? (branches[0] ? branches[0].to : null) : (branches[1] ? branches[1].to : null);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'stop') {
                stopProgram();
                break;
            }

            if (b.type === 'forever') {
                var children = outgoing(p, b.id);
                if (!children.length) {
                    // Empty forever: do nothing this frame and retry next frame.
                    runtime.currentBlockId = b.id;
                    break;
                }

                runtime.loopStack.push({
                    foreverId: b.id,
                    firstChildId: children[0].to
                });
                runtime.currentBlockId = children[0].to;
                continue;
            }

            runtime.currentBlockId = nextBlock(p, b.id);
        }

        if (runtime.running && steps >= budget) {
            // Yield to the next animation frame rather than risking a freeze.
            setStatus('実行中: ' + p.name + '（フレーム上限で次へ）');
        }
    }

    function nextBlock(p, id) {
        var outs = outgoing(p, id);
        return outs.length ? outs[0].to : null;
    }

    function returnFromLoopOrStop(p) {
        if (!runtime.loopStack.length) return false;

        var loop = runtime.loopStack[runtime.loopStack.length - 1];
        runtime.loopStack.pop();

        // The loop body is finished. Restart its first child on the next frame.
        runtime.currentBlockId = loop.firstChildId;
        runtime.loopStack.push(loop);
        return true;
    }

    function bindEvents(root) {
        root.querySelector('.cp-close').addEventListener('click', close);
        root.querySelector('.cp-add-program').addEventListener('click', addProgram);
        root.querySelector('.cp-delete-program').addEventListener('click', deleteCurrentProgram);
        root.querySelector('.cp-rename-program').addEventListener('click', renameCurrentProgram);

        root.querySelector('.cp-program-select').addEventListener('change', function () {
            stopProgram();
            state.currentId = this.value;
            runtime.connectionFrom = null;
            renderPrograms();
            renderCanvas();
        });

        root.querySelector('.cp-auto-load').addEventListener('change', function () {
            var p = getCurrentProgram();
            if (!p) return;
            p.autoLoad = this.checked;
            saveState();
            setStatus(this.checked ? '自動ロードをONにしました' : '自動ロードをOFFにしました');
        });

        root.querySelectorAll('.cp-palette-tab').forEach(function (el) {
            el.addEventListener('click', function () {
                runtime.paletteCategory = this.dataset.category;
                runtime.palettePage = 1;
                renderPalette();
            });
        });
        root.querySelectorAll('.cp-palette-page').forEach(function (el) {
            el.addEventListener('click', function () {
                runtime.palettePage = Number(this.dataset.page);
                renderPalette();
            });
        });
        renderPalette();

        root.querySelector('.cp-run').addEventListener('click', runProgram);
        root.querySelector('.cp-stop').addEventListener('click', stopProgram);
        root.querySelector('.cp-save').addEventListener('click', function () {
            saveState();
            setStatus('保存しました');
        });
        root.querySelector('.cp-load').addEventListener('click', function () {
            loadState();
            renderPrograms();
            renderCanvas();
            setStatus('保存データをロードしました');
        });
        root.querySelector('.cp-clear-connections').addEventListener('click', function () {
            runtime.connectionFrom = null;
            updateSelectionVisuals();
            setStatus('接続選択を解除しました');
        });

        var wrap = root.querySelector('.cp-canvas-wrap');

        root.querySelector('.cp-zoom-in').addEventListener('click', function () {
            var r = wrap.getBoundingClientRect();
            setZoom(runtime.view.zoom * 1.25, r.left + r.width / 2, r.top + r.height / 2);
        });
        root.querySelector('.cp-zoom-out').addEventListener('click', function () {
            var r = wrap.getBoundingClientRect();
            setZoom(runtime.view.zoom / 1.25, r.left + r.width / 2, r.top + r.height / 2);
        });
        root.querySelector('.cp-zoom-reset').addEventListener('click', resetView);

        wrap.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            var factor = ev.deltaY < 0 ? 1.1 : 0.9;
            setZoom(runtime.view.zoom * factor, ev.clientX, ev.clientY);
        }, {passive:false});

        wrap.addEventListener('pointerdown', function (ev) {
            if (ev.button !== undefined && ev.button !== 0) return;
            if (ev.target.closest && ev.target.closest('.cp-block')) return;

            runtime.connectionFrom = null;
            updateSelectionVisuals();
            runtime.viewPointers[ev.pointerId] = {x:ev.clientX, y:ev.clientY};
            try { wrap.setPointerCapture(ev.pointerId); } catch (e) {}

            var ids = Object.keys(runtime.viewPointers);
            if (ids.length === 1) {
                runtime.pan = {
                    pointerId: ev.pointerId,
                    startX: ev.clientX,
                    startY: ev.clientY,
                    origX: runtime.view.x,
                    origY: runtime.view.y
                };
                wrap.classList.add('panning');
            } else if (ids.length >= 2) {
                var a = runtime.viewPointers[ids[0]], b = runtime.viewPointers[ids[1]];
                var dx = b.x - a.x, dy = b.y - a.y;
                var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
                runtime.pinch = {
                    distance: Math.max(1, Math.hypot(dx,dy)),
                    zoom: runtime.view.zoom,
                    midX: midX,
                    midY: midY,
                    worldMidX: canvasPoint(midX, midY).x,
                    worldMidY: canvasPoint(midX, midY).y
                };
                runtime.pan = null;
            }
        });

        wrap.addEventListener('pointermove', function (ev) {
            if (!runtime.viewPointers[ev.pointerId]) return;
            runtime.viewPointers[ev.pointerId].x = ev.clientX;
            runtime.viewPointers[ev.pointerId].y = ev.clientY;

            var ids = Object.keys(runtime.viewPointers);
            if (ids.length >= 2) {
                var a = runtime.viewPointers[ids[0]], b = runtime.viewPointers[ids[1]];
                var dx = b.x - a.x, dy = b.y - a.y;
                var dist = Math.max(1, Math.hypot(dx,dy));
                var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
                if (!runtime.pinch) {
                    runtime.pinch = {
                        distance: dist, zoom: runtime.view.zoom,
                        midX: midX, midY: midY,
                        worldMidX: canvasPoint(midX, midY).x,
                        worldMidY: canvasPoint(midX, midY).y
                    };
                }
                var newZoom = Math.max(0.25, Math.min(3, runtime.pinch.zoom * dist / runtime.pinch.distance));
                var rect = wrap.getBoundingClientRect();
                var cx = midX - rect.left, cy = midY - rect.top;
                runtime.view.zoom = newZoom;
                runtime.view.x = cx - runtime.pinch.worldMidX * newZoom;
                runtime.view.y = cy - runtime.pinch.worldMidY * newZoom;
                applyView();
                return;
            }

            if (runtime.pan && runtime.pan.pointerId === ev.pointerId) {
                runtime.view.x = runtime.pan.origX + ev.clientX - runtime.pan.startX;
                runtime.view.y = runtime.pan.origY + ev.clientY - runtime.pan.startY;
                applyView();
            }
        });

        function endViewPointer(ev) {
            delete runtime.viewPointers[ev.pointerId];
            if (Object.keys(runtime.viewPointers).length < 2) runtime.pinch = null;
            if (!Object.keys(runtime.viewPointers).length) {
                runtime.pan = null;
                wrap.classList.remove('panning');
            }
        }
        wrap.addEventListener('pointerup', endViewPointer);
        wrap.addEventListener('pointercancel', endViewPointer);

        window.addEventListener('resize', function () {
            clampView();
            applyView();
        });
        applyView();
    }

    function getJavascriptConsole() {
        if (typeof Game === 'undefined' || !Game.Objects) return null;
        return Game.Objects[JS_CONSOLE_NAME] || null;
    }

    function getJavascriptConsoleMinigameDiv() {
        var obj = getJavascriptConsole();
        if (!obj) return null;

        // Cookie Clicker本体が各施設に用意しているミニゲーム領域。
        return document.getElementById('rowSpecial' + obj.id);
    }

    function setMinigameVisible(visible) {
        var obj = getJavascriptConsole();
        var div = getJavascriptConsoleMinigameDiv();
        if (!obj || !div) return false;

        div.style.display = visible ? 'block' : 'none';
        var root = document.getElementById(ROOT_ID);
        if (root) root.style.display = visible ? 'flex' : 'none';

        var rowCanvas = document.getElementById('rowCanvas' + obj.id);
        if (rowCanvas) rowCanvas.style.display = visible ? 'none' : 'block';

        // level 0でも表示できるよう、Game.isMinigameReady()/switchMinigame()は使わない。
        obj.onMinigame = visible ? 1 : 0;

        var row = document.getElementById('row' + obj.id);
        if (row) {
            if (visible) row.classList.add('onMinigame');
            else row.classList.remove('onMinigame');
        }

        // レベル0でも本家と同じ施設側のミニゲーム切替ボタンを使えるようにする。
        var button = document.getElementById('productMinigameButton' + obj.id);
        if (button) {
            button.style.display = 'block';
            button.textContent = visible ? 'Cookie Programmerを閉じる' : 'Cookie Programmerを見る';
            if (!button.dataset.cpBound) {
                button.dataset.cpBound = '1';
                button.onclick = function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setMinigameVisible(!obj.onMinigame);
                    PlaySound(obj.onMinigame ? 'snd/clickOn.mp3' : 'snd/clickOff.mp3');
                };
            }
        }

        return true;
    }

    function open() {
        injectStyle();
        loadState();
        seedFirstProgram();

        var obj = getJavascriptConsole();
        var div = getJavascriptConsoleMinigameDiv();

        if (!obj || !div) {
            console.warn('[CookieProgrammer] Javascript consoleのミニゲーム領域が見つかりません。');
            if (typeof Game !== 'undefined' && Game.Notify) {
                Game.Notify('Cookie Programmer', 'Javascriptコンソールのミニゲーム領域が見つかりません。', [16, 5], 5);
            }
            return false;
        }

        minigameDiv = div;
        var root = ensureRoot(div);
        root.style.display = 'flex';

        renderPrograms();
        renderCanvas();
        applyView();
        setStatus('準備完了');

        setMinigameVisible(true);
        return true;
    }

    function close() {
        stopProgram();
        var root = document.getElementById(ROOT_ID);
        if (root) root.style.display = 'none';
        setMinigameVisible(false);
    }

    function installJavascriptConsoleMinigame() {
        var obj = getJavascriptConsole();
        if (!obj) return false;

        // Cookie Clicker標準のミニゲーム登録方式に合わせる。
        // 外部ファイルを読み込ませず、このMOD自身をミニゲームとして登録する。
        var M = obj.minigame || {};
        M.parent = obj;
        M.name = 'Cookie Programmer';

        M.launch = function () {
            M.name = obj.minigameName || 'Cookie Programmer';
            M.init = function (div) {
                minigameDiv = div;
                injectStyle();
                loadState();
                seedFirstProgram();
                var root = ensureRoot(div);
                root.style.display = 'flex';
                renderPrograms();
                renderCanvas();
                applyView();
                setStatus('準備完了');
            };
            M.onResize = function () {
                drawLines();
            };
            M.save = function () {
                return JSON.stringify(state);
            };
            M.load = function (str) {
                try {
                    var parsed = JSON.parse(str);
                    if (parsed && Array.isArray(parsed.programs)) {
                        state = parsed;
                        renderPrograms();
                        renderCanvas();
                    }
                } catch (e) {}
            };
            M.reset = function () {};
        };

        obj.minigame = M;
        obj.minigameName = 'Cookie Programmer';
        obj.minigameLoaded = true;
        obj.minigameUrl = obj.minigameUrl || 'CookieProgrammerMod';

        M.launch();

        var div = getJavascriptConsoleMinigameDiv();
        if (!div) return false;

        M.init(div);

        // level 0でも施設内ミニゲームとして表示する。
        setMinigameVisible(true);
        return true;
    }

    function autoLoadPrograms() {
        var list = state.programs.filter(function (p) { return p.autoLoad; });
        if (!list.length) return;
        // v0.1: auto-load means selecting/restoring the saved program data.
        // Execution is intentionally not started automatically.
        state.currentId = list[0].id;
        saveState();
    }

    loadState();
    seedFirstProgram();
    autoLoadPrograms();

    var minigameInstalled = false;
    try {
        minigameInstalled = installJavascriptConsoleMinigame();
    } catch (e) {
        console.error('[CookieProgrammer] ミニゲーム登録に失敗しました:', e);
    }

    window[MOD_ID] = {
        version: VERSION,
        open: open,
        close: close,
        save: saveState,
        load: function () {
            loadState();
            autoLoadPrograms();
            if (document.getElementById(ROOT_ID)) {
                renderPrograms();
                renderCanvas();
            } else {
                open();
            }
        },
        run: runProgram,
        stop: stopProgram,
        getState: function () { return clone(state); }
    };

    /*
     * Cookie Clicker mod registration.
     * The UI can still be opened directly from the JS console.
     */
    try {
        if (typeof Game !== 'undefined' && Game.registerMod) {
            Game.registerMod(MOD_ID, {
                init: function () {
                    loadState();
                    seedFirstProgram();
                    autoLoadPrograms();
                    try {
                        installJavascriptConsoleMinigame();
                    } catch (e) {
                        console.error('[CookieProgrammer] ミニゲーム登録に失敗しました:', e);
                    }
                }
            });
        }
    } catch (e) {
        console.warn('[CookieProgrammer] Mod registration skipped:', e);
    }

    // JavaScriptコンソールから読み込んだ直後に、
    // Javascript console施設のミニゲームとして表示する。
    try {
        if (!minigameInstalled) {
            minigameInstalled = installJavascriptConsoleMinigame();
        }

        if (minigameInstalled) {
            if (typeof Game !== 'undefined' && Game.Notify) {
                Game.Notify('Cookie Programmer', 'ロード成功しました。', [16, 5], 5);
            }
        } else if (typeof Game !== 'undefined' && Game.Notify) {
            Game.Notify('Cookie Programmer', 'ロードしましたが、Javascriptコンソールのミニゲーム領域を取得できませんでした。', [16, 5], 5);
        }
    } catch (e) {
        console.error('[CookieProgrammer] ミニゲーム起動に失敗しました:', e);
        if (typeof Game !== 'undefined' && Game.Notify) {
            Game.Notify('Cookie Programmer', 'ロードは完了しましたが、ミニゲームの表示に失敗しました。', [16, 5], 5);
        }
    }

    console.log('[CookieProgrammer] v' + VERSION + ' loaded.');
    console.log('Open with: ' + MOD_ID + '.open()');
})();
