// ポータブル環境用：MIMEタイプ制限を回避して依存関係付きモジュールを安全に動的ロードする関数
async function loadGameModules() {
    try {
        const fetchAndBlob = async (path) => {
            const res = await fetch(path);
            let text = await res.text();
            // モジュール内部の import { ... } from './xxx.js' を Blob 読み込み可能に置換
            text = text.replace(/from\s+['"]\.\/csvLoader\.js['"]/g, `from '${csvBlobUrl}'`);
            const blob = new Blob([text], { type: 'application/javascript' });
            return URL.createObjectURL(blob);
        };

        // 1. 依存元となる csvLoader.js を先に Blob 化
        const csvRes = await fetch('./csvLoader.js');
        const csvText = await csvRes.text();
        const csvBlob = new Blob([csvText], { type: 'application/javascript' });
        const csvBlobUrl = URL.createObjectURL(csvBlob);

        // 2. csvBlobUrl を使用して ui.js と cpuAi.js を Blob 化
        const [uiUrl, cpuAiUrl] = await Promise.all([
            fetchAndBlob('./ui.js'),
            fetchAndBlob('./cpuAi.js')
        ]);

        // 3. モジュールインポート実行
        const [csvModule, uiModule, cpuAiModule] = await Promise.all([
            import(csvBlobUrl),
            import(uiUrl),
            import(cpuAiUrl)
        ]);

        return {
            loadGameDataFromCSV: csvModule.loadGameDataFromCSV,
            renderBattleUI: uiModule.renderBattleUI,
            renderDeckTab: uiModule.renderDeckTab,
            showToast: uiModule.showToast,
            selectCpuBattleCards: cpuAiModule.selectCpuBattleCards
        };
    } catch (err) {
        console.error("モジュールのロードに失敗しました:", err);
        return null;
    }
}

let gameModules = null;
const INITIAL_HP = 10000;
const STORAGE_KEY_PLAYER_DECK = 'rekishi_card_game_player_deck_v1';

// ★ BGM管理用
let bgmAudio = null;

// gameState に bgmMaster を保持
const gameState = {
    allCards: [],
    playerDeckIds: [],
    deck: [],
    hand: [],
    selectedCardIds: [],
    cpuJoker: null,
    cpuDeck: [],
    cpuHand: [],
    displayMode: 'illust',
    tagMaster: {},
    cpuDecks: [],
    jokerResults: [],
    bgmMaster: [], // ★ 追加
    turn: 1,
    maxTurn: 5,
    playerHp: INITIAL_HP,
    cpuHp: INITIAL_HP,
    lastBattleResult: null,
    turnHistory: [] // ★ ここを追加！
};

// ★ CSV連動版：BGM再生関数
function playSceneBGM(bgmId, isLoop = true) {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
    }

    // CSVデータから bgm_id を検索
    const bgmItem = gameState.bgmMaster.find(b => (b.bgm_id || b.bgmId) === String(bgmId));
    const fileName = bgmItem ? (bgmItem.bgm_file || bgmItem.bgmFile) : '';

    // CSVになかった場合のフォールバック（yayoi_bgm.mp3）
    const bgmPath = fileName ? `audio/${fileName}` : 'audio/yayoi_bgm.mp3';

    bgmAudio = new Audio(bgmPath);
    bgmAudio.loop = isLoop;
    bgmAudio.volume = 0.3; // 音量 (30%)

    bgmAudio.play().catch(err => {
        console.log("BGM自動再生待ち:", err);
    });
}

function stopEraBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
    }
}

const CATEGORY_CONFIG = {
    ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
    SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
    DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
    DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
    GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function initGame() {
    gameModules = await loadGameModules();
    if (!gameModules) return;

    const loadedData = await gameModules.loadGameDataFromCSV();

    if (loadedData && loadedData.cardsDb && loadedData.cardsDb.length > 0) {
        gameState.allCards = loadedData.cardsDb;
        gameState.tagMaster = loadedData.tagMaster || {};
        gameState.cpuDecks = loadedData.cpuDecks || [];
        gameState.jokerResults = loadedData.jokerResults || [];
        gameState.bgmMaster = loadedData.bgmMaster || []; // ★ 追加
        
        // 1. タイトル画面で選択した対戦設定を localStorage から取得
        const savedConfig = localStorage.getItem('selectedBattleConfig');
        let targetDeckId = 'd01';
        let opponentName = '卑弥呼';

        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                if (config.deckId) targetDeckId = config.deckId;
                if (config.opponentName) opponentName = config.opponentName;

                // ★ 追加：タイトル画面で選択した「編集済みプレイヤーデッキ」の読み込み
                if (config.playerDeck) {
                    const pDeck = config.playerDeck;
                    const loadedPlayerIds = [];

                    // JOKERを先頭（1枚目）に追加
                    if (pDeck.jokerId) {
                        loadedPlayerIds.push(String(pDeck.jokerId));
                    }

                    // ノーマルカード19枚を追加
                    if (pDeck.cardIds && Array.isArray(pDeck.cardIds)) {
                        pDeck.cardIds.forEach(id => loadedPlayerIds.push(String(id)));
                    }

                    // 20枚揃っていれば gameState に反映
                    if (loadedPlayerIds.length === 20) {
                        gameState.playerDeckIds = loadedPlayerIds;
                        console.log(`自作デッキ「${pDeck.name}」を正常にバトルへ反映しました！`);
                    }
                }
            } catch (e) {
                console.error("対戦設定の取得エラー:", e);
            }
        }

        // 自作デッキの設定がない場合（直接index.htmlを開いた場合など）のフォールバック
        if (!gameState.playerDeckIds || gameState.playerDeckIds.length !== 20) {
            const himikoDeckMaster = gameState.cpuDecks.find(d => (d.deckId || d.deck_id) === 'd01') || gameState.cpuDecks[0];
            if (himikoDeckMaster) {
                const leaderId = himikoDeckMaster.leaderId || himikoDeckMaster.leader_id;
                const cardIds = himikoDeckMaster.cardIds || himikoDeckMaster.card_ids;
                const allHimikoIds = [leaderId, ...cardIds];
                gameState.playerDeckIds = allHimikoIds.slice(0, 20).map(id => String(id));
            } else {
                gameState.playerDeckIds = gameState.allCards.slice(0, 20).map(c => String(c.id));
            }
        }

        try {
            localStorage.setItem(STORAGE_KEY_PLAYER_DECK, JSON.stringify(gameState.playerDeckIds));
        } catch (e) {}

        resetGameVariables();

        // 2. 選択された targetDeckId（d01, d02, d03, d04 等）でCPUデッキをセットアップ
        setupCpuDeck(targetDeckId);
        
        // 3. CSV（bgm.csv）からデッキIDに応じた対戦BGMを検索して再生
        playSceneBGM(targetDeckId, true);

        setupEventListeners();
        refreshAllUI();

    } else {
        console.error("CSVデータの読み込みに失敗しました");
    }
}

function resetGameVariables() {
    const playerFullDeck = [];
    gameState.playerDeckIds.forEach(id => {
        const card = gameState.allCards.find(c => String(c.id) === String(id));
        if (card) playerFullDeck.push({ ...card });
    });

    const shuffledPlayerDeck = [...playerFullDeck].sort(() => Math.random() - 0.5);

    gameState.deck = shuffledPlayerDeck;
    gameState.hand = gameState.deck.slice(0, 5);
    gameState.deck = gameState.deck.slice(5);
    gameState.selectedCardIds = [];
    gameState.turn = 1;
    gameState.playerHp = INITIAL_HP;
    gameState.cpuHp = INITIAL_HP;
    gameState.turnHistory = [];
}

function setupCpuDeck(targetDeckId) {
    const cpuDeckMaster = gameState.cpuDecks.find(d => d.deckId === targetDeckId) || gameState.cpuDecks[0];
    
    if (cpuDeckMaster) {
        gameState.cpuJoker = gameState.allCards.find(c => String(c.id) === String(cpuDeckMaster.leaderId)) || gameState.allCards[0];

        const allDeckIds = [cpuDeckMaster.leaderId, ...cpuDeckMaster.cardIds];
        const fullCpuCards = [];
        allDeckIds.forEach(id => {
            const card = gameState.allCards.find(c => String(c.id) === String(id));
            if (card) fullCpuCards.push({ ...card });
        });

        const shuffled = [...fullCpuCards].sort(() => Math.random() - 0.5);

        gameState.cpuHand = shuffled.slice(0, 5);
        gameState.cpuDeck = shuffled.slice(5);
    }
}

