/**
 * p2p_main.js - オンラインP2P対戦専用メインモジュール (フリーバトル完全同期版)
 * 役割: P2P通信同期、20枚デッキハンドシェイク、毎ターンの同時カード選択、30秒タイマー、本格計算エンジン＆演出完全連動
 */

// ポータブル環境用：MIMEタイプ制限を回避して依存関係付きモジュールを安全に動的ロードする関数
async function loadGameModules() {
    try {
        const fetchAndBlob = async (path) => {
            const res = await fetch(path);
            let text = await res.text();
            text = text.replace(/from\s+['"]\.\/csvLoader\.js['"]/g, `from '${csvBlobUrl}'`);
            const blob = new Blob([text], { type: 'application/javascript' });
            return URL.createObjectURL(blob);
        };

        const csvRes = await fetch('./csvLoader.js');
        const csvText = await csvRes.text();
        const csvBlob = new Blob([csvText], { type: 'application/javascript' });
        const csvBlobUrl = URL.createObjectURL(csvBlob);

        const [uiUrl, p2pNetUrl, p2pMgrUrl] = await Promise.all([
            fetchAndBlob('./ui.js'),
            fetchAndBlob('./p2p_network.js'),
            fetchAndBlob('./p2p_manager.js')
        ]);

        const [csvModule, uiModule, p2pNetModule, p2pMgrModule] = await Promise.all([
            import(csvBlobUrl),
            import(uiUrl),
            import(p2pNetUrl),
            import(p2pMgrUrl)
        ]);

        return {
            loadGameDataFromCSV: csvModule.loadGameDataFromCSV,
            renderBattleUI: uiModule.renderBattleUI,
            showToast: uiModule.showToast,
            P2PNetwork: p2pNetModule.P2PNetwork,
            P2PManager: p2pMgrModule.P2PManager
        };
    } catch (err) {
        console.error("P2Pモジュールのロードに失敗しました:", err);
        return null;
    }
}

let gameModules = null;
const INITIAL_HP = 10000;
let bgmAudio = null;

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
    jokerResults: [], // ★ main.js 準拠: joker_results.csv 保持用
    bgmMaster: [],
    turn: 1,
    maxTurn: 5,
    playerHp: INITIAL_HP,
    cpuHp: INITIAL_HP,
    lastBattleResult: null,
    turnHistory: [],
    p2pNetwork: null,
    p2pManager: null,

    // ★ 同期・再戦管理用フラグ追加
    currentRoomId: null,
    myDeckReadyData: null,
    opponentDeckData: null,
    myTurnChoice: null,
    opponentTurnChoice: null,
    myRematchRequest: false,
    opponentRematchRequest: false
};

const CATEGORY_CONFIG = {
    ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
    SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
    DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
    DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
    GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function initP2PGame() {
    gameModules = await loadGameModules();
    if (!gameModules) return;

    const loadedData = await gameModules.loadGameDataFromCSV();
    if (!loadedData || !loadedData.cardsDb) return;

    gameState.allCards = loadedData.cardsDb;
    gameState.tagMaster = loadedData.tagMaster || {};
    gameState.jokerResults = loadedData.jokerResults || []; // ★ main.js 準拠: JOKER勝利イラストデータ読み込み
    gameState.bgmMaster = loadedData.bgmMaster || [];

    // 1. title / p2p_room から引き継いだ設定の読み込み
    const savedConfig = localStorage.getItem('selectedBattleConfig');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            if (config.playerDeck) {
                const pDeck = config.playerDeck;
                const loadedPlayerIds = [];
                if (pDeck.jokerId) loadedPlayerIds.push(String(pDeck.jokerId));
                if (pDeck.cardIds && Array.isArray(pDeck.cardIds)) {
                    pDeck.cardIds.forEach(id => loadedPlayerIds.push(String(id)));
                }
                if (loadedPlayerIds.length === 20) {
                    gameState.playerDeckIds = loadedPlayerIds;
                }
            }
        } catch (e) {
            console.error("対戦設定取得エラー:", e);
        }
    }

    if (!gameState.playerDeckIds || gameState.playerDeckIds.length !== 20) {
        gameState.playerDeckIds = gameState.allCards.slice(0, 20).map(c => String(c.id));
    }

    setupEventListeners();
    populateP2PDeckSelect();
}

