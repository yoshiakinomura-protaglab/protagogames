/**
 * hero_ui.js - 主人公カスタマイズ & タグ解放・装着完全対応版
 */

function initHeroUI() {
    const container = document.getElementById('title-menu-container');
    if (!container || document.getElementById('btn-hero-custom')) return;

    const heroBtnHtml = `
        <button id="btn-hero-custom" class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-amber-950/60 border border-amber-300 hover:scale-105 active:scale-95 transition-all text-left flex items-center justify-between cursor-pointer">
            <span class="flex items-center gap-2.5">
                <i class="fa-solid fa-user-ninja text-lg"></i>
                <span>主人公カスタム</span>
            </span>
            <span id="hero-btn-famous-badge" class="text-[10px] bg-slate-950/20 px-2 py-0.5 rounded font-normal">有名度: --</span>
        </button>
    `;

    container.insertAdjacentHTML('beforeend', heroBtnHtml);
    document.getElementById('btn-hero-custom').addEventListener('click', openHeroModal);
    updateHeroBtnBadge();
}

function updateHeroBtnBadge() {
    const badge = document.getElementById('hero-btn-famous-badge');
    if (badge && typeof getHeroFamousLevel === 'function') {
        badge.textContent = `有名度: ${getHeroFamousLevel()}`;
    }
}

