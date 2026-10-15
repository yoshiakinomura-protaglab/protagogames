/**
 * ui.js - 英傑陣形伝 UI描画（カード名normal化 ＆ 特性タグボックス高さ2倍拡大版）
 */

const CATEGORY_CONFIG = {
    ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
    SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
    DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
    DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
    GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
};

function parseTagInfo(tagData) {
    if (!tagData) return { ...CATEGORY_CONFIG.GEN, displayText: "タグ" };
    let rawName = "";
    let overrideRank = "";

    try {
        if (typeof tagData === "object" && tagData !== null) {
            rawName = String(tagData.name || tagData.label || "").trim();
            overrideRank = String(tagData.rank || "").trim();
        } else {
            const str = String(tagData).trim();
            const match = str.match(/^(.+?)(?:[\(（]([A-Za-z0-9＋+]+)[\)）])?$/);
            if (match && match[1]) {
                rawName = match[1].trim();
                overrideRank = match[2] || "";
            } else {
                rawName = str;
            }
        }
    } catch (e) {
        rawName = String(tagData);
    }

    const tagMaster = (typeof window !== 'undefined' && window.gameState && window.gameState.tagMaster) ? window.gameState.tagMaster : {};
    const master = tagMaster[rawName] || { category: "GEN", rank: overrideRank || "" };
    
    const category = master.category || "GEN";
    const rank = overrideRank || master.rank || "";
    const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.GEN;
    const rankText = rank ? `(${rank})` : "";

    return {
        ...config,
        displayText: `${rawName}${rankText}`
    };
}