function resetP2PGameVariables() {
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

// ① ルーム選択（処理順修正版：即時ロック ➔ デッキ選択 ➔ ID発行 ➔ 部屋開放）
window.selectP2PRoom = async function(roomNumber) {
    gameState.currentRoomNumber = roomNumber;
    gameState.currentRoomId = `yamato-room-${roomNumber}`;

    // 1. ルーム選択画面を閉じ、部屋表記を「対戦準備中」へ一時ロック（3人目遮断）
    document.getElementById('p2p-room-select-screen')?.classList.add('hidden');
    
    const statusEl = document.getElementById(`p2p-room-status-${roomNumber}`);
    const btnEl = document.getElementById(`btn-join-room-${roomNumber}`);
    if (statusEl) {
        statusEl.innerText = "🟡 対戦準備中...";
        statusEl.className = "text-xs text-amber-400 font-bold font-mono";
    }
    if (btnEl) btnEl.disabled = true;

    // 2. ネットワークマネージャーの事前初期化
    gameState.p2pNetwork = new gameModules.P2PNetwork();
    gameState.p2pManager = new gameModules.P2PManager(gameState.p2pNetwork, {
        getSelectedCards: () => gameState.selectedCardIds,
        autoSelectRemaining: (neededCount) => {
            const unselected = gameState.hand.filter(c => !gameState.selectedCardIds.includes(String(c.id)));
            for (let i = 0; i < neededCount && i < unselected.length; i++) {
                gameState.selectedCardIds.push(String(unselected[i].id));
            }
            updateHandCardsSelectionUI();
            updateBattleStartButtonUI();
            updateCalculatorUI();
        },
        submitTurn: () => {
            if (gameState.selectedCardIds.length === 3 && gameState.p2pManager) {
                hideBattleConfirmModal();
                gameState.myTurnChoice = [...gameState.selectedCardIds];
                gameState.p2pManager.sendTurnChoice(gameState.myTurnChoice);
                checkExecuteTurn();
            }
        },
        onOpponentDeckReady: (opponentDeck) => {
            console.log("[P2P] 相手のデッキを受信:", opponentDeck);
            gameState.opponentDeckData = opponentDeck;
            checkStartBattleSequence();
        },
        onOpponentTurnChoice: (choice) => {
            gameState.opponentTurnChoice = choice;
            checkExecuteTurn();
        },
        onOpponentRematchSame: () => {
            gameState.opponentRematchRequest = true;
            if (gameState.myRematchRequest) startRematchSequence();
        },
        onOpponentChangeDeck: () => {
            alert("相手がデッキ選択へ戻りました。");
            resetToDeckSelectModal();
        }
    });

    // 相手（ゲスト）と通信が繋がった時の処理
    gameState.p2pNetwork.onConnectedCallback = () => {
        console.log("[P2P] ゲストが入室・接続が確立しました。");
    };

    // 相手との通信が切断された場合のハンドリング
    gameState.p2pNetwork.onDisconnectedCallback = () => {
        console.warn("[P2P] 通信が切断されました。");

        if (!gameState.p2pNetwork.isHost) {
            // ゲスト側の処理：ホストが離脱したため、ルーム選択へ戻す
            alert("対戦相手（ホスト）が離脱したため、ルーム選択へ戻ります。");
            
            // 各種モーダルを閉じる
            document.getElementById('p2p-deck-select-modal')?.classList.add('hidden');
            document.getElementById('p2p-waiting-opponent-modal')?.classList.add('hidden');
            document.getElementById('game-result-cutin-modal')?.classList.add('hidden');

            // ネットワークオブジェクトの初期化
            if (gameState.p2pNetwork) {
                try { gameState.p2pNetwork.disconnect(); } catch(e){}
            }

            // ルーム選択画面を再表示
            document.getElementById('p2p-room-select-screen')?.classList.remove('hidden');
        } else {
            // ホスト側の処理：ゲストが離脱した場合、デッキ選択済みのまま「対戦相手待ち」に戻る
            gameState.opponentDeckData = null;
            gameState.opponentReady = false;

            const waitText = document.getElementById('p2p-waiting-text');
            if (waitText) waitText.innerText = "対戦相手が離脱しました。新しい対戦相手を待っています... ⏳";
            document.getElementById('p2p-waiting-opponent-modal')?.classList.remove('hidden');
        }
    };

    // 3. まず「デッキ選択モーダル」を出す（まだPeerIDは作らない）
    document.getElementById('p2p-deck-select-modal')?.classList.remove('hidden');
};

// ② デッキ選択「決定」押下時の処理（ここでPeerID発行 ➔ 部屋を開放）
async function handleConfirmDeckSelection() {
    const slotId = document.getElementById('p2p-deck-dropdown')?.value || 1;
    const rawDecks = localStorage.getItem('yamato_縁_saved_decks_v1');
    const decks = rawDecks ? JSON.parse(rawDecks) : {};
    const selectedDeck = decks[slotId];

    if (!selectedDeck || !selectedDeck.jokerId) {
        alert("有効な20枚デッキを選択してください。");
        return;
    }

    gameState.playerDeckIds = [String(selectedDeck.jokerId), ...(selectedDeck.cardIds || []).map(id => String(id))];
    document.getElementById('p2p-deck-select-modal')?.classList.add('hidden');

    gameState.myDeckReadyData = {
        jokerId: String(selectedDeck.jokerId),
        cardIds: (selectedDeck.cardIds || []).map(id => String(id))
    };

    // 待機モーダルを表示
    const waitModal = document.getElementById('p2p-waiting-opponent-modal');
    const waitText = document.getElementById('p2p-waiting-text');
    if (waitText) waitText.innerText = "通信初期化・相手の接続を待っています... ⏳";
    if (waitModal) waitModal.classList.remove('hidden');

    // ★ ここでPeerIDを発行し、ホストまたはゲストとして部屋を開放・接続する
    try {
        // ホストとして PeerID (yamato-room-X) の発行を試みる
        await gameState.p2pNetwork.init(gameState.currentRoomId);
        console.log(`[P2P] デッキ選択完了 ➔ 部屋 ${gameState.currentRoomNumber} を「対戦待ち！」として開放しました。`);
        
        if (waitText) waitText.innerText = "相手のデッキ選択・入室を待っています... ⏳";
    } catch(e) {
        // 部屋が既に存在する場合はゲストとして参加接続
        console.log(`[P2P] 部屋 ${gameState.currentRoomNumber} にゲストとして接続を完了します...`);
        await gameState.p2pNetwork.init();
        gameState.p2pNetwork.connectToHost(gameState.currentRoomId);
        
        // 接続後、自分のデッキデータをホストへ即時送信
        setTimeout(() => {
            if (gameState.p2pManager && gameState.myDeckReadyData) {
                gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
            }
        }, 500);
    }

    checkStartBattleSequence();
}

// ② ドロップダウン用デッキ一覧設定
function populateP2PDeckSelect() {
    const dropdown = document.getElementById('p2p-deck-dropdown');
    if (!dropdown) return;

    try {
        const rawDecks = localStorage.getItem('yamato_縁_saved_decks_v1');
        const decks = rawDecks ? JSON.parse(rawDecks) : {};
        let optionsHTML = '';

        for (let i = 1; i <= 10; i++) {
            const deck = decks[i] || { id: i, name: `デッキ${i}`, jokerId: null, cardIds: [] };
            const total = (deck.jokerId ? 1 : 0) + (deck.cardIds ? deck.cardIds.length : 0);
            const is20 = total === 20;

            optionsHTML += `
                <option value="${i}" ${!is20 ? 'disabled' : ''}>
                    #${i} ${deck.name} (${total}/20枚) ${!is20 ? '【未完成】' : ''}
                </option>
            `;
        }
        dropdown.innerHTML = optionsHTML;
    } catch(e) {
        console.error("デッキ一覧取得エラー:", e);
    }
}

// ③ お互いのデッキ選択が揃ったら戦闘開始！
function checkStartBattleSequence() {
    if (gameState.myDeckReadyData && gameState.opponentDeckData) {
        document.getElementById('p2p-waiting-opponent-modal')?.classList.add('hidden');

        gameState.cpuJoker = gameState.allCards.find(c => String(c.id) === String(gameState.opponentDeckData.jokerId)) || gameState.allCards[0];
        
        const fullCards = [];
        const allIds = [gameState.opponentDeckData.jokerId, ...(gameState.opponentDeckData.cardIds || [])];
        allIds.forEach(id => {
            const card = gameState.allCards.find(c => String(c.id) === String(id));
            if (card) fullCards.push({ ...card });
        });

        const shuffled = [...fullCards].sort(() => Math.random() - 0.5);
        gameState.cpuHand = shuffled.slice(0, 5);
        gameState.cpuDeck = shuffled.slice(5);

        resetP2PGameVariables();
        refreshAllUI();

        triggerTurnCutin(1, () => {
            gameState.p2pManager.startTurnTimer();
        });
    }
}

// ④ お互いのターン3枚選択が揃ったらバトル実行
async function checkExecuteTurn() {
    if (gameState.myTurnChoice && gameState.opponentTurnChoice) {
        const playerCards = gameState.myTurnChoice
            .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
            .filter(Boolean);

        const cpuCards = gameState.opponentTurnChoice
            .map(id => gameState.cpuHand.find(c => String(c.id || c.cardId) === String(id)))
            .filter(Boolean);

        gameState.myTurnChoice = null;
        gameState.opponentTurnChoice = null;

        const battleResult = calculateBattleResult(playerCards, cpuCards, gameState.tagMaster);
        gameState.lastBattleResult = { playerCards, cpuCards, battleResult };

        gameState.turnHistory[gameState.turn - 1] = {
            turnNum: gameState.turn,
            playerCards: playerCards,
            cpuCards: cpuCards,
            battleResult: battleResult
        };

        await runBattleAnimation(playerCards, cpuCards, battleResult);
    }
}

function playSceneBGM(bgmId, isLoop = true) {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
    }

    const bgmItem = gameState.bgmMaster.find(b => (b.bgm_id || b.bgmId) === String(bgmId));
    const fileName = bgmItem ? (bgmItem.bgm_file || bgmItem.bgmFile) : '';
    const bgmPath = fileName ? `audio/${fileName}` : 'audio/yayoi_bgm.mp3';

    bgmAudio = new Audio(bgmPath);
    bgmAudio.loop = isLoop;
    bgmAudio.volume = 0.3;

    bgmAudio.play().catch(() => {});
}

function stopEraBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
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

    const btnConfirmDeck = document.getElementById('btn-p2p-confirm-deck');
    if (btnConfirmDeck) btnConfirmDeck.onclick = handleConfirmDeckSelection;

    const btnRematchSame = document.getElementById('btn-p2p-rematch-same');
    if (btnRematchSame) btnRematchSame.onclick = handleRematchSameDeck;

    const btnChangeDeck = document.getElementById('btn-p2p-change-deck');
    if (btnChangeDeck) btnChangeDeck.onclick = handleRematchChangeDeck;

    const confirmBtn = document.getElementById('btn-modal-confirm');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            hideBattleConfirmModal();
            if (gameState.p2pManager) {
                gameState.myTurnChoice = [...gameState.selectedCardIds];
                gameState.p2pManager.sendTurnChoice(gameState.myTurnChoice);
                checkExecuteTurn();
            }
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

    const titleBtn = document.getElementById('btn-result-title');
    if (titleBtn) {
        titleBtn.onclick = () => {
            stopEraBGM();
            sessionStorage.removeItem('isP2PMatch');
            window.location.href = 'title.html';
        };
    }

    const audioOverlay = document.getElementById('battle-start-audio-overlay');
    if (audioOverlay) {
        audioOverlay.onclick = () => {
            audioOverlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => { try { audioOverlay.remove(); } catch(e) {} }, 500);
            playSceneBGM('d01', true);
            setTimeout(() => { triggerTurnCutin(1); }, 200);
        };
    }

    document.removeEventListener('click', handleCardClick);
    document.addEventListener('click', handleCardClick);
}