function setupEventListeners() {
    const toggleImgBtn = document.getElementById('btn-toggle-img-mode') || document.getElementById('img-mode-toggle');
    if (toggleImgBtn) {
        toggleImgBtn.onclick = () => {
            gameState.displayMode = gameState.displayMode === 'illust' ? 'real' : 'illust';
            refreshAllUI();
        };
    }

    const battleStartBtn = document.getElementById('btn-battle-start');
    if (battleStartBtn) {
        battleStartBtn.onclick = () => {
            if (gameState.selectedCardIds.length === 3) {
                showBattleConfirmModal();
            }
        };
    }

    const confirmBtn = document.getElementById('btn-modal-confirm');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            hideBattleConfirmModal();
            handleBattleStart();
        };
    }

    const cancelBtn = document.getElementById('btn-modal-cancel');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            hideBattleConfirmModal();
            gameState.selectedCardIds.pop();
            refreshAllUI();
        };
    }

    const nextTurnBtn = document.getElementById('btn-next-turn');
    if (nextTurnBtn) {
        nextTurnBtn.onclick = proceedToNextTurn;
    }

    const restartBtn = document.getElementById('btn-result-restart');
    if (restartBtn) {
        restartBtn.onclick = () => {
            hideGameResultModal();

            // 選択されていた敵デッキIDを localStorage から取得
            const savedConfig = localStorage.getItem('selectedBattleConfig');
            let targetDeckId = 'd01';
            if (savedConfig) {
                try {
                    const config = JSON.parse(savedConfig);
                    if (config.deckId) targetDeckId = config.deckId;
                } catch(e) {}
            }

            resetGameVariables();
            setupCpuDeck(targetDeckId); // ★ 選択していた敵デッキで再セットアップ
            playSceneBGM(targetDeckId, true); // ★ 選択していた対戦BGMを再生

            refreshAllUI();
            triggerTurnCutin(1);
        };
    }

    // ★ 追加1：タイトルに戻るボタンのイベントリスナー（BGMを停止してタイトル画面へ）
    const titleBtn = document.getElementById('btn-result-title');
    if (titleBtn) {
        titleBtn.onclick = () => {
            stopEraBGM(); // BGM停止
            window.location.href = 'title.html';
        };
    }

    // ★ BGM再生ブロック解除用オーバーレイ（タップ時の確実な開戦処理）
    const audioOverlay = document.getElementById('battle-start-audio-overlay');
    if (audioOverlay) {
        audioOverlay.onclick = () => {
            // 1. オーバーレイを消去
            audioOverlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                try { audioOverlay.remove(); } catch(e) {}
            }, 500);

            // 2. CSV連動BGM再生の発火
            try {
                const savedConfig = localStorage.getItem('selectedBattleConfig');
                let targetDeckId = 'd01';
                if (savedConfig) {
                    const config = JSON.parse(savedConfig);
                    if (config.deckId) targetDeckId = config.deckId;
                }
                playSceneBGM(targetDeckId, true);
            } catch(e) {
                console.error("BGM再生エラー:", e);
            }

            // 3. 「第１陣 開始！」カットイン演出の発火
            setTimeout(() => {
                triggerTurnCutin(1);
            }, 200);
        };
    }

    document.removeEventListener('click', handleCardClick);
    document.addEventListener('click', handleCardClick);

    const tabs = ['battle', 'deck', 'gacha', 'versus'];
    tabs.forEach(tabName => {
        const btn = document.getElementById(`tab-${tabName}-btn`);
        if (btn) btn.onclick = () => switchTab(tabName);
    });
}


function handleCardClick(e) {
    const cardElement = e.target.closest('#player-hand-container .card-container');
    if (cardElement) {
        const cardId = cardElement.getAttribute('data-id');
        if (cardId) {
            toggleCardSelection(String(cardId));
        }
    }
}

function toggleCardSelection(cardId) {
    const targetIdStr = String(cardId);
    const idx = gameState.selectedCardIds.indexOf(targetIdStr);

    if (idx >= 0) {
        gameState.selectedCardIds.splice(idx, 1);
    } else {
        if (gameState.selectedCardIds.length < 3) {
            gameState.selectedCardIds.push(targetIdStr);
        } else {
            return;
        }
    }

    // ★ 画像を壊さず、CSSクラス（見た目）だけを切り替える
    updateHandCardsSelectionUI();

    // ★ ボタンの文言と上部計算機だけを更新
    updateBattleStartButtonUI();
    updateCalculatorUI();
}

// ★ 手札カードの選択・未選択の見た目（CSSクラス）だけを高速に切り替える関数
function updateHandCardsSelectionUI() {
    const handContainer = document.getElementById('player-hand-container');
    if (!handContainer) return;

    // 手札エリアにある全てのカード要素を取得
    const cards = handContainer.querySelectorAll('.card-container');

    cards.forEach(cardEl => {
        const id = cardEl.getAttribute('data-id');
        const isSelected = gameState.selectedCardIds.includes(String(id));

        if (isSelected) {
            // 選択時：暗さを解除して、青く光らせるクラスをセット
            cardEl.classList.remove('border-slate-800/80', 'brightness-50', 'opacity-60', 'grayscale-[30%]');
            cardEl.classList.add('border-cyan-300', 'ring-4', 'ring-cyan-400/80', 'card-selected-style', 'brightness-100', 'opacity-100');
        } else {
            // 未選択時：青い光を外して、薄暗くするクラスをセット
            cardEl.classList.remove('border-cyan-300', 'ring-4', 'ring-cyan-400/80', 'card-selected-style', 'brightness-100', 'opacity-100');
            cardEl.classList.add('border-slate-800/80', 'brightness-50', 'opacity-60', 'grayscale-[30%]');
        }
    });
}

// ★ 戦闘開始ボタンの状態だけを更新する関数
function updateBattleStartButtonUI() {
    const battleStartBtn = document.getElementById('btn-battle-start');
    if (!battleStartBtn) return;
    const selectedCount = gameState.selectedCardIds.length;

    if (selectedCount === 3) {
        battleStartBtn.disabled = false;
        battleStartBtn.innerText = "⚔️ 戦闘開始！";
        battleStartBtn.className = "w-full py-2.5 sm:py-3 px-5 rounded-xl text-sm sm:text-base font-black bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-950/80 border border-amber-300 cursor-pointer";
    } else {
        battleStartBtn.disabled = true;
        battleStartBtn.innerText = `カード選択中 (${selectedCount}/3)`;
        battleStartBtn.className = "w-full py-2.5 sm:py-3 px-5 rounded-xl text-sm sm:text-base font-black bg-slate-900/90 text-slate-400 border border-slate-800 opacity-70 cursor-not-allowed";
    }
}

