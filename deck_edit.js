// ポータブル環境用：MIMEタイプ制限を回避してデータをロードする関数
async function loadGameDataFromCSV() {
    try {
        const response = await fetch('./csvLoader.js');
        const jsText = await response.text();
        const blob = new Blob([jsText], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const module = await import(blobUrl);
        return await module.loadGameDataFromCSV();
    } catch (err) {
        console.error("CSVデータのロードに失敗しました:", err);
        return { cardsDb: [], tagMaster: {}, cpuDecks: [], jokerResults: [], bgmMaster: [] };
    }
}

const STORAGE_KEY_DECKS = 'yamato_縁_saved_decks_v1';
let allCards = [];
let retsudenMap = {};
let bgmAudio = null;
let currentEditingDeck = {
    id: 1,
    name: 'デッキ１',
    jokerId: null,
    cardIds: []
};
let displayMode = 'illust';
let activeCardDetail = null;
let tagsMap = {};
let selectedTagFilters = new Set();
let tempModalTagFilters = new Set();

// ==========================================
// 1. 初期化 ＆ データロード
// ==========================================
/**
 * 主人公カード（c97000〜c97003）を対象に、
 * heroData のパラメータ（名前・有名度・じゃんけん手・装着タグ）を動的上書きする関数
 * ※ 画像（imageIllust / imageReal）は cards.csv の設定をそのまま参照します
 */
/**
 * 主人公カード（c97000〜c97003）を対象に、
 * heroData のパラメータ（名前・有名度・じゃんけん手・装着タグ）を動的上書きする関数
 * ※ 画像（imageIllust / imageReal）は cards.csv の設定をそのまま参照します
 */
function applyHeroCustomToJokerCard(card) {
    if (!card || !card.id) return card;

    // 1. JOKER判定（一般カードは除外）
    const r = String(card.rank || '').toUpperCase();
    if (r !== 'JOKER' && r !== 'JK') return card;

    // 2. 主人公カードID判定（指定の4枚以外は除外）
    const PROTAGONIST_IDS = ['c97000', 'c97001', 'c97002', 'c97003'];
    const cardIdStr = String(card.id).trim();
    if (!PROTAGONIST_IDS.includes(cardIdStr)) {
        return card;
    }

    // hero_manager.js 経由で設定データを取得
    const hero = typeof getHeroData === 'function' 
        ? getHeroData() 
        : { name: '主人公', janken: 'gu', equippedTags: ['大和の縁'] };
    
    const famousLevel = typeof getHeroFamousLevel === 'function' 
        ? getHeroFamousLevel() 
        : 30;

    const updatedCard = { ...card };

    // ① 名前を入力値で動的上書き（未設定時は CSV 本来の名前を保持）
    updatedCard.name = hero.name || card.name;

    // ② 有名度（Power）を動的上書き
    updatedCard.power = famousLevel;

    // ③ 得意なじゃんけん手を動的上書き
    updatedCard.janken = hero.janken || 'gu';

    // ④ 装着特性タグを動的上書き（「大和の縁」＋ カスタム枠）
    const activeTags = (hero.equippedTags || ['大和の縁']).filter(Boolean);
    updatedCard.tags = activeTags;
    updatedCard.tag = activeTags.join(',');

    // ※ 画像（imageIllust / imageReal）は上書きせず CSV の値をそのまま採用

    return updatedCard;
}

async function initDeckEditor() {
    try {
        // ★ データを確実に待機して取得
        const gameData = await loadGameDataFromCSV();
        if (gameData && gameData.cardsDb && gameData.cardsDb.length > 0) {
            // ★ JOKERカードへ主人公カスタマイズ値を適用して保持
            allCards = gameData.cardsDb.map(c => applyHeroCustomToJokerCard(c));
        } else {
            console.warn("cardsDb が空です");
        }

        await loadRetsudenCSV();
        await loadTagsCSV();

        initGenFilter();
        loadDeckFromStorage(1);
        setupEventListeners();

        // ★ 取得完了後に画面再描画を実行
        refreshEditorUI();

        playDeckBGM();

    } catch (err) {
        console.error("初期化エラー:", err);
    }
}

// tags.csv パース
async function loadTagsCSV() {
    try {
        const res = await fetch('tags.csv');
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const tagIdx = headers.indexOf('tag');
        const catIdx = headers.indexOf('category');
        const rankIdx = headers.indexOf('rank');

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            const tagName = cols[tagIdx];
            if (tagName) {
                tagsMap[tagName] = {
                    category: cols[catIdx] || 'OTHERS',
                    rank: (cols[rankIdx] || 'C').toUpperCase()
                };
            }
        }
    } catch (e) {
        console.log("tags.csv読み込みエラー:", e);
    }
}


