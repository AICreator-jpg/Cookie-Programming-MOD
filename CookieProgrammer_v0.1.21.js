/*
 * Cookie Programmer MOD v0.1.20
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
 *   - Block palette categories: control/operator/info/action/variables
 *   - Palette pages: automatically 8 blocks per page
 *   - If block and nested arithmetic/comparison blocks
 *   - Value blocks for game information and nested expression blocks
 *   - Touch-friendly block deletion
 *   - Selectable click/purchase targets
 *   - Variables, upgrade sorting, detection and logical condition blocks
 */
(function () {
    'use strict';

    var MOD_ID = 'CookieProgrammerMod';
    var VERSION = '0.1.21';
    var STORAGE_KEY = 'CookieProgrammerMod.v01';
    var RESET_SAVED_DATA_ONCE = false;
    var RESET_MARKER_KEY = 'CookieProgrammerMod.v01.reset_0_1_20';
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
        nextProgramId: 1,
        variables: [],
        sorts: []
    };

    var runtime = {
        running: false,
        programId: null,
        currentBlockId: null,
        loopStack: [],
        frameToken: null,
        connectionFrom: null,
        drag: null,
        view: { x: GRID_CELL_SIZE + 16, y: GRID_CELL_SIZE + 16, zoom: 1 },
        viewPointers: {},
        pinch: null,
        pan: null,
        paletteCategory: 'control',
        palettePage: 1,
        selectedBlockId: null,
        waitUntil: 0,
        lastValue: 0,
        lastCondition: false,
        expressionTarget: null,
        detection: {
            lastGoldenOnScreen: 0,
            lastRedOnScreen: 0,
            lastGoldenClicks: 0,
            lastBuildingTotal: 0,
            lastUpgradeTotal: 0,
            lastPrestige: 0,
            lastGoldenBuffs: 0,
            events: {}
        },
        helpOpen: false,
        sidebarOpen: true,
        selectedSortId: null,
        editorMode: 'program'
    };

    var BLOCK_TYPES = {
        running: { label: 'このプログラムを実行中', kind: 'start', color: '#f0a64b', category: 'control' },
        forever: { label: 'ずっと', kind: 'control', color: '#70a6d8', category: 'control' },
        if: { label: 'もし〜なら', kind: 'control', color: '#65a6d9', category: 'control' },
        repeat: { label: '○回繰り返す', kind: 'control', color: '#70a6d8', category: 'control' },
        wait: { label: '○秒待つ', kind: 'control', color: '#70a6d8', category: 'control' },
        sortSetting: { label: 'ソート条件を設定する', kind: 'sortSetting', color: '#70a6d8', category: 'control' },
        stop: { label: 'プログラムを停止', kind: 'stop', color: '#8d72b5', category: 'control' },

        add: { label: '足し算', kind: 'operator', color: '#75b98f', category: 'operator' },
        subtract: { label: '引き算', kind: 'operator', color: '#75b98f', category: 'operator' },
        multiply: { label: '掛け算', kind: 'operator', color: '#75b98f', category: 'operator' },
        divide: { label: '割り算', kind: 'operator', color: '#75b98f', category: 'operator' },
        greater: { label: '>', kind: 'comparison', color: '#75b98f', category: 'operator' },
        less: { label: '<', kind: 'comparison', color: '#75b98f', category: 'operator' },
        equal: { label: '=', kind: 'comparison', color: '#75b98f', category: 'operator' },
        notEqual: { label: '≠', kind: 'comparison', color: '#75b98f', category: 'operator' },
        greaterEqual: { label: '≧', kind: 'comparison', color: '#75b98f', category: 'operator' },
        lessEqual: { label: '≦', kind: 'comparison', color: '#75b98f', category: 'operator' },

        cookiesTotal: { label: 'クッキー総生産', kind: 'value', color: '#e8c45b', category: 'info' },
        cookiesPs: { label: '現在のCPS', kind: 'value', color: '#e8c45b', category: 'info' },
        cookiesPsHighest: { label: '最高CPS', kind: 'value', color: '#e8c45b', category: 'info' },
        clicks: { label: 'クリック数', kind: 'value', color: '#e8c45b', category: 'info' },
        playTime: { label: 'プレイ時間', kind: 'value', color: '#e8c45b', category: 'info' },
        prestigeLevel: { label: '現在のPL', kind: 'value', color: '#e8c45b', category: 'info' },
        prestigeGain: { label: 'HC獲得数', kind: 'value', color: '#e8c45b', category: 'info' },
        expansionUpgrades: { label: '購入済み拡張アップグレード数', kind: 'value', color: '#e8c45b', category: 'info' },
        goldenClicks: { label: 'ゴールデンクッキークリック数', kind: 'value', color: '#e8c45b', category: 'info' },
        goldenOnScreen: { label: '画面上のゴールデンクッキー数', kind: 'value', color: '#e8c45b', category: 'info' },
        goldenBuffed: { label: 'ゴールデンクッキーバフ数', kind: 'value', color: '#e8c45b', category: 'info' },
        redClicks: { label: 'レッドクッキークリック数', kind: 'value', color: '#e8c45b', category: 'info' },
        redOnScreen: { label: '画面上のレッドクッキー数', kind: 'value', color: '#e8c45b', category: 'info' },
        redBuffed: { label: 'レッドクッキーバフ数', kind: 'value', color: '#e8c45b', category: 'info' },
        inventory: { label: '○○の所持数', kind: 'value', color: '#e8c45b', category: 'info' },

        click: { label: '[クリック対象]をクリックする', kind: 'action', color: '#d96c6c', category: 'action' },
        buy: { label: '[対象の施設]を購入する', kind: 'action', color: '#d96c6c', category: 'action' },
        buyUpgrade: { label: '[ソート順にアップグレードを購入する]', kind: 'action', color: '#d96c6c', category: 'action' },
        ascend: { label: '[アセンドする]', kind: 'action', color: '#d96c6c', category: 'action' },
        variableAdd: { label: '[変数]に○を足す', kind: 'action', color: '#b07bd8', category: 'variables' },
        variableSet: { label: '[変数]を○にする', kind: 'action', color: '#b07bd8', category: 'variables' },

        and: { label: '[かつ]', kind: 'logic', color: '#c58bd8', category: 'detection' },
        or: { label: '[または]', kind: 'logic', color: '#c58bd8', category: 'detection' },
        not: { label: '[ではない]', kind: 'logic', color: '#c58bd8', category: 'detection' },
        goldenAppeared: { label: 'ゴールデンクッキーが出現した', kind: 'detection', color: '#c58bd8', category: 'detection' },
        goldenClicked: { label: 'ゴールデンクッキーがクリックされた', kind: 'detection', color: '#c58bd8', category: 'detection' },
        goldenEffect: { label: 'ゴールデンクッキーの効果が発生した', kind: 'detection', color: '#c58bd8', category: 'detection' },
        redEffect: { label: 'レッドクッキーの効果が発生した', kind: 'detection', color: '#c58bd8', category: 'detection' },
        buildingPurchased: { label: '施設が購入された', kind: 'detection', color: '#c58bd8', category: 'detection' },
        upgradePurchased: { label: 'アップグレードが購入された', kind: 'detection', color: '#c58bd8', category: 'detection' },
        ascendAvailable: { label: 'アセンド可能になった', kind: 'detection', color: '#c58bd8', category: 'detection' },
        ascended: { label: 'アセンドした', kind: 'detection', color: '#c58bd8', category: 'detection' }
    };
    var PALETTE_CATEGORIES = {
        control: { label: '制御' },
        operator: { label: '演算' },
        info: { label: '情報' },
        action: { label: '動作' },
        variables: { label: '変数' },
        detection: { label: '検知' }
    };

    function refreshVariableBlockTypes() {
        Object.keys(BLOCK_TYPES).forEach(function (type) {
            if (type.indexOf('variable:') === 0) delete BLOCK_TYPES[type];
        });
        (state.variables || []).forEach(function (v) {
            if (!v || !v.id) return;
            BLOCK_TYPES['variable:' + v.id] = {
                label: v.name || '変数',
                kind: 'value',
                color: '#b07bd8',
                category: 'variables',
                variableId: v.id
            };
        });
    }

    function getVariable(id) {
        return (state.variables || []).find(function (v) { return v.id === id; }) || null;
    }

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
        if (['add','subtract','multiply','divide','greater','less','equal','notEqual','greaterEqual','lessEqual'].indexOf(type) >= 0) {
            block.a = '0';
            block.b = '0';
            block.inputs = { a: null, b: null };
        }
        if (type === 'if') {
            block.inputs = { condition: null };
        }
        if (type === 'and' || type === 'or') {
            block.inputs = { a: null, b: null };
        }
        if (type === 'not') {
            block.inputs = { value: null };
        }
        if (type === 'repeat') block.count = '1';
        if (type === 'wait') block.seconds = '1';
        if (type === 'sortSetting') { block.sortId = state.sorts[0] ? state.sorts[0].id : ''; block.targetType = 'upgrades'; block.order = 'desc'; block.inputs = { condition: null }; }
        if (type === 'click') block.target = 'bigCookie';
        if (type === 'buy') block.target = 'building:0';
        if (type === 'variableAdd' || type === 'variableSet') { block.variableId = state.variables[0] ? state.variables[0].id : ''; block.value = '0'; block.inputs = { value: null }; }
        if (type === 'playTime') block.unit = 'seconds';
        if (type === 'inventory') block.target = 'cookies';
        if (type === 'buyUpgrade') { block.sortId = state.sorts[0] ? state.sorts[0].id : ''; block.unavailableMode = 'next'; }
        return block;
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[CookieProgrammer] 保存に失敗しました。', e);
        }
    }

    function sanitizeState() {
        if (!Array.isArray(state.variables)) state.variables = [];
        state.variables = state.variables.filter(function (v) { return v && v.id && v.name; });
        refreshVariableBlockTypes();
        if (!Array.isArray(state.sorts)) state.sorts = [];
        state.sorts = state.sorts.filter(function (x) { return x && x.id && x.name; });
        state.sorts.forEach(normalizeSort);
        // 旧バージョンで保存された、現在存在しないブロックを取り除く。
        // 特に削除済みの砂糖玉ブロックが残っていても、画面全体が描画エラーにならないようにする。
        state.programs.forEach(function (p) {
            if (!p || !Array.isArray(p.blocks)) p.blocks = [];
            if (!Array.isArray(p.connections)) p.connections = [];

            var validIds = {};
            p.blocks = p.blocks.filter(function (b) {
                if (!b || !b.id || !BLOCK_TYPES[b.type]) return false;
                validIds[b.id] = true;
                return true;
            });

            p.connections = p.connections.filter(function (c) {
                return c && validIds[c.from] && validIds[c.to];
            });

            // 式入力から削除済みブロックを参照していた場合も解除する。
            p.blocks.forEach(function (b) {
                if (b.type === 'sortSetting') {
            var sort = getSort(b.sortId) || (runtime.editorMode === 'sort' ? getSort(runtime.selectedSortId) : null);
            var targetType = sort ? sort.targetType : (b.targetType || 'upgrades');
            var order = sort ? sort.order : (b.order || 'desc');
            return head + '<div style="text-align:center"><b>ソート条件を設定する</b></div>' +
                '<div class="cp-expression-row"><span>対象：</span><select class="cp-select" data-field="targetType"><option value="upgrades"'+(targetType==='upgrades'?' selected':'')+'>アップグレード</option><option value="buildings"'+(targetType==='buildings'?' selected':'')+'>施設</option></select></div>' +
                '<div class="cp-expression-row">条件：' + inputSlotHtml(p,b,'condition') + '</div>' +
                '<div class="cp-expression-row"><span>並び順：</span><select class="cp-select" data-field="order"><option value="desc"'+(order==='desc'?' selected':'')+'>大きい順</option><option value="asc"'+(order==='asc'?' selected':'')+'>小さい順</option></select></div>';
        }
        if (b.type === 'if') {
                    if (!b.inputs) b.inputs = {};
                    if (!Object.prototype.hasOwnProperty.call(b.inputs, 'condition')) b.inputs.condition = null;
                    delete b.inputs.left;
                    delete b.inputs.right;
                    delete b.left;
                    delete b.right;
                    delete b.op;
                }
                if (!b.inputs) return;
                Object.keys(b.inputs).forEach(function (key) {
                    if (b.inputs[key] && !validIds[b.inputs[key]]) b.inputs[key] = null;
                });
            });
        });

        if (!state.programs.length) {
            state.currentId = null;
        } else if (!state.currentId || !state.programs.some(function (p) { return p.id === state.currentId; })) {
            state.currentId = state.programs[0].id;
        }
    }

    function loadState() {
        try {
            // v0.1.13では、旧バージョンの保存データを一度だけリセットする。
            if (RESET_SAVED_DATA_ONCE && !localStorage.getItem(RESET_MARKER_KEY)) {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.setItem(RESET_MARKER_KEY, '1');
            }

            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.programs)) return;

            state.programs = parsed.programs;
            state.currentId = parsed.currentId || null;
            state.nextBlockId = Number(parsed.nextBlockId) || 1;
            state.nextProgramId = Number(parsed.nextProgramId) || 1;
            state.variables = Array.isArray(parsed.variables) ? parsed.variables : [];
            state.sorts = Array.isArray(parsed.sorts) ? parsed.sorts : [];

            sanitizeState();
            saveState();
        } catch (e) {
            console.warn('[CookieProgrammer] 保存データを読み込めませんでした。', e);
        }
    }

    function getCurrentProgram() {
        return state.programs.find(function (p) { return p.id === state.currentId; }) || null;
    }

    function getEditorDocument() {
        if (runtime.editorMode === 'sort') return getSort(runtime.selectedSortId);
        return getCurrentProgram();
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
#${ROOT_ID} .cp-help-button{background:#fafafa;color:#333;border:2px solid #ddd;border-radius:5px;padding:4px 12px;cursor:pointer}
#${ROOT_ID} .cp-body{flex:1;min-height:0;display:flex}
#${ROOT_ID} .cp-sidebar{width:270px;background:#ddd;border-right:3px solid #aaa;padding:10px;box-sizing:border-box;overflow:auto}
#${ROOT_ID} .cp-editor{flex:1;min-width:0;display:flex;flex-direction:column}
#${ROOT_ID} .cp-programs{display:flex;gap:5px;margin-bottom:8px}
#${ROOT_ID} .cp-programs select{flex:1;min-width:0;padding:7px}
#${ROOT_ID} .cp-btn{padding:7px 10px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer}
#${ROOT_ID} .cp-btn:active{transform:translateY(1px)}
#${ROOT_ID} .cp-palette-tabs,#${ROOT_ID} .cp-palette-pages{display:flex;gap:4px;margin:6px 0;flex-wrap:wrap}
#${ROOT_ID} .cp-palette-tab{flex:1;min-width:0;padding:6px 4px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer;font-size:12px}
#${ROOT_ID} .cp-palette-tab.active{font-weight:bold}
#${ROOT_ID} .cp-palette-tab[data-category="control"],#${ROOT_ID} .cp-palette-block[data-category="control"]{background:#70a6d8}
#${ROOT_ID} .cp-palette-tab[data-category="operator"],#${ROOT_ID} .cp-palette-block[data-category="operator"]{background:#75b98f}
#${ROOT_ID} .cp-palette-tab[data-category="info"],#${ROOT_ID} .cp-palette-block[data-category="info"]{background:#e8c45b}
#${ROOT_ID} .cp-palette-tab[data-category="action"],#${ROOT_ID} .cp-palette-block[data-category="action"]{background:#d96c6c}
#${ROOT_ID} .cp-palette-tab[data-category="variables"],#${ROOT_ID} .cp-palette-block[data-category="variables"]{background:#b07bd8}
#${ROOT_ID} .cp-palette-tab[data-category="detection"],#${ROOT_ID} .cp-palette-block[data-category="detection"]{background:#c58bd8}

#${ROOT_ID} .cp-palette-prev,#${ROOT_ID} .cp-palette-next{padding:6px 10px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer;font-size:14px}
#${ROOT_ID} .cp-palette-page-label{flex:1;text-align:center;padding:6px 4px;font-size:12px;font-weight:bold}
#${ROOT_ID} .cp-block-palette-title{font-weight:bold;margin:10px 0 6px}
#${ROOT_ID} .cp-palette-block{margin:7px 0;padding:10px;border:2px solid #888;border-radius:7px;cursor:pointer;user-select:none;touch-action:manipulation}
#${ROOT_ID} .cp-palette-block[data-type="running"]{background:#f0a64b}
#${ROOT_ID} .cp-palette-block[data-type="click"]{background:#d96c6c}
#${ROOT_ID} .cp-palette-block[data-type="forever"]{background:#70a6d8}
#${ROOT_ID} .cp-palette-block[data-type="stop"]{background:#8d72b5;color:#fff}
#${ROOT_ID} .cp-help{font-size:12px;line-height:1.45;background:#eee;border:1px solid #aaa;border-radius:6px;padding:8px;margin-top:10px}
#${ROOT_ID} .cp-block-list-toggle{position:absolute;z-index:30;left:8px;top:8px;padding:6px 9px;border:2px solid #888;border-radius:5px;background:#fafafa;cursor:pointer}
#${ROOT_ID} .cp-help-panel{position:absolute;z-index:40;right:8px;top:8px;width:min(360px,calc(100% - 16px));max-height:70%;overflow:auto;display:none;background:#eee;border:3px solid #555;border-radius:8px;padding:12px;box-shadow:0 5px 20px rgba(0,0,0,.35);box-sizing:border-box}
#${ROOT_ID} .cp-help-panel.show{display:block}
#${ROOT_ID} .cp-help-source{display:none}
#${ROOT_ID} .cp-sort-tools{border-top:1px solid #aaa;padding-top:6px}
#${ROOT_ID} .cp-sort-list{margin-top:5px}
#${ROOT_ID} .cp-sort-row,#${ROOT_ID} .cp-sort-item{display:flex;gap:3px;align-items:center;margin:3px 0;font-size:11px}
#${ROOT_ID} .cp-sort-row button:first-child,#${ROOT_ID} .cp-sort-item span{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis}
#${ROOT_ID} .cp-sort-row button,#${ROOT_ID} .cp-sort-item button{padding:2px 4px;font-size:10px}
#${ROOT_ID} .cp-sort-editor{margin-top:6px;padding:6px;background:#eee;border:1px solid #aaa;border-radius:5px}
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
#${ROOT_ID} .cp-block .cp-number-input{width:72px;box-sizing:border-box;padding:3px;border:1px solid #777;border-radius:3px;background:#fff;color:#222;user-select:text;-webkit-user-select:text;pointer-events:auto;touch-action:manipulation}
#${ROOT_ID} .cp-block .cp-select{max-width:150px;padding:3px;border:1px solid #777;border-radius:3px;background:#fff;color:#222;pointer-events:auto;touch-action:manipulation}
#${ROOT_ID} .cp-block .cp-input-field{width:62px;box-sizing:border-box;padding:3px;border:1px solid #777;border-radius:3px;background:#fff;color:#222;user-select:text;-webkit-user-select:text;pointer-events:auto;touch-action:manipulation;cursor:text}
#${ROOT_ID} .cp-block .cp-input-empty{display:inline-block;min-width:34px;padding:2px 5px;border:1px dashed #777;border-radius:3px;background:#fff;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#${ROOT_ID} .cp-block[data-type="if"] .cp-input-slot{min-width:80px}
#${ROOT_ID} .cp-block .cp-operator-row{display:flex;align-items:center;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:4px}
#${ROOT_ID} .cp-block .cp-condition-select{padding:3px;border:1px solid #777;border-radius:3px;background:#fff}
#${ROOT_ID} .cp-input-slot{display:inline-flex;align-items:center;min-width:52px;min-height:24px;padding:2px 5px;border:2px dashed #777;border-radius:6px;background:rgba(255,255,255,.75);cursor:pointer;vertical-align:middle;box-sizing:border-box}
#${ROOT_ID} .cp-input-slot.empty{color:#666;font-size:11px}
#${ROOT_ID} .cp-nested-expression{display:inline-flex;align-items:center;padding:3px 6px;border:2px solid #666;border-radius:6px;background:#f7e8a8;color:#222;font-weight:bold;cursor:pointer;max-width:190px;overflow:hidden}
#${ROOT_ID} .cp-nested-expression .cp-nested-expression{margin:0 2px;padding:2px 4px;font-size:11px}
#${ROOT_ID} .cp-expression-row{display:flex;align-items:center;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:4px}
#${ROOT_ID} .cp-expression-target{outline:3px solid #55aaff}
#${ROOT_ID} .cp-expression-child.selected{outline:3px solid #55aaff}
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
            var oldClose = root.querySelector('.cp-close');
            if (oldClose) { oldClose.className='cp-help-button'; oldClose.textContent='説明'; }
            if (!root.querySelector('.cp-block-list-toggle')) { var t=document.createElement('button'); t.className='cp-block-list-toggle'; t.textContent='☰ ブロック'; root.querySelector('.cp-editor').appendChild(t); }
            if (!root.querySelector('.cp-help-panel')) { var hp=document.createElement('div'); hp.className='cp-help-panel'; hp.innerHTML='<b>使い方</b><div class="cp-help-content"></div>'; root.querySelector('.cp-window').appendChild(hp); }
            if (!root.querySelector('.cp-help-source')) { var hs=document.createElement('div'); hs.className='cp-help-source'; hs.style.display='none'; hs.textContent='Cookie Programmerの操作説明です。'; root.querySelector('.cp-sidebar').appendChild(hs); }
            if (!root.querySelector('.cp-sort-tools')) { var st=document.createElement('div'); st.className='cp-sort-tools'; st.innerHTML='<b>ソート</b><div style="display:flex;gap:4px;margin-top:4px"><button class="cp-btn cp-add-sort">追加</button><button class="cp-btn cp-rename-sort">名前変更</button><button class="cp-btn cp-delete-sort">削除</button></div><div class="cp-sort-list"></div><div class="cp-sort-editor"></div>'; root.querySelector('.cp-sidebar').appendChild(st); }
            if (!root.querySelector('.cp-delete-block')) {
                var sidebar = root.querySelector('.cp-sidebar');
                if (sidebar) {
                    var deleteButton = document.createElement('button');
                    deleteButton.className = 'cp-btn cp-delete-block';
                    deleteButton.style.cssText = 'margin-top:6px;width:100%';
                    deleteButton.textContent = 'ブロック削除';
                    var autoLoad = sidebar.querySelector('.cp-auto-load');
                    if (autoLoad && autoLoad.parentNode) sidebar.insertBefore(deleteButton, autoLoad.parentNode);
                    else sidebar.appendChild(deleteButton);
                }
            }
            return root;
        }

        root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