function showBattleConfirmModal() {
    const modal = document.getElementById('battle-confirm-modal');
    if (!modal) return;

    // 1. 選択カードデータの取得
    const selectedCards = gameState.selectedCardIds
        .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
        .filter(Boolean);

    if (selectedCards.length !== 3) return;

    // ① カード3枚のミニカード（画像 ＋ 強調名前）
    const cardsContainer = document.getElementById('modal-confirm-card-list');
    if (cardsContainer) {
        cardsContainer.innerHTML = selectedCards.map(c => {
            const imgName = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
            return `
                <div class="flex flex-col items-center">
                    <div class="w-full aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden border border-amber-400/80 mb-1.5 shadow-md">
                        <img src="images/${imgName}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                    </div>
                    <!-- Pwr表示を削除し、フォントサイズを拡大（text-sm sm:text-base） -->
                    <div class="text-sm sm:text-base font-nomal text-white-300 truncate w-full text-center leading-tight font-yuji">${c.name}</div>
                </div>
            `;
        }).join('');
    }

    // ② じゃんけん最終判定手 ＆ トランプ役
    const counts = { gu: 0, cho: 0, pa: 0 };
    selectedCards.forEach(c => { if (counts[c.janken] !== undefined) counts[c.janken]++; });

    let finalHandIcon = '❓';
    let finalHandLabel = 'なし';

    if (counts.gu === 3 || counts.gu === 2) {
        finalHandIcon = '✊';
    } else if (counts.cho === 3 || counts.cho === 2) {
        finalHandIcon = '✌️';
    } else if (counts.pa === 3 || counts.pa === 2) {
        finalHandIcon = '✋';
    } else if (counts.gu === 1 && counts.cho === 1 && counts.pa === 1) {
        finalHandIcon = '✨';
    }

    const pokerInfo = getPokerHandInfo(selectedCards);

    const jankenEl = document.getElementById('modal-confirm-janken');
    const pokerEl = document.getElementById('modal-confirm-poker');
    if (jankenEl) jankenEl.innerText = finalHandIcon;
    if (pokerEl) pokerEl.innerText = pokerInfo.name;

    // ③ 発動特性（計算機と同等の倍率算出 ＆ 最大6個表示）
    let baseMultSum = 1.0;
    let atkMultSum = 1.0;
    let defMultSum = 1.0;

    const tagCounts = {};
    selectedCards.forEach(c => {
        if (Array.isArray(c.tags)) {
            c.tags.forEach(t => {
                const rawName = (typeof t === 'object' ? (t.name || t.label) : String(t)).replace(/[\(（].*?[\)）]/, '').trim();
                if (rawName) tagCounts[rawName] = (tagCounts[rawName] || 0) + 1;
            });
        }
    });

    const activeEntries = Object.entries(tagCounts).filter(([tagName, cnt]) => {
        const cleanKey = String(tagName).trim();
        const master = gameState.tagMaster[cleanKey] || { minCards: 2 };
        return cnt >= master.minCards;
    });

    const tagsContainer = document.getElementById('modal-confirm-tags');
    if (tagsContainer) {
        const slotsHTML = [];
        activeEntries.forEach(([tagName, cnt]) => {
            const cleanKey = String(tagName).trim();
            const master = gameState.tagMaster[cleanKey] || { category: "GEN", rank: "C", mult1: 1.0, mult2: 1.2, mult3: 1.5 };
            const config = CATEGORY_CONFIG[master.category] || CATEGORY_CONFIG.GEN;

            let multiplier = 1.0;
            if (cnt === 1) multiplier = master.mult1;
            else if (cnt === 2) multiplier = master.mult2;
            else if (cnt >= 3) multiplier = master.mult3;

            if (master.category === 'GEN' || master.category === 'SUP') baseMultSum *= multiplier;
            else if (master.category === 'ATK') atkMultSum *= multiplier;
            else if (master.category === 'DEF') defMultSum *= multiplier;

            slotsHTML.push(`
                <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${config.color} text-xs sm:text-sm font-bold shadow-md min-h-[36px] leading-tight">
                    <span class="truncate flex items-center gap-1.5">
                        <i class="fa-solid ${config.icon} text-xs flex-shrink-0"></i>
                        <span class="truncate">${cleanKey}(${master.rank})</span>
                    </span>
                    <span class="text-yellow-300 font-mono font-black text-xs sm:text-sm flex-shrink-0">×${multiplier}</span>
                </div>
            `);
        });

        // 6枠埋まるまで空枠で固定（min-h-[36px] に統一）
        while (slotsHTML.length < 6) {
            slotsHTML.push(`<div class="rounded-lg border border-slate-800/40 bg-slate-950/20 min-h-[36px]"></div>`);
        }

        tagsContainer.innerHTML = slotsHTML.slice(0, 6).join('');
    }

    // ④ じゃんけん・デバフ除外 予測 ATK ｜ DEF
    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerMult = pokerInfo.multiplier;

    const totalAtk = Math.round(basePowerSum * baseMultSum * atkMultSum * pokerMult);
    const totalDef = Math.round(basePowerSum * baseMultSum * defMultSum * pokerMult);

    const atkEl = document.getElementById('modal-confirm-atk');
    const defEl = document.getElementById('modal-confirm-def');
    if (atkEl) atkEl.innerText = totalAtk.toLocaleString();
    if (defEl) defEl.innerText = totalDef.toLocaleString();

    // モーダル表示
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function hideBattleConfirmModal() {
    const modal = document.getElementById('battle-confirm-modal');
    if (modal) {
        modal.style.display = 'none'; // ★ インラインの display: flex を直接上書きして消去
        modal.classList.add('hidden');
    }
}

async function handleBattleStart() {
    if (gameState.selectedCardIds.length !== 3) return;

    const playerCards = gameState.selectedCardIds
        .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
        .filter(Boolean);

    // ★ gameModules 経由で呼び出し
    const cpuCards = gameModules.selectCpuBattleCards(gameState.cpuHand, gameState.tagMaster);
    const battleResult = calculateBattleResult(playerCards, cpuCards, gameState.tagMaster);
    
    gameState.lastBattleResult = { playerCards, cpuCards, battleResult };

    // 各ターンの結果を記憶
    gameState.turnHistory[gameState.turn - 1] = {
        turnNum: gameState.turn,
        playerCards: playerCards,
        cpuCards: cpuCards,
        battleResult: battleResult
    };

    // ★ この1行（runBattleAnimation の呼び出し）が必要です
    await runBattleAnimation(playerCards, cpuCards, battleResult);
}

async function runBattleAnimation(playerCards, cpuCards, battleResult) {
    // ★ ① 手札がリセットされる前に、計算機画面の数値（Ground Truth）を一番最初に退避・取得する！
    const calcAtkText = document.getElementById('calc-total-atk')?.innerText.replace(/,/g, '') || '0';
    const calcDefText = document.getElementById('calc-total-def')?.innerText.replace(/,/g, '') || '0';
    const calcAtkVal = parseInt(calcAtkText, 10);
    const calcDefVal = parseInt(calcDefText, 10);

    const whiteout = document.getElementById('battle-animation-overlay');

    if (whiteout) {
        whiteout.classList.remove('opacity-0', 'pointer-events-none');
        whiteout.classList.add('opacity-100', 'pointer-events-auto');
    }

    await sleep(300);
    gameState.selectedCardIds = [];
    refreshAllUI();
    await sleep(200);

    // ホワイトアウト解除
    if (whiteout) {
        whiteout.classList.remove('opacity-100', 'pointer-events-auto');
        whiteout.classList.add('opacity-0', 'pointer-events-none');
    }

    // -------------------------------------------------------------
    // ★ 2. 実際のバトル結果（battleResult）から演出用オブジェクトを動的に構築
    // -------------------------------------------------------------
    
    // 敵カード3枚の画像・名前抽出
    const formattedCpuCards = cpuCards.map(c => {
        const img = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
        return {
            name: c.name || '敵英傑',
            image: `images/${img}`
        };
    });

    // 実際に発動した敵の特性タグリストの抽出（①倍率が低い順 ➔ ②同倍率はカテゴリ順［GEN/SUP ➔ ATK ➔ DEF ➔ DEB］）
    const rawTagDetails = battleResult.cpu.tagDetails || [];

    // カテゴリごとの優先順位を定義（数値が小さいほど優先）
    const categoryPriority = {
        GEN: 1, // 時代・汎用
        SUP: 2, // サポート
        ATK: 3, // 攻撃
        DEF: 4, // 防御
        DEB: 5  // デバフ
    };

    // 2段階ソートの実行
    const sortedTagDetails = [...rawTagDetails].sort((a, b) => {
        const multA = a.mult || 1.0;
        const multB = b.mult || 1.0;

        // 1. まず倍率が異なる場合は、倍率が低い順（昇順）
        if (multA !== multB) {
            return multA - multB;
        }

        // 2. 倍率が同じだった場合は、指定のカテゴリ順で並べる
        const pA = categoryPriority[a.category] || 99;
        const pB = categoryPriority[b.category] || 99;
        return pA - pB;
    });

    // リアルタイムで倍率を掛け合わせながら formattedTags を構築
    let runningAtkMult = 1.0;
    let runningDefMult = 1.0;

    const formattedTags = sortedTagDetails.map((t) => {
        const tagName = t.name;
        const mult = t.mult || 1.0;
        const category = t.category || 'GEN';

        // カテゴリに応じて累積倍率を計算
        if (category === 'ATK') {
            runningAtkMult *= mult;
        } else if (category === 'DEF') {
            runningDefMult *= mult;
        } else if (category === 'GEN' || category === 'SUP') {
            runningAtkMult *= mult;
            runningDefMult *= mult;
        }

        // 場に出ている敵カード3枚の中から、このタグ(tagName)を持っているカードのインデックスを抽出
        const matchingIndexes = [];
        cpuCards.forEach((card, index) => {
            if (!card) return;
            let rawTags = card.tags || card.tag || [];
            let tagArray = [];
            if (Array.isArray(rawTags)) {
                tagArray = rawTags.map(item => typeof item === 'object' ? (item.name || item.label || '') : String(item));
            } else if (typeof rawTags === 'string') {
                tagArray = rawTags.split(',').map(s => s.trim());
            }

            const hasTag = tagArray.some(raw => {
                const clean = String(raw).replace(/[\(（].*?[\)）]/, '').trim();
                return clean === tagName.trim();
            });

            if (hasTag) {
                matchingIndexes.push(index);
            }
        });

        const targetIdxs = matchingIndexes.length > 0 ? matchingIndexes : [0, 1, 2];

        return {
            name: t.name,
            category: category,
            targetIndexes: targetIdxs,
            atkMult: runningAtkMult, // その時点での累積ATK倍率
            defMult: runningDefMult  // その時点での累積DEF倍率
        };
    });

    // ① 特性タグのみの最終積算倍率（ポーカー役・じゃんけん適用前）
    const tagTotalAtkMult = runningAtkMult;
    const tagTotalDefMult = runningDefMult;

    // ② 特性タグ総積算 ✕ ポーカー役倍率
    const cpuPokerInfo = battleResult.cpu.pokerInfo || { name: '役なし', multiplier: 1.0 };
    const pokerMult = cpuPokerInfo.multiplier || 1.0;

    const afterPokerAtkMult = tagTotalAtkMult * pokerMult;
    const afterPokerDefMult = tagTotalDefMult * pokerMult;

    // 敵軍ポーカー演出用オブジェクト
    const cpuPokerData = {
        name: cpuPokerInfo.name,
        multiplier: pokerMult,
        atkMult: afterPokerAtkMult,
        defMult: afterPokerDefMult
    };

    // ③ 特性タグ総積算 ✕ ポーカー役倍率 ✕ じゃんけん倍率
    const cpuJankenMult = battleResult.cpu.jankenMult || 1.0;
    const afterJankenAtkMult = afterPokerAtkMult * cpuJankenMult;
    const afterJankenDefMult = afterPokerDefMult * cpuJankenMult;

    // 実際のじゃんけん結果データ（引き分け時も必ず演出へ渡す！）
    const jankenData = {
        title: `✊ VS ✌️ じゃんけん結果：${battleResult.jankenResultText || '勝負'}`,
        sub: `自軍補正 ×${battleResult.player.jankenMult} / 敵軍補正 ×${battleResult.cpu.jankenMult}`,
        atkMult: afterJankenAtkMult,
        defMult: afterJankenDefMult
    };

    // 自軍・敵軍のデバフタグリストを抽出
    const playerDebuffList = (battleResult.player.tagDetails || []).filter(t => t.category === 'DEB');
    const enemyDebuffList = (battleResult.cpu.tagDetails || []).filter(t => t.category === 'DEB');

    // ④ 特性タグ総積算 ✕ ポーカー役倍率 ✕ じゃんけん倍率 ✕ 味方デバフ倍率
    const playerDebMultToCpu = battleResult.player.debMultToEnemy || 1.0;
    const afterDebuffAtkMult = afterJankenAtkMult * playerDebMultToCpu;
    const afterDebuffDefMult = afterJankenDefMult * playerDebMultToCpu;

// ★ 1. 演出再生前に決着判定を行う！
    const isGameOver = (
        gameState.playerHp - battleResult.cpu.damageGiven <= 0 ||
        gameState.cpuHp - battleResult.player.damageGiven <= 0 ||
        gameState.turn >= gameState.maxTurn
    );
    
    // 動的演出オブジェクトの組み立て
    const animData = {
        cpuCards: formattedCpuCards,
        enemyBaseAtk: battleResult.cpu.basePowerSum,
        enemyBaseDef: battleResult.cpu.basePowerSum,
        tags: formattedTags,
        poker: cpuPokerData, // ★ 追加：アニメ演出側へポーカー役データを渡す
        janken: jankenData,
        
        // デバフ詳細データ
        playerDebuffs: playerDebuffList.map(d => ({ name: d.name, mult: d.mult })),
        enemyDebuffs: enemyDebuffList.map(d => ({ name: d.name, mult: d.mult })),
        
        // 自軍数値
        playerBaseAtk: calcAtkVal,
        playerBaseDef: calcDefVal,
        // ★【追加】じゃんけん補正常算直後（デバフ適用前）の自軍中間ステータスを算出！
        playerAfterJankenAtk: Math.round(calcAtkVal * (battleResult.player.jankenMult || 1.0)),
        playerAfterJankenDef: Math.round(calcDefVal * (battleResult.player.jankenMult || 1.0)),
        // 最終確定数値（デバフ適用後）
        playerAtk: battleResult.player.finalAtk,
        playerDef: battleResult.player.finalDef,

        // 敵軍数値（デバフ適用後の最終倍率＆最終確定ステータス）
        enemyAfterDebuffAtkMult: afterDebuffAtkMult,
        enemyAfterDebuffDefMult: afterDebuffDefMult,
        enemyFinalAtk: battleResult.cpu.finalAtk,
        enemyFinalDef: battleResult.cpu.finalDef,
        isGameOver: isGameOver // ★【追加】演出側へ決着フラグを渡す！
    };

    // -------------------------------------------------------------
    // ★ 3. ド派手演出を再生！（黒渦が画面を覆うまで非同期で待機）
    // -------------------------------------------------------------
    let retryCount = 0;
    while (!window.battleAnim && retryCount < 10) {
        await sleep(100);
        retryCount++;
    }

    if (window.battleAnim) {
        await window.battleAnim.play(animData);
    } else {
        console.warn("window.battleAnim が見つからないため演出をスキップします");
    }

    // 古いリザルトの残像を事前消去
    const turnResultModal = document.getElementById('turn-result-modal');
    if (turnResultModal) turnResultModal.classList.add('hidden');

    if (isGameOver) {
        // --- 【決着ターン】：アニメ側で100%真っ白になった裏で1枚絵をセット ➔ 白幕を晴らす ---
        
        gameState.playerHp = Math.max(0, gameState.playerHp - battleResult.cpu.damageGiven);
        gameState.cpuHp = Math.max(0, gameState.cpuHp - battleResult.player.damageGiven);
        
        let resultType = 'win_normal';
        if (gameState.cpuHp <= 0) resultType = 'win_perfect';
        else if (gameState.playerHp <= 0) resultType = 'lose_perfect';
        else if (gameState.playerHp > gameState.cpuHp) resultType = 'win_normal';
        else resultType = 'lose_normal';

        playSceneBGM(resultType, true);

        // 1. 真っ白（透過率0%）の裏で1枚絵モーダルを安全にセットアップ
        showGameResultCutin(resultType);
        await sleep(200);

        // 2. 白幕（.whiteout-transition-overlay）をゆっくり晴らして1枚絵へ着地！
        const whiteOverlay = document.querySelector('.whiteout-transition-overlay');
        if (whiteOverlay) {
            whiteOverlay.style.opacity = '0';
            await sleep(500);
            whiteOverlay.remove();
        }

    } else {
        // --- 【通常ターン】：黒渦の中で手札・背景更新 ＆ リザルト用意 ➔ 黒渦が晴れる ---
        
        let sumiEl = document.querySelector('.sumi-arashi-overlay');
        if (!sumiEl) {
            sumiEl = document.createElement('div');
            sumiEl.className = 'sumi-arashi-overlay';
            document.body.appendChild(sumiEl);
            await sleep(400);
        }

        showTurnResultModal(playerCards, cpuCards, battleResult);

        await sleep(200);

        sumiEl.style.transition = 'opacity 0.4s ease-out';
        sumiEl.style.opacity = '0';
        await sleep(400);
        sumiEl.remove();
    }
}

function renderAnimCardSetHTML(cards, isOpen, isPlayer) {
    if (!cards || cards.length < 3) return '';

    const margins = isPlayer 
        ? ["ml-0", "ml-8 sm:ml-12", "ml-0"]
        : ["mr-0", "mr-8 sm:mr-12", "mr-0"];

    return cards.map((card, i) => {
        const offsetClass = margins[i] || "";

        if (!isOpen) {
            return `
                <div class="w-32 sm:w-44 aspect-[3/4] bg-slate-900 border-2 border-slate-700/80 rounded-xl p-2 text-center shadow-2xl flex flex-col items-center justify-center ${offsetClass}">
                    <i class="fa-solid fa-shield-cat text-3xl text-slate-600 mb-2"></i>
                    <div class="text-xs font-bold text-slate-500 tracking-widest">伏せカード</div>
                </div>
            `;
        }

        const imgName = gameState.displayMode === 'real'
            ? (card.imageReal || card.image_real || 'c00000_real.jpg')
            : (card.imageIllust || card.image_illust || 'c00000_illust.jpg');

        return `
            <div class="w-32 sm:w-44 aspect-[3/4] bg-slate-950 border-2 border-amber-500/90 rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(245,158,11,0.3)] flex flex-col justify-between ${offsetClass} transform hover:scale-105 transition-all">
                <div class="relative flex-1 w-full bg-slate-900 overflow-hidden">
                    <img src="images/${imgName}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                    <div class="absolute bottom-1 right-1 bg-slate-950/90 border border-amber-400 text-amber-300 font-mono text-xs sm:text-sm px-2 py-0.5 font-black rounded-md shadow-md">
                        ${card.power || 0}
                    </div>
                </div>
                <div class="p-1 sm:p-1.5 bg-slate-950 border-t border-slate-800 text-center">
                    <div class="text-xs sm:text-sm font-bold text-slate-100 truncate font-yuji">${card.name}</div>
                </div>
            </div>
        `;
    }).join('');
}

function showTurnResultModal(playerCards, cpuCards, battleResult, viewTurnIndex = null) {
    const modal = document.getElementById('turn-result-modal');
    if (!modal) return;
    modal.style.zIndex = '900000';

    // 表示するターン履歴のデータを切り替える（指定がなければ一番新しいターン）
    const targetTurnIdx = viewTurnIndex !== null ? viewTurnIndex : (gameState.turnHistory.length - 1);
    const historyData = gameState.turnHistory[targetTurnIdx];

    const currentPCards = historyData ? historyData.playerCards : playerCards;
    const currentCCards = historyData ? historyData.cpuCards : cpuCards;
    const currentResult = historyData ? historyData.battleResult : battleResult;

    // 安全に innerHTML / innerText をセットするヘルパー関数
    const setSafeHTML = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    // 1. 参戦者 (画像＋名前)
    const renderMiniCards = (cards) => cards.map(c => {
        const img = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
        return `
            <div class="flex flex-col items-center min-w-0">
                <div class="w-full aspect-[3/4] bg-slate-900 rounded overflow-hidden border border-slate-700">
                    <img src="images/${img}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                </div>
                <span class="text-[9px] font-normal text-slate-300 truncate w-full text-center mt-0.5 leading-tight">${c.name}</span>
            </div>
        `;
    }).join('');

    setSafeHTML('res-p-cards', renderMiniCards(currentPCards));
    setSafeHTML('res-c-cards', renderMiniCards(currentCCards));

    // 2. 有名度合計
    setSafeText('res-p-power', currentResult.player.basePowerSum.toLocaleString());
    setSafeText('res-c-power', currentResult.cpu.basePowerSum.toLocaleString());

    // 3. ポーカー役
    setSafeText('res-p-poker', `${currentResult.player.pokerInfo.name}`);
    setSafeText('res-c-poker', `${currentResult.cpu.pokerInfo.name}`);

    // 4. カテゴリ別 発動特性リスト描画
    const renderCategoryRows = (catKey) => {
        const pTags = currentResult.player.tagDetails ? currentResult.player.tagDetails.filter(t => t.category === catKey) : [];
        const cTags = currentResult.cpu.tagDetails ? currentResult.cpu.tagDetails.filter(t => t.category === catKey) : [];
        const maxLen = Math.max(pTags.length, cTags.length);

        if (maxLen === 0) {
            return `<div class="grid grid-cols-12 gap-2 text-[10px] text-slate-600 italic">
                <div class="col-span-5 text-center">なし</div>
                <div class="col-span-2 text-center text-slate-800">|</div>
                <div class="col-span-5 text-center">なし</div>
            </div>`;
        }

        let html = '';
        for (let i = 0; i < maxLen; i++) {
            const p = pTags[i] ? `${pTags[i].name} (x${pTags[i].mult})` : '-';
            const c = cTags[i] ? `${cTags[i].name} (x${cTags[i].mult})` : '-';
            html += `
                <div class="grid grid-cols-12 gap-2 text-[11px] items-center">
                    <div class="col-span-5 text-center truncate ${p !== '-' ? 'text-emerald-300 font-bold' : 'text-slate-600'}">${p}</div>
                    <div class="col-span-2 text-center text-slate-700">|</div>
                    <div class="col-span-5 text-center truncate ${c !== '-' ? 'text-rose-300 font-bold' : 'text-slate-600'}">${c}</div>
                </div>
            `;
        }
        return html;
    };

    setSafeHTML('res-list-gen', renderCategoryRows('GEN'));
    setSafeHTML('res-list-atk', renderCategoryRows('ATK'));
    setSafeHTML('res-list-def', renderCategoryRows('DEF'));
    setSafeHTML('res-list-sup', renderCategoryRows('SUP'));
    setSafeHTML('res-list-deb', renderCategoryRows('DEB'));

    // 5. 中間数値 (特性適用後)
    const midPAtk = Math.round(currentResult.player.basePowerSum * currentResult.player.genSupMult * currentResult.player.atkMult * currentResult.player.pokerMult);
    const midPDef = Math.round(currentResult.player.basePowerSum * currentResult.player.genSupMult * currentResult.player.defMult * currentResult.player.pokerMult);
    const midCAtk = Math.round(currentResult.cpu.basePowerSum * currentResult.cpu.genSupMult * currentResult.cpu.atkMult * currentResult.cpu.pokerMult);
    const midCDef = Math.round(currentResult.cpu.basePowerSum * currentResult.cpu.genSupMult * currentResult.cpu.defMult * currentResult.cpu.pokerMult);

    setSafeText('res-mid-p-atk', midPAtk.toLocaleString());
    setSafeText('res-mid-p-def', midPDef.toLocaleString());
    setSafeText('res-mid-c-atk', midCAtk.toLocaleString());
    setSafeText('res-mid-c-def', midCDef.toLocaleString());

    // 6. じゃんけん補正
    setSafeText('res-janken-text', currentResult.jankenResultText);
    setSafeText('res-p-janken-mult', `自軍補正: x${currentResult.player.jankenMult}`);
    setSafeText('res-c-janken-mult', `敵軍補正: x${currentResult.cpu.jankenMult}`);

    // 7. 最終数値 ＆ ダメージ
    setSafeText('res-final-p-atk', currentResult.player.finalAtk.toLocaleString());
    setSafeText('res-final-p-def', currentResult.player.finalDef.toLocaleString());
    setSafeText('res-final-c-atk', currentResult.cpu.finalAtk.toLocaleString());
    setSafeText('res-final-c-def', currentResult.cpu.finalDef.toLocaleString());

    setSafeText('res-damage-given-cpu', currentResult.player.damageGiven.toLocaleString());
    setSafeText('res-damage-given-player', currentResult.cpu.damageGiven.toLocaleString());

    // ★ 右側の第1陣〜最終決戦の切替ボタンを描画
    const tabContainer = document.getElementById('result-turn-tab-container');
    if (tabContainer) {
        const turnLabels = ["第１陣", "第２陣", "第３陣", "第４陣", "最終決戦"];
        let tabsHTML = '';

        for (let i = 0; i < 5; i++) {
            const hasData = i < gameState.turnHistory.length; // プレイ済みのターンか？
            const isSelected = i === targetTurnIdx;           // 今画面で見ているターンか？

            let btnStyle = "";
            if (isSelected) {
                btnStyle = "bg-amber-500 text-slate-950 font-black border-amber-300 shadow-md scale-105";
            } else if (hasData) {
                btnStyle = "bg-slate-900 text-amber-300 hover:bg-slate-800 border-slate-700 cursor-pointer";
            } else {
                btnStyle = "bg-slate-950/40 text-slate-600 border-slate-900 cursor-not-allowed opacity-40";
            }

            tabsHTML += `
                <button 
                    onclick="window.switchResultTurnTab(${i})" 
                    ${!hasData ? 'disabled' : ''} 
                    class="w-full py-2 px-1 rounded-xl border text-[10px] sm:text-xs font-yuji transition-all text-center ${btnStyle}">
                    ${turnLabels[i]}
                </button>
            `;
        }
        tabContainer.innerHTML = tabsHTML;
    }

    // ボタンの文字切替（最後か途中か）
    const nextBtn = document.getElementById('btn-next-turn');
    if (nextBtn) {
        const isGameOver = (
            gameState.playerHp <= 0 || 
            gameState.cpuHp <= 0 || 
            gameState.turn >= gameState.maxTurn
        );

        if (isGameOver) {
            nextBtn.innerText = '➔ 決着画面に戻る';
        } else {
            nextBtn.innerText = '次のターンへ進む ➔';
        }
    }

    modal.classList.remove('hidden');
}

// ★ 右側ボタンを押した時に過去の画面を呼び出す関数
window.switchResultTurnTab = function(turnIndex) {
    if (gameState.turnHistory[turnIndex]) {
        const data = gameState.turnHistory[turnIndex];
        showTurnResultModal(data.playerCards, data.cpuCards, data.battleResult, turnIndex);
    }
};

function proceedToNextTurn() {
    const modal = document.getElementById('turn-result-modal');
    
    // ★ 最終決戦（HP0または5ターン終了）でリザルトを見ていた場合 ➔ 一枚絵へ戻る
    const isGameOver = (
        gameState.playerHp <= 0 || 
        gameState.cpuHp <= 0 || 
        gameState.turn >= gameState.maxTurn
    );

    if (isGameOver) {
        // レシートを閉じるだけで、一枚絵＋3ボタン画面へ復帰
        if (modal) modal.classList.add('hidden');
        return;
    }

    // --- 通常ターンの処理 ---
    if (modal) modal.classList.add('hidden');

    if (!gameState.lastBattleResult) return;
    const { battleResult, playerCards, cpuCards } = gameState.lastBattleResult;

    gameState.playerHp = Math.max(0, gameState.playerHp - battleResult.cpu.damageGiven);
    gameState.cpuHp = Math.max(0, gameState.cpuHp - battleResult.player.damageGiven);

    const pUsedSet = new Set(playerCards.map(c => String(c.id || c.cardId)));
    gameState.hand = gameState.hand.filter(c => !pUsedSet.has(String(c.id || c.cardId)));

    const cUsedSet = new Set(cpuCards.map(c => String(c.id || c.cardId)));
    gameState.cpuHand = gameState.cpuHand.filter(c => !cUsedSet.has(String(c.id || c.cardId)));

    while (gameState.hand.length < 5 && gameState.deck.length > 0) gameState.hand.push(gameState.deck.shift());
    while (gameState.cpuHand.length < 5 && gameState.cpuDeck.length > 0) gameState.cpuHand.push(gameState.cpuDeck.shift());

    gameState.turn += 1;
    refreshAllUI();
    triggerTurnCutin(gameState.turn);
}

// ==========================================
// ★ 勝敗1枚絵カットイン表示関数 (ホワイトアウト＆ズーム演出完全版)
// ==========================================
function showGameResultCutin() {
    const modal = document.getElementById('game-result-cutin-modal');
    const cutinImg = document.getElementById('result-cutin-img');
    const toResultBtn = document.getElementById('btn-cutin-to-result');
    const restartBtn = document.getElementById('btn-cutin-restart');
    const titleBtn = document.getElementById('btn-cutin-title');

    if (!modal || !cutinImg) return;

    // 1. 自軍JOKERのID取得 ＆ 勝敗タイプの判定
    const playerJokerId = gameState.playerDeckIds[0] || 'c00000';
    let resultType = 'win_normal';
    if (gameState.cpuHp <= 0) resultType = 'win_perfect';
    else if (gameState.playerHp <= 0) resultType = 'lose_perfect';
    else if (gameState.playerHp > gameState.cpuHp) resultType = 'win_normal';
    else resultType = 'lose_normal';

    // 2. 画像のセット
    const jokerSetting = gameState.jokerResults.find(r => (r.joker_id || r.jokerId) === String(playerJokerId));
    let fileName = jokerSetting ? (jokerSetting[resultType] || '') : '';
    const imagePath = fileName ? `images/${fileName}` : `images/himiko_${resultType}.jpg`;
    
    cutinImg.src = imagePath;
    cutinImg.onerror = () => { cutinImg.src = 'images/default.jpg'; };

    // 一枚絵の表示（★ 白幕 z-index:999999 のすぐ裏 z-index:800000 に展開）
    modal.style.zIndex = '800000';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('active');
    });

    // --------------------------------------------------
    // ボタンのイベント接続
    // --------------------------------------------------

    // 再戦するボタン
    if (restartBtn) {
        restartBtn.onclick = () => {
            modal.classList.remove('active');
            modal.classList.add('opacity-0', 'hidden');

            // ★ 前回の戦闘アニメUIを完全にたたんで初期状態に戻す
            const animOverlay = document.getElementById('battle-anim-overlay');
            if (animOverlay) animOverlay.classList.add('hidden');
            
            // 選択されていた敵デッキIDを localStorage から取得
            const savedConfig = localStorage.getItem('selectedBattleConfig');
            let targetDeckId = 'd01';
            if (savedConfig) {
                try {
                    const config = JSON.parse(savedConfig);
                    if (config.deckId) targetDeckId = config.deckId;
                } catch(e) {}
            }

            resetGameVariables();
            setupCpuDeck(targetDeckId); // ★ 選択していた敵デッキで再セットアップ
            playSceneBGM(targetDeckId, true); // ★ 選択していた対戦BGMを再生

            refreshAllUI();
            triggerTurnCutin(1);
        };
    }

    // タイトルに戻るボタン：BGM停止してタイトルへ
    if (titleBtn) {
        titleBtn.onclick = () => {
            stopEraBGM();
            window.location.href = 'title.html';
        };
    }

    if (toResultBtn) {
        toResultBtn.onclick = () => {
            if (gameState.lastBattleResult) {
                const nextBtn = document.getElementById('btn-next-turn');
                if (nextBtn) nextBtn.innerText = '➔ 決着画面に戻る';

                const { playerCards, cpuCards, battleResult } = gameState.lastBattleResult;
                showTurnResultModal(playerCards, cpuCards, battleResult);
            }
        };
    }
}