// retsuden.csv パース
async function loadRetsudenCSV() {
    try {
        const res = await fetch('retsuden.csv');
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const idIdx = headers.indexOf('id');
        const textIdx = headers.indexOf('text');

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            if (idIdx !== -1 && textIdx !== -1) {
                retsudenMap[cols[idIdx]] = cols[textIdx];
            }
        }
    } catch (e) {
        console.log("retsuden.csv読み込みスキップ:", e);
    }
}

// ==========================================
// ★ ここ（83行目付近）に追加します！
// ==========================================
// bgm.csv から deckbuild の曲を取得して再生する関数
async function playDeckBGM() {
    try {
        const res = await fetch(`bgm.csv?v=${new Date().getTime()}`);
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const idIdx = headers.indexOf('bgm_id');
        const fileIdx = headers.indexOf('bgm_file');

        let fileName = 'deckbuild_bgm.mp3';

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols[idIdx] === 'deckbuild') {
                fileName = cols[fileIdx] || fileName;
                break;
            }
        }

        if (bgmAudio) {
            bgmAudio.pause();
            bgmAudio = null;
        }

        bgmAudio = new Audio(`audio/${fileName}`);
        bgmAudio.loop = true;
        bgmAudio.volume = 0.3;

        bgmAudio.play().catch(err => {
            console.log("BGM自動再生待ち:", err);
        });
    } catch (e) {
        console.log("bgm.csv読み込みエラー:", e);
    }
}

// BGMを停止する関数
function stopDeckBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
    }
}

// ==========================================
// 2. ストレージ（localStorage）10枠管理
// ==========================================

// ゲーム内トースト通知表示関数
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = message;
    toast.classList.remove('-translate-y-[100px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-[100px]', 'opacity-0');
    }, 2000);
}

function getSavedDecks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_DECKS);
        if (raw) return JSON.parse(raw);
    } catch (e) {}

    // デフォルト10枠を作成
    const defaultDecks = {};
    for (let i = 1; i <= 10; i++) {
        defaultDecks[i] = {
            id: i,
            name: `デッキ${i}`,
            jokerId: null,
            cardIds: []
        };
    }
    return defaultDecks;
}

function saveCurrentDeckToStorage() {
    const decks = getSavedDecks();
    const inputName = document.getElementById('deck-name-input')?.value.trim() || `デッキ${currentEditingDeck.id}`;
    
    currentEditingDeck.name = inputName;
    decks[currentEditingDeck.id] = { ...currentEditingDeck };

    localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));

    // ブラウザのalertではなくゲーム内トーストを表示！
    showToast(`「${currentEditingDeck.name}」を保存しました！`);
}

function loadDeckFromStorage(deckSlotId) {
    const decks = getSavedDecks();
    const loaded = decks[deckSlotId] || { id: deckSlotId, name: `デッキ${deckSlotId}`, jokerId: null, cardIds: [] };
    
    currentEditingDeck = { ...loaded };

    const inputName = document.getElementById('deck-name-input');
    if (inputName) inputName.value = currentEditingDeck.name;

    refreshEditorUI();
}

// ==========================================
// 3. UI再描画（編成枠 ＆ カード一覧）
// ==========================================
function refreshEditorUI() {
    renderSelectedSlots();
    renderCollectionGrid();
}