export function createCardHTML(card, options = {}) {
    if (!card) return '';
    const { isSelected = false, dataAction = 'select-card', displayMode = 'illust' } = options;

    const jankenMap = {
        gu: { label: '✊', color: 'text-rose-400 bg-rose-950/80 border-rose-600' },
        cho: { label: '✌️', color: 'text-amber-400 bg-amber-950/80 border-amber-600' },
        pa: { label: '✋', color: 'text-emerald-400 bg-emerald-950/80 border-emerald-600' }
    };
    const jInfo = jankenMap[card.janken] || { label: '❓', color: 'text-slate-400 bg-slate-900 border-slate-700' };

    let rankDisplay = card.rank || '1';
    if (card.rank === 'JOKER' || card.rank === 'Joker') {
        rankDisplay = 'JK';
    }

    const rawPower = card.power !== undefined ? card.power : (card.famous !== undefined ? card.famous : 0);
    const powerVal = parseInt(rawPower, 10) || 0;
    const famousVal = card.power !== undefined ? card.power : (card.famous !== undefined ? card.famous : '-');

    let particlesHTML = '';
    if (powerVal >= 1000) {
        particlesHTML = `
            <div class="gold-particle w-4 h-4 -top-2 left-1" style="animation-delay: 0.1s;"></div>
            <div class="gold-particle w-2.5 h-2.5 top-2 -left-2" style="animation-delay: 0.7s;"></div>
            <div class="gold-particle w-3.5 h-3.5 -bottom-1 left-4" style="animation-delay: 1.2s;"></div>
            <div class="gold-particle w-2 h-2 top-0 right-1" style="animation-delay: 0.4s;"></div>
            <div class="gold-particle w-3 h-3 bottom-1 -right-1" style="animation-delay: 0.9s;"></div>
        `;
    } else if (powerVal >= 700) {
        particlesHTML = `
            <div class="gold-particle w-2.5 h-2.5 -top-1 left-0" style="animation-delay: 0.2s;"></div>
            <div class="gold-particle w-3 h-3 -bottom-1 left-3" style="animation-delay: 1.0s;"></div>
            <div class="gold-particle w-2 h-2 top-1 -right-1" style="animation-delay: 0.5s;"></div>
        `;
    } else if (powerVal >= 500) {
        particlesHTML = `
            <div class="gold-particle w-2 h-2 -top-1 left-1" style="animation-delay: 0.3s;"></div>
            <div class="gold-particle w-1.5 h-1.5 bottom-0 -right-1" style="animation-delay: 0.8s;"></div>
        `;
    } else {
        particlesHTML = '';
    }

    const fileName = (displayMode === 'real' ? card.imageReal : card.imageIllust) || `${card.id}_${displayMode}.jpg`;
    const imgSrc = `images/${fileName}`;

    let tagsHTML = '<span class="text-[11px] text-slate-500 italic col-span-2 text-center">タグなし</span>';
    if (Array.isArray(card.tags) && card.tags.length > 0) {
        tagsHTML = card.tags.map(tagData => {
            const parsed = parseTagInfo(tagData);
            return `
                <span class="text-[11px] sm:text-xs ${parsed.color} border px-1.5 py-1 rounded truncate font-mono font-bold flex items-center gap-1 shadow-md leading-tight h-6">
                    <i class="fa-solid ${parsed.icon} text-[9px] flex-shrink-0"></i>
                    <span class="truncate">${parsed.displayText}</span>
                </span>
            `;
        }).join('');
    }

    // ★ スマホ用：カード左上縦一列アイコン（最大8個：①じゃんけん ②ポーカー手 ③〜⑧特性）
    let statusIconsHTML = `
        <div class="w-4 h-4 rounded flex items-center justify-center text-[9px] font-black border ${jInfo.color} shadow-md flex-shrink-0">
            ${jInfo.label}
        </div>
        <div class="w-4 h-4 rounded flex items-center justify-center text-[8px] font-mono font-black border bg-amber-950/90 text-amber-300 border-amber-500/80 shadow-md flex-shrink-0">
            ${rankDisplay}
        </div>
    `;

    if (Array.isArray(card.tags) && card.tags.length > 0) {
        card.tags.slice(0, 6).forEach(tagData => {
            const parsed = parseTagInfo(tagData);
            statusIconsHTML += `
                <div class="w-4 h-4 rounded flex items-center justify-center text-[8px] border ${parsed.color} shadow-md flex-shrink-0">
                    <i class="fa-solid ${parsed.icon}"></i>
                </div>
            `;
        });
    }

    const selectedClasses = isSelected
        ? 'border-cyan-300 ring-4 ring-cyan-400/80 card-selected-style brightness-100 opacity-100'
        : 'border-slate-800/80 brightness-50 opacity-60 grayscale-[30%] hover:brightness-90 hover:opacity-90';

    return `
    <div class="card-container relative w-full bg-slate-900 border-2 ${selectedClasses} rounded-xl p-1.5 flex flex-col justify-between shadow-xl cursor-pointer overflow-hidden select-none" 
         data-action="${dataAction}" 
         data-id="${card.id}">
        
        <!-- ★ カード名ヘッダー -->
        <div class="flex items-center justify-between gap-1 bg-slate-950/90 border border-slate-800 p-1 rounded-lg mb-1 pointer-events-none flex-shrink-0">
            <h4 class="font-normal text-sm sm:text-base text-slate-100 font-yuji truncate flex-1 leading-tight tracking-wide">${card.name || '英傑'}</h4>
            <span class="text-xs px-1.5 py-0.5 rounded border ${jInfo.color} font-black shadow-inner flex-shrink-0">${jInfo.label}</span>
            <span class="font-bold text-xs bg-amber-950 border border-amber-500/70 px-1.5 py-0.5 rounded text-amber-300 font-mono shadow-md flex-shrink-0">${rankDisplay}</span>
        </div>

        <!-- ★ 武将画像コンテナ（この内部の右上に虫眼鏡ボタンを配置） -->
        <div class="relative w-full flex-1 aspect-[3/4] min-h-0 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner pointer-events-none my-0.5">
            <img src="${imgSrc}" alt="${card.name || 'カード'}" class="w-full h-full object-cover object-top" onerror="this.onerror=null; this.src='images/default.jpg';">
            
            <!-- ★ スマホ用 左上縦一列アイコン列（PCでは初期非表示） -->
            <div class="card-status-icon-column absolute top-1 left-1 hidden flex-col gap-0.5 z-20 pointer-events-none">
                ${statusIconsHTML}
            </div>

            <!-- 虫眼鏡（詳細表示）ボタン：画像の右上 ＆ クリック可能にセット -->
            <button onclick="window.openCardDetail('${card.id}', event)" class="absolute top-1 right-1 bg-slate-950/90 border border-amber-400 text-amber-300 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs hover:scale-110 z-30 cursor-pointer shadow-md pointer-events-auto">
                <i class="fa-solid fa-magnifying-glass"></i>
            </button>

            <!-- 有名度数値表示 -->
            <div class="absolute bottom-1 right-2 inline-block select-none pointer-events-none">
                <span class="relative inline-block font-black text-3xl sm:text-4xl font-sans tracking-wider block drop-shadow-[0_4px_4px_rgba(0,0,0,0.9)]"
                      style="-webkit-text-stroke: 2.5px #ffffff; -webkit-text-fill-color: #ffffff;">
                    ${famousVal}
                    <span class="absolute inset-0 gold-text" style="-webkit-text-stroke: 1px #ca8a04; pointer-events: none;">
                        ${famousVal}
                    </span>
                </span>
                ${particlesHTML}
            </div>
        </div>

        <!-- ★ 特性タグボックスの数と高さを約2倍（h-[104px]）へ拡張し隙間・ゆとりを確保 -->
        <div class="grid grid-cols-2 gap-1.5 w-full mt-1.5 p-1 bg-slate-950/60 rounded-lg border border-slate-800/80 pointer-events-none flex-shrink-0 h-[104px] content-start overflow-y-auto">
            ${tagsHTML}
        </div>
    </div>`;
}

