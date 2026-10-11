/**
 * p2p_main.js - オンラインP2P対戦専用メインモジュール
 * 役割: P2P通信同期、20枚デッキハンドシェイク、毎ターンの同時カード選択、30秒タイマー、演出（battle-animation.js）の呼び出し
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
    bgmMaster: [],
    turn: 1,
    maxTurn: 5,
    playerHp: INITIAL_HP,
    cpuHp: INITIAL_HP,
    lastBattleResult: null,
    turnHistory: [],
    p2pNetwork: null,
    p2pManager: null,
    opponentReady: false
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

    // デフォルトフォールバック
    if (!gameState.playerDeckIds || gameState.playerDeckIds.length !== 20) {
        gameState.playerDeckIds = gameState.allCards.slice(0, 20).map(c => String(c.id));
    }

    resetP2PGameVariables();
    playSceneBGM('d01', true);
    setupEventListeners();

    // 2. P2P通信マネージャーの初期化 ＆ 自動ハンドシェイク
    initP2PNetworkConnection();

    refreshAllUI();
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

// -------------------------------------------------------------
// P2P通信の初期化・ハンドシェイク・同期
// -------------------------------------------------------------
function initP2PNetworkConnection() {
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
                gameState.p2pManager.sendTurnChoice([...gameState.selectedCardIds]);
            }
        },
        setupOpponentData: (opponentDeckData) => {
            if (!opponentDeckData) return;

            // 相手のJOKER設定
            gameState.cpuJoker = gameState.allCards.find(c => String(c.id) === String(opponentDeckData.jokerId)) || gameState.allCards[0];

            // 相手の20枚デッキを展開＆シャッフル
            const fullCards = [];
            const allIds = [opponentDeckData.jokerId, ...(opponentDeckData.cardIds || [])];
            allIds.forEach(id => {
                const card = gameState.allCards.find(c => String(c.id) === String(id));
                if (card) fullCards.push({ ...card });
            });

            const shuffled = [...fullCards].sort(() => Math.random() - 0.5);
            gameState.cpuHand = shuffled.slice(0, 5);
            gameState.cpuDeck = shuffled.slice(5);

            gameState.opponentReady = true;
            refreshAllUI();
        },
        onP2PBattleStart: () => {
            refreshAllUI();
            triggerTurnCutin(1, () => {
                gameState.p2pManager.startTurnTimer();
            });
        },
        // 双方の選択3枚が揃った時の同期実行
        executeP2PBattle: async (mySelectedIds, opponentSelectedIds) => {
            const playerCards = mySelectedIds
                .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
                .filter(Boolean);

            const cpuCards = opponentSelectedIds
                .map(id => gameState.cpuHand.find(c => String(c.id || c.cardId) === String(id)))
                .filter(Boolean);

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
    });

    // P2P通信初期化＆自身の20枚デッキを送信
    gameState.p2pNetwork.init().then(() => {
        // 自軍のデッキ構成データを相手に送信
        const jId = gameState.playerDeckIds[0];
        const cIds = gameState.playerDeckIds.slice(1);
        gameState.p2pManager.sendMyDeck({ jokerId: jId, cardIds: cIds });
    });
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

    const confirmBtn = document.getElementById('btn-modal-confirm');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            hideBattleConfirmModal();
            if (gameState.p2pManager) {
                gameState.p2pManager.sendTurnChoice([...gameState.selectedCardIds]);
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

    const pokerInfo = getPokerHandInfo(selectedCards);
    const pokerEl = document.getElementById('modal-confirm-poker');
    if (pokerEl) pokerEl.innerText = pokerInfo.name;

    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerMult = pokerInfo.multiplier;

    const totalAtk = Math.round(basePowerSum * pokerMult);
    const totalDef = Math.round(basePowerSum * pokerMult);

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

    const isGameOver = (
        gameState.playerHp - battleResult.cpu.damageGiven <= 0 ||
        gameState.cpuHp - battleResult.player.damageGiven <= 0 ||
        gameState.turn >= gameState.maxTurn
    );

    const animData = {
        cpuCards: formattedCpuCards,
        enemyBaseAtk: battleResult.cpu.basePowerSum,
        enemyBaseDef: battleResult.cpu.basePowerSum,
        tags: [],
        poker: { name: battleResult.cpu.pokerInfo.name, multiplier: battleResult.cpu.pokerMult },
        janken: {
            title: `⚔️ じゃんけん結果：${battleResult.jankenResultText}`,
            sub: `自軍補正 ×${battleResult.player.jankenMult} / 敵軍補正 ×${battleResult.cpu.jankenMult}`,
            atkMult: battleResult.cpu.jankenMult,
            defMult: battleResult.cpu.jankenMult
        },
        playerBaseAtk: calcAtkVal,
        playerBaseDef: calcDefVal,
        playerAfterJankenAtk: Math.round(calcAtkVal * (battleResult.player.jankenMult || 1.0)),
        playerAfterJankenDef: Math.round(calcDefVal * (battleResult.player.jankenMult || 1.0)),
        playerAtk: battleResult.player.finalAtk,
        playerDef: battleResult.player.finalDef,
        enemyFinalAtk: battleResult.cpu.finalAtk,
        enemyFinalDef: battleResult.cpu.finalDef,
        isGameOver: isGameOver
    };

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

        showGameResultCutin(resultType);
    } else {
        showTurnResultModal(playerCards, cpuCards, battleResult);
    }
}

function showTurnResultModal(playerCards, cpuCards, battleResult) {
    const modal = document.getElementById('turn-result-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
}

function proceedToNextTurn() {
    const modal = document.getElementById('turn-result-modal');
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

function showGameResultCutin(resultType) {
    const modal = document.getElementById('game-result-cutin-modal');
    const cutinImg = document.getElementById('result-cutin-img');
    const titleBtn = document.getElementById('btn-cutin-title');

    if (!modal || !cutinImg) return;

    cutinImg.src = `images/himiko_${resultType}.jpg`;
    cutinImg.onerror = () => { cutinImg.src = 'images/default.jpg'; };

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('active'));

    if (titleBtn) {
        titleBtn.onclick = () => {
            stopEraBGM();
            sessionStorage.removeItem('isP2PMatch');
            window.location.href = 'title.html';
        };
    }
}

function refreshAllUI() {
    const turnEl = document.getElementById('current-turn-num');
    if (turnEl) turnEl.innerText = `${Math.min(gameState.turn, gameState.maxTurn)}/${gameState.maxTurn}`;

    updateBattleStartButtonUI();

    const playerHpEl = document.getElementById('player-hp-text');
    if (playerHpEl) playerHpEl.innerText = `${gameState.playerHp.toLocaleString()} / ${INITIAL_HP.toLocaleString()}`;

    const playerHpBar = document.getElementById('player-hp-bar');
    if (playerHpBar) {
        const playerPct = Math.max(0, Math.min(100, (gameState.playerHp / INITIAL_HP) * 100));
        playerHpBar.style.width = `${playerPct}%`;
    }

    const cpuHpEl = document.getElementById('cpu-hp-text');
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
            cpuImgEl.src = imageName ? `images/${imageName}` : 'images/default.jpg';
        }
    }

    const handContainer = document.getElementById('player-hand-container');
    if (handContainer && gameModules && gameModules.renderBattleUI) {
        gameModules.renderBattleUI(handContainer, gameState, { 
            selectedCardIds: gameState.selectedCardIds,
            displayMode: gameState.displayMode
        });
    }

    updateCalculatorUI();
}

function getPokerHandInfo(cards) {
    if (!cards || cards.length !== 3) return { name: '役なし', multiplier: 1.0 };
    const ranks = cards.map(c => String(c.rank || '1').toUpperCase());
    const jokerCount = ranks.filter(r => r === 'JOKER' || r === 'JK').length;
    if (jokerCount >= 2) return { name: 'スリーカード ✨2.0倍', multiplier: 2.0 };
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { name: 'スリーカード ✨2.0倍', multiplier: 2.0 };
    return { name: '役なし', multiplier: 1.0 };
}

function updateCalculatorUI() {
    const atkEl = document.getElementById('calc-total-atk');
    const defEl = document.getElementById('calc-total-def');

    const selectedCards = gameState.selectedCardIds
        .map(id => gameState.hand.find(c => String(c.id || c.cardId) === String(id)))
        .filter(Boolean);
    const count = selectedCards.length;

    const basePowerSum = selectedCards.reduce((sum, card) => sum + (parseInt(card.power, 10) || 0), 0);
    const pokerInfo = getPokerHandInfo(selectedCards);

    const totalAtk = count > 0 ? Math.round(basePowerSum * pokerInfo.multiplier) : 0;
    const totalDef = count > 0 ? Math.round(basePowerSum * pokerInfo.multiplier) : 0;

    if (atkEl) atkEl.innerText = totalAtk.toLocaleString();
    if (defEl) defEl.innerText = totalDef.toLocaleString();
}

function calculateBattleResult(playerCards, cpuCards, tagMaster) {
    const pPower = playerCards.reduce((sum, c) => sum + (parseInt(c.power, 10) || 0), 0);
    const cPower = cpuCards.reduce((sum, c) => sum + (parseInt(c.power, 10) || 0), 0);

    const pPoker = getPokerHandInfo(playerCards);
    const cPoker = getPokerHandInfo(cpuCards);

    const pFinalAtk = Math.round(pPower * pPoker.multiplier);
    const pFinalDef = Math.round(pPower * pPoker.multiplier);
    const cFinalAtk = Math.round(cPower * cPoker.multiplier);
    const cFinalDef = Math.round(cPower * cPoker.multiplier);

    const damageToCpu = Math.max(0, pFinalAtk - cFinalDef);
    const damageToPlayer = Math.max(0, cFinalAtk - pFinalDef);

    return {
        jankenResultText: "引き分け",
        player: { basePowerSum: pPower, pokerInfo: pPoker, pokerMult: pPoker.multiplier, jankenMult: 1.0, finalAtk: pFinalAtk, finalDef: pFinalDef, damageGiven: damageToCpu },
        cpu: { basePowerSum: cPower, pokerInfo: cPoker, pokerMult: cPoker.multiplier, jankenMult: 1.0, finalAtk: cFinalAtk, finalDef: cFinalDef, damageGiven: damageToPlayer }
    };
}

function triggerTurnCutin(turnNumber, callback) {
    const overlay = document.getElementById('turn-cutin-overlay');
    const textEl = document.getElementById('turn-cutin-text');

    if (!overlay || !textEl) {
        if (callback) callback();
        return;
    }

    textEl.innerText = `第${turnNumber}陣 開始！`;
    overlay.classList.remove('hidden');

    requestAnimationFrame(() => {
        setTimeout(() => overlay.classList.add('active'), 20);
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