// 画面上部：編成枠（1マス目JOKER + 2〜20マス目ノーマルカード19枚）
function renderSelectedSlots() {
    const container = document.getElementById('slots-20-container');
    const badge = document.getElementById('deck-count-badge');

    const totalCount = (currentEditingDeck.jokerId ? 1 : 0) + currentEditingDeck.cardIds.length;
    if (badge) badge.innerText = `${totalCount} / 20枚`;

    if (!container) return;

    let html = '';

    // ==========================================
    // 1マス目：JOKER専用枠（右上虫眼鏡ボタン追加）
    // ==========================================
    if (currentEditingDeck.jokerId) {
        const jokerCard = allCards.find(c => String(c.id) === String(currentEditingDeck.jokerId));
        const img = (displayMode === 'real' ? jokerCard?.imageReal : jokerCard?.imageIllust) || `${jokerCard?.id}_illust.jpg`;

        html += `
            <div class="relative group w-full aspect-[3/4]">
                <div onclick="removeJoker()" class="w-full h-full bg-slate-950 border-2 border-amber-400 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-all relative shadow-[0_0_15px_rgba(245,158,11,0.5)] min-h-0">
                    <img src="images/${img}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                    <div class="absolute top-0.5 left-0.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-1 py-0.5 rounded shadow flex items-center gap-0.5 z-10">
                        <i class="fa-solid fa-crown text-[7px]"></i> JOKER
                    </div>
                </div>

                <!-- 虫眼鏡（詳細表示）ボタン -->
                <button onclick="window.openCardDetail('${jokerCard?.id}', event)" class="absolute top-1 right-1 bg-slate-950/80 border border-amber-400 text-amber-300 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] hover:scale-110 z-20 cursor-pointer">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
            </div>
        `;
    } else {
        html += `
            <div class="w-full aspect-[3/4] bg-amber-950/20 border-2 border-dashed border-amber-500/80 rounded-lg flex flex-col items-center justify-center text-amber-400 text-center p-0.5 space-y-0.5 min-h-0">
                <i class="fa-solid fa-crown text-amber-400 text-xs sm:text-sm"></i>
                <div class="text-[8px] font-black font-yuji">JOKER</div>
            </div>
        `;
    }

    // ==========================================
    // 2〜20マス目：ノーマルカード19枚枠（右上虫眼鏡ボタン追加）
    // ==========================================
    for (let i = 0; i < 19; i++) {
        const cardId = currentEditingDeck.cardIds[i];
        if (cardId) {
            const card = allCards.find(c => String(c.id) === String(cardId));
            const img = (displayMode === 'real' ? card?.imageReal : card?.imageIllust) || `${card?.id}_illust.jpg`;
            html += `
                <div class="relative group w-full aspect-[3/4]">
                    <div onclick="window.removeNormalCard(${i})" class="w-full h-full bg-slate-950 border border-amber-500/60 rounded-lg overflow-hidden cursor-pointer hover:border-rose-400 transition-all relative min-h-0">
                        <img src="images/${img}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                    </div>

                    <!-- 虫眼鏡（詳細表示）ボタン -->
                    <button onclick="window.openCardDetail('${card?.id}', event)" class="absolute top-1 right-1 bg-slate-950/80 border border-amber-400 text-amber-300 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] hover:scale-110 z-20 cursor-pointer">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                </div>
            `;
        } else {
            html += `
                <div class="w-full aspect-[3/4] bg-slate-950/40 border border-slate-800 rounded-lg flex items-center justify-center text-slate-700 text-[9px] font-bold min-h-0">
                    ${i + 1}
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

// 画面下部：カード一覧描画（JOKER別枠固定表示 ＆ 赤枠編成中対応）
function renderCollectionGrid() {
    const jokerContainer = document.getElementById('joker-collection-grid');
    const normalContainer = document.getElementById('normal-collection-grid');
    const countEl = document.getElementById('collection-count');
    
    if (!jokerContainer || !normalContainer) return;

    // 1. 現在のフィルター条件に合うカードを抽出（AND検索対応）
    let filtered = allCards.filter(c => {
        const cardTags = String(c.tags || c.tag || '').split(',').map(t => t.trim());
        if (selectedTagFilters.size > 0) {
            for (let requiredTag of selectedTagFilters) {
                if (!cardTags.includes(requiredTag)) return false;
            }
        }
        return true;
    });

    if (countEl) countEl.innerText = `${filtered.length}枚表示`;

    // 右メニュー内の適用中タグ表示を更新
    updateActiveTagFilterUI();

    // 2. JOKERカードと一般カードに分類
    const jokerCards = filtered.filter(c => String(c.rank).toUpperCase() === 'JOKER');
    const normalCards = filtered.filter(c => String(c.rank).toUpperCase() !== 'JOKER');

    // --- ① JOKER一覧の描画（選択中は「赤枠＋編成中バッジ」） ---
    jokerContainer.innerHTML = jokerCards.map(card => {
        const isJoker = String(currentEditingDeck.jokerId) === String(card.id);
        const img = (displayMode === 'real' ? card.imageReal : card.imageIllust) || `${card.id}_illust.jpg`;

        // JOKER専用の赤枠スタイルと赤背景の「編成中」バッジ
        let cardStyle = 'border-slate-800/80 brightness-50 opacity-60 grayscale-[30%] hover:brightness-90 hover:opacity-90';
        let badgeHtml = '';

        if (isJoker) {
            cardStyle = 'border-rose-500 brightness-100 opacity-100 shadow-[0_0_12px_rgba(244,63,94,0.7)] z-10';
            badgeHtml = `<span class="absolute top-1 left-1 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow z-20">編成中</span>`;
        }

        return `
            <div class="relative group">
                <div onclick="window.handleCardSelect('${card.id}')" class="w-full aspect-[3/4] bg-slate-950 border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${cardStyle}">
                    <img src="images/${img}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                </div>
                ${badgeHtml}

                <button onclick="window.openCardDetail('${card.id}', event)" class="absolute top-1 right-1 bg-slate-950/80 border border-slate-700 text-amber-300 w-5 h-5 rounded-full flex items-center justify-center text-[9px] hover:scale-110 z-20 cursor-pointer">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
            </div>
        `;
    }).join('');

    // --- ② 一般カード一覧の描画（選択中は「金枠＋編成中バッジ」） ---
    normalContainer.innerHTML = normalCards.map(card => {
        const isNormal = currentEditingDeck.cardIds.map(String).includes(String(card.id));
        const img = (displayMode === 'real' ? card.imageReal : card.imageIllust) || `${card.id}_illust.jpg`;

        let cardStyle = 'border-slate-800/80 brightness-50 opacity-60 grayscale-[30%] hover:brightness-90 hover:opacity-90';
        let badgeHtml = '';

        if (isNormal) {
            cardStyle = 'border-amber-500/80 brightness-100 opacity-100 shadow-[0_0_8px_rgba(245,158,11,0.3)] z-10';
            badgeHtml = `<span class="absolute top-1 left-1 bg-amber-500/90 text-slate-950 text-[8px] font-black px-1 py-0.5 rounded shadow z-20">編成中</span>`;
        }

        return `
            <div class="relative group">
                <div onclick="window.handleCardSelect('${card.id}')" class="w-full aspect-[3/4] bg-slate-950 border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${cardStyle}">
                    <img src="images/${img}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                </div>
                ${badgeHtml}

                <button onclick="window.openCardDetail('${card.id}', event)" class="absolute top-1 right-1 bg-slate-950/80 border border-slate-700 text-amber-300 w-5 h-5 rounded-full flex items-center justify-center text-[9px] hover:scale-110 z-20 cursor-pointer">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. カード追加 ＆ 削除ロジック
// ==========================================
window.handleCardSelect = function(cardId) {
    const card = allCards.find(c => String(c.id) === String(cardId));
    if (!card) return;

    const isJoker = String(card.rank).toUpperCase() === 'JOKER';

    if (isJoker) {
        // JOKERのセット/差し替え
        currentEditingDeck.jokerId = card.id;
    } else {
        // ノーマルカードの追加判定
        const idx = currentEditingDeck.cardIds.indexOf(card.id);
        if (idx >= 0) {
            // すでに存在していれば削除
            currentEditingDeck.cardIds.splice(idx, 1);
        } else {
            // 19枚上限チェック
            if (currentEditingDeck.cardIds.length >= 19) {
                alert("ノーマルカードは最大19枚までです！");
                return;
            }
            currentEditingDeck.cardIds.push(card.id);
        }
    }

    refreshEditorUI();
};

function removeJoker() {
    currentEditingDeck.jokerId = null;
    refreshEditorUI();
}

window.removeNormalCard = function(index) {
    currentEditingDeck.cardIds.splice(index, 1);
    refreshEditorUI();
};

// デッキ特性チェックモーダルの開閉とロジック（未編成非表示・あと1枚グレー表示版）
window.openTraitsCheckModal = function() {
    const container = document.getElementById('traits-list-container');
    if (!container) return;

    // 1. デッキに含まれるすべてのカードIDを取得
    const activeDeckCardIds = [];
    if (currentEditingDeck.jokerId) activeDeckCardIds.push(currentEditingDeck.jokerId);
    activeDeckCardIds.push(...currentEditingDeck.cardIds);

    // 2. タグの出現回数をカウント
    const tagCounts = {};
    activeDeckCardIds.forEach(id => {
        const card = allCards.find(c => String(c.id) === String(id));
        if (card) {
            const rawTags = String(card.tags || card.tag || '');
            const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
            tags.forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
        }
    });

// カテゴリー定義・日本語表示・カラー指定の対応
    const categories = [
        { key: 'GEN', label: '時代特性', icon: 'fa-landmark', colorClass: 'text-white border-white/30' },
        { key: 'ATK', label: '攻撃特性', icon: 'fa-burst', colorClass: 'text-rose-400 border-rose-500/40' },
        { key: 'DEF', label: '防御特性', icon: 'fa-shield-halved', colorClass: 'text-sky-400 border-sky-500/40' },
        { key: 'SUP', label: 'サポート特性', icon: 'fa-hands-holding-child', colorClass: 'text-amber-300 border-amber-500/40' },
        { key: 'DEB', label: 'デバフ特性', icon: 'fa-skull', colorClass: 'text-purple-400 border-purple-500/40' }
    ];

    let html = '';

 categories.forEach(cat => {
        // このカテゴリーに属するタグの中で、1枚以上デッキに含まれているものだけを抽出（0枚は除外）
        const activeTags = Object.keys(tagCounts).filter(tagName => {
            const tagMeta = tagsMap[tagName];
            return tagMeta && tagMeta.category === cat.key && tagCounts[tagName] > 0;
        });

        html += `
            <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                <div class="text-xs font-bold font-yuji border-b pb-1.5 mb-2 flex items-center gap-1.5 ${cat.colorClass}">
                    <i class="fa-solid ${cat.icon}"></i> ${cat.label}
                </div>
        `;

        if (activeTags.length === 0) {
            html += `<p class="text-[11px] text-slate-500 italic pl-2">該当する特性はありません</p>`;
        } else {
            html += `<div class="space-y-1.5">`;
            activeTags.forEach(tagName => {
                const count = tagCounts[tagName];
                const meta = tagsMap[tagName] || { rank: 'C' };
                const rank = meta.rank;

                // 判定ロジック
                const isExecutable = (rank === 'S' && count >= 1) || (rank !== 'S' && count >= 2);

                // スタイル分岐
                let containerClass = 'bg-slate-950/50 border-slate-800/80 opacity-60'; // あと1枚（グレー表示）
                let textClass = 'text-slate-400 font-normal';
                let badgeHtml = `<span class="text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">あと1枚！</span>`;

                if (isExecutable) {
                    containerClass = 'bg-slate-900 border-amber-500/70 shadow-[0_0_8px_rgba(245,158,11,0.2)] opacity-100';
                    textClass = 'text-amber-300 font-bold';
                    badgeHtml = `<span class="text-[10px] font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 px-1.5 py-0.5 rounded shadow animate-pulse">発動可能！</span>`;
                }

                html += `
                    <div class="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${containerClass} transition-all">
                        <div class="flex items-center gap-2">
                            <span class="${textClass}">${tagName}</span>
                            <span class="text-[10px] font-mono px-1 rounded ${rank === 'S' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}">
                                (${rank})
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-mono ${isExecutable ? 'text-slate-300' : 'text-slate-500'}">${count}枚編成中</span>
                            ${badgeHtml}
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        html += `</div>`;
    });

    container.innerHTML = html;
    document.getElementById('modal-traits-check')?.classList.remove('hidden');
};

// ==========================================
// 5. 詳細モーダル ＆ イベントハンドラ（レイアウト調整完成版）
// ==========================================
window.openCardDetail = function(cardId, event) {
    if (event) event.stopPropagation();
    const card = allCards.find(c => String(c.id) === String(cardId));
    if (!card) return;

    activeCardDetail = card;

    const modal = document.getElementById('modal-card-detail');
    const nameEl = document.getElementById('detail-card-name');
    const famousEl = document.getElementById('detail-card-famous');
    const jankenEl = document.getElementById('detail-card-janken');
    const pokerEl = document.getElementById('detail-card-poker');
    const imgEl = document.getElementById('detail-card-img');
    const tagsEl = document.getElementById('detail-card-tags');
    const retsudenEl = document.getElementById('detail-card-retsuden');

    // ① 名前（バッジは付けない）
    if (nameEl) nameEl.innerText = card.name || '英傑';

    // ② 有名度（名前と同じ大型サイズ）
    const rawPower = card.power !== undefined ? card.power : (card.famous !== undefined ? card.famous : 0);
    if (famousEl) famousEl.innerText = rawPower;

    // ③ じゃんけん（大型アイコンバッジ表示）
    const jankenMap = {
        gu: { emoji: '✊', label: 'グー', color: 'bg-rose-950 text-rose-300 border-rose-600' },
        cho: { emoji: '✌️', label: 'チョキ', color: 'bg-amber-950 text-amber-300 border-amber-600' },
        pa: { emoji: '✋', label: 'パー', color: 'bg-emerald-950 text-emerald-300 border-emerald-600' }
    };
    const jInfo = jankenMap[card.janken] || { emoji: '❓', label: '不明', color: 'bg-slate-900 text-slate-400 border-slate-700' };
    if (jankenEl) {
        jankenEl.innerHTML = `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${jInfo.color} font-bold text-xs sm:text-sm shadow-md">
                <span class="text-base sm:text-lg">${jInfo.emoji}</span>
                <span>${jInfo.label}</span>
            </div>
        `;
    }

    // ポーカー手 / 手札ランク（大型アイコンバッジ表示）
    if (pokerEl) {
        const r = String(card.rank || '1').toUpperCase();
        const displayRank = (r === 'JOKER' || r === 'JK') ? 'JK' : r;
        pokerEl.innerHTML = `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-amber-950/80 border-amber-500/70 text-amber-300 font-mono font-black text-xs sm:text-sm shadow-md">
                <span class="text-[10px] text-amber-400/80 font-sans">手札:</span>
                <span class="text-sm sm:text-base text-yellow-300">${displayRank}</span>
            </div>
        `;
    }

    // 画像セット
    if (imgEl) {
        imgEl.src = `images/${(displayMode === 'real' ? card.imageReal : card.imageIllust) || 'default.jpg'}`;
    }

// ④ 特性タグ（ソート機能追加：カテゴリ優先順 ➔ ランク順）
    if (tagsEl) {
        const rawTags = String(card.tags || card.tag || '');
        const tagList = rawTags.split(',').map(t => t.trim()).filter(Boolean);

        if (tagList.length === 0) {
            tagsEl.innerHTML = `<span class="text-xs text-slate-500 italic col-span-2">タグなし</span>`;
        } else {
            // カテゴリ優先度定義 (数値が小さいほど上位)
            const catOrder = { GEN: 1, ATK: 2, SUP: 3, DEF: 4, DEB: 5 };
            // ランク優先度定義 (数値が小さいほど上位)
            const rankOrder = { S: 1, A: 2, B: 3, C: 4, D: 5, E: 6 };

            // タグリストのソート実行
            tagList.sort((a, b) => {
                const metaA = tagsMap[a] || { category: 'GEN', rank: 'C' };
                const metaB = tagsMap[b] || { category: 'GEN', rank: 'C' };

                const orderCatA = catOrder[metaA.category] || 99;
                const orderCatB = catOrder[metaB.category] || 99;

                // 1. カテゴリ順で判定
                if (orderCatA !== orderCatB) {
                    return orderCatA - orderCatB;
                }

                // 2. 同一カテゴリ内なら ランク順で判定
                const orderRankA = rankOrder[String(metaA.rank).toUpperCase()] || 99;
                const orderRankB = rankOrder[String(metaB.rank).toUpperCase()] || 99;

                return orderRankA - orderRankB;
            });

            // カテゴリごとの配色マップ
            const catColors = {
                GEN: 'bg-slate-950/90 border-slate-700 text-slate-200',
                ATK: 'bg-rose-950/90 border-rose-600/80 text-rose-200',
                DEF: 'bg-sky-950/90 border-sky-600/80 text-sky-200',
                SUP: 'bg-amber-950/90 border-amber-600/80 text-amber-200',
                DEB: 'bg-purple-950/90 border-purple-600/80 text-purple-200'
            };

            // ソート済みの順序でHTMLを出力（grid-cols-2 により①② / ③④ / ⑤⑥ の順で自然配置）
            tagsEl.innerHTML = tagList.map(tagName => {
                const meta = tagsMap[tagName] || { category: 'GEN', rank: 'C' };
                const catKey = meta.category || 'GEN';
                const colorClass = catColors[catKey] || catColors.GEN;
                const rankText = meta.rank ? `(${meta.rank})` : '';

                return `
                    <div class="flex items-center justify-between text-xs sm:text-sm font-bold border px-2.5 py-1 rounded-lg ${colorClass} shadow-sm truncate">
                        <span class="truncate">${tagName} <span class="font-mono text-[11px] opacity-80">${rankText}</span></span>
                    </div>
                `;
            }).join('');
        }
    }

    // ⑤ 列伝テキスト
    if (retsudenEl) {
        retsudenEl.innerText = retsudenMap[card.id] || "（列伝テキスト準備中）";
    }

    modal?.classList.remove('hidden');
};

function setupEventListeners() {
    // 保存ボタン
    document.getElementById('btn-save-deck')?.addEventListener('click', saveCurrentDeckToStorage);

    // デッキ呼出モーダル
    document.getElementById('btn-open-load-modal')?.addEventListener('click', () => {
        renderDeckLoadModalList();
        document.getElementById('modal-deck-load')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-load-modal')?.addEventListener('click', () => {
        document.getElementById('modal-deck-load')?.classList.add('hidden');
    });

    // タイトルに戻るモーダル
    document.getElementById('btn-back-to-title')?.addEventListener('click', () => {
        document.getElementById('modal-confirm-back')?.classList.remove('hidden');
    });
    document.getElementById('btn-back-cancel')?.addEventListener('click', () => {
        document.getElementById('modal-confirm-back')?.classList.add('hidden');
    });
    document.getElementById('btn-back-confirm')?.addEventListener('click', () => {
    stopDeckBGM(); // ★ BGMを停止してからタイトルへ遷移
    window.location.href = 'title.html';
    });

    // 詳細モーダル閉じる
    document.getElementById('btn-close-detail-modal')?.addEventListener('click', () => {
        document.getElementById('modal-card-detail')?.classList.add('hidden');
    });

    // 詳細モーダル内画像切替
    document.getElementById('btn-detail-toggle-img')?.addEventListener('click', () => {
        displayMode = displayMode === 'illust' ? 'real' : 'illust';
        if (activeCardDetail) window.openCardDetail(activeCardDetail.id);
    });

    // ★ 絞り込みモーダル開閉＆実行ボタンイベント
    document.getElementById('btn-open-tag-modal')?.addEventListener('click', () => {
        renderTagFilterModal();
        document.getElementById('modal-tag-filter')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-tag-modal')?.addEventListener('click', () => {
        document.getElementById('modal-tag-filter')?.classList.add('hidden');
    });

    document.getElementById('btn-reset-modal-tags')?.addEventListener('click', () => {
        tempModalTagFilters.clear();
        renderTagFilterModal();
    });

    document.getElementById('btn-apply-tag-filter')?.addEventListener('click', () => {
        selectedTagFilters = new Set(tempModalTagFilters);
        document.getElementById('modal-tag-filter')?.classList.add('hidden');
        renderCollectionGrid();
    });

    document.getElementById('btn-clear-tag-filter')?.addEventListener('click', () => {
        selectedTagFilters.clear();
        renderCollectionGrid();
    });

    // 特性チェックボタン
    document.getElementById('btn-check-traits')?.addEventListener('click', window.openTraitsCheckModal);
    document.getElementById('btn-close-traits-modal')?.addEventListener('click', () => {
        document.getElementById('modal-traits-check')?.classList.add('hidden');
    });
}

// GENタグ選択肢の初期化
async function initGenFilter() {
    try {
        const res = await fetch('tags.csv');
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const tagIdx = headers.indexOf('tag');
        const catIdx = headers.indexOf('category');

        const select = document.getElementById('filter-gen');
        if (!select) return;

        select.innerHTML = '<option value="ALL">すべて</option>';
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols[catIdx] === 'GEN') {
                const opt = document.createElement('option');
                opt.value = cols[tagIdx];
                opt.textContent = cols[tagIdx];
                select.appendChild(opt);
            }
        }
    } catch (e) {}
}

// モーダル内の10個デッキ一覧生成（視認性UP版）
function renderDeckLoadModalList() {
    const container = document.getElementById('deck-list-container');
    if (!container) return;

    const saved = getSavedDecks();
    let html = '';

    for (let i = 1; i <= 10; i++) {
        const deck = saved[i] || { id: i, name: `デッキ${i}`, jokerId: null, cardIds: [] };
        const total = (deck.jokerId ? 1 : 0) + (deck.cardIds ? deck.cardIds.length : 0);
        const isCurrent = Number(currentEditingDeck.id) === Number(i);

        html += `
            <div onclick="window.selectDeckSlot(${i})" class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950 border ${isCurrent ? 'border-amber-400 bg-amber-950/20 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-slate-800 hover:border-amber-500/70'} cursor-pointer transition-all hover:scale-[1.01] group">
                <!-- 左側：スロット番号 ＋ デッキ名 -->
                <div class="flex items-center gap-3">
                    <span class="text-xs font-black font-mono text-amber-500/80 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                        #${i}
                    </span>
                    <span class="text-sm sm:text-base font-bold text-amber-300 font-mono tracking-wide group-hover:text-yellow-200 transition-colors">
                        ${deck.name}
                    </span>
                </div>

                <!-- 右側：枚数バッジ ＆ 選択表示 -->
                <div class="flex items-center gap-2">
                    <span class="text-xs sm:text-sm font-black font-mono bg-slate-900 border ${total === 20 ? 'border-amber-500 text-amber-400' : 'border-slate-700 text-slate-300'} px-2.5 py-1 rounded-lg">
                        ${total} / 20枚
                    </span>
                    ${isCurrent ? '<span class="text-[10px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded shadow">編集中</span>' : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

window.selectDeckSlot = function(slotId) {
    loadDeckFromStorage(slotId);
    document.getElementById('modal-deck-load')?.classList.add('hidden');
};

// ==========================================
// 右メニュー内の適用中タグ表示更新
// ==========================================
function updateActiveTagFilterUI() {
    const box = document.getElementById('active-tag-filter-box');
    const list = document.getElementById('active-tag-filter-list');
    const badge = document.getElementById('tag-filter-count-badge');

    if (!box || !list) return;

    if (selectedTagFilters.size === 0) {
        box.classList.add('hidden');
        if (badge) badge.classList.add('hidden');
        return;
    }

    box.classList.remove('hidden');
    if (badge) {
        badge.innerText = selectedTagFilters.size;
        badge.classList.remove('hidden');
    }

    const catColors = {
        GEN: 'bg-slate-900 border-slate-700 text-slate-200',
        ATK: 'bg-rose-950 border-rose-600 text-rose-300',
        DEF: 'bg-sky-950 border-sky-600 text-sky-300',
        SUP: 'bg-amber-950 border-amber-600 text-amber-300',
        DEB: 'bg-purple-950 border-purple-600 text-purple-300'
    };

    list.innerHTML = Array.from(selectedTagFilters).map(tagName => {
        const meta = tagsMap[tagName] || { category: 'GEN', rank: 'C' };
        const colorClass = catColors[meta.category] || catColors.GEN;
        const rankText = meta.rank ? `(${meta.rank})` : '';

        return `
            <div class="flex items-center justify-between gap-1 px-2 py-1 rounded-lg border ${colorClass} text-xs font-bold shadow-sm">
                <span class="truncate">${tagName} <span class="font-mono text-[10px] opacity-80">${rankText}</span></span>
                <button onclick="window.removeSingleTagFilter('${tagName}')" class="hover:text-rose-400 cursor-pointer ml-1">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `;
    }).join('');
}

window.removeSingleTagFilter = function(tagName) {
    selectedTagFilters.delete(tagName);
    renderCollectionGrid();
};

// ==========================================
// モーダル生成 (GEN ➔ ATK ➔ SUP ➔ DEF ➔ DEB 順 ＆ ランク順)
// ==========================================
function renderTagFilterModal() {
    const container = document.getElementById('modal-tag-grid-container');
    if (!container) return;

    tempModalTagFilters = new Set(selectedTagFilters);

    const categories = [
        { key: 'GEN', label: '時代特性', icon: 'fa-landmark', colorClass: 'text-white border-white/30 bg-slate-950/90' },
        { key: 'ATK', label: '攻撃特性', icon: 'fa-burst', colorClass: 'text-rose-400 border-rose-600/80 bg-rose-950/90' },
        { key: 'SUP', label: 'サポート特性', icon: 'fa-hands-holding-child', colorClass: 'text-amber-300 border-amber-600/80 bg-amber-950/90' },
        { key: 'DEF', label: '防御特性', icon: 'fa-shield-halved', colorClass: 'text-sky-400 border-sky-600/80 bg-sky-950/90' },
        { key: 'DEB', label: 'デバフ特性', icon: 'fa-skull', colorClass: 'text-purple-400 border-purple-600/80 bg-purple-950/90' }
    ];

    const rankOrder = { S: 1, A: 2, B: 3, C: 4, D: 5, E: 6 };

    let html = '';

    categories.forEach(cat => {
        const categoryTags = Object.keys(tagsMap).filter(tagName => {
            const meta = tagsMap[tagName];
            return meta && meta.category === cat.key;
        });

        categoryTags.sort((a, b) => {
            const rA = rankOrder[String(tagsMap[a]?.rank).toUpperCase()] || 99;
            const rB = rankOrder[String(tagsMap[b]?.rank).toUpperCase()] || 99;
            return rA - rB;
        });

        if (categoryTags.length > 0) {
            html += `
                <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div class="text-xs font-bold font-yuji border-b border-slate-800 pb-1.5 mb-2.5 flex items-center gap-1.5 ${cat.colorClass.split(' ')[0]}">
                        <i class="fa-solid ${cat.icon}"></i> ${cat.label}
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            `;

            categoryTags.forEach(tagName => {
                const meta = tagsMap[tagName] || { rank: 'C' };
                const rankText = meta.rank ? `(${meta.rank})` : '';
                const isChecked = tempModalTagFilters.has(tagName);

                html += `
                    <label class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cat.colorClass} cursor-pointer hover:scale-[1.02] transition-all text-xs font-bold select-none">
                        <input type="checkbox" value="${tagName}" ${isChecked ? 'checked' : ''} 
                               onchange="window.toggleTempModalTag('${tagName}', this.checked)"
                               class="w-4 h-4 accent-amber-500 rounded cursor-pointer">
                        <span class="truncate">${tagName} <span class="font-mono text-[10px] opacity-80">${rankText}</span></span>
                    </label>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

window.toggleTempModalTag = function(tagName, isChecked) {
    if (isChecked) {
        tempModalTagFilters.add(tagName);
    } else {
        tempModalTagFilters.delete(tagName);
    }
};

// 起動（DOMContentLoadedの遅延発火対策）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeckEditor);
} else {
    initDeckEditor();
}