function refreshAllUI() {
    updateImageModeButtonUI();

    const turnEl = document.getElementById('current-turn-num');
    if (turnEl) turnEl.innerText = `${Math.min(gameState.turn, gameState.maxTurn)}/${gameState.maxTurn}`;

    // 先ほど作成した関数を呼び出す
    updateBattleStartButtonUI();

    const playerHpEl = document.getElementById('player-hp-text') || document.getElementById('player-hp-num');
    if (playerHpEl) playerHpEl.innerText = `${gameState.playerHp.toLocaleString()} / ${INITIAL_HP.toLocaleString()}`;

    const playerHpBar = document.getElementById('player-hp-bar');
    if (playerHpBar) {
        const playerPct = Math.max(0, Math.min(100, (gameState.playerHp / INITIAL_HP) * 100));
        playerHpBar.style.width = `${playerPct}%`;
    }

    const cpuHpEl = document.getElementById('cpu-hp-text') || document.getElementById('cpu-hp-num');
    if (cpuHpEl) cpuHpEl.innerText = `${gameState.cpuHp.toLocaleString()} / ${INITIAL_HP.toLocaleString()}`;

    const cpuHpBar = document.getElementById('cpu-hp-bar');
    if (cpuHpBar) {
        const cpuPct = Math.max(0, Math.min(100, (gameState.cpuHp / INITIAL_HP) * 100));
        cpuHpBar.style.width = `${cpuPct}%`;
    }

    if (gameState.cpuJoker) {
        const cpuNameEl = document.getElementById('cpu-joker-name');
        if (cpuNameEl) cpuNameEl.innerText = gameState.cpuJoker.name || '卑弥呼';

        const cpuImgEl = document.getElementById('cpu-joker-img');
        if (cpuImgEl) {
            const imageName = gameState.displayMode === 'real'
                ? (gameState.cpuJoker.imageReal || gameState.cpuJoker.image_real)
                : (gameState.cpuJoker.imageIllust || gameState.cpuJoker.image_illust);
            
            // ★ 画像名が存在する場合のみ src をセット（空の時に NO IMAGE が浮き出るのを防止）
            if (imageName) {
                cpuImgEl.src = `images/${imageName}`;
            } else {
                cpuImgEl.src = 'images/default.jpg';
            }
            cpuImgEl.onerror = () => { cpuImgEl.src = 'images/default.jpg'; };
        }
    }

    const cpuCounts = { gu: 0, cho: 0, pa: 0 };
    const allCpuCards = [
        ...(Array.isArray(gameState.cpuHand) ? gameState.cpuHand : []),
        ...(Array.isArray(gameState.cpuDeck) ? gameState.cpuDeck : [])
    ];

    allCpuCards.forEach(card => {
        if (card && cpuCounts[card.janken] !== undefined) {
            cpuCounts[card.janken]++;
        }
    });

    const cpuGuEl = document.getElementById('cpu-deck-gu');
    const cpuChoEl = document.getElementById('cpu-deck-cho');
    const cpuPaEl = document.getElementById('cpu-deck-pa');

    if (cpuGuEl) cpuGuEl.innerText = `${cpuCounts.gu}枚`;
    if (cpuChoEl) cpuChoEl.innerText = `${cpuCounts.cho}枚`;
    if (cpuPaEl) cpuPaEl.innerText = `${cpuCounts.pa}枚`;

    const handContainer = document.getElementById('player-hand-container');
    if (handContainer && gameModules && gameModules.renderBattleUI) {
        gameModules.renderBattleUI(handContainer, gameState, { 
            selectedCardIds: gameState.selectedCardIds,
            displayMode: gameState.displayMode
        });
    }

    // ★ 危険度判定＆点滅演出の適用
    const cpuJokerBox = document.getElementById('cpu-joker-box');
    const cpuDangerEl = document.getElementById('cpu-danger-level');

    if (cpuJokerBox && cpuDangerEl && Array.isArray(gameState.cpuHand)) {
        // CPU手札5枚のPower合計値を算出
        const cpuHandPowerSum = gameState.cpuHand.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);

        // 点滅用クラスの初期化
        cpuJokerBox.classList.remove('danger-mid-glow', 'danger-high-glow', 'danger-extreme-glow');

        if (cpuHandPowerSum >= 3600) {
            // 3600〜 : 特大（激しい赤点滅）
            cpuJokerBox.classList.add('danger-extreme-glow');
            cpuDangerEl.innerText = '危険度：特大 ⚠️';
            cpuDangerEl.className = 'text-xs font-black mt-0.5 text-rose-400 animate-pulse';
        } else if (cpuHandPowerSum >= 2900) {
            // 2900〜3599 : 大（ほのかに赤点滅）
            cpuJokerBox.classList.add('danger-high-glow');
            cpuDangerEl.innerText = '危険度：大 ⚠️';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-rose-300';
        } else if (cpuHandPowerSum >= 2250) {
            // 2250〜2899 : 中（ほのかに黄点滅）
            cpuJokerBox.classList.add('danger-mid-glow');
            cpuDangerEl.innerText = '危険度：中 ⚡';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-amber-300';
        } else {
            // 〜2249 : 小（通常表示）
            cpuDangerEl.innerText = '危険度：小 🛡️';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-slate-400';
        }
    }

    updateCalculatorUI();
}