export function renderCardList(containerElement, cards = [], options = {}) {
    if (!containerElement) return;
    const safeCards = Array.isArray(cards) ? cards : [];
    if (safeCards.length === 0) {
        containerElement.innerHTML = `<div class="col-span-full text-xs text-slate-500 italic p-4 text-center">カードがありません</div>`;
        return;
    }
    const { selectedCardIds = [], displayMode = 'illust', dataAction = 'select-card' } = options;
    const selectedStrings = (selectedCardIds || []).map(id => String(id));
    containerElement.innerHTML = safeCards.map(card => createCardHTML(card, { isSelected: selectedStrings.includes(String(card.id)), dataAction, displayMode })).join('');
}

export function renderBattleUI(container, state, options = {}) {
    if (typeof window !== 'undefined') {
        window.gameState = state;
    }
    renderCardList(container, state.hand || [], options);
}

export function renderDeckTab(container, cards) {
    renderCardList(container, cards || [], { dataAction: 'deck-card' });
}

export function showToast(message) {
    // ポップアップ完全廃止のため処理なし
}

// P2Pモジュールの安全な動的ロード
export async function loadP2PModules() {
    try {
        const netRes = await fetch('./p2p_network.js');
        const netText = await netRes.text();
        const netBlob = new Blob([netText], { type: 'application/javascript' });
        const netUrl = URL.createObjectURL(netBlob);
        const { P2PNetwork } = await import(netUrl);

        const mgrRes = await fetch('./p2p_manager.js');
        const mgrText = await mgrRes.text();
        const mgrBlob = new Blob([mgrText], { type: 'application/javascript' });
        const mgrUrl = URL.createObjectURL(mgrBlob);
        const { P2PManager } = await import(mgrUrl);

        return { P2PNetwork, P2PManager };
    } catch (e) {
        console.error("P2Pモジュールの読み込みに失敗しました:", e);
        return null;
    }
}