<div class="cp-dim"></div>
<div class="cp-window">
  <div class="cp-title">
    <span>Cookie Programmer v${VERSION}</span>
    <button class="cp-help-button">説明</button>
  </div>
  <button class="cp-block-list-toggle">☰ ブロック</button>
  <div class="cp-help-panel"><b>使い方</b><div class="cp-help-content"></div></div>
  <div class="cp-body">
    <aside class="cp-sidebar">
      <div class="cp-programs">
        <select class="cp-program-select"></select>
        <button class="cp-btn cp-add-program">＋</button>
      </div>
      <button class="cp-btn cp-rename-program">名前変更</button>
      <button class="cp-btn cp-delete-program">削除</button>
      <button class="cp-btn cp-delete-block" style="margin-top:6px;width:100%">ブロック削除</button>
      <div class="cp-variable-tools" style="display:flex;gap:4px;margin-top:6px"><button class="cp-btn cp-add-variable" style="flex:1">変数追加</button><button class="cp-btn cp-rename-variable" style="flex:1">名前変更</button></div>
      <div class="cp-sort-tools" style="margin-top:8px"><b>ソート</b><div style="display:flex;gap:4px;margin-top:4px"><button class="cp-btn cp-add-sort" style="flex:1">追加</button><button class="cp-btn cp-rename-sort" style="flex:1">名前変更</button><button class="cp-btn cp-delete-sort" style="flex:1">削除</button></div><div class="cp-sort-list"></div><div class="cp-sort-editor"></div><button class="cp-btn cp-exit-sort-edit" style="display:none;width:100%;margin-top:5px">プログラム編集に戻る</button></div>
      <label style="display:block;margin-top:9px;font-size:13px">
        <input type="checkbox" class="cp-auto-load"> このプログラムを自動ロード
      </label>
      <div class="cp-block-palette-title">ブロック</div>
      <div class="cp-palette-tabs">
        <button class="cp-palette-tab active" data-category="control">制御</button>
        <button class="cp-palette-tab" data-category="operator">演算</button>
        <button class="cp-palette-tab" data-category="info">情報</button>
        <button class="cp-palette-tab" data-category="action">動作</button>
         <button class="cp-palette-tab" data-category="variables">変数</button>
        <button class="cp-palette-tab" data-category="detection">検知</button>
      </div>
      <div class="cp-palette-pages">
        <button class="cp-palette-prev" title="前のページ">＜</button>
        <span class="cp-palette-page-label">ページ1 / 1</span>
        <button class="cp-palette-next" title="次のページ">＞</button>
      </div>
      <div class="cp-palette-list"></div>
      <div class="cp-help-source">配置：ブロックをタップ/クリックすると追加。追加後はドラッグで移動できます。<br><br>接続：先に実行するブロックをクリック → 後に実行するブロックをクリック。複数接続できます。<br><br>もし〜なら：条件に合えば1本目、合わなければ2本目の接続へ進みます。<br><br>演算：数値欄には直接入力でき、演算・情報・変数・検知ブロックも入れ子にできます。<br><br>検知：かつ・または・ではないを使って条件を組み合わせられます。<br><br>削除：ブロックを選択してブロック削除。PCではDeleteキーでも削除できます。<br><br>ソート：ソート設定からソートを作成し、「条件をブロックで編集」でソート条件を既存の値・演算・変数・検知ブロックから作れます。</div>
    </aside>
    <section class="cp-editor">
      <div class="cp-editor-mode-label" style="display:none;background:#e8d77a;padding:6px;text-align:center;font-weight:bold">ソート条件編集モード</div>
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
        var p = getEditorDocument();
        if (!p) {
            drawLines();
            return;
        }

        p.blocks.forEach(function (b) {
            if (isNestedBlock(p, b.id)) return;
            var def = BLOCK_TYPES[b.type];
            if (!def) return;
            var el = document.createElement('div');
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
            el.querySelectorAll('.cp-nested-expression').forEach(function (nested) {
                nested.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
                nested.addEventListener('pointerup', function (ev) { ev.stopPropagation(); });
                nested.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    var childId = this.dataset.expressionId;
                    if (!childId) return;
                    runtime.selectedBlockId = childId;
                    runtime.connectionFrom = null;
                    runtime.expressionTarget = null;
                    updateSelectionVisuals();
                    updateExpressionTargetVisuals();
                    setStatus('入力ブロックを選択しました');
                });
            });
        });

        updateSelectionVisuals();
        updateExpressionTargetVisuals();
        applyView();
    }

    function isExpressionType(type) {
        return ['value','operator','comparison','logic','detection'].indexOf(BLOCK_TYPES[type] ? BLOCK_TYPES[type].kind : '') >= 0;
    }

    function isConditionType(type) {
        return !!(BLOCK_TYPES[type] && ['comparison','logic','detection'].indexOf(BLOCK_TYPES[type].kind) >= 0);
    }

    function expressionInputKeys(b) {
        if (!b) return [];
        if (b.type === 'if') return ['condition'];
        if (['add','subtract','multiply','divide','greater','less','equal','notEqual','greaterEqual','lessEqual','and','or'].indexOf(b.type) >= 0) return ['a', 'b'];
        if (b.type === 'not') return ['value'];
        if (b.type === 'variableAdd' || b.type === 'variableSet') return ['value'];
        return [];
    }

    function getInputRef(b, key) {
        return b && b.inputs && b.inputs[key] ? b.inputs[key] : null;
    }

    function isNestedBlock(p, id) {
        return !!findParentInput(p, id);
    }

    function findParentInput(p, childId) {
        if (!p) return null;
        for (var i = 0; i < p.blocks.length; i++) {
            var b = p.blocks[i];
            if (!b.inputs) continue;
            var keys = expressionInputKeys(b);
            for (var j = 0; j < keys.length; j++) {
                if (b.inputs[keys[j]] === childId) return { parentId: b.id, key: keys[j] };
            }
        }
        return null;
    }

    function expressionContains(p, rootId, targetId, seen) {
        if (rootId === targetId) return true;
        seen = seen || {};
        if (seen[rootId]) return false;
        seen[rootId] = true;
        var root = getBlock(p, rootId);
        if (!root || !root.inputs) return false;
        var keys = expressionInputKeys(root);
        for (var i = 0; i < keys.length; i++) {
            var childId = root.inputs[keys[i]];
            if (childId && expressionContains(p, childId, targetId, seen)) return true;
        }
        return false;
    }

    function detachExpressionBlock(p, childId) {
        var parent = findParentInput(p, childId);
        if (!parent) return;
        var parentBlock = getBlock(p, parent.parentId);
        if (parentBlock && parentBlock.inputs) parentBlock.inputs[parent.key] = null;
    }

    function setExpressionInput(p, parentId, key, childId) {
        var parent = getBlock(p, parentId);
        var child = getBlock(p, childId);
        if (!parent || !child || !parent.inputs || !isExpressionType(child.type)) return false;
        if (parentId === childId || expressionContains(p, childId, parentId)) {
            setStatus('このブロックは入れられません（循環するため）');
            return false;
        }

        detachExpressionBlock(p, childId);
        parent.inputs[key] = childId;

        // 式として使うブロックは実行用の線から外す。
        p.connections = p.connections.filter(function (c) {
            return c.from !== childId && c.to !== childId;
        });
        return true;
    }

    function expressionLabel(p, id, seen) {
        var b = getBlock(p, id);
        if (!b) return '';
        seen = seen || {};
        if (seen[id]) return '<span class="cp-nested-expression cp-expression-child" data-expression-id="' + escapeHtml(id) + '">循環</span>';
        seen[id] = true;

        var def = BLOCK_TYPES[b.type];
        if (!def) return '';
        if (def.kind === 'value' || def.kind === 'detection') {
            var valueLabel = def.label;
            if (b.type.indexOf('variable:') === 0) {
                var v = getVariable(def.variableId);
                valueLabel = v ? v.name : '変数';
            }
            if (b.type === 'playTime') valueLabel = 'プレイ時間（' + ({seconds:'秒',minutes:'分',hours:'時間',days:'日'}[b.unit] || '秒') + '）';
            if (b.type === 'inventory') valueLabel = getInventoryTargetLabel(b.target);
            return '<span class="cp-nested-expression cp-expression-child" data-expression-id="' + escapeHtml(b.id) + '" style="background:' + escapeHtml(def.color) + '">' + escapeHtml(valueLabel) + '</span>';
        }

        if (def.kind === 'operator' || def.kind === 'comparison') {
            var symbol = {add:'＋',subtract:'−',multiply:'×',divide:'÷',greater:'＞',less:'＜',equal:'＝',notEqual:'≠',greaterEqual:'≧',lessEqual:'≦'}[b.type] || '';
            var a = inputSlotHtml(p, b, 'a', seen);
            var c = inputSlotHtml(p, b, 'b', seen);
            return '<span class="cp-nested-expression cp-expression-child" data-expression-id="' + escapeHtml(b.id) + '" style="background:' + escapeHtml(def.color) + '"><span class="cp-expression-inline">' + a + ' <b>' + symbol + '</b> ' + c + '</span></span>';
        }
        if (def.kind === 'logic') {
            var logicHtml;
            if (b.type === 'not') {
                logicHtml = inputSlotHtml(p, b, 'value', seen) + ' <b>ではない</b>';
            } else {
                var logicSymbol = b.type === 'and' ? 'かつ' : 'または';
                logicHtml = inputSlotHtml(p, b, 'a', seen) + ' <b>' + logicSymbol + '</b> ' + inputSlotHtml(p, b, 'b', seen);
            }
            return '<span class="cp-nested-expression cp-expression-child" data-expression-id="' + escapeHtml(b.id) + '" style="background:' + escapeHtml(def.color) + '"><span class="cp-expression-inline">' + logicHtml + '</span></span>';
        }
        return '<span class="cp-nested-expression cp-expression-child" data-expression-id="' + escapeHtml(b.id) + '">' + escapeHtml(def.label) + '</span>';
    }

    function inputSlotHtml(p, b, key, seen) {
        var ref = getInputRef(b, key);
        if (ref) {
            return '<span class="cp-input-slot cp-input-expression" data-input-owner="' + escapeHtml(b.id) + '" data-input-key="' + key + '">' + expressionLabel(p, ref, seen || {}) + '</span>';
        }
        if (key === 'condition') {
            return '<span class="cp-input-slot cp-input-empty" data-input-owner="' + escapeHtml(b.id) + '" data-input-key="condition">条件を入れる</span>';
        }
        var value = key === 'a' ? b.a : (key === 'b' ? b.b : (key === 'value' ? b.value : '0'));
        return '<input class="cp-input-field cp-constant-input" type="text" inputmode="decimal" data-input-owner="' + escapeHtml(b.id) + '" data-input-key="' + key + '" value="' + escapeHtml(value == null ? '0' : value) + '">';
    }


    function getClickTargets() {
        return [
            { id: 'bigCookie', label: '大クッキー' },
            { id: 'goldenCookie', label: 'ゴールデンクッキー' },
            { id: 'reindeer', label: 'トナカイ' },
            { id: 'ticker', label: 'ニュースティッカー' },
            { id: 'cookieDragon', label: 'クッキードラゴン' }
        ];
    }

    function getPurchaseTargets() {
        var targets = [];
        if (typeof Game !== 'undefined' && Array.isArray(Game.ObjectsById)) {
            for (var i = 0; i <= 19; i++) {
                var obj = Game.ObjectsById[i];
                if (obj) targets.push({ id: 'building:' + i, label: obj.name || ('施設' + i) });
            }
        } else {
            for (var j = 0; j <= 19; j++) targets.push({ id: 'building:' + j, label: '施設ID ' + j });
        }
        (state.variables || []).forEach(function (v) {
            targets.push({ id: 'variable:' + v.id, label: v.name + '（施設ID）' });
        });
        return targets;
    }

    function getInventoryTargets() {
        var targets = [
            {id:'cookies',label:'クッキー'},
            {id:'heavenlyChips',label:'HC'},
            {id:'sugarLumps',label:'砂糖玉'}
        ];
        if (typeof Game !== 'undefined' && Array.isArray(Game.ObjectsById)) {
            for (var i = 0; i <= 19; i++) {
                var obj = Game.ObjectsById[i];
                if (obj) targets.push({id:'building:' + i, label:obj.name});
            }
        }
        targets.push(
            {id:'buildingsTotal',label:'施設（総数）'},
            {id:'upgradesTotal',label:'アップグレード（総数）'},
            {id:'heavenlyUpgradesTotal',label:'天界アップグレード（総数）'}
        );
        return targets;
    }

    function optionsHtml(list, selected) {
        return list.map(function (x) { return '<option value="' + escapeHtml(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + escapeHtml(x.label) + '</option>'; }).join('');
    }

    function getClickTargetLabel(id) {
        var x = getClickTargets().find(function (v) { return v.id === id; });
        return x ? x.label : 'クリック対象';
    }

    function getPurchaseTargetLabel(id) {
        var x = getPurchaseTargets().find(function (v) { return v.id === id; });
        return x ? x.label : (id || '対象の施設');
    }

    function getInventoryTargetLabel(id) {
        var x = getInventoryTargets().find(function (v) { return v.id === id; });
        return x ? x.label + 'の所持数' : '○○の所持数';
    }


    function blockInnerHtml(b) {
        var def = BLOCK_TYPES[b.type];
        if (!def) return '';
        var head = '<span class="cp-handle">●</span>';
        var p = getEditorDocument();

        if (b.type === 'if') {
            return head + '<div><b>もし</b></div><div class="cp-expression-row">' + inputSlotHtml(p, b, 'condition') + '</div><div style="text-align:center;margin-top:3px">なら</div>';
        }
        if (b.type === 'sortSetting') {
            return head
                + '<div style="text-align:center"><b>ソート条件を設定する</b></div>'
                + '<div style="margin-top:5px">対象：<select class="cp-select" data-field="targetType">'
                + '<option value="upgrades"' + (b.targetType === 'upgrades' ? ' selected' : '') + '>アップグレード</option>'
                + '<option value="buildings"' + (b.targetType === 'buildings' ? ' selected' : '') + '>施設</option>'
                + '</select></div>'
                + '<div style="margin-top:5px">条件：</div>'
                + '<div class="cp-expression-row">' + inputSlotHtml(p, b, 'condition') + '</div>'
                + '<div style="margin-top:5px">並び順：<select class="cp-select" data-field="order">'
                + '<option value="desc"' + (b.order === 'desc' ? ' selected' : '') + '>大きい順</option>'
                + '<option value="asc"' + (b.order === 'asc' ? ' selected' : '') + '>小さい順</option>'
                + '</select></div>';
        }
        if (b.type === 'repeat') {
            return head + '<div style="text-align:center"><input class="cp-number-input" type="number" min="0" step="1" data-field="count" value="' + escapeHtml(b.count == null ? '1' : b.count) + '"> 回繰り返す</div>';
        }
        if (b.type === 'wait') {
            return head + '<div style="text-align:center"><input class="cp-number-input" type="number" min="0" step="0.1" data-field="seconds" value="' + escapeHtml(b.seconds == null ? '1' : b.seconds) + '"> 秒待つ</div>';
        }
        if (def.kind === 'operator' || def.kind === 'comparison') {
            var symbol = {add:'＋',subtract:'−',multiply:'×',divide:'÷',greater:'＞',less:'＜',equal:'＝',notEqual:'≠',greaterEqual:'≧',lessEqual:'≦'}[b.type] || '';
            return head + '<div style="text-align:center"><b>' + escapeHtml(def.label) + '</b></div><div class="cp-expression-row">' + inputSlotHtml(p, b, 'a') + '<span>' + symbol + '</span>' + inputSlotHtml(p, b, 'b') + '</div>';
        }
        if (def.kind === 'logic') {
            if (b.type === 'not') return head + '<div style="text-align:center"><b>ではない</b></div><div class="cp-expression-row">' + inputSlotHtml(p, b, 'value') + '</div>';
            var logicWord = b.type === 'and' ? 'かつ' : 'または';
            return head + '<div style="text-align:center"><b>' + logicWord + '</b></div><div class="cp-expression-row">' + inputSlotHtml(p, b, 'a') + '<span>' + logicWord + '</span>' + inputSlotHtml(p, b, 'b') + '</div>';
        }
        if (b.type === 'click') {
            return head + '<div><select class="cp-select" data-field="target">' + optionsHtml(getClickTargets(), b.target) + '</select>をクリックする</div>';
        }
        if (b.type === 'buy') {
            return head + '<div><select class="cp-select" data-field="target">' + optionsHtml(getPurchaseTargets(), b.target) + '</select>を購入する</div>';
        }
        if (b.type === 'buyUpgrade') {
            var sortOptions = (state.sorts || []).filter(function(s){ normalizeSort(s); return s.targetType === 'upgrades'; }).map(function(s){ return {id:s.id,label:s.name}; });
            return head + '<div><select class="cp-select" data-field="sortId">' + optionsHtml(sortOptions, b.sortId) + '</select>順にアップグレードを購入する</div><div><select class="cp-select" data-field="unavailableMode"><option value="next"' + (b.unavailableMode === 'next' ? ' selected' : '') + '>購入できなければ次へ</option><option value="wait"' + (b.unavailableMode === 'wait' ? ' selected' : '') + '>購入できるまで待機</option></select></div>';
        }
        if (b.type === 'ascend') {
            return head + '<div>アセンドする</div>';
        }
        if (b.type === 'inventory') {
            return head + '<div><select class="cp-select" data-field="target">' + optionsHtml(getInventoryTargets(), b.target) + '</select>の所持数</div>';
        }
        if (b.type === 'playTime') {
            return head + '<div>プレイ時間</div><div><select class="cp-select" data-field="unit">' + optionsHtml([{id:'seconds',label:'秒'},{id:'minutes',label:'分'},{id:'hours',label:'時間'},{id:'days',label:'日'}], b.unit || 'seconds') + '</select></div>';
        }
        if (b.type === 'variableAdd' || b.type === 'variableSet') {
            var variableOptions = (state.variables || []).map(function(v){ return {id:v.id,label:v.name}; });
            return head + '<div><select class="cp-select" data-field="variableId">' + optionsHtml(variableOptions, b.variableId) + '</select></div><div class="cp-expression-row">' + (b.type === 'variableSet' ? '＝' : '＋') + inputSlotHtml(p,b,'value') + '</div>';
        }
        if (b.type.indexOf('variable:') === 0) {
            return head + '<div class="cp-nested-expression" style="background:' + escapeHtml(def.color) + '">' + escapeHtml(def.label) + '</div>';
        }
        if (def.kind === 'value') return head + '<div class="cp-nested-expression" style="background:' + escapeHtml(def.color) + '">' + escapeHtml(def.label) + '</div>';
        return head + escapeHtml(def.label);
    }


    function bindBlockFields(el, block) {
        el.querySelectorAll('[data-field]').forEach(function (field) {
            field.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
            field.addEventListener('click', function (ev) { ev.stopPropagation(); });
            field.addEventListener('input', function () {
                block[this.dataset.field] = this.value;
                // 入力中は再描画・保存しない。カーソル位置と入力内容を維持する。
            });
            field.addEventListener('change', function () {
                block[this.dataset.field] = this.value;
                if (block.type === 'sortSetting' && runtime.editorMode === 'sort') {
                    var sort = getSort(runtime.selectedSortId);
                    if (sort) {
                        if (this.dataset.field === 'targetType') sort.targetType = this.value;
                        if (this.dataset.field === 'order') sort.order = this.value;
                    }
                }
                saveState();
                renderCanvas();
                refreshPurchaseTargets();
                renderSortManager();
            });
            field.addEventListener('blur', function () {
                if (this.dataset.field && (this.tagName === 'INPUT')) {
                    block[this.dataset.field] = this.value;
                    saveState();
                }
            });
        });

        el.querySelectorAll('.cp-input-slot').forEach(function (slot) {
            slot.addEventListener('pointerdown', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
            });
            slot.addEventListener('pointerup', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                runtime.expressionTarget = { parentId: this.dataset.inputOwner, key: this.dataset.inputKey };
                runtime.connectionFrom = null;
                runtime.selectedBlockId = null;
                updateSelectionVisuals();
                updateExpressionTargetVisuals();
                setStatus('ここに入れるブロックをパレットから選んでください');
            });
            slot.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); });
        });
    }

    function refreshPurchaseTargets() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.cp-block[data-type="buy"] .cp-select[data-field="target"]').forEach(function(select){
            var value = select.value;
            select.innerHTML = optionsHtml(getPurchaseTargets(), value);
            if (!select.value && select.options.length) select.selectedIndex = 0;
            var p = getEditorDocument();
            var b = p ? getBlock(p, select.closest('.cp-block').dataset.blockId) : null;
            if (b) b.target = select.value;
        });
    }

    function getPaletteTypes() {
        return Object.keys(BLOCK_TYPES).filter(function (type) {
            var def = BLOCK_TYPES[type];
            if (runtime.editorMode === 'sort') {
                if (runtime.paletteCategory === 'control') return type === 'sortSetting';
                if (['operator','info','variables','detection'].indexOf(runtime.paletteCategory) < 0) return false;
                return def.category === runtime.paletteCategory && ['value','operator','comparison','logic','detection'].indexOf(def.kind) >= 0;
            }
            return def.category === runtime.paletteCategory;
        });
    }

    function getPalettePageCount() {
        return Math.max(1, Math.ceil(getPaletteTypes().length / 8));
    }

    function clampPalettePage() {
        var count = getPalettePageCount();
        runtime.palettePage = Math.max(1, Math.min(count, runtime.palettePage));
        return count;
    }

    function renderPalette() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.cp-palette-tab').forEach(function (el) {
            el.classList.toggle('active', el.dataset.category === runtime.paletteCategory);
        });

        var pageCount = clampPalettePage();
        var label = root.querySelector('.cp-palette-page-label');
        var prev = root.querySelector('.cp-palette-prev');
        var next = root.querySelector('.cp-palette-next');
        label.textContent = 'ページ' + runtime.palettePage + ' / ' + pageCount;
        prev.disabled = runtime.palettePage <= 1;
        next.disabled = runtime.palettePage >= pageCount;
        prev.style.opacity = prev.disabled ? '0.45' : '1';
        next.style.opacity = next.disabled ? '0.45' : '1';

        var list = root.querySelector('.cp-palette-list');
        list.innerHTML = '';
        var types = getPaletteTypes();
        var start = (runtime.palettePage - 1) * 8;
        types.slice(start, start + 8).forEach(function (type) {
            var def = BLOCK_TYPES[type];
            var el = document.createElement('div');
            el.className = 'cp-palette-block';
            el.dataset.type = type;
            el.dataset.category = def.category;
            el.style.background = def.color;
            if (def.kind === 'stop') el.style.color = '#fff';
            el.textContent = def.label;
            list.appendChild(el);
            el.addEventListener('pointerup', function (ev) {
                if (ev.pointerType === 'mouse' && ev.button !== 0) return;
                ev.preventDefault();
                ev.stopPropagation();
                var wrap = root.querySelector('.cp-canvas-wrap');
                var rect = wrap.getBoundingClientRect();
                var center = canvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                addBlock(this.dataset.type, center.x, center.y);
            });
        });
        if (!list.children.length) {
            var empty = document.createElement('div');
            empty.className = 'cp-help';
            empty.textContent = 'このページにはまだブロックがありません。';
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
        runtime.view.x = GRID_CELL_SIZE + 16;
        runtime.view.y = GRID_CELL_SIZE + 16;
        applyView();
    }

    function addBlock(type, x, y) {
        var p = getEditorDocument();
        if (!p) return;
        if (runtime.editorMode === 'sort') {
            var def = BLOCK_TYPES[type];
            if (type !== 'sortSetting' && !def) return;
            if (type !== 'sortSetting' && ['value','operator','comparison','logic','detection'].indexOf(def.kind) < 0) { setStatus('ソート条件には値・演算・検知ブロックを使ってください'); return; }
            if (type === 'sortSetting' && p.blocks.some(function(x){ return x.type === 'sortSetting'; })) { setStatus('ソート条件設定ブロックは1つだけです'); return; }
        }
        var b = defaultBlock(type, Math.max(5, Math.min(WORLD_SIZE - 240, x - 90)), Math.max(5, Math.min(WORLD_SIZE - 80, y - 20)));
        if (runtime.editorMode === 'sort' && type === 'sortSetting') {
            b.sortId = p.id; b.targetType = p.targetType || 'upgrades'; b.order = p.order || 'desc'; p.settingBlockId = b.id;
        }
        p.blocks.push(b);

        if (runtime.expressionTarget && isExpressionType(type)) {
            var targetParent = getBlock(p, runtime.expressionTarget.parentId);
            var allowed = true;
            if (targetParent && targetParent.type === 'if' && runtime.expressionTarget.key === 'condition') {
                allowed = isConditionType(type);
            }
            if (allowed && setExpressionInput(p, runtime.expressionTarget.parentId, runtime.expressionTarget.key, b.id)) {
                runtime.expressionTarget = null;
                saveState();
                renderCanvas();
                setStatus('ブロックを入れました');
                return;
            }
            p.blocks = p.blocks.filter(function (x) { return x.id !== b.id; });
            runtime.expressionTarget = null;
        }

        saveState();
        renderCanvas();
        setStatus('ブロックを追加しました');
    }

    function deleteBlockById(id) {
        var p = getEditorDocument();
        if (!p || !id) return false;
        var b = getBlock(p, id);
        if (!b) return false;
        p.blocks.forEach(function (parent) {
            if (!parent.inputs) return;
            Object.keys(parent.inputs).forEach(function (key) {
                if (parent.inputs[key] === id) parent.inputs[key] = null;
            });
        });
        p.connections = p.connections.filter(function (c) { return c.from !== id && c.to !== id; });
        p.blocks = p.blocks.filter(function (x) { return x.id !== id; });
        if (runtime.connectionFrom === id) runtime.connectionFrom = null;
        if (runtime.selectedBlockId === id) runtime.selectedBlockId = null;
        if (runtime.expressionTarget && runtime.expressionTarget.parentId === id) runtime.expressionTarget = null;
        saveState();
        renderCanvas();
        setStatus('ブロックを削除しました');
        return true;
    }

    function removeConnection(from, to) {
        var p = getEditorDocument();
        if (!p) return false;
        var before = p.connections.length;
        p.connections = p.connections.filter(function (c) {
            return !(c.from === from && c.to === to);
        });
        return before !== p.connections.length;
    }

    function connectBlocks(from, to) {
        var p = getEditorDocument();
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
        root.querySelectorAll('.cp-block, .cp-expression-child').forEach(function (el) {
            var id = el.dataset.blockId || el.dataset.expressionId;
            el.classList.toggle('connect-source', id === runtime.connectionFrom);
            el.classList.toggle('selected', id === runtime.selectedBlockId);
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

    function updateExpressionTargetVisuals() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.cp-input-slot').forEach(function (slot) {
            var active = runtime.expressionTarget && slot.dataset.inputOwner === runtime.expressionTarget.parentId && slot.dataset.inputKey === runtime.expressionTarget.key;
            slot.classList.toggle('cp-expression-target', !!active);
        });
    }

    function assignExpressionTarget(childId) {
        var p = getEditorDocument();
        var target = runtime.expressionTarget;
        if (!p || !target) return false;
        if (!setExpressionInput(p, target.parentId, target.key, childId)) return false;
        runtime.expressionTarget = null;
        saveState();
        renderCanvas();
        setStatus('ブロックを入れました');
        return true;
    }

    function attachBlockPointer(el) {
        el.addEventListener('pointerdown', function (ev) {
            if (ev.button !== undefined && ev.button !== 0) return;
            ev.preventDefault();

            var p = getEditorDocument();
            var b = getBlock(p, el.dataset.blockId);
            if (!b) return;

            runtime.selectedBlockId = b.id;
            updateSelectionVisuals();
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

            var p = getEditorDocument();
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

            var p = getEditorDocument();
            var b = getBlock(p, el.dataset.blockId);
            if (!b) return;

            if (runtime.expressionTarget && isExpressionType(b.type)) {
                assignExpressionTarget(b.id);
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
        var p = getEditorDocument();
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

    function addVariable() {
        openNameDialog('新しい変数名', '変数' + ((state.variables || []).length + 1), function (name) {
            if ((state.variables || []).some(function(v){ return v.name === name; })) {
                setStatus('同じ名前の変数があります');
                return;
            }
            if (!Array.isArray(state.variables)) state.variables = [];
            state.variables.push({ id: uid('v'), name: name, value: 0 });
            refreshVariableBlockTypes();
            saveState();
            renderPalette();
            renderCanvas();
            setStatus('変数を追加しました');
        });
    }

    function renameVariable() {
        if (!state.variables || !state.variables.length) {
            setStatus('変数がありません');
            return;
        }
        var v = state.variables[state.variables.length - 1];
        openNameDialog('変数名を変更', v.name, function(name) {
            if (state.variables.some(function(x){ return x.id !== v.id && x.name === name; })) {
                setStatus('同じ名前の変数があります');
                return;
            }
            v.name = name;
            refreshVariableBlockTypes();
            saveState();
            renderPalette();
            renderCanvas();
            setStatus('変数名を変更しました');
        });
    }

    function addProgram() {
        openNameDialog('新しいプログラム名', '新しいプログラム', function (name) {
            var p = defaultProgram(name);
            state.programs.push(p);
            state.currentId = p.id;
            runtime.connectionFrom = null;
            runtime.expressionTarget = null;
            runtime.selectedBlockId = null;
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
        var p = defaultProgram('新しいプログラム');
        state.programs.push(p);
        state.currentId = p.id;
        saveState();
    }

    function executeClickTarget(target) {
        try {
            if (target === 'bigCookie') return clickBigCookie();
            if (typeof Game === 'undefined') return false;
            if (target === 'goldenCookie' || target === 'reindeer') {
                var type = target === 'reindeer' ? 'reindeer' : 'golden';
                var shimmer = Game.shimmers && Game.shimmers.find(function(s){ return s.type === type; });
                if (shimmer && shimmer.pop) { shimmer.pop(); return true; }
            }
            if (target === 'ticker' && Game.tickerL && Game.tickerL.click) {
                Game.tickerL.click();
                return true;
            }
            if (target === 'cookieDragon') {
                var dragon = document.getElementById('dragon');
                if (dragon && dragon.click) { dragon.click(); return true; }
                var dragonButton = document.querySelector('[id*="dragon"],[class*="dragon"]');
                if (dragonButton && dragonButton.click) { dragonButton.click(); return true; }
            }
        } catch (e) {}
        return false;
    }

    function normalizeSort(sort) {
        if (!sort) return;
        if (!sort.mode) sort.mode = 'condition';
        if (!Array.isArray(sort.items)) sort.items = [];
        if (!sort.targetType) sort.targetType = 'upgrades';
        if (sort.targetType !== 'upgrades' && sort.targetType !== 'buildings') sort.targetType = 'upgrades';
        if (sort.order !== 'asc' && sort.order !== 'desc') sort.order = 'desc';
        if (!sort.unavailableMode) sort.unavailableMode = 'next';
        if (!Array.isArray(sort.blocks)) sort.blocks = [];
        if (!Array.isArray(sort.connections)) sort.connections = [];

        var valid = {};
        sort.blocks = sort.blocks.filter(function(b){
            if (!b || !b.id || !BLOCK_TYPES[b.type]) return false;
            valid[b.id] = true;
            return true;
        });
        sort.connections = sort.connections.filter(function(c){
            return c && valid[c.from] && valid[c.to];
        });

        var setting = sort.settingBlockId ? sort.blocks.find(function(b){ return b.id === sort.settingBlockId && b.type === 'sortSetting'; }) : null;
        if (!setting) setting = sort.blocks.find(function(b){ return b.type === 'sortSetting'; });
        if (!setting) {
            setting = defaultBlock('sortSetting', 80, 80);
            setting.sortId = sort.id;
            setting.targetType = sort.targetType;
            setting.order = sort.order;
            sort.blocks.push(setting);
        }
        sort.settingBlockId = setting.id;
        setting.sortId = sort.id;
        setting.targetType = sort.targetType;
        setting.order = sort.order;
        if (!setting.inputs) setting.inputs = { condition: null };
        if (!Object.prototype.hasOwnProperty.call(setting.inputs, 'condition')) setting.inputs.condition = null;
        if (setting.inputs.condition && !valid[setting.inputs.condition]) setting.inputs.condition = null;
        sort.blocks.forEach(function(b){
            if (!b.inputs) return;
            Object.keys(b.inputs).forEach(function(key){
                if (b.inputs[key] && !valid[b.inputs[key]]) b.inputs[key] = null;
            });
        });

        // 旧形式の固定条件は破棄し、条件式はソート設定ブロックの入力だけを使う。
        delete sort.condition;
    }

    function getSort(id) {
        return (state.sorts || []).find(function(s){ return s.id === id; }) || null;
    }

    function getUpgradeList() {
        if (typeof Game === 'undefined') return [];
        if (Array.isArray(Game.UpgradesInStore)) return Game.UpgradesInStore.filter(function(u){ return !!u && !u.bought; });
        return [];
    }

    function getBuildingList() {
        if (typeof Game === 'undefined') return [];
        var result = [];
        var seen = {};
        try {
            var products = document.querySelectorAll('#products .product');
            Array.prototype.forEach.call(products, function(el){
                var m = String(el.id || '').match(/^product(\d+)$/);
                if (!m) return;
                var id = Number(m[1]);
                var obj = Game.ObjectsById && Game.ObjectsById[id];
                if (obj && !seen[id]) { seen[id] = true; result.push(obj); }
            });
        } catch(e) {}
        if (!result.length && Array.isArray(Game.ObjectsById)) {
            Game.ObjectsById.forEach(function(obj){ if (obj && obj.unlocked !== false) result.push(obj); });
        }
        return result;
    }

    function getSortTargets(sort) {
        normalizeSort(sort);
        return sort.targetType === 'buildings' ? getBuildingList() : getUpgradeList();
    }

    function getSortTargetLabel(sort) {
        return sort.targetType === 'buildings' ? '施設' : 'アップグレード';
    }

    function getSortConditionValue(sort, item) {
        var setting = sort && sort.blocks ? getBlock(sort, sort.settingBlockId) : null;
        var ref = setting ? getInputRef(setting, 'condition') : null;
        if (!ref) return 0;
        runtime.sortEvaluationSort = sort;
        runtime.sortEvaluationItem = item || null;
        var value = Number(evaluateExpressionBlock(sort, ref));
        runtime.sortEvaluationItem = null;
        runtime.sortEvaluationSort = null;
        return Number.isFinite(value) ? value : 0;
    }

    function getSortedItems(sort) {
        normalizeSort(sort);
        var all = getSortTargets(sort);
        var excluded = {};
        sort.items.forEach(function(x){ if (x.excluded) excluded[String(x.id)] = true; });
        all = all.filter(function(item){ return !excluded[String(item.id)]; });
        if (sort.mode === 'manual') {
            var order = {};
            sort.items.forEach(function(x,i){ order[String(x.id)] = i; });
            all.sort(function(a,b){
                var ai = Object.prototype.hasOwnProperty.call(order,String(a.id)) ? order[String(a.id)] : 999999;
                var bi = Object.prototype.hasOwnProperty.call(order,String(b.id)) ? order[String(b.id)] : 999999;
                return ai - bi || String(a.name).localeCompare(String(b.name));
            });
            return all;
        }
        var values = {};
        all.forEach(function(item){ values[String(item.id)] = getSortConditionValue(sort, item); });
        all.sort(function(a,b){
            var av = values[String(a.id)] || 0;
            var bv = values[String(b.id)] || 0;
            var d = av - bv;
            if (sort.order === 'desc') d = -d;
            return d || String(a.name).localeCompare(String(b.name));
        });
        return all;
    }

    function canBuyUpgrade(u) {
        try {
            if (!u || u.bought) return false;
            if (u.unlocked === false) return false;
            if (typeof u.canBuy === 'function') return !!u.canBuy();
            return typeof Game !== 'undefined' && Number(Game.cookies) >= Number(u.getPrice ? u.getPrice() : u.basePrice || 0);
        } catch(e) { return false; }
    }

    function executeUpgradeSort(sortId, unavailableMode) {
        var sort = getSort(sortId);
        if (!sort || sort.targetType !== 'upgrades') return false;
        var list = getSortedItems(sort);
        if (!list.length) return false;
        for (var i=0;i<list.length;i++) {
            if (canBuyUpgrade(list[i])) {
                try { if (list[i].buy) { list[i].buy(); return true; } } catch(e) {}
            }
            if (unavailableMode === 'wait') return 'wait';
        }
        return false;
    }

    function createDefaultSort(name) {
        var sort = { id: uid('s'), name: name || '新しいソート', mode: 'condition', items: [], targetType: 'upgrades', order: 'desc', unavailableMode: 'next', blocks: [], connections: [], settingBlockId: null };
        var setting = defaultBlock('sortSetting', 80, 80);
        setting.sortId = sort.id;
        setting.targetType = sort.targetType;
        setting.order = sort.order;
        sort.blocks.push(setting);
        sort.settingBlockId = setting.id;
        return sort;
    }

    function renderSortManager(){
        var root=document.getElementById(ROOT_ID); if(!root)return;
        var list=root.querySelector('.cp-sort-list'); if(!list)return;
        list.innerHTML='';
        (state.sorts||[]).forEach(function(sort){
            normalizeSort(sort);
            var row=document.createElement('div'); row.className='cp-sort-row';
            row.innerHTML='<button class="cp-sort-select" style="flex:1;text-align:left">'+escapeHtml(sort.name)+'（'+escapeHtml(getSortTargetLabel(sort))+'）</button>';
            row.querySelector('.cp-sort-select').addEventListener('click',function(){
                runtime.selectedSortId=sort.id;
                renderSortManager(); renderSortEditor();
            });
            list.appendChild(row);
        });
    }

    function renderSortEditor(){
        var root=document.getElementById(ROOT_ID); if(!root)return;
        var box=root.querySelector('.cp-sort-editor'); if(!box)return;
        var sort=getSort(runtime.selectedSortId);
        if(!sort){box.innerHTML='ソートを選択してください';return;}
        normalizeSort(sort);
        box.innerHTML='<div style="font-size:12px;margin-top:5px">対象：<b>'+escapeHtml(getSortTargetLabel(sort))+'</b></div>' +
            '<div style="display:flex;gap:4px;margin-top:5px"><button class="cp-btn cp-edit-sort-condition" style="flex:1">条件をブロックで編集</button></div>' +
            '<div style="font-size:11px;margin-top:4px">ソート条件は「ソート条件を設定する」ブロックで作成します。</div>';
        box.querySelector('.cp-edit-sort-condition').addEventListener('click',function(){
            runtime.editorMode='sort';
            runtime.selectedBlockId=null; runtime.connectionFrom=null; runtime.expressionTarget=null;
            renderEditorModeUI(); renderPalette(); renderCanvas();
            setStatus('ソート条件の編集モードです');
        });
    }

    function reorderSortItem(sort,i,d){var j=i+d;if(j<0||j>=sort.items.length)return;var t=sort.items[i];sort.items[i]=sort.items[j];sort.items[j]=t;saveState();renderSortEditor();}

    function renderEditorModeUI(){
        var root=document.getElementById(ROOT_ID); if(!root)return;
        var sortMode=runtime.editorMode==='sort';
        var select=root.querySelector('.cp-program-select');
        if(select) select.disabled=sortMode;
        root.querySelectorAll('.cp-programs + .cp-btn, .cp-programs + .cp-btn + .cp-btn').forEach(function(b){ b.disabled=sortMode; b.style.opacity=sortMode?'0.5':'1'; });
        var auto=root.querySelector('.cp-auto-load'); if(auto){ auto.disabled=sortMode; auto.parentNode.style.opacity=sortMode?'0.5':'1'; }
        var run=root.querySelector('.cp-run'); var stop=root.querySelector('.cp-stop');
        if(run) { run.disabled=sortMode; run.style.opacity=sortMode?'0.5':'1'; }
        if(stop) { stop.disabled=sortMode; stop.style.opacity=sortMode?'0.5':'1'; }
        var title=root.querySelector('.cp-block-palette-title');
        if(title) title.textContent=sortMode?'ソート条件ブロック':'ブロック';
        var modeLabel=root.querySelector('.cp-editor-mode-label'); if(modeLabel) modeLabel.style.display=sortMode?'block':'none';
        var tools=root.querySelector('.cp-sort-tools');
        if(tools) tools.querySelectorAll('button').forEach(function(b){ b.disabled=false; });
        var exit=root.querySelector('.cp-exit-sort-edit'); if(exit) exit.style.display=sortMode?'block':'none';
    }

    function executePurchaseTarget(target) {
        if (typeof Game === 'undefined' || !target) return false;
        var id = null;
        if (target.indexOf('building:') === 0) id = Number(target.slice(9));
        if (target.indexOf('variable:') === 0) {
            var v = getVariable(target.slice(9));
            id = v ? Number(v.value) : NaN;
        }
        if (!Number.isInteger(id) || id < 0 || id > 19) return false;
        var obj = Game.ObjectsById && Game.ObjectsById[id];
        if (obj && obj.buy) { obj.buy(1); return true; }
        return false;
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

    function getPlaySeconds() {
        if (typeof Game === 'undefined') return 0;
        var start = Number(Game.fullDate);
        if (!Number.isFinite(start) || start <= 0) start = Number(Game.startDate);
        if (!Number.isFinite(start) || start <= 0) return 0;
        return Math.max(0, (Date.now() - start) / 1000);
    }

    function countShimmers(type) {
        if (typeof Game === 'undefined' || !Array.isArray(Game.shimmers)) return 0;
        return Game.shimmers.filter(function(s){ return s.type === type; }).length;
    }

    function countGoldenBuffs() {
        if (typeof Game === 'undefined' || !Game.buffs) return 0;
        var n = 0;
        Object.keys(Game.buffs).forEach(function(k) {
            var b = Game.buffs[k];
            if (b && b.time > 0) n++;
        });
        return n;
    }

    function updateDetectionState() {
        if (typeof Game === 'undefined') return;
        var golden = countShimmers('golden');
        var red = (typeof Game.shimmers !== 'undefined' && Array.isArray(Game.shimmers)) ? Game.shimmers.filter(function(s){ return s.type === 'golden' && s.wrath; }).length : 0;
        var goldenClicks = Number(Game.goldenClicks || 0);
        var buildings = Array.isArray(Game.ObjectsById) ? Game.ObjectsById.reduce(function(n,o){ return n + (Number(o && o.amount)||0); },0) : 0;
        var upgrades = Game.UpgradesById ? Object.keys(Game.UpgradesById).reduce(function(n,k){ return n + (Game.UpgradesById[k] && Game.UpgradesById[k].bought ? 1 : 0); },0) : 0;
        var prestige = Number(Game.prestige || 0);
        var buffs = countGoldenBuffs();
        runtime.detection.events.goldenAppeared = golden > runtime.detection.lastGoldenOnScreen;
        runtime.detection.events.goldenClicked = goldenClicks > runtime.detection.lastGoldenClicks;
        runtime.detection.events.goldenEffect = buffs > runtime.detection.lastGoldenBuffs;
        runtime.detection.events.redEffect = red > runtime.detection.lastRedOnScreen;
        runtime.detection.events.buildingPurchased = buildings > runtime.detection.lastBuildingTotal;
        runtime.detection.events.upgradePurchased = upgrades > runtime.detection.lastUpgradeTotal;
        var canAscend = false;
        try { canAscend = !!(Game.HowMuchPrestige && Game.HowMuchPrestige(Game.cookiesReset) > 0); } catch(e) {}
        runtime.detection.events.ascendAvailable = canAscend && runtime.detection.lastAscendAvailable !== true;
        runtime.detection.events.ascended = prestige !== runtime.detection.lastPrestige && prestige > runtime.detection.lastPrestige;
        runtime.detection.lastGoldenOnScreen = golden;
        runtime.detection.lastRedOnScreen = red;
        runtime.detection.lastGoldenClicks = goldenClicks;
        runtime.detection.lastBuildingTotal = buildings;
        runtime.detection.lastUpgradeTotal = upgrades;
        runtime.detection.lastPrestige = prestige;
        runtime.detection.lastGoldenBuffs = buffs;
        runtime.detection.lastAscendAvailable = canAscend;
    }

    function detectionValue(type) {
        return !!runtime.detection.events[type];
    }

    function getValueBlockValue(type, block) {
        if (BLOCK_TYPES[type] && BLOCK_TYPES[type].kind === 'detection') return detectionValue(type);
        var seconds = getPlaySeconds();
        if (type === 'cookiesTotal') return typeof Game === 'undefined' ? 0 : (Number(Game.cookiesEarned) || 0) + (Number(Game.cookiesReset) || 0);
        if (type === 'cookiesPs') return typeof Game !== 'undefined' && typeof Game.cookiesPs === 'number' ? Game.cookiesPs : 0;
        if (type === 'cookiesPsHighest') return typeof Game !== 'undefined' && typeof Game.cookiesPsRawHighest === 'number' ? Game.cookiesPsRawHighest : 0;
        if (type === 'clicks') return typeof Game !== 'undefined' && typeof Game.cookieClicks === 'number' ? Game.cookieClicks : 0;
        if (type === 'playTime') {
            if (!block || block.unit === 'seconds') return seconds;
            if (block.unit === 'minutes') return seconds / 60;
            if (block.unit === 'hours') return seconds / 3600;
            return seconds / 86400;
        }
        if (type === 'prestigeLevel') return typeof Game === 'undefined' ? 0 : Number(Game.prestige) || 0;
        if (type === 'prestigeGain') return typeof Game === 'undefined' || !Game.HowMuchPrestige ? 0 : Number(Game.HowMuchPrestige(Game.cookiesReset)) || 0;
        if (type === 'expansionUpgrades') {
            if (typeof Game === 'undefined' || !Game.UpgradesById) return 0;
            return Object.keys(Game.UpgradesById).reduce(function(n,k){ var u=Game.UpgradesById[k]; return n + (u && u.bought && u.pool === 'prestige' ? 1 : 0); }, 0);
        }
        if (type === 'goldenClicks') return typeof Game === 'undefined' ? 0 : Number(Game.goldenClicks || 0);
        if (type === 'goldenOnScreen') return countShimmers('golden');
        if (type === 'goldenBuffed') return countGoldenBuffs();
        if (type === 'redClicks') return typeof Game === 'undefined' ? 0 : Number(Game.goldenClicks || 0) - Number(Game.goldenClicksLocal || 0);
        if (type === 'redOnScreen') {
            if (typeof Game === 'undefined' || !Array.isArray(Game.shimmers)) return 0;
            return Game.shimmers.filter(function(s){ return s.type === 'golden' && s.wrath; }).length;
        }
        if (type === 'redBuffed') return countGoldenBuffs();
        if (type === 'inventory') {
            var target = block && block.target;
            if (typeof Game === 'undefined' || !target) return 0;
            if (target === 'cookies') return Number(Game.cookies) || 0;
            if (target === 'sugarLumps') return Number(Game.lumps) || 0;
            if (target === 'heavenlyChips') return Number(Game.heavenlyChips) || 0;
            if (target.indexOf('building:') === 0) {
                var id = Number(target.slice(9));
                var obj = Game.ObjectsById && Game.ObjectsById[id];
                return obj ? Number(obj.amount) || 0 : 0;
            }
            if (target === 'buildingsTotal') return (Game.ObjectsById || []).reduce(function(n,o){ return n + (Number(o && o.amount) || 0); }, 0);
            if (target === 'upgradesTotal') return Game.UpgradesById ? Object.keys(Game.UpgradesById).reduce(function(n,k){ return n + (Game.UpgradesById[k] && Game.UpgradesById[k].bought ? 1 : 0); }, 0) : 0;
            if (target === 'heavenlyUpgradesTotal') return Game.UpgradesById ? Object.keys(Game.UpgradesById).reduce(function(n,k){ var u=Game.UpgradesById[k]; return n + (u && u.bought && u.pool === 'prestige' ? 1 : 0); }, 0) : 0;
        }
        if (type.indexOf('variable:') === 0) {
            var v = getVariable(type.slice(9));
            return v ? Number(v.value) || 0 : 0;
        }
        return 0;
    }


    function readNumber(value, p, ownerId, key) {
        var ref = ownerId && key ? getInputRef(getBlock(p, ownerId), key) : null;
        if (ref) return evaluateExpressionBlock(p, ref);
        value = String(value == null ? '0' : value).trim();
        if (value === '結果') return Number(runtime.lastValue) || 0;
        if (value === 'クッキー') return typeof Game !== 'undefined' ? Number(Game.cookies)||0 : 0;
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function evaluateExpressionBlock(p, id, seen) {
        var b = getBlock(p, id);
        if (!b) return 0;
        seen = seen || {};
        if (seen[id]) return 0;
        seen[id] = true;

        var def = BLOCK_TYPES[b.type];
        if (!def) return 0;
        if (def.kind === 'value' || def.kind === 'detection') return getValueBlockValue(b.type, b);
        if (def.kind === 'operator' || def.kind === 'comparison') {
            var a = readNumber(b.a, p, b.id, 'a');
            var c = readNumber(b.b, p, b.id, 'b');
            var result = 0;
            if (b.type === 'add') result = a + c;
            if (b.type === 'subtract') result = a - c;
            if (b.type === 'multiply') result = a * c;
            if (b.type === 'divide') result = c === 0 ? 0 : a / c;
            if (b.type === 'greater') result = a > c ? 1 : 0;
            if (b.type === 'less') result = a < c ? 1 : 0;
            if (b.type === 'equal') result = a === c ? 1 : 0;
            if (b.type === 'notEqual') result = a !== c ? 1 : 0;
            if (b.type === 'greaterEqual') result = a >= c ? 1 : 0;
            if (b.type === 'lessEqual') result = a <= c ? 1 : 0;
            return result;
        }
        if (def.kind === 'logic') {
            if (b.type === 'not') return !Boolean(readLogicInput(b, 'value', p));
            if (b.type === 'and') return Boolean(readLogicInput(b, 'a', p)) && Boolean(readLogicInput(b, 'b', p));
            if (b.type === 'or') return Boolean(readLogicInput(b, 'a', p)) || Boolean(readLogicInput(b, 'b', p));
        }
        return 0;
    }

    function readLogicInput(b, key, p) {
        var ref = getInputRef(b, key);
        if (ref) return evaluateExpressionBlock(p, ref);
        return 0;
    }

    function evaluateCondition(b, p) {
        var conditionId = getInputRef(b, 'condition');
        if (!conditionId) return false;
        var conditionBlock = getBlock(p, conditionId);
        if (!conditionBlock || !BLOCK_TYPES[conditionBlock.type] || ['comparison','logic'].indexOf(BLOCK_TYPES[conditionBlock.type].kind) < 0) return false;
        return !!evaluateExpressionBlock(p, conditionId);
    }

    function executeOperator(b, p) {
        var result = evaluateExpressionBlock(p, b.id);
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
        runtime.waitUntil = 0;
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

        updateDetectionState();
        var budget = 64;
        var steps = 0;

        if (runtime.waitUntil > Date.now()) return;
        runtime.waitUntil = 0;

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
                executeClickTarget(b.target);
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'buy') {
                executePurchaseTarget(b.target);
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'buyUpgrade') {
                var sortResult = executeUpgradeSort(b.sortId, b.unavailableMode);
                if (sortResult === 'wait') {
                    runtime.currentBlockId = b.id;
                    runtime.waitUntil = Date.now() + 250;
                    return;
                }
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'ascend') {
                try { if (typeof Game !== 'undefined' && Game.Ascend) Game.Ascend(); } catch (e) {}
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'variableAdd' || b.type === 'variableSet') {
                var variable = getVariable(b.variableId);
                if (variable) {
                    var value = readNumber(b.value, p, b.id, 'value');
                    variable.value = b.type === 'variableAdd' ? (Number(variable.value) || 0) + value : value;
                    saveState();
                }
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'add' || b.type === 'subtract' || b.type === 'multiply' || b.type === 'divide' || b.type === 'greater' || b.type === 'less' || b.type === 'equal' || b.type === 'notEqual' || b.type === 'greaterEqual' || b.type === 'lessEqual') {
                executeOperator(b, p);
                runtime.currentBlockId = nextBlock(p, b.id);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'if') {
                var condition = evaluateCondition(b, p);
                runtime.lastCondition = condition;
                var branches = outgoing(p, b.id);
                runtime.currentBlockId = condition ? (branches[0] ? branches[0].to : null) : (branches[1] ? branches[1].to : null);
                if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                continue;
            }

            if (b.type === 'repeat') {
                var repeatCount = Math.max(0, Math.floor(Number(b.count) || 0));
                var repeatChildren = outgoing(p, b.id);
                if (repeatCount <= 0 || !repeatChildren.length) {
                    runtime.currentBlockId = nextBlock(p, b.id);
                    if (!runtime.currentBlockId) returnFromLoopOrStop(p);
                    continue;
                }
                var top = runtime.loopStack[runtime.loopStack.length - 1];
                if (!top || top.repeatId !== b.id) {
                    runtime.loopStack.push({ repeatId: b.id, firstChildId: repeatChildren[0].to, remaining: repeatCount });
                }
                runtime.currentBlockId = repeatChildren[0].to;
                continue;
            }

            if (b.type === 'wait') {
                var waitSeconds = Math.max(0, Number(b.seconds) || 0);
                runtime.waitUntil = Date.now() + waitSeconds * 1000;
                runtime.currentBlockId = nextBlock(p, b.id);
                return;
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
        if (loop.repeatId) {
            loop.remaining--;
            if (loop.remaining > 0) {
                runtime.currentBlockId = loop.firstChildId;
                return true;
            }
            runtime.loopStack.pop();
            runtime.currentBlockId = nextBlock(p, loop.repeatId);
            if (runtime.currentBlockId) return true;
            return returnFromLoopOrStop(p);
        }

        // The forever body is finished. Restart its first child on the next frame.
        runtime.currentBlockId = loop.firstChildId;
        return true;
    }

    function bindEvents(root) {
        var helpButton = root.querySelector('.cp-help-button');
        helpButton.addEventListener('click', function(){ var panel=root.querySelector('.cp-help-panel'); panel.classList.toggle('show'); runtime.helpOpen=panel.classList.contains('show'); });
        var helpPanel=root.querySelector('.cp-help-panel');
        helpPanel.querySelector('.cp-help-content').innerHTML=root.querySelector('.cp-help-source').innerHTML;
        root.querySelector('.cp-block-list-toggle').addEventListener('click', function(){ runtime.sidebarOpen=!runtime.sidebarOpen; root.querySelector('.cp-sidebar').style.display=runtime.sidebarOpen?'block':'none'; });
        root.querySelector('.cp-add-sort').addEventListener('click', function(){ openNameDialog('新しいソート名','新しいソート',function(name){var sort=createDefaultSort(name);state.sorts.push(sort);runtime.selectedSortId=sort.id;runtime.editorMode='sort';saveState();renderSortManager();renderSortEditor();renderEditorModeUI();renderPalette();renderCanvas();}); });
        root.querySelector('.cp-rename-sort').addEventListener('click', function(){var sort=getSort(runtime.selectedSortId);if(!sort){setStatus('ソートを選択してください');return;}openNameDialog('ソート名を変更',sort.name,function(name){sort.name=name;saveState();renderSortManager();renderSortEditor();renderCanvas();});});
        root.querySelector('.cp-delete-sort').addEventListener('click', function(){var sort=getSort(runtime.selectedSortId);if(!sort)return;if(!confirm('「'+sort.name+'」を削除しますか？'))return;state.sorts=state.sorts.filter(function(x){return x.id!==sort.id;});runtime.selectedSortId=state.sorts[0]?state.sorts[0].id:null;saveState();renderSortManager();renderSortEditor();renderPalette();renderCanvas();});
        root.querySelector('.cp-exit-sort-edit').addEventListener('click', function(){ runtime.editorMode='program'; runtime.selectedBlockId=null; runtime.connectionFrom=null; runtime.expressionTarget=null; renderEditorModeUI(); renderPalette(); renderCanvas(); setStatus('プログラム編集に戻りました'); });
        root.querySelector('.cp-add-program').addEventListener('click', addProgram);
        root.querySelector('.cp-delete-program').addEventListener('click', deleteCurrentProgram);
        root.querySelector('.cp-rename-program').addEventListener('click', renameCurrentProgram);
        root.querySelector('.cp-add-variable').addEventListener('click', addVariable);
        root.querySelector('.cp-rename-variable').addEventListener('click', renameVariable);

        root.querySelector('.cp-program-select').addEventListener('change', function () {
            stopProgram();
            state.currentId = this.value;
            runtime.connectionFrom = null;
            runtime.expressionTarget = null;
            runtime.selectedBlockId = null;
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
        root.querySelector('.cp-palette-prev').addEventListener('click', function () {
            runtime.palettePage--;
            renderPalette();
        });
        root.querySelector('.cp-palette-next').addEventListener('click', function () {
            runtime.palettePage++;
            renderPalette();
        });
        var deleteBlockButton = root.querySelector('.cp-delete-block');
        if (deleteBlockButton) {
            deleteBlockButton.addEventListener('click', function () {
                if (!runtime.selectedBlockId) { setStatus('削除するブロックを選択してください'); return; }
                deleteBlockById(runtime.selectedBlockId);
            });
        }
        document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
            var rootNow = document.getElementById(ROOT_ID);
            if (!rootNow || document.activeElement && ['INPUT','SELECT','TEXTAREA'].indexOf(document.activeElement.tagName) >= 0) return;
            if (runtime.selectedBlockId) { ev.preventDefault(); deleteBlockById(runtime.selectedBlockId); }
        });
        renderPalette();
        renderSortManager();
        renderSortEditor();
        renderEditorModeUI();

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
            runtime.expressionTarget = null;
            runtime.selectedBlockId = null;
            updateSelectionVisuals();
            updateExpressionTargetVisuals();
            setStatus('選択を解除しました');
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

        wrap.addEventListener('touchstart', function (ev) {
            if (!ev.touches || !ev.touches.length) return;
            if (ev.target.closest && ev.target.closest('.cp-block')) return;
            ev.preventDefault();
            runtime.touchGesture = {
                touches: Array.prototype.slice.call(ev.touches).map(function(t) {
                    return {x:t.clientX, y:t.clientY};
                }),
                viewX: runtime.view.x,
                viewY: runtime.view.y,
                zoom: runtime.view.zoom
            };
        }, {passive:false});

        wrap.addEventListener('touchmove', function (ev) {
            var g = runtime.touchGesture;
            if (!g || !ev.touches || !ev.touches.length) return;
            ev.preventDefault();

            if (ev.touches.length === 1 && g.touches.length === 1) {
                runtime.view.x = g.viewX + ev.touches[0].clientX - g.touches[0].x;
                runtime.view.y = g.viewY + ev.touches[0].clientY - g.touches[0].y;
                applyView();
                return;
            }

            if (ev.touches.length >= 2 && g.touches.length >= 2) {
                var a0 = g.touches[0], b0 = g.touches[1];
                var a = ev.touches[0], b = ev.touches[1];
                var oldDist = Math.max(1, Math.hypot(b0.x-a0.x, b0.y-a0.y));
                var newDist = Math.max(1, Math.hypot(b.clientX-a.clientX, b.clientY-a.clientY));
                var oldMidX = (a0.x+b0.x)/2, oldMidY = (a0.y+b0.y)/2;
                var newMidX = (a.clientX+b.clientX)/2, newMidY = (a.clientY+b.clientY)/2;
                var rect = wrap.getBoundingClientRect();
                var worldX = (oldMidX-rect.left-g.viewX)/g.zoom;
                var worldY = (oldMidY-rect.top-g.viewY)/g.zoom;
                var newZoom = Math.max(0.25, Math.min(3, g.zoom*newDist/oldDist));
                runtime.view.zoom = newZoom;
                runtime.view.x = newMidX-rect.left-worldX*newZoom;
                runtime.view.y = newMidY-rect.top-worldY*newZoom;
                applyView();
            }
        }, {passive:false});

        wrap.addEventListener('touchend', function () {
            runtime.touchGesture = null;
        }, {passive:false});

        wrap.addEventListener('touchcancel', function () {
            runtime.touchGesture = null;
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
        renderSortManager();
        renderSortEditor();
        renderEditorModeUI();
        renderCanvas();
        applyView();
        setStatus(runtime.editorMode === 'sort' ? 'ソート条件の編集モードです' : '準備完了');

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
                renderSortManager();
                renderSortEditor();
                renderEditorModeUI();
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
                        sanitizeState();
                        saveState();
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
    if (!runtime.selectedSortId && state.sorts.length) runtime.selectedSortId = state.sorts[0].id;

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
        console.error('[CookieProgrammer] error message:', e && e.message);
        console.error('[CookieProgrammer] error stack:', e && e.stack);

        if (typeof Game !== 'undefined' && Game.Notify) {
            var errorMessage = (e && e.message) ? String(e.message) : String(e);
            Game.Notify(
                'Cookie Programmer',
                'ミニゲームの表示に失敗しました。エラー: ' + errorMessage,
                [16, 5],
                12
            );
        }
    }

    console.log('[CookieProgrammer] v' + VERSION + ' loaded.');
    console.log('Open with: ' + MOD_ID + '.open()');
})();