function updateImageModeButtonUI() {
    const labelEl = document.getElementById('img-mode-label');
    const modeBtn = document.getElementById('btn-toggle-img-mode') || document.getElementById('img-mode-toggle');
    const isReal = gameState.displayMode === 'real';
    const modeText = isReal ? '資料' : 'イラスト';

    if (labelEl) {
        labelEl.innerText = modeText;
    } else if (modeBtn) {
        const textNode = Array.from(modeBtn.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);
        if (textNode) textNode.textContent = modeText;
    }
}

function getPokerHandInfo(cards) {
    if (!cards || cards.length !== 3) {
        return { name: '役なし', multiplier: 1.0 };
    }

    const ranks = cards.map(c => String(c.rank || '1').toUpperCase());
    const jokerCount = ranks.filter(r => r === 'JOKER' || r === 'JK').length;
    const normalRanks = ranks.filter(r => r !== 'JOKER' && r !== 'JK');

    if (jokerCount >= 2) return { name: 'スリーカード ✨2.0倍', multiplier: 2.0 };
    if (jokerCount === 1) {
        if (normalRanks[0] === normalRanks[1]) return { name: 'スリーカード ✨2.0倍', multiplier: 2.0 };
        if (canFormStraightWithJoker(normalRanks)) return { name: 'ストレート ✨1.5倍', multiplier: 1.5 };
        return { name: 'ワンペア ✨1.2倍', multiplier: 1.2 };
    }

    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { name: 'スリーカード ✨2.0倍', multiplier: 2.0 };
    if (isStraight(ranks)) return { name: 'ストレート ✨1.5倍', multiplier: 1.5 };
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) return { name: 'ワンペア ✨1.2倍', multiplier: 1.2 };

    return { name: '役なし', multiplier: 1.0 };
}

