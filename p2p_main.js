/**
 * p2p_main.js - オンラインP2P対戦専用メインモジュール (4桁部屋番号完全同期版)
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
    jokerResults: [],
    bgmMaster: [],
    turn: 1,
    maxTurn: 5,
    playerHp: INITIAL_HP,
    cpuHp: INITIAL_HP,
    lastBattleResult: null,
    turnHistory: [],
    p2pNetwork: null,
    p2pManager: null,

    // マッチング管理フラグ
    isHostMode: false,
    currentRoomCode: null,
    currentRoomId: null,
    myDeckReadyData: null,
    opponentDeckData: null,
    myTurnChoice: null,
    opponentTurnChoice: null,
    myRematchRequest: false,
    opponentRematchRequest: false,

    // 相手から受信した手札ステータス（危険度・じゃんけん枚数）
    opponentHandStat: {
        handPowerSum: 0,
        gu: 0,
        cho: 0,
        pa: 0
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function initP2PGame() {
    gameModules = await loadGameModules();
    if (!gameModules) return;

    const loadedData = await gameModules.loadGameDataFromCSV();
    if (!loadedData || !loadedData.cardsDb) return;

    gameState.allCards = loadedData.cardsDb;
    gameState.tagMaster = loadedData.tagMaster || {};
    gameState.jokerResults = loadedData.jokerResults || [];
    gameState.bgmMaster = loadedData.bgmMaster || [];

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

// ==========================================================
// 部屋作成（ホスト）& 部屋参加（ゲスト）ロジック
// ==========================================================

function handleCreateHostRoom() {
    gameState.isHostMode = true;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    gameState.currentRoomCode = code;
    gameState.currentRoomId = `yamato-room-${code}`;

    document.getElementById('p2p-room-select-screen')?.classList.add('hidden');
    document.getElementById('p2p-deck-select-modal')?.classList.remove('hidden');
}

function handleJoinGuestRoom() {
    const inputEl = document.getElementById('input-p2p-room-code');
    const code = inputEl?.value?.trim();

    if (!code || code.length !== 4 || isNaN(code)) {
        alert("4桁の数字の部屋番号を入力してください。");
        return;
    }

    gameState.isHostMode = false;
    gameState.currentRoomCode = code;
    gameState.currentRoomId = `yamato-room-${code}`;

    document.getElementById('p2p-room-select-screen')?.classList.add('hidden');
    document.getElementById('p2p-deck-select-modal')?.classList.remove('hidden');
}

function cancelWaitingAndReset() {
    if (gameState.p2pNetwork) {
        try { gameState.p2pNetwork.disconnect(); } catch(e){}
    }
    document.getElementById('p2p-waiting-opponent-modal')?.classList.add('hidden');
    document.getElementById('p2p-deck-select-modal')?.classList.add('hidden');
    document.getElementById('p2p-room-select-screen')?.classList.remove('hidden');
}

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

    const waitModal = document.getElementById('p2p-waiting-opponent-modal');
    const waitText = document.getElementById('p2p-waiting-text');
    const codeBox = document.getElementById('p2p-room-code-display-box');
    const codeDisplay = document.getElementById('display-p2p-room-code');

    if (waitText) waitText.innerText = "通信初期化中... ⏳";
    if (waitModal) waitModal.classList.remove('hidden');

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
            const role = gameState.isHostMode ? "ホスト" : "ゲスト";
            console.log(`[P2P] 【LOG 2/4】[${role}] 相手のデッキを受信成功！`, opponentDeck);
            gameState.opponentDeckData = opponentDeck;

            if (gameState.isHostMode && gameState.myDeckReadyData && gameState.p2pManager) {
                console.log("[P2P] 【LOG 3】[ホスト] ゲストへ自分のデッキを返信試行...", gameState.myDeckReadyData);
                const success = gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
                console.log(`[P2P] 【LOG 3 結果】返信処理: ${success ? '成功' : '失敗'}`);
            }

            checkStartBattleSequence();
        },
        onOpponentHandStatUpdate: (statData) => {
            if (statData) {
                gameState.opponentHandStat = statData;
                refreshAllUI();
            }
        },
        onOpponentTurnChoice: (choice) => {
            console.log("[P2P] 相手のカード選択を受信しました:", choice);
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

    gameState.p2pNetwork.onConnectedCallback = () => {
        const role = gameState.isHostMode ? "ホスト" : "ゲスト";
        console.log(`[P2P] ✅ DataChannel確立！ 役割: ${role}`);

        if (!gameState.isHostMode) {
            if (gameState.myDeckReadyData && gameState.p2pManager) {
                console.log("[P2P] 【LOG 1】[ゲスト] ホストへ自分のデッキを送信試行...", gameState.myDeckReadyData);
                const success = gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
                console.log(`[P2P] 【LOG 1 結果】送信処理: ${success ? '成功' : '失敗'}`);
            } else {
                console.error("[P2P] 【LOG 1 失敗】[ゲスト] デッキデータまたはp2pManagerがセットされていません。");
            }
        }
    };

    gameState.p2pNetwork.onDisconnectedCallback = () => {
        if (!gameState.p2pNetwork.isHost) {
            alert("対戦相手（ホスト）が離脱したため、部屋作成画面に戻ります。");
            cancelWaitingAndReset();
        } else {
            gameState.opponentDeckData = null;
            if (waitText) waitText.innerText = "対戦相手が離脱しました。新しい対戦相手を待っています... ⏳";
            if (waitModal) waitModal.classList.remove('hidden');
        }
    };

    if (gameState.isHostMode) {
        try {
            await gameState.p2pNetwork.init(gameState.currentRoomId);
            if (waitText) waitText.innerText = "対戦相手の接続を待っています...";
            if (codeBox && codeDisplay) {
                codeDisplay.innerText = gameState.currentRoomCode;
                codeBox.classList.remove('hidden');
            }
        } catch (e) {
            alert("この部屋番号は既に使われている可能性があります。もう一度やり直してください。");
            cancelWaitingAndReset();
        }
    } else {
        if (codeBox) codeBox.classList.add('hidden');
        if (waitText) waitText.innerText = `部屋 【${gameState.currentRoomCode}】 へ接続中... ⏳`;

        try {
            console.log("[P2P] 1/3 ゲスト自身のPeer初期化を開始...");
            await gameState.p2pNetwork.init();
            
            console.log("[P2P] 2/3 ホストへの回線開通を待機中...", gameState.currentRoomId);
            await gameState.p2pNetwork.connectToHost(gameState.currentRoomId);

            console.log("[P2P] 3/3 回線開通完了！デッキデータの送信を開始します。");
            if (gameState.myDeckReadyData && gameState.p2pManager) {
                const success = gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
                console.log(`[P2P] 送信処理結果: ${success ? '成功' : '失敗'}`);
            }
        } catch (e) {
            console.error("[P2P] ゲスト接続フローエラー:", e);
            alert("部屋の接続に失敗しました。番号を確認してください。");
            cancelWaitingAndReset();
        }
    }
}

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

function sendMyHandStatUpdate() {
    if (!gameState.p2pManager) return;

    const handPowerSum = gameState.hand.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);

    const counts = { gu: 0, cho: 0, pa: 0 };
    const allMyCards = [
        ...(Array.isArray(gameState.hand) ? gameState.hand : []),
        ...(Array.isArray(gameState.deck) ? gameState.deck : [])
    ];

    allMyCards.forEach(card => {
        if (card && counts[card.janken] !== undefined) {
            counts[card.janken]++;
        }
    });

    gameState.p2pManager.sendHandStatUpdate({
        handPowerSum: handPowerSum,
        gu: counts.gu,
        cho: counts.cho,
        pa: counts.pa
    });
}

function checkStartBattleSequence() {
    console.log("[P2P] 開戦チェック:", { 
        myDeck: !!gameState.myDeckReadyData, 
        opponentDeck: !!gameState.opponentDeckData 
    });

    if (gameState.myDeckReadyData && !gameState.opponentDeckData && gameState.p2pManager) {
        gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
    }

    if (gameState.myDeckReadyData && gameState.opponentDeckData) {
        console.log("[P2P] ⚔️ 双方のデッキが揃いました！ 対戦を開始します。");
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

        sendMyHandStatUpdate();

        // ★ window.triggerTurnCutin を安全に呼び出すガード処理
        const cutinFn = window.triggerTurnCutin || (typeof triggerTurnCutin !== 'undefined' ? triggerTurnCutin : null);
        if (cutinFn) {
            cutinFn(1, () => {
                if (gameState.p2pManager) gameState.p2pManager.startTurnTimer();
            });
        } else {
            // 万が一カットイン関数がなくてもタイマーだけは確実に発動して進行させる
            if (gameState.p2pManager) gameState.p2pManager.startTurnTimer();
        }
    }
}

// 🟢 修正：選択完了時のバトル実行判定 (battle_engine.js へ委譲)
async function checkExecuteTurn() {
    console.log("[P2P Check] checkExecuteTurnが呼び出されました", {
        myChoice: gameState.myTurnChoice,
        opponentChoice: gameState.opponentTurnChoice
    });

    if (gameState.myTurnChoice && gameState.opponentTurnChoice) {
        console.log("[P2P] 双方のカード選択が揃いました！ 復元・計算を開始します。");

        try {
            // 自分の選択カードを自分の手札から取得
            const playerCards = gameState.myTurnChoice
                .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
                .filter(Boolean);

            // 相手の選択カードを全カードDBから直接復元
            const cpuCards = gameState.opponentTurnChoice
                .map(id => {
                    const found = gameState.allCards.find(c => String(c.id) === String(id));
                    return found ? { ...found } : null;
                })
                .filter(Boolean);

            console.log("[P2P] カード復元結果:", { playerCards, cpuCards });

            if (playerCards.length !== 3 || cpuCards.length !== 3) {
                console.error("[P2P 判定エラー] カードが3枚ずつ復元できませんでした。処理を中断します。", {
                    playerCardsCount: playerCards.length,
                    cpuCardsCount: cpuCards.length
                });
                return;
            }

            // フラグをクリア
            gameState.myTurnChoice = null;
            gameState.opponentTurnChoice = null;

            // ★ main.js と100%同一の battle_engine.js を呼び出し（計算 ➔ 演出 ➔ リザルト描画）
            if (window.executeBattleSequence) {
                await window.executeBattleSequence(playerCards, cpuCards, gameState, playSceneBGM);
            } else {
                console.error("[P2P Fatal] window.executeBattleSequence (battle_engine.js) が読み込まれていません。");
            }

        } catch (err) {
            console.error("[P2P Fatal Error] checkExecuteTurn 内で例外が発生しました:", err);
        }
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
    const btnCreateHost = document.getElementById('btn-create-host-room');
    if (btnCreateHost) btnCreateHost.onclick = handleCreateHostRoom;

    const btnJoinGuest = document.getElementById('btn-join-guest-room');
    if (btnJoinGuest) btnJoinGuest.onclick = handleJoinGuestRoom;

    const btnConfirmDeck = document.getElementById('btn-p2p-confirm-deck');
    if (btnConfirmDeck) btnConfirmDeck.onclick = () => { handleConfirmDeckSelection(); };

    const btnDeckCancel = document.getElementById('btn-p2p-deck-cancel');
    if (btnDeckCancel) btnDeckCancel.onclick = cancelWaitingAndReset;

    const btnCancelWait = document.getElementById('btn-cancel-waiting');
    if (btnCancelWait) btnCancelWait.onclick = cancelWaitingAndReset;

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
            const config = {
                ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
                SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
                DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
                DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
                GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
            }[master.category] || { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" };

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
    const { battleResult, playerCards } = gameState.lastBattleResult;

    // HP更新
    gameState.playerHp = Math.max(0, gameState.playerHp - battleResult.cpu.damageGiven);
    gameState.cpuHp = Math.max(0, gameState.cpuHp - battleResult.player.damageGiven);

    // 使用カードを手札から取り除き、山札からドローして5枚に補充
    const pUsedSet = new Set(playerCards.map(c => String(c.id || c.cardId)));
    gameState.hand = gameState.hand.filter(c => !pUsedSet.has(String(c.id || c.cardId)));

    while (gameState.hand.length < 5 && gameState.deck.length > 0) {
        gameState.hand.push(gameState.deck.shift());
    }

    gameState.turn += 1;
    refreshAllUI();

    // ★ 補充された新しい手札ステータス（危険度・じゃんけん枚数）を相手へ再送信
    sendMyHandStatUpdate();

    // ★ window.triggerTurnCutin を安全に呼び出すガード処理
    const cutinFn = window.triggerTurnCutin || (typeof triggerTurnCutin !== 'undefined' ? triggerTurnCutin : null);
    if (cutinFn) {
        cutinFn(gameState.turn, () => {
            if (gameState.p2pManager) gameState.p2pManager.startTurnTimer();
        });
    } else {
        if (gameState.p2pManager) gameState.p2pManager.startTurnTimer();
    }
}

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

function startRematchSequence() {
    gameState.myRematchRequest = false;
    gameState.opponentRematchRequest = false;

    resetP2PGameVariables();

    if (gameState.myDeckReadyData) {
        gameState.p2pManager.sendDeckReady(gameState.myDeckReadyData);
    }
    
    checkStartBattleSequence();
}

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
            
            cpuImgEl.className = "w-full h-full object-cover object-top aspect-[3/4]";

            if (imageName) {
                cpuImgEl.src = `images/${imageName}`;
            } else {
                cpuImgEl.src = 'images/default.jpg';
            }
            cpuImgEl.onerror = () => { cpuImgEl.src = 'images/default.jpg'; };
        }
    }

    const cpuGuEl = document.getElementById('cpu-deck-gu');
    const cpuChoEl = document.getElementById('cpu-deck-cho');
    const cpuPaEl = document.getElementById('cpu-deck-pa');

    const oppStat = gameState.opponentHandStat || { handPowerSum: 0, gu: 0, cho: 0, pa: 0 };

    if (cpuGuEl) cpuGuEl.innerText = `${oppStat.gu || 0}枚`;
    if (cpuChoEl) cpuChoEl.innerText = `${oppStat.cho || 0}枚`;
    if (cpuPaEl) cpuPaEl.innerText = `${oppStat.pa || 0}枚`;

    const handContainer = document.getElementById('player-hand-container');
    if (handContainer && gameModules && gameModules.renderBattleUI) {
        gameModules.renderBattleUI(handContainer, gameState, { 
            selectedCardIds: gameState.selectedCardIds,
            displayMode: gameState.displayMode
        });
    }

    const cpuJokerBox = document.getElementById('cpu-joker-box');
    const cpuDangerEl = document.getElementById('cpu-danger-level');

    if (cpuJokerBox && cpuDangerEl) {
        const cpuHandPowerSum = oppStat.handPowerSum || 0;

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
    const pokerInfo = typeof getPokerHandInfo === 'function' ? getPokerHandInfo(selectedCards) : { name: '選択中...', multiplier: 1.0 };

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
            const config = {
                ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
                SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
                DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
                DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
                GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
            }[master.category] || { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" };

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initP2PGame);
} else {
    initP2PGame();
}