function openHeroModal() {
    if (document.getElementById('hero-modal')) return;

    const hero = getHeroData();
    const famous = getHeroFamousLevel();
    const totalCards = getTotalCardCount();
    if (!hero.equippedTags) hero.equippedTags = ['大和の縁', null, null];

    // 初期表示する全身画像の決定
    const bgImgPath = hero.gender === 'female' 
        ? 'images/protagonist_sf_all.png' 
        : 'images/protagonist_sm_all.png';

    const modalHtml = `
        <div id="hero-modal" class="fixed inset-0 bg-black flex items-center justify-center z-[80] select-none p-4 sm:p-8 overflow-hidden">
        
            <!-- 全体コンテナ（左：ウィンドウ / 右：キャラ全身画像） -->
            <div class="relative w-full max-w-5xl h-full max-h-[85vh] flex items-center justify-between gap-6">

                <!-- 1. 左側：フロント設定ウィンドウ -->
                <div class="bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-5 sm:p-6 max-w-lg w-full text-center shadow-2xl relative z-10 flex flex-col max-h-full overflow-y-auto flex-shrink-0">
                    
                    <button id="btn-hero-modal-close" class="absolute top-3 right-4 text-slate-400 hover:text-white text-xl cursor-pointer">✕</button>

                    <h3 class="text-lg sm:text-xl font-bold text-yellow-300 font-serif mb-4 border-b border-amber-500/30 pb-2 flex items-center justify-center gap-2">
                        <i class="fa-solid fa-user-ninja text-amber-400"></i> 主人公カスタマイズ
                    </h3>

                    <!-- ステータス概要 -->
                    <div class="bg-slate-950 p-3.5 rounded-xl border border-amber-500/30 mb-4 flex justify-around items-center">
                        <div>
                            <div class="text-[10px] text-amber-400/80 font-bold">収集数 → 有名度</div>
                            <div class="text-base sm:text-lg font-black text-amber-300 font-mono">${totalCards}枚 ➔ ${famous}</div>
                        </div>
                        <div class="h-8 w-px bg-slate-800"></div>
                        <div>
                            <div class="text-[10px] text-amber-400/80 font-bold">ポーカー役</div>
                            <div class="text-base sm:text-lg font-black text-amber-400 font-mono">JOKER (固定)</div>
                        </div>
                    </div>

                    <!-- 名前・性別・じゃんけん手 -->
                    <div class="space-y-4 text-left bg-slate-950/60 p-4 rounded-xl border border-slate-800 mb-4">
                        <div>
                            <label class="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                                <span class="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black">1</span>
                                <span>主人公の名前</span>
                            </label>
                            <!-- アイコン付き入力ボックスコンテナ -->
                        <div class="relative w-full">
                            <input id="input-hero-name" type="text" value="${hero.name || '主人公'}" placeholder="名前を入力（最大10文字）" maxlength="10"
                                   class="w-full bg-slate-900 border border-amber-500/60 focus:border-amber-300 rounded-xl pl-8 pr-8 py-2 text-sm font-bold text-yellow-300 outline-none text-center shadow-inner">
                            
                            <!-- 右側に配置する編集（ペン）アイコン -->
                            <i class="fa-solid fa-pen-to-square absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/80 text-xs pointer-events-none"></i>
                        </div>
                    </div>

                        <div>
                            <label class="text-xs font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
                                <span class="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black">2</span>
                                <span>性別（姿）</span>
                            </label>
                            <div class="flex gap-3">
                                <button id="btn-hero-gender-male" class="flex-1 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${hero.gender === 'male' ? 'bg-amber-600 border-amber-300 text-slate-950 font-black' : 'bg-slate-900 border-slate-700 text-slate-300'}">♂ 男性</button>
                                <button id="btn-hero-gender-female" class="flex-1 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${hero.gender === 'female' ? 'bg-amber-600 border-amber-300 text-slate-950 font-black' : 'bg-slate-900 border-slate-700 text-slate-300'}">♀ 女性</button>
                            </div>
                        </div>

                        <div>
                            <label class="text-xs font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
                                <span class="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black">3</span>
                                <span>得意なじゃんけんの手</span>
                            </label>
                            <div class="flex gap-2">
                                <button id="btn-hero-janken-gu" class="flex-1 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${hero.janken === 'gu' ? 'bg-blue-600 border-blue-300 text-white font-black' : 'bg-slate-900 border-slate-700 text-slate-300'}">✊ グー</button>
                                <button id="btn-hero-janken-cho" class="flex-1 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${hero.janken === 'cho' ? 'bg-rose-600 border-rose-300 text-white font-black' : 'bg-slate-900 border-slate-700 text-slate-300'}">✌️ チョキ</button>
                                <button id="btn-hero-janken-pa" class="flex-1 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${hero.janken === 'pa' ? 'bg-emerald-600 border-emerald-300 text-white font-black' : 'bg-slate-900 border-slate-700 text-slate-300'}">✋ パー</button>
                            </div>
                        </div>
                    </div>

                    <!-- 装着中タグ枠 -->
                    <div class="text-left mb-4">
                        <label class="text-xs font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
                            <span class="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black">4</span>
                            <span>装着特性タグ (タップで切り替え)</span>
                        </label>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="bg-slate-950 border-2 border-amber-500 p-2 rounded-xl text-center">
                                <div class="text-[9px] text-amber-400 font-bold">【固定枠】</div>
                                <div class="text-xs font-black text-yellow-300 font-mono mt-0.5">大和の縁</div>
                            </div>

                            <div id="slot-tag-1" onclick="openTagSelectorModal(1)" class="bg-slate-950 border ${hero.equippedTags[1] ? 'border-amber-400' : 'border-slate-700'} p-2 rounded-xl text-center cursor-pointer hover:border-amber-300 transition-all">
                                <div class="text-[9px] text-slate-400 font-bold">【カスタム1】</div>
                                <div class="text-xs font-bold ${hero.equippedTags[1] ? 'text-amber-300' : 'text-slate-500'} mt-0.5 truncate">${hero.equippedTags[1] || '未装着'}</div>
                            </div>

                            <div id="slot-tag-2" onclick="openTagSelectorModal(2)" class="bg-slate-950 border ${hero.equippedTags[2] ? 'border-amber-400' : 'border-slate-700'} p-2 rounded-xl text-center cursor-pointer hover:border-amber-300 transition-all">
                                <div class="text-[9px] text-slate-400 font-bold">【カスタム2】</div>
                                <div class="text-xs font-bold ${hero.equippedTags[2] ? 'text-amber-300' : 'text-slate-500'} mt-0.5 truncate">${hero.equippedTags[2] || '未装着'}</div>
                            </div>
                        </div>
                    </div>

                    <button id="btn-hero-save-close" class="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-slate-950 font-black text-sm shadow-lg border border-amber-300 transition-all cursor-pointer">保存して閉じる</button>

                </div>

                <!-- 2. 右側：大きくドーンと表示されるキャラ全身画像（背景透過合成） -->
                <div class="flex-1 h-full flex items-center justify-center pointer-events-none relative overflow-hidden">
                    <img id="hero-modal-bg-img" src="${bgImgPath}" 
                         class="h-full max-h-[80vh] w-auto object-contain mix-blend-lighten filter drop-shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all duration-500" 
                         onerror="this.style.display='none';">
                </div>

            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-hero-modal-close').onclick = closeHeroModal;
    document.getElementById('btn-hero-save-close').onclick = () => {
        saveHeroNameFromInput();
        closeHeroModal();
    };

    document.getElementById('btn-hero-gender-male').onclick = () => {
        updateHeroModalBgImage('male');
        updateHeroProperty('gender', 'male');
    };
    document.getElementById('btn-hero-gender-female').onclick = () => {
        updateHeroModalBgImage('female');
        updateHeroProperty('gender', 'female');
    };

    document.getElementById('btn-hero-janken-gu').onclick = () => updateHeroProperty('janken', 'gu');
    document.getElementById('btn-hero-janken-cho').onclick = () => updateHeroProperty('janken', 'cho');
    document.getElementById('btn-hero-janken-pa').onclick = () => updateHeroProperty('janken', 'pa');
}

/**
 * タグ選択・動的解放モーダル（Step 4完全対応）
 */
function openTagSelectorModal(slotIndex) {
    saveHeroNameFromInput();
    if (document.getElementById('tag-selector-modal')) return;

    const hero = getHeroData();
    const rules = typeof tagUnlockRulesDb !== 'undefined' ? tagUnlockRulesDb : [];

    const rankOrder = { 'S': 1, 'A': 2, 'B': 3, 'C': 4, 'SPECIAL': 99 };
    const sortedRules = [...rules].sort((a, b) => (rankOrder[a.rank] || 5) - (rankOrder[b.rank] || 5));

    const tagListHtml = sortedRules.map(rule => {
        if (!rule.tag || rule.tag === '大和の縁') return '';

        const isAlreadyUnlocked = hero.unlockedTags && hero.unlockedTags.includes(rule.tag);
        const canUnlockNow = typeof canUnlockTag === 'function' ? canUnlockTag(rule.tag) : false;
        const isEquippedOther = hero.equippedTags.includes(rule.tag) && hero.equippedTags[slotIndex] !== rule.tag;
        const isCurrentSlot = hero.equippedTags[slotIndex] === rule.tag;

        if (!isAlreadyUnlocked && !canUnlockNow) {
            return `
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-left flex items-center justify-between opacity-50 select-none">
                    <div>
                        <div class="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                            <span>🔒 ${rule.tag}</span>
                            <span class="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">${rule.rank || 'C'}</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">${rule.description || '解放条件未達成'}</div>
                    </div>
                </div>
            `;
        }

        if (!isAlreadyUnlocked && canUnlockNow) {
            return `
                <div class="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/80 text-left flex items-center justify-between shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                    <div>
                        <div class="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <span>✨ ${rule.tag}</span>
                            <span class="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">${rule.rank || 'C'}</span>
                        </div>
                        <div class="text-[10px] text-amber-400/80 mt-0.5">条件クリア！タップで解放可能</div>
                    </div>
                    <button onclick="handleUnlockTagAction('${rule.tag}', ${slotIndex})" class="text-xs font-black px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-md">
                        解放する
                    </button>
                </div>
            `;
        }

        if (isEquippedOther) {
            return `
                <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-left flex items-center justify-between opacity-60">
                    <div>
                        <div class="text-xs font-bold text-slate-300">✅ ${rule.tag}</div>
                        <div class="text-[10px] text-amber-400/80 mt-0.5">他のスロットに装着中</div>
                    </div>
                </div>
            `;
        }

        return `
            <div onclick="equipTagToSlot(${slotIndex}, '${rule.tag}')" class="p-2.5 rounded-xl border transition-all cursor-pointer text-left flex items-center justify-between ${isCurrentSlot ? 'bg-amber-950/40 border-amber-400' : 'bg-slate-950 border-slate-700 hover:border-amber-400'}">
                <div>
                    <div class="text-xs font-bold text-yellow-300 flex items-center gap-1.5">
                        <span>✅ ${rule.tag}</span>
                        <span class="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">${rule.rank || 'C'}</span>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${rule.description || '装着可能'}</div>
                </div>
                <button class="text-xs font-black px-3 py-1 rounded-lg ${isCurrentSlot ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 text-white'}">
                    ${isCurrentSlot ? '装着中' : '選択'}
                </button>
            </div>
        `;
    }).join('');

    const modalHtml = `
        <div id="tag-selector-modal" class="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[90] select-none p-4">
            <div class="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-5 max-w-md w-full text-center shadow-2xl relative flex flex-col max-h-[80vh]">
                
                <h4 class="text-base font-black text-amber-300 font-yuji mb-3 border-b border-amber-500/30 pb-2">
                    【カスタム${slotIndex}】装着タグを選択
                </h4>

                <div class="space-y-2 overflow-y-auto my-2 pr-1 flex-1">
                    <div onclick="equipTagToSlot(${slotIndex}, null)" class="p-2.5 rounded-xl bg-slate-950 border border-rose-500/50 hover:border-rose-400 transition-all cursor-pointer text-center text-xs font-bold text-rose-400">
                        ✖ タグを外して空欄にする
                    </div>
                    ${tagListHtml}
                </div>

                <button onclick="document.getElementById('tag-selector-modal').remove()" class="w-full py-2.5 mt-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer">
                    閉じる
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function handleUnlockTagAction(tagName, slotIndex) {
    if (typeof tryUnlockTag === 'function') {
        tryUnlockTag(tagName);
    } else {
        const hero = getHeroData();
        if (!hero.unlockedTags.includes(tagName)) hero.unlockedTags.push(tagName);
        saveHeroData(hero);
    }
    document.getElementById('tag-selector-modal')?.remove();
    openTagSelectorModal(slotIndex);
}

function equipTagToSlot(slotIndex, tagName) {
    saveHeroNameFromInput();
    const hero = getHeroData();
    if (!hero.equippedTags) hero.equippedTags = ['大和の縁', null, null];

    hero.equippedTags[slotIndex] = tagName;
    saveHeroData(hero);

    document.getElementById('tag-selector-modal')?.remove();
    document.getElementById('hero-modal')?.remove();
    openHeroModal();
}

// ★ 入力欄の名前を保持して保存する関数
function saveHeroNameFromInput() {
    const input = document.getElementById('input-hero-name');
    if (input) {
        const hero = getHeroData();
        hero.name = input.value.trim() || '主人公';
        saveHeroData(hero);
    }
}

function updateHeroProperty(key, value) {
    saveHeroNameFromInput();
    const hero = getHeroData();
    hero[key] = value;
    saveHeroData(hero);

    document.getElementById('hero-modal')?.remove();
    openHeroModal();
}

function closeHeroModal() {
    saveHeroNameFromInput();
    document.getElementById('hero-modal')?.remove();
    updateHeroBtnBadge();
}

// モーダル背景の全身画像を更新するヘルパー関数
function updateHeroModalBgImage(gender) {
    const bgImg = document.getElementById('hero-modal-bg-img');
    if (bgImg) {
        bgImg.src = gender === 'female' 
            ? 'images/protagonist_sf_all.png' 
            : 'images/protagonist_sm_all.png';
    }
}

window.addEventListener('DOMContentLoaded', initHeroUI);