function rankToVal(r) {
    if (r === 'A') return 1;
    if (r === 'J') return 11;
    if (r === 'Q') return 12;
    if (r === 'K') return 13;
    const n = parseInt(r, 10);
    return isNaN(n) ? 0 : n;
}

function isStraight(ranks) {
    const vals = ranks.map(rankToVal).sort((a, b) => a - b);
    if (vals[0] + 1 === vals[1] && vals[1] + 1 === vals[2]) return true;
    if (vals[0] === 1) {
        const valsAceHigh = [vals[1], vals[2], 14].sort((a, b) => a - b);
        if (valsAceHigh[0] + 1 === valsAceHigh[1] && valsAceHigh[1] + 1 === valsAceHigh[2]) return true;
    }
    return false;
}

function canFormStraightWithJoker(normalRanks) {
    const v1 = rankToVal(normalRanks[0]);
    const v2 = rankToVal(normalRanks[1]);
    if (v1 === 0 || v2 === 0) return false;
    const diff = Math.abs(v1 - v2);
    return diff === 1 || diff === 2 || (v1 === 1 && v2 >= 12) || (v2 === 1 && v1 >= 12);
}

function updateCalculatorUI() {
    const jankenIconsEl = document.getElementById('calc-janken-icons');
    const pokerRanksEl = document.getElementById('calc-poker-ranks');
    const tagsEl = document.getElementById('calc-active-tags');
    const atkEl = document.getElementById('calc-total-atk');
    const defEl = document.getElementById('calc-total-def');

    const selectedCards = gameState.selectedCardIds
        .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
        .filter(Boolean);
    const count = selectedCards.length;

    const handIcons = selectedCards.map(c => ({ gu: '✊', cho: '✌️', pa: '✋' }[c.janken] || '❓'));
    let finalHandIcon = '❓';
    if (count === 3) {
        const counts = { gu: 0, cho: 0, pa: 0 };
        selectedCards.forEach(c => { if (counts[c.janken] !== undefined) counts[c.janken]++; });
        if (counts.gu === 3) finalHandIcon = '✊';
        else if (counts.cho === 3) finalHandIcon = '✌️';
        else if (counts.pa === 3) finalHandIcon = '✋';
        else if (counts.gu === 1 && counts.cho === 1 && counts.pa === 1) finalHandIcon = '✨';
        else finalHandIcon = counts.gu === 2 ? '✊' : (counts.cho === 2 ? '✌️' : '✋');
    } else {
        finalHandIcon = count > 0 ? handIcons[count - 1] : '-';
    }

    if (jankenIconsEl) {
        jankenIconsEl.innerHTML = count === 0 
            ? `<span class="text-xs text-slate-500">-</span>` 
            : `
            <div class="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold">
                <span class="${handIcons[0] ? 'opacity-100' : 'opacity-40'}">${handIcons[0] || '-'}</span>
                <span class="text-slate-600 text-[10px]">|</span>
                <span class="${handIcons[1] ? 'opacity-100' : 'opacity-40'}">${handIcons[1] || '-'}</span>
                <span class="text-slate-600 text-[10px]">|</span>
                <span class="${handIcons[2] ? 'opacity-100' : 'opacity-40'}">${handIcons[2] || '-'}</span>
                <span class="text-amber-500 font-bold mx-0.5">➡</span>
                <span class="text-lg sm:text-xl font-black text-yellow-300 drop-shadow">${finalHandIcon}</span>
            </div>`;
    }

    const pRanks = selectedCards.map(c => {
        const r = String(c.rank || '1').toUpperCase();
        return (r === 'JOKER' || r === 'JK') ? 'JK' : r;
    });
    const pokerInfo = getPokerHandInfo(selectedCards);

    if (pokerRanksEl) {
        pokerRanksEl.innerHTML = count === 0
            ? `<span class="text-xs text-slate-500">-</span>`
            : `
            <div class="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold font-mono">
                <span class="${pRanks[0] ? 'opacity-100' : 'opacity-40'}">${pRanks[0] || '-'}</span>
                <span class="text-slate-600 text-[10px]">|</span>
                <span class="${pRanks[1] ? 'opacity-100' : 'opacity-40'}">${pRanks[1] || '-'}</span>
                <span class="text-slate-600 text-[10px]">|</span>
                <span class="${pRanks[2] ? 'opacity-100' : 'opacity-40'}">${pRanks[2] || '-'}</span>
                <span class="text-amber-500 font-bold mx-0.5">➡</span>
                <span class="text-xs sm:text-sm font-black text-yellow-300 font-yuji">${count === 3 ? pokerInfo.name : '選択中...'}</span>
            </div>`;
    }

    let baseMultSum = 1.0;
    let atkMultSum = 1.0;
    let defMultSum = 1.0;

    if (tagsEl) {
        const tagCounts = {};
        selectedCards.forEach(c => {
            if (Array.isArray(c.tags)) {
                c.tags.forEach(t => {
                    const rawName = (typeof t === 'object' ? (t.name || t.label) : String(t)).replace(/[\(（].*?[\)）]/, '').trim();
                    if (rawName) tagCounts[rawName] = (tagCounts[rawName] || 0) + 1;
                });
            }
        });

        const activeEntries = Object.entries(tagCounts).filter(([tagName, cnt]) => {
            const cleanKey = String(tagName).trim();
            const master = gameState.tagMaster[cleanKey] || { minCards: 2 };
            return cnt >= master.minCards;
        });

        const slotsHTML = [];

        activeEntries.forEach(([tagName, cnt]) => {
            const cleanKey = String(tagName).trim();
            const master = gameState.tagMaster[cleanKey] || { category: "GEN", rank: "C", mult1: 1.0, mult2: 1.2, mult3: 1.5 };
            const config = CATEGORY_CONFIG[master.category] || CATEGORY_CONFIG.GEN;

            let multiplier = 1.0;
            if (cnt === 1) multiplier = master.mult1;
            else if (cnt === 2) multiplier = master.mult2;
            else if (cnt >= 3) multiplier = master.mult3;

            if (master.category === 'GEN' || master.category === 'SUP') {
                baseMultSum *= multiplier;
            } else if (master.category === 'ATK') {
                atkMultSum *= multiplier;
            } else if (master.category === 'DEF') {
                defMultSum *= multiplier;
            }

            const glowClass = cnt >= 3 ? 'tag-glow-3 border-amber-300' : 'tag-glow-2 border-amber-500';

            slotsHTML.push(`
                <div class="flex items-center justify-between gap-1 px-2 py-0.5 rounded-lg border ${config.color} ${glowClass} text-xs sm:text-sm font-bold shadow-sm h-6 leading-tight">
                    <div class="flex items-center gap-1 min-w-0 truncate">
                        <i class="fa-solid ${config.icon} text-xs flex-shrink-0"></i>
                        <span class="truncate">${cleanKey}(${master.rank})</span>
                    </div>
                    <div class="flex items-center gap-1 font-mono flex-shrink-0">
                        <span class="bg-black/60 px-1 rounded text-[10px] sm:text-xs text-amber-300">${cnt}枚</span>
                        <span class="text-yellow-300 font-black text-xs sm:text-sm">×${multiplier}</span>
                    </div>
                </div>
            `);
        });

        while (slotsHTML.length < 8) {
            slotsHTML.push(`
                <div class="flex items-center justify-center rounded-lg border border-slate-800/40 bg-slate-950/20 h-6">
                </div>
            `);
        }

        // ★ 136px の高さ設定・ゆとり配置を完全適用
        const overflowClass = activeEntries.length > 8 ? "overflow-y-auto" : "overflow-hidden";
        tagsEl.className = `grid grid-cols-2 gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 w-full h-[136px] ${overflowClass} content-start`;
        tagsEl.innerHTML = slotsHTML.join('');
    }

    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerMult = pokerInfo.multiplier;

    const totalAtk = count > 0 ? Math.round(basePowerSum * baseMultSum * atkMultSum * pokerMult) : 0;
    const totalDef = count > 0 ? Math.round(basePowerSum * baseMultSum * defMultSum * pokerMult) : 0;

    if (atkEl) atkEl.innerText = totalAtk.toLocaleString();
    if (defEl) defEl.innerText = totalDef.toLocaleString();
}

