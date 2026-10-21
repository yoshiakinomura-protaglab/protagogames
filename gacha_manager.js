/**
 * gacha_manager.js - パーセント指定(2段階抽選) ＆ 動画演出 ＆ カードオープンUI管理
 */

let gachaCardsDb = [];
let gachaRulesDb = [];
let currentGachaResults = [];
let openedCardCount = 0;
let currentSelectedGachaType = 'single'; // 'single' または 'multi'
let currentGachaId = 'normal'; // 初期ガチャID

// ガチャ用オーラアニメーションCSSの動的注入
// ガチャ用オーラアニメーションCSSの動的注入
// ガチャ用オーラアニメーションCSSの動的注入
(function injectGachaStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* 輝く白銀のフレア (Power 500〜699) */
        @keyframes silverFlare {
            0%, 100% {
                box-shadow: 0 0 10px #e2e8f0, 0 0 20px rgba(226, 232, 240, 0.8), 0 0 35px rgba(255, 255, 255, 0.6), inset 0 0 10px #ffffff;
                border-color: #f8fafc;
            }
            50% {
                box-shadow: 0 0 15px #ffffff, 0 0 30px rgba(241, 245, 249, 1), 0 0 50px rgba(203, 213, 225, 0.9), inset 0 0 15px #ffffff;
                border-color: #ffffff;
            }
        }

        /* 黄金のフレア (Power 700〜999) */
        @keyframes goldFlare {
            0%, 100% {
                box-shadow: 0 0 12px #eab308, 0 0 25px rgba(234, 179, 8, 0.8), 0 0 45px rgba(250, 204, 21, 0.6), inset 0 0 12px #fef08a;
                border-color: #fde047;
            }
            50% {
                box-shadow: 0 0 18px #fef08a, 0 0 35px rgba(250, 204, 21, 1), 0 0 60px rgba(234, 179, 8, 0.9), inset 0 0 18px #ffffff;
                border-color: #ffffff;
            }
        }

        /* 激しく色彩が駆け巡る虹色フレア (Power 1000〜) */
        @keyframes rainbowFlare {
            0% {
                box-shadow: 0 0 15px #ef4444, 0 0 30px rgba(239, 68, 68, 0.8), 0 0 50px rgba(249, 115, 22, 0.6), inset 0 0 12px #fca5a5;
                border-color: #f87171;
            }
            25% {
                box-shadow: 0 0 15px #eab308, 0 0 30px rgba(234, 179, 8, 0.8), 0 0 50px rgba(34, 197, 94, 0.6), inset 0 0 12px #fef08a;
                border-color: #facc15;
            }
            50% {
                box-shadow: 0 0 15px #22c55e, 0 0 30px rgba(34, 197, 94, 0.8), 0 0 50px rgba(59, 130, 246, 0.6), inset 0 0 12px #86efac;
                border-color: #4ade80;
            }
            75% {
                box-shadow: 0 0 15px #3b82f6, 0 0 30px rgba(59, 130, 246, 0.8), 0 0 50px rgba(168, 85, 247, 0.6), inset 0 0 12px #93c5fd;
                border-color: #60a5fa;
            }
            100% {
                box-shadow: 0 0 15px #a855f7, 0 0 30px rgba(168, 85, 247, 0.8), 0 0 50px rgba(239, 68, 68, 0.6), inset 0 0 12px #f5d0fe;
                border-color: #c084fc;
            }
        }

        .aura-silver { animation: silverFlare 1.8s infinite ease-in-out; }
        .aura-gold { animation: goldFlare 1.8s infinite ease-in-out; }
        .aura-rainbow { animation: rainbowFlare 2s infinite linear; }
        .aura-none { border-color: #334155; box-shadow: none; }
    `;
    document.head.appendChild(style);
})();

/**
 * ★ BGM制御関数：動画再生前にすべてのBGMを停止
 */
function stopAllBGMForGacha() {
    const titleBgm = document.getElementById('bgm-title');
    if (titleBgm) titleBgm.pause();
    if (window.pvpPrepAudio) {
        try { window.pvpPrepAudio.pause(); } catch (e) {}
    }
}

/**
 * ★ BGM制御関数：めくり画面移行時にタイトルBGMを再開
 */
function resumeTitleBGMForGacha() {
    const titleBgm = document.getElementById('bgm-title');
    if (titleBgm) {
        titleBgm.play().catch(err => console.warn("タイトルBGM再開ブロック:", err));
    }
}

/**
 * 1. データ読み込み（cards.csv ＆ gacha_rates.csv）
 */
async function loadGachaAllData() {
    // 1-1. cards.csv ロード
    if (gachaCardsDb.length === 0) {
        try {
            const response = await fetch('./csvLoader.js');
            const jsText = await response.text();
            const blob = new Blob([jsText], { type: 'application/javascript' });
            const module = await import(URL.createObjectURL(blob));
            const data = await module.loadGameDataFromCSV();
            if (data && data.cardsDb) {
                gachaCardsDb = data.cardsDb.filter(card => {
                    if (!card || !card.id) return false;
                    const idNum = parseInt(String(card.id).replace(/^c/i, ''), 10);
                    
                    // 90000番台以上（NPC専用）および 85000〜85999（初期配布キャラ）をガチャ排出一覧から除外
                    const isNpcCard = idNum >= 90000;
                    const isInitialDistCard = idNum >= 85000 && idNum < 86000;

                    return isNaN(idNum) || (!isNpcCard && !isInitialDistCard);
                });
            }
        } catch (e) {
            console.error("cards.csv ロードエラー:", e);
        }
    }

    // 1-2. gacha_rates.csv ロード (コメント行 '#' をスキップ)
    if (gachaRulesDb.length === 0) {
        try {
            const res = await fetch('gacha_rates.csv');
            const text = await res.text();
            const lines = text.trim().split('\n');
            
            // コメント行を除外した有効なデータ行を取得
            const validLines = lines.filter(line => line.trim() && !line.trim().startsWith('#'));

            if (validLines.length > 1) {
                const headers = validLines[0].split(',').map(h => h.trim());
                gachaRulesDb = [];
                for (let i = 1; i < validLines.length; i++) {
                    const line = validLines[i].trim();
                    if (!line) continue;
                    const cols = line.match(/(?:[^\s",]+|"[^"]*")+/g) || line.split(',');
                    const row = {};
                    headers.forEach((h, idx) => {
                        row[h] = cols[idx] ? cols[idx].replace(/^"|"$/g, '').trim() : '';
                    });
                    gachaRulesDb.push(row);
                }
            }
        } catch (e) {
            console.warn("gacha_rates.csv 未検出。デフォルト設定で動作します。", e);
        }
    }
}

/**
 * 2. 2段階パーセント指定 抽選エンジン
 */
function drawCardByPercentRules(gachaId = 'normal') {
    if (!gachaCardsDb || gachaCardsDb.length === 0) return null;

    // 対象の gachaId に対応するルールを取得
    let rules = gachaRulesDb.filter(r => r.gacha_id === gachaId);

    // ルールが未設定の場合はデフォルト (Power帯 3% / 17% / 80%)
    if (rules.length === 0) {
        rules = [
            { rule_type: 'POWER_RANGE', target_value: '1000-9999', rate_percent: '3' },
            { rule_type: 'POWER_RANGE', target_value: '500-999', rate_percent: '17' },
            { rule_type: 'POWER_RANGE', target_value: '1-499', rate_percent: '80' }
        ];
    }

    // 各ルールグループごとに該当するカード群を分類
    const matchedGroups = [];
    const usedCardIds = new Set(); // 判定済みカードIDの記録

    rules.forEach(rule => {
        const rType = rule.rule_type;
        const target = rule.target_value;
        const percent = parseFloat(rule.rate_percent) || 0;
        let pool = [];

        if (rType === 'NAME') {
            pool = gachaCardsDb.filter(c => c.name === target);

        } else if (rType === 'CARD_ID') {
            pool = gachaCardsDb.filter(c => String(c.id).toLowerCase() === String(target).toLowerCase());

        } else if (rType === 'TAG' || rType === 'GEN') {
            const targetTags = target.split(',').map(t => t.trim());
            pool = gachaCardsDb.filter(card => {
                const rawTags = card.tags || card.tag || '';
                const cardTagArr = Array.isArray(rawTags) ? rawTags : String(rawTags).split(',').map(t => t.trim());
                return targetTags.some(tt => cardTagArr.includes(tt));
            });

        } else if (rType === 'POWER_RANGE') {
            const [minP, maxP] = target.split('-').map(v => parseInt(v.trim(), 10) || 0);
            pool = gachaCardsDb.filter(card => {
                const power = parseInt(card.power || 0, 10);
                return power >= minP && power <= maxP;
            });

        } else if (rType === 'OTHERS') {
            // OTHERS は他のルールで引っかかっていない残りのカード群
            pool = gachaCardsDb.filter(card => !usedCardIds.has(card.id));
        }

        // 使用済みIDの登録
        pool.forEach(c => usedCardIds.add(c.id));

        if (pool.length > 0 && percent > 0) {
            matchedGroups.push({ percent, pool });
        }
    });

    // 【1段階目】 パーセント抽選（グループの選択）
    const totalPercent = matchedGroups.reduce((sum, g) => sum + g.percent, 0);
    let rand = Math.random() * (totalPercent > 0 ? totalPercent : 100);

    let selectedPool = gachaCardsDb; // 初期値
    for (const group of matchedGroups) {
        if (rand < group.percent) {
            selectedPool = group.pool;
            break;
        }
        rand -= group.percent;
    }

    // 【2段階目】 選ばれたグループ内のカードから均等ランダム抽出
    const finalIndex = Math.floor(Math.random() * selectedPool.length);
    return selectedPool[finalIndex] || gachaCardsDb[0];
}

/**
 * 3. ガチャモーダルの表示
 */
function openGachaSelectModal() {
    loadGachaAllData();
    let modal = document.getElementById('gacha-master-modal');
    if (!modal) {
        createGachaModalHTML();
        modal = document.getElementById('gacha-master-modal');
    }
    showGachaStep('step-select-gacha');
    modal.classList.remove('hidden');
}

function showGachaStep(stepId) {
    const steps = ['step-select-gacha', 'step-select-type', 'step-confirm', 'step-video', 'step-result'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(stepId)?.classList.remove('hidden');
}

/**
 * 4. モーダルHTML生成
 */
function createGachaModalHTML() {
    const html = `
    <div id="gacha-master-modal" class="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[80000] hidden select-none">
        <!-- STEP 1: ガチャ選択画面 -->
        <div id="step-select-gacha" class="bg-slate-900 border-2 border-amber-500 rounded-2xl p-6 max-w-md w-11/12 text-center shadow-2xl space-y-4">
            <h3 class="text-xl font-black text-amber-300 font-yuji border-b border-amber-500/30 pb-3">
                <i class="fa-solid fa-gem text-amber-400"></i> ガチャ選択
            </h3>
            <div class="space-y-3">
                <button onclick="startSelectTypeFor('normal')" class="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-slate-950 font-black text-base border border-amber-300 shadow-lg cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-cards"></i> ノーマルガチャ
                </button>
                <button disabled class="w-full py-4 rounded-xl bg-slate-950/60 text-slate-500 font-bold text-base border border-slate-800 opacity-50 cursor-not-allowed flex items-center justify-center gap-2">
                    <i class="fa-solid fa-crown"></i> 厳選ガチャ（準備中）
                </button>
            </div>
            <button onclick="closeGachaModal()" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all">
                戻る
            </button>
        </div>

        <!-- STEP 2: 単発 / 十連 選択画面 -->
        <div id="step-select-type" class="bg-slate-900 border-2 border-amber-500 rounded-2xl p-6 max-w-md w-11/12 text-center shadow-2xl space-y-4 hidden">
            <h3 class="text-xl font-black text-amber-300 font-yuji border-b border-amber-500/30 pb-3">
                方式選択
            </h3>
            <div class="grid grid-cols-2 gap-3">
                <button onclick="selectGachaType('single')" class="py-6 rounded-xl bg-slate-950 border-2 border-amber-500/50 hover:border-amber-400 text-amber-300 font-black text-base shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-1">
                    <span class="text-xs text-amber-400/80">1枚引く</span>
                    <span>単発ガチャ</span>
                </button>
                <button onclick="selectGachaType('multi')" class="py-6 rounded-xl bg-gradient-to-br from-amber-950 to-slate-950 border-2 border-amber-400 text-yellow-300 font-black text-base shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-1">
                    <span class="text-xs text-yellow-400">10枚連続</span>
                    <span>十連ガチャ</span>
                </button>
            </div>
            <button onclick="showGachaStep('step-select-gacha')" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all">
                戻る
            </button>
        </div>

        <!-- STEP 3: 確認画面 -->
        <div id="step-confirm" class="bg-slate-900 border-2 border-amber-500 rounded-2xl p-6 max-w-md w-11/12 text-center shadow-2xl space-y-4 hidden">
            <h3 class="text-lg font-black text-amber-300 font-yuji">確認</h3>
            <p id="gacha-confirm-text" class="text-sm text-slate-200 font-bold">
                「ノーマルガチャ (十連)」を引きます。よろしいですか？
            </p>
            <div class="flex items-center gap-3 pt-2">
                <button onclick="startGachaExecution()" class="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 font-black text-sm border border-amber-300 shadow-lg cursor-pointer transition-all active:scale-95">
                    はい
                </button>
                <button onclick="showGachaStep('step-select-type')" class="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer transition-all active:scale-95">
                    いいえ
                </button>
            </div>
        </div>

        <!-- STEP 4: 映像再生画面 -->
        <div id="step-video" class="fixed inset-0 z-[90000] bg-black hidden flex items-center justify-center">
            <video id="gacha-video-player" class="w-full h-full object-contain" playsinline preload="auto"></video>
            <div id="gacha-flash-overlay" class="absolute inset-0 bg-white opacity-0 pointer-events-none transition-opacity duration-500"></div>
        </div>

        <!-- STEP 5: カードオープン ＆ 結果画面 -->
        <div id="step-result" class="fixed inset-0 z-[85000] bg-slate-950/95 flex flex-col p-4 sm:p-8 hidden">
            <div id="gacha-tap-notice" class="text-center py-2 text-yellow-300 font-black text-sm sm:text-base font-yuji animate-pulse">
                ✨ カードをタップ！ ✨
            </div>

            <div class="flex-1 flex flex-col sm:flex-row items-center justify-between gap-4 overflow-hidden my-2">
                <div id="gacha-left-cards-container" class="w-full sm:w-1/2 h-full flex items-center justify-center p-2 overflow-y-auto">
                </div>

                <!-- ★ 右側：カード詳細表示エリア（大判画像 ＋ ステータス ＋ 6枠タグ） -->
                <div id="gacha-right-detail-container" class="w-full sm:w-1/2 h-full bg-slate-900/90 border-2 border-amber-500/50 rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden">
                    
                    <div id="gacha-detail-placeholder" class="m-auto text-slate-500 font-bold text-sm">
                        左側のカードを選択してください
                    </div>
                    
                    <div id="gacha-detail-content" class="w-full h-full flex flex-col justify-between hidden">
                        
                        <!-- 上部メイン：【左：大判カード画像】 ＋ 【右：基本ステータス】 -->
                        <div class="flex flex-row items-center gap-5 sm:gap-6 flex-1 min-h-0">
                            
                            <!-- 1. 左：どーんと大きく表示するカード画像（右エリアの大半を占有） -->
                            <div class="w-1/2 max-w-[280px] aspect-[3/4] rounded-2xl border-2 border-amber-400 overflow-hidden shadow-[0_0_25px_rgba(245,158,11,0.35)] bg-slate-950 flex-shrink-0">
                                <img id="gacha-detail-img" src="" class="w-full h-full object-cover object-top">
                            </div>

                            <!-- 2. 右：カード基本ステータス（フォント超特大化） -->
                            <div class="flex-1 flex flex-col justify-center space-y-4 text-left">
                                <div class="border-b-2 border-amber-500/40 pb-3">
                                    <h2 id="gacha-detail-name" class="text-3xl sm:text-4xl font-black text-yellow-300 font-yuji tracking-wider drop-shadow-md">---</h2>
                                </div>

                                <!-- 有名度 (Power) -->
                                <div class="bg-slate-950/90 p-3.5 rounded-2xl border-2 border-amber-500/30 shadow-inner">
                                    <div class="text-xs text-amber-400/90 font-black tracking-wider uppercase mb-1">有名度 (Power)</div>
                                    <div id="gacha-detail-power" class="text-3xl sm:text-4xl font-black text-amber-300 font-mono tracking-tight drop-shadow">0</div>
                                </div>

                                <!-- じゃんけん手 ＆ ポーカー手 -->
                                <div class="grid grid-cols-2 gap-3">
                                    <div class="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 text-center shadow-md">
                                        <div class="text-xs text-slate-400 font-bold mb-1">じゃんけん</div>
                                        <div id="gacha-detail-janken" class="text-lg sm:text-xl font-black text-amber-300">---</div>
                                    </div>
                                    <div class="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 text-center shadow-md">
                                        <div class="text-xs text-slate-400 font-bold mb-1">ポーカー手</div>
                                        <div id="gacha-detail-num" class="text-xl sm:text-2xl font-black text-amber-300 font-mono">---</div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 3. 画像の下部：特性タグ用枠（最大6個固定枠） -->
                        <div class="mt-4 pt-3 border-t border-amber-500/30 text-left">
                            <div class="text-xs font-bold text-amber-400/90 mb-2 flex items-center gap-1.5">
                                <i class="fa-solid fa-tags text-amber-400"></i>
                                <span>所持特性タグ（最大6枠）</span>
                            </div>
                            
                            <!-- 3列×2行で最大6個固定で並ぶタグコンテナ -->
                            <div id="gacha-detail-tags" class="grid grid-cols-3 gap-2">
                                <!-- JSで最大6枠生成 -->
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <div id="gacha-footer-area" class="h-12 flex items-center justify-center">
                <button id="btn-gacha-finish" onclick="closeGachaModal()" class="px-8 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 font-black text-sm border border-amber-300 shadow-xl cursor-pointer transition-all hover:scale-105 active:scale-95 hidden">
                    タイトルに戻る
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function closeGachaModal() {
    document.getElementById('gacha-master-modal')?.classList.add('hidden');
}

function startSelectTypeFor(gachaId) {
    currentGachaId = gachaId;
    showGachaStep('step-select-type');
}

function selectGachaType(type) {
    currentSelectedGachaType = type;
    const textEl = document.getElementById('gacha-confirm-text');
    if (textEl) {
        textEl.innerText = `「ノーマルガチャ (${type === 'multi' ? '十連' : '単発'})」を引きます。よろしいですか？`;
    }
    showGachaStep('step-confirm');
}

/**
 * 5. ガチャ実行 ＆ 動画演出 ＆ 2段階パーセント抽選
 */
async function startGachaExecution() {
    await loadGachaAllData();
    if (!gachaCardsDb || gachaCardsDb.length === 0) {
        alert("カードデータの読み込みに失敗しました。");
        return;
    }

    // ① パーセントルールに基づいてカードを抽選
    const count = currentSelectedGachaType === 'multi' ? 10 : 1;
    currentGachaResults = [];
    for (let i = 0; i < count; i++) {
        const drawn = drawCardByPercentRules(currentGachaId);
        if (drawn) currentGachaResults.push(drawn);
    }

    // ② 所持コレクションへ保存
    currentGachaResults.forEach(card => {
        if (card && card.id) {
            if (typeof addCardToCollection === 'function') {
                addCardToCollection(card.id, 1);
            } else {
                const rawCol = localStorage.getItem('yamato_user_collection');
                const col = rawCol ? JSON.parse(rawCol) : {};
                col[card.id] = (col[card.id] || 0) + 1;
                localStorage.setItem('yamato_user_collection', JSON.stringify(col));
            }
        }
    });

    // ③ 演出動画の決定
    const maxPower = Math.max(...currentGachaResults.map(c => parseInt(c.power || 0, 10)));
    let videoFile = 'video/gacha_normal.mp4';
    if (maxPower >= 1000) {
        videoFile = 'video/gacha_rare_multi.mp4';
    } else if (maxPower >= 500) {
        videoFile = 'video/gacha_rare_single.mp4';
    }

    // BGM停止
    stopAllBGMForGacha();

    // ④ 動画再生
    showGachaStep('step-video');
    const videoEl = document.getElementById('gacha-video-player');
    const flashEl = document.getElementById('gacha-flash-overlay');

    if (videoEl) {
        videoEl.src = videoFile;
        videoEl.currentTime = 0;

        videoEl.onended = () => {
            if (flashEl) {
                flashEl.style.opacity = '1';
                setTimeout(() => {
                    setupGachaResultScreen();
                    showGachaStep('step-result');
                    resumeTitleBGMForGacha();
                    flashEl.style.opacity = '0';
                }, 500);
            } else {
                setupGachaResultScreen();
                showGachaStep('step-result');
                resumeTitleBGMForGacha();
            }
        };

        videoEl.play().catch(err => {
            console.warn("動画自動再生ブロック:", err);
            setupGachaResultScreen();
            showGachaStep('step-result');
            resumeTitleBGMForGacha();
        });
    }
}

/**
 * 6. めくり画面構築
 */
function setupGachaResultScreen() {
    openedCardCount = 0;
    const leftContainer = document.getElementById('gacha-left-cards-container');
    const rightPlaceholder = document.getElementById('gacha-detail-placeholder');
    const rightContent = document.getElementById('gacha-detail-content');
    const finishBtn = document.getElementById('btn-gacha-finish');

    if (!leftContainer) return;
    rightPlaceholder?.classList.remove('hidden');
    rightContent?.classList.add('hidden');
    finishBtn?.classList.add('hidden');

    const isMulti = currentSelectedGachaType === 'multi';

    if (isMulti) {
        leftContainer.className = "w-full sm:w-1/2 h-full grid grid-cols-5 gap-2 p-2 items-center justify-center";
    } else {
        leftContainer.className = "w-full sm:w-1/2 h-full flex items-center justify-center p-2";
    }

    leftContainer.innerHTML = currentGachaResults.map((card, idx) => {
        const power = parseInt(card.power || 0, 10);
        let auraClass = 'aura-none';
        if (power >= 1000) {
            auraClass = 'aura-rainbow';
        } else if (power >= 700) {
            auraClass = 'aura-gold';
        } else if (power >= 500) {
            auraClass = 'aura-silver';
        }

        const cardWidthClass = isMulti ? 'w-full aspect-[3/4]' : 'w-36 sm:w-44 aspect-[3/4]';

        return `
            <div id="gacha-card-${idx}" onclick="openGachaCard(${idx})" 
                 class="${cardWidthClass} relative cursor-pointer perspective-1000 transition-all hover:scale-105 active:scale-95">
                <div id="gacha-card-inner-${idx}" class="w-full h-full relative preserve-3d transition-transform duration-500">
                    <div class="absolute inset-0 w-full h-full rounded-xl border-2 bg-slate-950 backface-hidden ${auraClass}">
                        <img src="images/card_back.jpg" class="w-full h-full object-cover rounded-xl" onerror="this.onerror=null; this.src='images/default.jpg';">
                    </div>
                    <!-- 表面 (めくり後) ★ 表面側にも ${auraClass} を付与 ＆ overflow-hiddenを外してフレアを外へあふれ出させる -->
                    <div class="absolute inset-0 w-full h-full rounded-xl border-2 bg-slate-900 backface-hidden rotate-y-180 ${auraClass}">
                        <img src="images/${getCardImageFileName(card)}" class="w-full h-full object-cover object-top rounded-xl" onerror="this.onerror=null; this.src='images/default.jpg';">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getCardImageFileName(card) {
    if (!card) return 'default.jpg';
    const fileName = card.imageIllust || card.image_illust || card.imageReal || card.image_real;
    if (!fileName || fileName.trim() === '' || fileName === 'NO IMAGE') {
        return 'default.jpg';
    }
    return fileName.trim();
}

function openGachaCard(idx) {
    const card = currentGachaResults[idx];
    if (!card) return;

    const innerEl = document.getElementById(`gacha-card-inner-${idx}`);
    if (innerEl && !innerEl.classList.contains('opened')) {
        innerEl.style.transform = 'rotateY(180deg)';
        innerEl.classList.add('opened');
        openedCardCount++;

        if (openedCardCount >= currentGachaResults.length) {
            document.getElementById('gacha-tap-notice')?.classList.add('hidden');
            document.getElementById('btn-gacha-finish')?.classList.remove('hidden');
        }
    }

    showGachaCardDetail(card);
}

function showGachaCardDetail(card) {
    const rightPlaceholder = document.getElementById('gacha-detail-placeholder');
    const rightContent = document.getElementById('gacha-detail-content');

    rightPlaceholder?.classList.add('hidden');
    rightContent?.classList.remove('hidden');

    const imgEl = document.getElementById('gacha-detail-img');
    const rankEl = document.getElementById('gacha-detail-rank');
    const nameEl = document.getElementById('gacha-detail-name');
    const jankenEl = document.getElementById('gacha-detail-janken');
    const numEl = document.getElementById('gacha-detail-num');
    const powerEl = document.getElementById('gacha-detail-power');
    const tagsEl = document.getElementById('gacha-detail-tags');

    if (imgEl) imgEl.src = `images/${getCardImageFileName(card)}`;
    if (rankEl) rankEl.innerText = `RANK: ${card.rank || '-'}`;
    if (nameEl) nameEl.innerText = card.name || '---';

    const jankenMap = { gu: '✊', cho: '✌️', pa: '✋' };
    if (jankenEl) jankenEl.innerText = jankenMap[card.janken] || card.janken || '---';
    // ★ ポーカー手（cards.csv の rank 列を参照）
    if (numEl) numEl.innerText = card.rank || '---';

    if (powerEl) powerEl.innerText = card.power || card.famous || '0';

    // ★ 特性タグ（特大・派手グラデーション装飾付き最大6枠）
    if (tagsEl) {
        const rawTags = card.tags || card.tag || '';
        const tagArr = Array.isArray(rawTags) 
            ? rawTags 
            : String(rawTags).split(',').map(t => t.trim()).filter(Boolean);

        let tagHtml = '';
        for (let i = 0; i < 6; i++) {
            const tag = tagArr[i];
            if (tag) {
                tagHtml += `
                    <div class="bg-gradient-to-r from-amber-950/80 via-slate-950 to-amber-950/80 border-2 border-amber-500/60 py-2.5 px-3 rounded-2xl text-center text-sm sm:text-base font-black text-amber-200 shadow-lg shadow-amber-950/50 truncate flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-tag text-xs text-amber-400"></i>
                        <span>${tag}</span>
                    </div>`;
            } else {
                // 空き枠
                tagHtml += `
                    <div class="bg-slate-950/40 border border-slate-800/50 py-2.5 px-3 rounded-2xl text-center text-sm font-bold text-slate-700 truncate">
                        ---
                    </div>`;
            }
        }
        tagsEl.innerHTML = tagHtml;
    }
}

// グローバル公開
window.openGachaSelectModal = openGachaSelectModal;
window.closeGachaModal = closeGachaModal;
window.startSelectTypeFor = startSelectTypeFor;
window.selectGachaType = selectGachaType;
window.startGachaExecution = startGachaExecution;
window.openGachaCard = openGachaCard;
window.showGachaStep = showGachaStep;