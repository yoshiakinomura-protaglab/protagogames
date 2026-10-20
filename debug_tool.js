/**
 * debug_tool.js - カード個別削除 ＋ 20枚表示縦長ツール
 */

let debugLoadedCards = [];

async function loadDebugCardsDb() {
    try {
        const response = await fetch('./csvLoader.js');
        const jsText = await response.text();
        const blob = new Blob([jsText], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const module = await import(blobUrl);
        const data = await module.loadGameDataFromCSV();
        
        if (data && data.cardsDb && data.cardsDb.length > 0) {
            debugLoadedCards = data.cardsDb;
            if (typeof setCachedCardsDb === 'function') {
                setCachedCardsDb(debugLoadedCards);
            }
            populateCardSelect();
            updateDebugDisplay();
        }
    } catch (e) {
        console.warn("debug_tool: cards.csv ロード待機中", e);
    }
}

function populateCardSelect() {
    const select = document.getElementById('debug-select-card-id');
    if (!select || debugLoadedCards.length === 0) return;

    select.innerHTML = debugLoadedCards.map(c => 
        `<option value="${c.id}">${c.id}: ${c.name}</option>`
    ).join('');
}

/**
 * 個別カードの枚数変更・削除処理
 */
function removeCardFromCollection(cardId, removeCount = 1) {
    const col = getUserCollection();
    const idStr = String(cardId);
    
    if (col[idStr]) {
        if (removeCount === 'ALL') {
            delete col[idStr];
        } else {
            col[idStr] -= Number(removeCount);
            if (col[idStr] <= 0) delete col[idStr];
        }
        saveUserCollection(col);
        updateDebugDisplay();
    }
}

function initDebugCardTool() {
    if (document.getElementById('debug-card-tool')) return;

    const toolHtml = `
        <div id="debug-card-tool" style="
            position: fixed; bottom: 12px; right: 12px; z-index: 99998;
            font-family: sans-serif; color: #ffffff; select-none;
        ">
            <!-- 普段の最小化バー -->
            <div id="debug-tool-bar" style="
                background: rgba(15, 23, 42, 0.9); border: 1.5px solid #f59e0b;
                border-radius: 20px; padding: 6px 14px; font-size: 11px; font-weight: bold;
                color: #f59e0b; cursor: pointer; display: flex; align-items: center; gap: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.6); backdrop-filter: blur(4px);
            ">
                <span>🛠️ デバッグツール</span>
                <span id="debug-bar-famous" style="color: #38bdf8; font-size: 10px;">有名度: --</span>
                <span style="background: #f59e0b; color: #0f172a; border-radius: 10px; padding: 1px 6px; font-size: 9px;">開く ▲</span>
            </div>

            <!-- 縦長メインパネル -->
            <div id="debug-tool-panel" style="
                display: none; width: 340px; height: 92vh; max-height: 750px;
                background: rgba(15, 23, 42, 0.96); border: 2px solid #f59e0b;
                border-radius: 14px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.9);
                backdrop-filter: blur(8px); flex-direction: column; gap: 10px; margin-top: 6px;
            ">
                <!-- ヘッダー -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-b: 1px solid #334155; padding-bottom: 6px; flex-shrink: 0;">
                    <span style="font-weight: bold; font-size: 13px; color: #f59e0b;">🛠️ デバッグカード獲得 & 管理</span>
                    <button id="debug-panel-close" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer;">▼ 閉じる</button>
                </div>

                <!-- 1. 最上段：カード選択 ＆ 入手 -->
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <select id="debug-select-card-id" style="
                        flex: 1; padding: 6px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 11px; outline: none;
                    ">
                        <option value="">読み込み中...</option>
                    </select>
                    <input type="number" id="debug-input-card-count" min="1" value="1" style="
                        width: 45px; padding: 6px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 11px; text-align: center;
                    " />
                    <button id="debug-btn-add-card" style="
                        background: #2563eb; color: #fff; font-weight: bold; font-size: 11px; border: none; border-radius: 6px; cursor: pointer; padding: 6px 12px;
                    ">入手</button>
                </div>

                <!-- 2. 中段：解放タグ検証エリア -->
                <div style="background: #1e293b; border-radius: 8px; padding: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #38bdf8;">🏷️ 解放タグ検証（リアルタイム）</span>
                        <span id="debug-unlocked-count" style="font-size: 10px; color: #94a3b8;">--</span>
                    </div>
                    <div id="debug-tag-check-results" style="
                        max-height: 80px; overflow-y: auto; background: #0f172a; padding: 6px; border-radius: 6px; line-height: 1.5; word-break: break-all;
                    ">
                        カードを入手・削除すると解放判定が行われます
                    </div>
                </div>

                <!-- 3. 下段：20枚以上＋削除ボタン付き所持リスト -->
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; min-height: 0;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; flex-shrink: 0;">
                        <span id="debug-famous-display" style="color: #f59e0b; font-weight: bold;">有名度: --</span>
                        <span id="debug-mode-display">モード: --</span>
                    </div>
                    
                    <div id="debug-status-log" style="
                        flex: 1; overflow-y: auto; background: #020617; border: 1px solid #1e293b;
                        padding: 6px 8px; border-radius: 6px; font-size: 10.5px; line-height: 1.45; color: #e2e8f0;
                    ">
                        所持データを読み込んでいます...
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', toolHtml);

    // イベント設定
    const bar = document.getElementById('debug-tool-bar');
    const panel = document.getElementById('debug-tool-panel');
    const btnClose = document.getElementById('debug-panel-close');

    const togglePanel = (show) => {
        bar.style.display = show ? 'none' : 'flex';
        panel.style.display = show ? 'flex' : 'none';
    };

    bar.addEventListener('click', () => togglePanel(true));
    btnClose.addEventListener('click', () => togglePanel(false));

    document.getElementById('debug-btn-add-card').addEventListener('click', () => {
        const select = document.getElementById('debug-select-card-id');
        const id = select ? select.value : '';
        const count = document.getElementById('debug-input-card-count').value;
        if (!id) return;

        addCardToCollection(id, count);
        updateDebugDisplay();
    });

    loadDebugCardsDb().then(() => updateDebugDisplay());
}

/**
 * 画面表示の自動更新処理（削除ボタンイベントバインド追加）
 */
function updateDebugDisplay() {
    const col = getUserCollection();
    const total = getTotalCardCount();
    const famous = getHeroFamousLevel();
    const uniqueCount = Object.keys(col).filter(id => col[id] > 0).length;

    const barFamous = document.getElementById('debug-bar-famous');
    if (barFamous) barFamous.textContent = `有名度: ${famous}`;

    const famousDisp = document.getElementById('debug-famous-display');
    if (famousDisp) famousDisp.textContent = `有名度: ${famous} (計${total}枚)`;

    const modeDisp = document.getElementById('debug-mode-display');
    if (modeDisp) modeDisp.textContent = `【${getAppMode() === 'DEBUG_ALL' ? '全所持' : '通常'}】 (${uniqueCount}種)`;

    // 下段ログ：カード名 ＋ 枚数 ＋ 減算/削除操作ボタン
    const logEl = document.getElementById('debug-status-log');
    if (logEl) {
        const ownedEntries = Object.entries(col).filter(([_, cnt]) => cnt > 0);
        if (ownedEntries.length === 0) {
            logEl.innerHTML = '<span style="color:#64748b;">所持カードがありません</span>';
        } else {
            const listHtml = ownedEntries.map(([id, cnt]) => {
                const card = debugLoadedCards.find(c => String(c.id) === String(id));
                const name = card ? card.name : id;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-b:1px solid #0f172a; padding:3px 0;">
                        <span style="truncate; max-width: 170px;">${name} <span style="font-size:9px; color:#64748b;">(${id})</span></span>
                        <div style="display:flex; align-items:center; gap: 4px;">
                            <b style="color:#38bdf8; font-size:11px; margin-right:4px;">${cnt}枚</b>
                            <button onclick="removeCardFromCollection('${id}', 1)" style="
                                background:#334155; color:#fff; border:none; border-radius:3px; padding:1px 5px; font-size:9px; cursor:pointer;
                            " title="1枚減らす">-1</button>
                            <button onclick="removeCardFromCollection('${id}', 'ALL')" style="
                                background:#ef4444; color:#fff; border:none; border-radius:3px; padding:1px 5px; font-size:9px; cursor:pointer;
                            " title="全削除">全削除</button>
                        </div>
                    </div>
                `;
            }).join('');
            logEl.innerHTML = listHtml;
        }
    }

    // タグ解放検証
    const tagEl = document.getElementById('debug-tag-check-results');
    const tagCountEl = document.getElementById('debug-unlocked-count');
    
    if (tagEl && typeof canUnlockTag === 'function' && typeof tagUnlockRulesDb !== 'undefined') {
        const unlockedList = [];
        let totalRuleTags = 0;

        tagUnlockRulesDb.forEach(rule => {
            if (!rule.tag) return;
            totalRuleTags++;
            if (canUnlockTag(rule.tag, debugLoadedCards)) {
                unlockedList.push(rule.tag);
            }
        });

        if (tagCountEl) tagCountEl.textContent = `解放可: ${unlockedList.length} / ${totalRuleTags}タグ`;

        if (unlockedList.length === 0) {
            tagEl.innerHTML = '<span style="color:#64748b;">現在解放条件を満たしているタグはありません</span>';
        } else {
            tagEl.innerHTML = unlockedList.map(tag => 
                `<span style="display:inline-block; background:#0284c7; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin:2px;">✅ ${tag}</span>`
            ).join(' ');
        }
    }
}

window.addEventListener('DOMContentLoaded', initDebugCardTool);