function handleCardClick(e) {
    const cardElement = e.target.closest('#player-hand-container .card-container');
    if (cardElement) {
        const cardId = cardElement.getAttribute('data-id');
        if (cardId) toggleCardSelection(String(cardId));
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

    updateHandCardsSelectionUI();
    updateBattleStartButtonUI();
    updateCalculatorUI();
}

function updateHandCardsSelectionUI() {
    const handContainer = document.getElementById('player-hand-container');
    if (!handContainer) return;

    const cards = handContainer.querySelectorAll('.card-container');

    cards.forEach(cardEl => {
        const id = cardEl.getAttribute('data-id');
        const isSelected = gameState.selectedCardIds.includes(String(id));

        if (isSelected) {
            cardEl.classList.remove('border-slate-800/80', 'brightness-50', 'opacity-60', 'grayscale-[30%]');
            cardEl.classList.add('border-cyan-300', 'ring-4', 'ring-cyan-400/80', 'card-selected-style', 'brightness-100', 'opacity-100');
        } else {
            cardEl.classList.remove('border-cyan-300', 'ring-4', 'ring-cyan-400/80', 'card-selected-style', 'brightness-100', 'opacity-100');
            cardEl.classList.add('border-slate-800/80', 'brightness-50', 'opacity-60', 'grayscale-[30%]');
        }
    });
}

function updateBattleStartButtonUI() {
    const battleStartBtn = document.getElementById('btn-battle-start');
    if (!battleStartBtn) return;
    const selectedCount = gameState.selectedCardIds.length;

    if (selectedCount === 3) {
        battleStartBtn.disabled = false;
        battleStartBtn.innerText = "⚔️ 戦闘決定！";
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

    const selectedCards = gameState.selectedCardIds
        .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
        .filter(Boolean);

    if (selectedCards.length !== 3) return;

    const cardsContainer = document.getElementById('modal-confirm-card-list');
    if (cardsContainer) {
        cardsContainer.innerHTML = selectedCards.map(c => {
            const imgName = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
            return `
                <div class="flex flex-col items-center">
                    <div class="w-full aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden border border-amber-400/80 mb-1.5 shadow-md">
                        <img src="images/${imgName}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                    </div>
                    <div class="text-sm sm:text-base font-nomal text-white-300 truncate w-full text-center leading-tight font-yuji">${c.name}</div>
                </div>
            `;
        }).join('');
    }

    const counts = { gu: 0, cho: 0, pa: 0 };
    selectedCards.forEach(c => { if (counts[c.janken] !== undefined) counts[c.janken]++; });

    let finalHandIcon = '❓';
    if (counts.gu === 3 || counts.gu === 2) finalHandIcon = '✊';
    else if (counts.cho === 3 || counts.cho === 2) finalHandIcon = '✌️';
    else if (counts.pa === 3 || counts.pa === 2) finalHandIcon = '✋';
    else if (counts.gu === 1 && counts.cho === 1 && counts.pa === 1) finalHandIcon = '✨';

    const pokerInfo = getPokerHandInfo(selectedCards);

    const jankenEl = document.getElementById('modal-confirm-janken');
    const pokerEl = document.getElementById('modal-confirm-poker');
    if (jankenEl) jankenEl.innerText = finalHandIcon;
    if (pokerEl) pokerEl.innerText = pokerInfo.name;

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

        while (slotsHTML.length < 6) {
            slotsHTML.push(`<div class="rounded-lg border border-slate-800/40 bg-slate-950/20 min-h-[36px]"></div>`);
        }

        tagsContainer.innerHTML = slotsHTML.slice(0, 6).join('');
    }

    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerMult = pokerInfo.multiplier;

    const totalAtk = Math.round(basePowerSum * baseMultSum * atkMultSum * pokerMult);
    const totalDef = Math.round(basePowerSum * baseMultSum * defMultSum * pokerMult);

    const atkEl = document.getElementById('modal-confirm-atk');
    const defEl = document.getElementById('modal-confirm-def');
    if (atkEl) atkEl.innerText = totalAtk.toLocaleString();
    if (defEl) defEl.innerText = totalDef.toLocaleString();

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function hideBattleConfirmModal() {
    const modal = document.getElementById('battle-confirm-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// ★ main.js 準拠: アニメーション演出＆結果動的構築
// -------------------------------------------------------------
async function runBattleAnimation(playerCards, cpuCards, battleResult) {
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

    if (whiteout) {
        whiteout.classList.remove('opacity-100', 'pointer-events-auto');
        whiteout.classList.add('opacity-0', 'pointer-events-none');
    }

    const formattedCpuCards = cpuCards.map(c => {
        const img = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
        return {
            name: c.name || '敵英傑',
            image: `images/${img}`
        };
    });

    const rawTagDetails = battleResult.cpu.tagDetails || [];
    const categoryPriority = { GEN: 1, SUP: 2, ATK: 3, DEF: 4, DEB: 5 };

    const sortedTagDetails = [...rawTagDetails].sort((a, b) => {
        const multA = a.mult || 1.0;
        const multB = b.mult || 1.0;
        if (multA !== multB) return multA - multB;
        const pA = categoryPriority[a.category] || 99;
        const pB = categoryPriority[b.category] || 99;
        return pA - pB;
    });

    let runningAtkMult = 1.0;
    let runningDefMult = 1.0;

    const formattedTags = sortedTagDetails.map((t) => {
        const tagName = t.name;
        const mult = t.mult || 1.0;
        const category = t.category || 'GEN';

        if (category === 'ATK') runningAtkMult *= mult;
        else if (category === 'DEF') runningDefMult *= mult;
        else if (category === 'GEN' || category === 'SUP') {
            runningAtkMult *= mult;
            runningDefMult *= mult;
        }

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

            if (hasTag) matchingIndexes.push(index);
        });

        const targetIdxs = matchingIndexes.length > 0 ? matchingIndexes : [0, 1, 2];

        return {
            name: t.name,
            category: category,
            targetIndexes: targetIdxs,
            atkMult: runningAtkMult,
            defMult: runningDefMult
        };
    });

    const tagTotalAtkMult = runningAtkMult;
    const tagTotalDefMult = runningDefMult;

    const cpuPokerInfo = battleResult.cpu.pokerInfo || { name: '役なし', multiplier: 1.0 };
    const pokerMult = cpuPokerInfo.multiplier || 1.0;

    const afterPokerAtkMult = tagTotalAtkMult * pokerMult;
    const afterPokerDefMult = tagTotalDefMult * pokerMult;

    const cpuPokerData = {
        name: cpuPokerInfo.name,
        multiplier: pokerMult,
        atkMult: afterPokerAtkMult,
        defMult: afterPokerDefMult
    };

    const cpuJankenMult = battleResult.cpu.jankenMult || 1.0;
    const afterJankenAtkMult = afterPokerAtkMult * cpuJankenMult;
    const afterJankenDefMult = afterPokerDefMult * cpuJankenMult;

    const jankenData = {
        title: `✊ VS ✌️ じゃんけん結果：${battleResult.jankenResultText || '勝負'}`,
        sub: `自軍補正 ×${battleResult.player.jankenMult} / 敵軍補正 ×${battleResult.cpu.jankenMult}`,
        atkMult: afterJankenAtkMult,
        defMult: afterJankenDefMult
    };

    const playerDebuffList = (battleResult.player.tagDetails || []).filter(t => t.category === 'DEB');
    const enemyDebuffList = (battleResult.cpu.tagDetails || []).filter(t => t.category === 'DEB');

    const playerDebMultToCpu = battleResult.player.debMultToEnemy || 1.0;
    const afterDebuffAtkMult = afterJankenAtkMult * playerDebMultToCpu;
    const afterDebuffDefMult = afterJankenDefMult * playerDebMultToCpu;

    const isGameOver = (
        gameState.playerHp - battleResult.cpu.damageGiven <= 0 ||
        gameState.cpuHp - battleResult.player.damageGiven <= 0 ||
        gameState.turn >= gameState.maxTurn
    );

    const animData = {
        cpuCards: formattedCpuCards,
        enemyBaseAtk: battleResult.cpu.basePowerSum,
        enemyBaseDef: battleResult.cpu.basePowerSum,
        tags: formattedTags,
        poker: cpuPokerData,
        janken: jankenData,
        playerDebuffs: playerDebuffList.map(d => ({ name: d.name, mult: d.mult })),
        enemyDebuffs: enemyDebuffList.map(d => ({ name: d.name, mult: d.mult })),
        playerBaseAtk: calcAtkVal,
        playerBaseDef: calcDefVal,
        playerAfterJankenAtk: Math.round(calcAtkVal * (battleResult.player.jankenMult || 1.0)),
        playerAfterJankenDef: Math.round(calcDefVal * (battleResult.player.jankenMult || 1.0)),
        playerAtk: battleResult.player.finalAtk,
        playerDef: battleResult.player.finalDef,
        enemyAfterDebuffAtkMult: afterDebuffAtkMult,
        enemyAfterDebuffDefMult: afterDebuffDefMult,
        enemyFinalAtk: battleResult.cpu.finalAtk,
        enemyFinalDef: battleResult.cpu.finalDef,
        isGameOver: isGameOver
    };

    let retryCount = 0;
    while (!window.battleAnim && retryCount < 10) {
        await sleep(100);
        retryCount++;
    }

    if (window.battleAnim) {
        await window.battleAnim.play(animData);
    }

    const turnResultModal = document.getElementById('turn-result-modal');
    if (turnResultModal) turnResultModal.classList.add('hidden');

    if (isGameOver) {
        gameState.playerHp = Math.max(0, gameState.playerHp - battleResult.cpu.damageGiven);
        gameState.cpuHp = Math.max(0, gameState.cpuHp - battleResult.player.damageGiven);

        let resultType = 'win_normal';
        if (gameState.cpuHp <= 0) resultType = 'win_perfect';
        else if (gameState.playerHp <= 0) resultType = 'lose_perfect';
        else if (gameState.playerHp > gameState.cpuHp) resultType = 'win_normal';
        else resultType = 'lose_normal';

        playSceneBGM(resultType, true);

        showGameResultCutin(resultType);
        await sleep(200);

        const whiteOverlay = document.querySelector('.whiteout-transition-overlay');
        if (whiteOverlay) {
            whiteOverlay.style.opacity = '0';
            await sleep(500);
            whiteOverlay.remove();
        }
    } else {
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

// ★ main.js 準拠: 過去ターン切替対応版 ターン結果モーダル
function showTurnResultModal(playerCards, cpuCards, battleResult, viewTurnIndex = null) {
    const modal = document.getElementById('turn-result-modal');
    if (!modal) return;
    modal.style.zIndex = '900000';

    const targetTurnIdx = viewTurnIndex !== null ? viewTurnIndex : (gameState.turnHistory.length - 1);
    const historyData = gameState.turnHistory[targetTurnIdx];

    const currentPCards = historyData ? historyData.playerCards : playerCards;
    const currentCCards = historyData ? historyData.cpuCards : cpuCards;
    const currentResult = historyData ? historyData.battleResult : battleResult;

    const setSafeHTML = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

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

    setSafeText('res-p-power', currentResult.player.basePowerSum.toLocaleString());
    setSafeText('res-c-power', currentResult.cpu.basePowerSum.toLocaleString());

    setSafeText('res-p-poker', `${currentResult.player.pokerInfo.name}`);
    setSafeText('res-c-poker', `${currentResult.cpu.pokerInfo.name}`);

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

    const midPAtk = Math.round(currentResult.player.basePowerSum * currentResult.player.genSupMult * currentResult.player.atkMult * currentResult.player.pokerMult);
    const midPDef = Math.round(currentResult.player.basePowerSum * currentResult.player.genSupMult * currentResult.player.defMult * currentResult.player.pokerMult);
    const midCAtk = Math.round(currentResult.cpu.basePowerSum * currentResult.cpu.genSupMult * currentResult.cpu.atkMult * currentResult.cpu.pokerMult);
    const midCDef = Math.round(currentResult.cpu.basePowerSum * currentResult.cpu.genSupMult * currentResult.cpu.defMult * currentResult.cpu.pokerMult);

    setSafeText('res-mid-p-atk', midPAtk.toLocaleString());
    setSafeText('res-mid-p-def', midPDef.toLocaleString());
    setSafeText('res-mid-c-atk', midCAtk.toLocaleString());
    setSafeText('res-mid-c-def', midCDef.toLocaleString());

    setSafeText('res-janken-text', currentResult.jankenResultText);
    setSafeText('res-p-janken-mult', `自軍補正: x${currentResult.player.jankenMult}`);
    setSafeText('res-c-janken-mult', `敵軍補正: x${currentResult.cpu.jankenMult}`);

    setSafeText('res-final-p-atk', currentResult.player.finalAtk.toLocaleString());
    setSafeText('res-final-p-def', currentResult.player.finalDef.toLocaleString());
    setSafeText('res-final-c-atk', currentResult.cpu.finalAtk.toLocaleString());
    setSafeText('res-final-c-def', currentResult.cpu.finalDef.toLocaleString());

    setSafeText('res-damage-given-cpu', currentResult.player.damageGiven.toLocaleString());
    setSafeText('res-damage-given-player', currentResult.cpu.damageGiven.toLocaleString());

    const tabContainer = document.getElementById('result-turn-tab-container');
    if (tabContainer) {
        const turnLabels = ["第１陣", "第２陣", "第３陣", "第４陣", "最終決戦"];
        let tabsHTML = '';

        for (let i = 0; i < 5; i++) {
            const hasData = i < gameState.turnHistory.length;
            const isSelected = i === targetTurnIdx;

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
                    class="w-full min-h-[32px] py-1.5 px-1 rounded-xl border text-[10px] sm:text-xs font-yuji transition-all text-center flex-shrink-0 flex items-center justify-center ${btnStyle}">
                    ${turnLabels[i]}
                </button>
            `;
        }
        tabContainer.innerHTML = tabsHTML;
    }

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

window.switchResultTurnTab = function(turnIndex) {
    if (gameState.turnHistory[turnIndex]) {
        const data = gameState.turnHistory[turnIndex];
        showTurnResultModal(data.playerCards, data.cpuCards, data.battleResult, turnIndex);
    }
};

function proceedToNextTurn() {
    const modal = document.getElementById('turn-result-modal');
    
    const isGameOver = (
        gameState.playerHp <= 0 || 
        gameState.cpuHp <= 0 || 
        gameState.turn >= gameState.maxTurn
    );

    if (isGameOver) {
        if (modal) modal.classList.add('hidden');
        return;
    }

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

    triggerTurnCutin(gameState.turn, () => {
        if (gameState.p2pManager) {
            gameState.p2pManager.startTurnTimer();
        }
    });
}

// ★ main.js 準拠: jokerResults CSV連動 勝敗1枚絵カットイン表示関数
function showGameResultCutin() {
    const modal = document.getElementById('game-result-cutin-modal');
    const cutinImg = document.getElementById('result-cutin-img');
    const toResultBtn = document.getElementById('btn-cutin-to-result');
    const restartBtn = document.getElementById('btn-cutin-restart');
    const titleBtn = document.getElementById('btn-cutin-title');

    if (!modal || !cutinImg) return;

    const playerJokerId = gameState.playerDeckIds[0] || 'c00000';
    let resultType = 'win_normal';
    
    // HP勝敗判定（勝者と敗者で異なるCGイラスト・テキストを表示）
    if (gameState.playerHp > gameState.cpuHp) {
        resultType = gameState.cpuHp <= 0 ? 'win_perfect' : 'win_normal';
    } else {
        resultType = gameState.playerHp <= 0 ? 'lose_perfect' : 'lose_normal';
    }

    const jokerSetting = gameState.jokerResults.find(r => (r.joker_id || r.jokerId) === String(playerJokerId));
    let fileName = jokerSetting ? (jokerSetting[resultType] || '') : '';
    const imagePath = fileName ? `images/${fileName}` : `images/himiko_${resultType}.jpg`;
    
    cutinImg.src = imagePath;
    cutinImg.onerror = () => { cutinImg.src = 'images/default.jpg'; };

    modal.style.zIndex = '800000';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('active');
    });

    if (titleBtn) {
        titleBtn.onclick = () => {
            stopEraBGM();
            sessionStorage.removeItem('isP2PMatch');
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

// ⑥ 再戦処理（「同じデッキで再戦」）
function handleRematchSameDeck() {
    gameState.myRematchRequest = true;
    gameState.p2pManager.sendRematchSame();

    document.getElementById('game-result-cutin-modal')?.classList.add('hidden');
    const waitText = document.getElementById('p2p-waiting-text');
    if (waitText) waitText.innerText = "相手のデッキ選択を待っています...";
    document.getElementById('p2p-waiting-opponent-modal')?.classList.remove('hidden');

    if (gameState.opponentRematchRequest) {
        startRematchSequence();
    }
}

// ⑥ 再戦シーケンス開始（双方同意時）
function startRematchSequence() {
    gameState.myRematchRequest = false;
    gameState.opponentRematchRequest = false;

    // 手札・デッキ状態を初期化
    resetP2PGameVariables();

    // 相手へ自分のデッキReadyを再送信
    if (gameState.myDeckReadyData) {
        gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
    }
    
    // 戦闘開始チェックへ進行
    checkStartBattleSequence();
}

// ⑥ 再戦処理（「デッキを選び直す」）
function handleRematchChangeDeck() {
    gameState.p2pManager.sendChangeDeck();
    resetToDeckSelectModal();
}

function resetToDeckSelectModal() {
    document.getElementById('game-result-cutin-modal')?.classList.add('hidden');
    document.getElementById('p2p-waiting-opponent-modal')?.classList.add('hidden');

    gameState.myDeckReadyData = null;
    gameState.opponentDeckData = null;

    document.getElementById('p2p-deck-select-modal')?.classList.remove('hidden');
}

// ★ main.js 準拠: UI更新（敵軍危険度判定＆点滅表示含む）
function refreshAllUI() {
    const turnEl = document.getElementById('current-turn-num');
    if (turnEl) turnEl.innerText = `${Math.min(gameState.turn, gameState.maxTurn)}/${gameState.maxTurn}`;

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
        if (cpuNameEl) cpuNameEl.innerText = gameState.cpuJoker.name || '対戦相手';

        const cpuImgEl = document.getElementById('cpu-joker-img');
        if (cpuImgEl) {
            const imageName = gameState.displayMode === 'real'
                ? (gameState.cpuJoker.imageReal || gameState.cpuJoker.image_real)
                : (gameState.cpuJoker.imageIllust || gameState.cpuJoker.image_illust);
            
            // ★ この1行を追加（画像表示時の縦横比・サイズ崩れを固定）
            cpuImgEl.className = "w-full h-full object-cover object-top aspect-[3/4]";

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

    // ★ main.js 準拠: 危険度判定＆点滅演出の適用
    const cpuJokerBox = document.getElementById('cpu-joker-box');
    const cpuDangerEl = document.getElementById('cpu-danger-level');

    if (cpuJokerBox && cpuDangerEl && Array.isArray(gameState.cpuHand)) {
        const cpuHandPowerSum = gameState.cpuHand.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);

        cpuJokerBox.classList.remove('danger-mid-glow', 'danger-high-glow', 'danger-extreme-glow');

        if (cpuHandPowerSum >= 3600) {
            cpuJokerBox.classList.add('danger-extreme-glow');
            cpuDangerEl.innerText = '危険度：特大 ⚠️';
            cpuDangerEl.className = 'text-xs font-black mt-0.5 text-rose-400 animate-pulse';
        } else if (cpuHandPowerSum >= 2900) {
            cpuJokerBox.classList.add('danger-high-glow');
            cpuDangerEl.innerText = '危険度：大 ⚠️';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-rose-300';
        } else if (cpuHandPowerSum >= 2250) {
            cpuJokerBox.classList.add('danger-mid-glow');
            cpuDangerEl.innerText = '危険度：中 ⚡';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-amber-300';
        } else {
            cpuDangerEl.innerText = '危険度：小 🛡️';
            cpuDangerEl.className = 'text-xs font-bold mt-0.5 text-slate-400';
        }
    }

    updateCalculatorUI();
}

// ★ main.js 準拠: ポーカー役フル判定 (スリーカード, ストレート, ワンペア, 役なし, JOKER判定)
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

        // ★ UI崩れガード: スクロール制御と高さを完全固定
        tagsEl.className = "grid grid-cols-2 gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 w-full h-[136px] overflow-y-auto content-start";
        tagsEl.innerHTML = slotsHTML.join('');
    }

    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerMult = pokerInfo.multiplier;

    const totalAtk = count > 0 ? Math.round(basePowerSum * baseMultSum * atkMultSum * pokerMult) : 0;
    const totalDef = count > 0 ? Math.round(basePowerSum * baseMultSum * defMultSum * pokerMult) : 0;

    if (atkEl) atkEl.innerText = totalAtk.toLocaleString();
    if (defEl) defEl.innerText = totalDef.toLocaleString();
}

// ★ main.js 準拠: じゃんけん型特定ロジック
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

// ★ main.js 準拠: じゃんけん勝敗判定＆補正倍率算出
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

// ★ main.js 準拠: 片側の特性タグ＆中間ステータス評価
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

// ★ main.js 準拠: 両軍完全対戦結果計算エンジン
function calculateBattleResult(playerCards, cpuCards, tagMaster) {
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

function triggerTurnCutin(turnNumber, callback) {
    const overlay = document.getElementById('turn-cutin-overlay');
    const textEl = document.getElementById('turn-cutin-text');

    if (!overlay || !textEl) {
        if (callback) callback();
        return;
    }

    let turnText = '';
    if (turnNumber === 1) turnText = '第１陣 開始！';
    else if (turnNumber === 2) turnText = '第２陣 開始！';
    else if (turnNumber === 3) turnText = '第３陣 開始！';
    else if (turnNumber === 4) turnText = '第４陣 開始！';
    else if (turnNumber >= 5) turnText = '最終決戦 開始！';
    else turnText = `第${turnNumber}陣 開始！`;

    textEl.innerText = turnText;
    overlay.classList.remove('hidden');

    requestAnimationFrame(() => {
        setTimeout(() => {
            overlay.classList.add('active');
        }, 20);
    });

    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            if (callback) callback();
        }, 300);
    }, 1500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initP2PGame);
} else {
    initP2PGame();
}