function switchTab(tabName) {
    const tabs = ['battle', 'deck', 'gacha', 'versus'];
    tabs.forEach(t => {
        const panel = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tab-${t}-btn`);
        if (panel) panel.classList.toggle('hidden', t !== tabName);
        if (btn) {
            btn.className = t === tabName 
                ? "px-3 py-1 rounded-lg text-xs sm:text-sm font-bold bg-amber-600 text-white shadow-md transition-all"
                : "px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold text-slate-400 hover:text-amber-300 transition-all";
        }
    });
    refreshAllUI();
}

function getJankenHandType(cards) {
    if (!cards || cards.length !== 3) return 'none';
    const counts = { gu: 0, cho: 0, pa: 0 };
    cards.forEach(c => { if (counts[c.janken] !== undefined) counts[c.janken]++; });

    if (counts.gu === 3) return 'gu';
    if (counts.cho === 3) return 'cho';
    if (counts.pa === 3) return 'pa';
    if (counts.gu === 1 && counts.cho === 1 && counts.pa === 1) return 'all';
    
    if (counts.gu === 2) return 'gu';
    if (counts.cho === 2) return 'cho';
    if (counts.pa === 2) return 'pa';

    return 'none';
}

function getJankenMultipliers(playerHandType, cpuHandType) {
    if (playerHandType === cpuHandType) {
        return { playerMult: 1.0, cpuMult: 1.0, resultText: "引き分け" };
    }

    if (playerHandType === 'all' && cpuHandType !== 'all') {
        return { playerMult: 1.0, cpuMult: 1.2, resultText: "CPU手あり優位" };
    }
    if (playerHandType !== 'all' && cpuHandType === 'all') {
        return { playerMult: 1.2, cpuMult: 1.0, resultText: "自軍手あり優位" };
    }

    const winMap = { gu: 'cho', cho: 'pa', pa: 'gu' };
    if (winMap[playerHandType] === cpuHandType) {
        return { playerMult: 1.2, cpuMult: 0.8, resultText: "自軍の勝ち！" };
    } else {
        return { playerMult: 0.8, cpuMult: 1.2, resultText: "CPUの勝ち！" };
    }
}

function evaluateSideStatus(cards, tagMaster) {
    const basePowerSum = cards.reduce((sum, c) => sum + (parseInt(c.power, 10) || 0), 0);
    const pokerInfo = getPokerHandInfo(cards);

    const tagCounts = {};
    cards.forEach(c => {
        if (Array.isArray(c.tags)) {
            c.tags.forEach(t => {
                const rawName = (typeof t === 'object' ? (t.name || t.label) : String(t)).replace(/[\(（].*?[\)）]/, '').trim();
                if (rawName) tagCounts[rawName] = (tagCounts[rawName] || 0) + 1;
            });
        }
    });

    let genSupMult = 1.0;
    let atkMult = 1.0;
    let defMult = 1.0;
    let debMultToEnemy = 1.0;
    const activeTags = [];
    const tagDetails = [];

    Object.entries(tagCounts).forEach(([tagName, cnt]) => {
        const master = tagMaster[tagName] || { category: "GEN", minCards: 2, mult1: 1.0, mult2: 1.2, mult3: 1.5 };
        if (cnt >= master.minCards) {
            let mult = 1.0;
            if (cnt === 1) mult = master.mult1;
            else if (cnt === 2) mult = master.mult2;
            else if (cnt >= 3) mult = master.mult3;

            activeTags.push(`${tagName}(x${mult})`);
            tagDetails.push({ name: tagName, category: master.category || "GEN", mult });

            if (master.category === 'GEN' || master.category === 'SUP') {
                genSupMult *= mult;
            } else if (master.category === 'ATK') {
                atkMult *= mult;
            } else if (master.category === 'DEF') {
                defMult *= mult;
            } else if (master.category === 'DEB') {
                debMultToEnemy *= mult;
            }
        }
    });

    return {
        basePowerSum,
        pokerInfo,
        pokerMult: pokerInfo.multiplier,
        genSupMult,
        atkMult,
        defMult,
        debMultToEnemy,
        activeTags,
        tagDetails,
        handType: getJankenHandType(cards)
    };
}

export function calculateBattleResult(playerCards, cpuCards, tagMaster) {
    const playerStat = evaluateSideStatus(playerCards, tagMaster);
    const cpuStat = evaluateSideStatus(cpuCards, tagMaster);

    const jankenRes = getJankenMultipliers(playerStat.handType, cpuStat.handType);

    const finalPlayerAtk = Math.round(
        playerStat.basePowerSum * playerStat.genSupMult * playerStat.atkMult * playerStat.pokerMult * jankenRes.playerMult * cpuStat.debMultToEnemy
    );
    const finalPlayerDef = Math.round(
        playerStat.basePowerSum * playerStat.genSupMult * playerStat.defMult * playerStat.pokerMult * jankenRes.playerMult * cpuStat.debMultToEnemy
    );

    const finalCpuAtk = Math.round(
        cpuStat.basePowerSum * cpuStat.genSupMult * cpuStat.atkMult * cpuStat.pokerMult * jankenRes.cpuMult * playerStat.debMultToEnemy
    );
    const finalCpuDef = Math.round(
        cpuStat.basePowerSum * cpuStat.genSupMult * cpuStat.defMult * cpuStat.pokerMult * jankenRes.cpuMult * playerStat.debMultToEnemy
    );

    const damageToCpu = Math.max(0, finalPlayerAtk - finalCpuDef);
    const damageToPlayer = Math.max(0, finalCpuAtk - finalPlayerDef);

    return {
        jankenResultText: jankenRes.resultText,
        player: {
            ...playerStat,
            jankenMult: jankenRes.playerMult,
            finalAtk: finalPlayerAtk,
            finalDef: finalPlayerDef,
            damageGiven: damageToCpu
        },
        cpu: {
            ...cpuStat,
            jankenMult: jankenRes.cpuMult,
            finalAtk: finalCpuAtk,
            finalDef: finalCpuDef,
            damageGiven: damageToPlayer
        }
    };
}

// ==========================================
// ★ ターンスタート・カットイン演出関数
// ==========================================
export function triggerTurnCutin(turnNumber, callback) {
    const overlay = document.getElementById('turn-cutin-overlay');
    const textEl = document.getElementById('turn-cutin-text');

    if (!overlay || !textEl) {
        if (callback) callback();
        return;
    }

    // ターン数に応じたテキスト指定
    let turnText = '';
    if (turnNumber === 1) turnText = '第１陣 開始！';
    else if (turnNumber === 2) turnText = '第２陣 開始！';
    else if (turnNumber === 3) turnText = '第３陣 開始！';
    else if (turnNumber === 4) turnText = '第４陣 開始！';
    else if (turnNumber >= 5) turnText = '最終決戦 開始！';
    else turnText = `第${turnNumber}陣 開始！`;

    textEl.innerText = turnText;

    // 非表示解除
    overlay.classList.remove('hidden');

    // 次の描画フレームで active を付与してアニメーションを開始
    requestAnimationFrame(() => {
        setTimeout(() => {
            overlay.classList.add('active');
        }, 20);
    });

    // 1.5秒間しっかり見せてからフェードアウト
    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            if (callback) callback();
        }, 300);
    }, 1500);
}

// 起動（DOMContentLoadedの遅延発火対策）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

// ==========================================
// ★ カード詳細モーダル ＆ データ読み込み処理
// ==========================================
let retsudenMap = {};
let tagsMap = {};
let activeCardDetail = null;

// tags.csv 読み込み
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
    } catch (e) {}
}

// retsuden.csv 読み込み
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
    } catch (e) {}
}

// カード詳細モーダルオープン関数
window.openCardDetail = function(cardId, event) {
    if (event) event.stopPropagation(); // 手札選択のカードタップイベントを発火させない
    const card = gameState.allCards.find(c => String(c.id) === String(cardId));
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

    if (nameEl) nameEl.innerText = card.name || '英傑';

    const rawPower = card.power !== undefined ? card.power : (card.famous !== undefined ? card.famous : 0);
    if (famousEl) famousEl.innerText = rawPower;

    const jankenMap = {
        gu: { emoji: '✊', label: 'グー', color: 'bg-rose-950 text-rose-300 border-rose-600' },
        cho: { emoji: '✌️', label: 'チョキ', color: 'bg-amber-950 text-amber-300 border-amber-600' },
        pa: { emoji: '✋', label: 'パー', color: 'bg-emerald-950 text-emerald-300 border-emerald-600' }
    };
    const jInfo = jankenMap[card.janken] || { emoji: '❓', label: '不明', color: 'bg-slate-900 text-slate-400 border-slate-700' };
    if (jankenEl) {
        jankenEl.innerHTML = `
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-lg border ${jInfo.color} font-bold text-xs shadow-md">
                <span>${jInfo.emoji}</span>
                <span>${jInfo.label}</span>
            </div>
        `;
    }

    if (pokerEl) {
        const r = String(card.rank || '1').toUpperCase();
        const displayRank = (r === 'JOKER' || r === 'JK') ? 'JK' : r;
        pokerEl.innerHTML = `
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-amber-950/80 border-amber-500/70 text-amber-300 font-mono font-black text-xs shadow-md">
                <span class="text-[10px] text-amber-400/80 font-sans">手札:</span>
                <span class="text-xs text-yellow-300">${displayRank}</span>
            </div>
        `;
    }

    if (imgEl) {
        const imgName = (gameState.displayMode === 'real' ? card.imageReal : card.imageIllust) || `${card.id}_illust.jpg`;
        imgEl.src = `images/${imgName}`;
    }

    if (tagsEl) {
        const rawTags = String(card.tags || card.tag || '');
        const tagList = rawTags.split(',').map(t => t.trim()).filter(Boolean);

        if (tagList.length === 0) {
            tagsEl.innerHTML = `<span class="text-xs text-slate-500 italic col-span-2">タグなし</span>`;
        } else {
            const catColors = {
                GEN: 'bg-slate-950/90 border-slate-700 text-slate-200',
                ATK: 'bg-rose-950/90 border-rose-600/80 text-rose-200',
                DEF: 'bg-sky-950/90 border-sky-600/80 text-sky-200',
                SUP: 'bg-amber-950/90 border-amber-600/80 text-amber-200',
                DEB: 'bg-purple-950/90 border-purple-600/80 text-purple-200'
            };

            tagsEl.innerHTML = tagList.map(tagName => {
                const meta = tagsMap[tagName] || { category: 'GEN', rank: 'C' };
                const colorClass = catColors[meta.category] || catColors.GEN;
                const rankText = meta.rank ? `(${meta.rank})` : '';

                return `
                    <div class="flex items-center justify-between text-xs font-bold border px-2 py-0.5 rounded-lg ${colorClass} shadow-sm truncate">
                        <span class="truncate">${tagName} <span class="font-mono text-[10px] opacity-80">${rankText}</span></span>
                    </div>
                `;
            }).join('');
        }
    }

    if (retsudenEl) {
        retsudenEl.innerText = retsudenMap[card.id] || "（列伝テキスト準備中）";
    }

    modal?.classList.remove('hidden');
};

// モーダルイベント初期化
document.addEventListener('DOMContentLoaded', () => {
    loadTagsCSV();
    loadRetsudenCSV();

    document.getElementById('btn-close-detail-modal')?.addEventListener('click', () => {
        document.getElementById('modal-card-detail')?.classList.add('hidden');
    });

    document.getElementById('btn-detail-toggle-img')?.addEventListener('click', () => {
        gameState.displayMode = gameState.displayMode === 'illust' ? 'real' : 'illust';
        if (activeCardDetail) window.openCardDetail(activeCardDetail.id);
    });
});