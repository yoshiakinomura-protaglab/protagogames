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

    if (!gameState.playerDeckIds || gameState.playerDeckIds.length !== 20) {
        gameState.playerDeckIds = gameState.allCards.slice(0, 20).map(c => String(c.id));
    }

    resetP2PGameVariables();
    playSceneBGM('d01', true);
    setupEventListeners();

    // 2. P2P通信マネージャーの初期化 ＆ ハンドシェイク
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
                if (gameState.p2pManager) gameState.p2pManager.startTurnTimer();
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

            // 本格戦闘判定エンジン（特性タグ・ジャンケン・ポーカー役フル対応）
            const battleResult = calculateBattleResultFull(playerCards, cpuCards, gameState.tagMaster);
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

    const sideEval = evaluateSide(selectedCards, gameState.tagMaster);

    const jankenEl = document.getElementById('modal-confirm-janken');
    if (jankenEl) jankenEl.innerText = sideEval.jankenSummary;

    const pokerEl = document.getElementById('modal-confirm-poker');
    if (pokerEl) pokerEl.innerText = sideEval.pokerInfo.name;

    const tagsContainer = document.getElementById('modal-confirm-tags');
    if (tagsContainer) {
        if (sideEval.activeTags.length === 0) {
            tagsContainer.innerHTML = `<span class="col-span-2 text-xs text-slate-500 italic text-center py-2">発動特性なし</span>`;
        } else {
            tagsContainer.innerHTML = sideEval.activeTags.map(t => {
                const conf = CATEGORY_CONFIG[t.category] || CATEGORY_CONFIG.GEN;
                return `
                    <div class="flex items-center justify-between p-1.5 rounded-lg border ${conf.color} text-xs font-bold shadow">
                        <span class="flex items-center gap-1 truncate">
                            <i class="fa-solid ${conf.icon}"></i>
                            <span class="truncate">${t.name} (${t.rank})</span>
                        </span>
                        <span class="font-mono text-amber-300 ml-1">x${t.mult.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
        }
    }

    const atkEl = document.getElementById('modal-confirm-atk');
    const defEl = document.getElementById('modal-confirm-def');
    if (atkEl) atkEl.innerText = sideEval.finalAtk.toLocaleString();
    if (defEl) defEl.innerText = sideEval.finalDef.toLocaleString();

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
// バトル演出再生・リザルトモーダル連動
// -------------------------------------------------------------
async function runBattleAnimation(playerCards, cpuCards, battleResult) {
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

    // 演出アニメーション（battle-animation.js）が欲しがる完全データを生成
    const animData = {
        cpuCards: formattedCpuCards,
        enemyBaseAtk: battleResult.cpu.basePowerSum,
        enemyBaseDef: battleResult.cpu.basePowerSum,
        tags: battleResult.cpu.activeTags.map(t => ({
            name: `${t.name}(${t.rank})`,
            category: t.category,
            targetIndexes: t.cardIndexes,
            atkMult: battleResult.cpu.atkMult,
            defMult: battleResult.cpu.defMult,
            debMult: t.mult
        })),
        poker: { name: battleResult.cpu.pokerInfo.name, multiplier: battleResult.cpu.pokerMult },
        janken: {
            title: `⚔️ じゃんけん結果：${battleResult.jankenResultText}`,
            sub: `自軍補正 ×${battleResult.player.jankenMult} / 敵軍補正 ×${battleResult.cpu.jankenMult}`,
            atkMult: battleResult.cpu.jankenMult,
            defMult: battleResult.cpu.jankenMult
        },
        playerBaseAtk: battleResult.player.basePowerSum,
        playerBaseDef: battleResult.player.basePowerSum,
        playerAfterJankenAtk: Math.round(battleResult.player.basePowerSum * battleResult.player.atkMult * battleResult.player.pokerMult * battleResult.player.jankenMult),
        playerAfterJankenDef: Math.round(battleResult.player.basePowerSum * battleResult.player.defMult * battleResult.player.pokerMult * battleResult.player.jankenMult),
        playerAtk: battleResult.player.finalAtk,
        playerDef: battleResult.player.finalDef,
        enemyFinalAtk: battleResult.cpu.finalAtk,
        enemyFinalDef: battleResult.cpu.finalDef,
        playerDebuffs: battleResult.cpu.activeTags.filter(t => t.category === 'DEB'),
        enemyDebuffs: battleResult.player.activeTags.filter(t => t.category === 'DEB'),
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

// ターン結果リザルト（明細レシート）の描画
function showTurnResultModal(playerCards, cpuCards, battleResult) {
    const modal = document.getElementById('turn-result-modal');
    if (!modal) return;

    const setCardsHTML = (containerId, cards) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = cards.map(c => {
            const img = (gameState.displayMode === 'real' ? c.imageReal : c.imageIllust) || `${c.id}_illust.jpg`;
            return `
                <div class="aspect-[3/4] bg-slate-900 rounded overflow-hidden border border-slate-700">
                    <img src="images/${img}" class="w-full h-full object-cover">
                </div>
            `;
        }).join('');
    };

    setCardsHTML('res-p-cards', playerCards);
    setCardsHTML('res-c-cards', cpuCards);

    document.getElementById('res-p-power').innerText = battleResult.player.basePowerSum.toLocaleString();
    document.getElementById('res-c-power').innerText = battleResult.cpu.basePowerSum.toLocaleString();

    document.getElementById('res-p-poker').innerText = battleResult.player.pokerInfo.name;
    document.getElementById('res-c-poker').innerText = battleResult.cpu.pokerInfo.name;

    const renderTagList = (targetId, catKey) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        const pTags = battleResult.player.activeTags.filter(t => t.category === catKey);
        const cTags = battleResult.cpu.activeTags.filter(t => t.category === catKey);

        if (pTags.length === 0 && cTags.length === 0) {
            el.innerHTML = `<div class="text-[10px] text-slate-600 italic">発動なし</div>`;
            return;
        }

        let html = '';
        const maxLen = Math.max(pTags.length, cTags.length);
        for (let i = 0; i < maxLen; i++) {
            const pt = pTags[i];
            const ct = cTags[i];
            html += `
                <div class="grid grid-cols-12 gap-2 text-[11px] items-center">
                    <div class="col-span-5 text-emerald-300 truncate">${pt ? `${pt.name}(${pt.rank}) x${pt.mult.toFixed(2)}` : '-'}</div>
                    <div class="col-span-2 text-center text-slate-700">|</div>
                    <div class="col-span-5 text-rose-300 truncate">${ct ? `${ct.name}(${ct.rank}) x${ct.mult.toFixed(2)}` : '-'}</div>
                </div>
            `;
        }
        el.innerHTML = html;
    };

    renderTagList('res-list-gen', 'GEN');
    renderTagList('res-list-atk', 'ATK');
    renderTagList('res-list-def', 'DEF');
    renderTagList('res-list-sup', 'SUP');
    renderTagList('res-list-deb', 'DEB');

    document.getElementById('res-mid-p-atk').innerText = Math.round(battleResult.player.basePowerSum * battleResult.player.atkMult * battleResult.player.pokerMult).toLocaleString();
    document.getElementById('res-mid-p-def').innerText = Math.round(battleResult.player.basePowerSum * battleResult.player.defMult * battleResult.player.pokerMult).toLocaleString();
    document.getElementById('res-mid-c-atk').innerText = Math.round(battleResult.cpu.basePowerSum * battleResult.cpu.atkMult * battleResult.cpu.pokerMult).toLocaleString();
    document.getElementById('res-mid-c-def').innerText = Math.round(battleResult.cpu.basePowerSum * battleResult.cpu.defMult * battleResult.cpu.pokerMult).toLocaleString();

    document.getElementById('res-janken-text').innerText = battleResult.jankenResultText;
    document.getElementById('res-p-janken-mult').innerText = `自軍補正: x${battleResult.player.jankenMult}`;
    document.getElementById('res-c-janken-mult').innerText = `敵軍補正: x${battleResult.cpu.jankenMult}`;

    document.getElementById('res-final-p-atk').innerText = battleResult.player.finalAtk.toLocaleString();
    document.getElementById('res-final-p-def').innerText = battleResult.player.finalDef.toLocaleString();
    document.getElementById('res-final-c-atk').innerText = battleResult.cpu.finalAtk.toLocaleString();
    document.getElementById('res-final-c-def').innerText = battleResult.cpu.finalDef.toLocaleString();

    document.getElementById('res-damage-given-cpu').innerText = battleResult.player.damageGiven.toLocaleString();
    document.getElementById('res-damage-given-player').innerText = battleResult.cpu.damageGiven.toLocaleString();

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

// -------------------------------------------------------------
// 本格戦闘判定エンジン（特性タグ・ポーカー役・ジャンケン判定）
// -------------------------------------------------------------
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

    const sideEval = evaluateSide(selectedCards, gameState.tagMaster);

    if (atkEl) atkEl.innerText = sideEval.finalAtk.toLocaleString();
    if (defEl) defEl.innerText = sideEval.finalDef.toLocaleString();

    const jankenIconsEl = document.getElementById('calc-janken-icons');
    if (jankenIconsEl) jankenIconsEl.innerText = sideEval.jankenSummary;

    const pokerRanksEl = document.getElementById('calc-poker-ranks');
    if (pokerRanksEl) pokerRanksEl.innerText = sideEval.pokerInfo.name;

    const activeTagsEl = document.getElementById('calc-active-tags');
    if (activeTagsEl) {
        if (sideEval.activeTags.length === 0) {
            activeTagsEl.innerHTML = `<div class="col-span-2 text-xs text-slate-500 italic text-center py-4">発動特性なし</div>`;
        } else {
            activeTagsEl.innerHTML = sideEval.activeTags.map(t => {
                const conf = CATEGORY_CONFIG[t.category] || CATEGORY_CONFIG.GEN;
                return `
                    <div class="flex items-center justify-between p-1 rounded border ${conf.color} text-xs font-bold">
                        <span class="truncate"><i class="fa-solid ${conf.icon} mr-1"></i>${t.name}</span>
                        <span class="font-mono text-amber-300">x${t.mult.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
        }
    }
}

function evaluateSide(cards, tagMaster) {
    if (!cards || cards.length === 0) {
        return { basePowerSum: 0, pokerInfo: { name: '役なし', multiplier: 1.0 }, activeTags: [], atkMult: 1.0, defMult: 1.0, finalAtk: 0, finalDef: 0, jankenSummary: '-' };
    }

    const basePowerSum = cards.reduce((sum, c) => sum + (parseInt(c.power, 10) || 0), 0);
    const pokerInfo = getPokerHandInfo(cards);

    const jankenIcons = cards.map(c => {
        if (c.janken === 'gu') return '✊';
        if (c.janken === 'cho') return '✌️';
        if (c.janken === 'pa') return '✋';
        return '❓';
    }).join(' ');

    const tagCounts = {};
    const tagCardIndexes = {};

    cards.forEach((c, cardIdx) => {
        const tList = Array.isArray(c.tags) ? c.tags : (c.tags ? String(c.tags).split(',') : []);
        tList.forEach(rawTag => {
            const cleanTag = String(rawTag).replace(/[\(（].*?[\)）]/, '').trim();
            if (!cleanTag) return;
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
            if (!tagCardIndexes[cleanTag]) tagCardIndexes[cleanTag] = [];
            tagCardIndexes[cleanTag].push(cardIdx);
        });
    });

    const activeTags = [];
    let atkMult = 1.0;
    let defMult = 1.0;

    Object.keys(tagCounts).forEach(tagName => {
        const count = tagCounts[tagName];
        const master = tagMaster[tagName];
        if (master) {
            const min = master.minCards || 1;
            if (count >= min) {
                let m = 1.0;
                if (count === 1) m = master.mult1;
                else if (count === 2) m = master.mult2;
                else if (count >= 3) m = master.mult3;

                activeTags.push({
                    name: tagName,
                    category: master.category,
                    rank: master.rank,
                    mult: m,
                    cardIndexes: tagCardIndexes[tagName] || []
                });

                if (master.category === 'ATK') atkMult *= m;
                if (master.category === 'DEF') defMult *= m;
                if (master.category === 'GEN' || master.category === 'SUP') {
                    atkMult *= m;
                    defMult *= m;
                }
            }
        }
    });

    const finalAtk = Math.round(basePowerSum * atkMult * pokerInfo.multiplier);
    const finalDef = Math.round(basePowerSum * defMult * pokerInfo.multiplier);

    return {
        basePowerSum,
        pokerInfo,
        activeTags,
        atkMult,
        defMult,
        finalAtk,
        finalDef,
        jankenSummary: jankenIcons
    };
}

function calculateBattleResultFull(playerCards, cpuCards, tagMaster) {
    const pEval = evaluateSide(playerCards, tagMaster);
    const cEval = evaluateSide(cpuCards, tagMaster);

    const getJankenCounts = (cards) => {
        const counts = { gu: 0, cho: 0, pa: 0 };
        cards.forEach(c => {
            if (c.janken && counts[c.janken] !== undefined) counts[c.janken]++;
        });
        return counts;
    };

    const pJ = getJankenCounts(playerCards);
    const cJ = getJankenCounts(cpuCards);

    let pWins = 0;
    let cWins = 0;

    const types = ['gu', 'cho', 'pa'];
    const winsAgainst = { gu: 'cho', cho: 'pa', pa: 'gu' };

    types.forEach(t1 => {
        const target = winsAgainst[t1];
        const score = Math.min(pJ[t1], cJ[target]);
        pWins += score;
    });

    types.forEach(t2 => {
        const target = winsAgainst[t2];
        const score = Math.min(cJ[t2], pJ[target]);
        cWins += score;
    });

    let jankenResultText = "引き分け";
    let pJankenMult = 1.0;
    let cJankenMult = 1.0;

    if (pWins > cWins) {
        jankenResultText = "自軍勝利 (+20%補正)";
        pJankenMult = 1.2;
        cJankenMult = 0.8;
    } else if (cWins > pWins) {
        jankenResultText = "敵軍勝利 (敵+20%補正)";
        pJankenMult = 0.8;
        cJankenMult = 1.2;
    }

    // デバフ適用
    let pDebuffMult = 1.0;
    pEval.activeTags.filter(t => t.category === 'DEB').forEach(t => pDebuffMult *= t.mult);

    let cDebuffMult = 1.0;
    cEval.activeTags.filter(t => t.category === 'DEB').forEach(t => cDebuffMult *= t.mult);

    const pFinalAtk = Math.round(pEval.finalAtk * pJankenMult * cDebuffMult);
    const pFinalDef = Math.round(pEval.finalDef * pJankenMult * cDebuffMult);

    const cFinalAtk = Math.round(cEval.finalAtk * cJankenMult * pDebuffMult);
    const cFinalDef = Math.round(cEval.finalDef * cJankenMult * pDebuffMult);

    const damageToCpu = Math.max(0, pFinalAtk - cFinalDef);
    const damageToPlayer = Math.max(0, cFinalAtk - pFinalDef);

    return {
        jankenResultText,
        player: {
            basePowerSum: pEval.basePowerSum,
            pokerInfo: pEval.pokerInfo,
            pokerMult: pEval.pokerInfo.multiplier,
            activeTags: pEval.activeTags,
            atkMult: pEval.atkMult,
            defMult: pEval.defMult,
            jankenMult: pJankenMult,
            finalAtk: pFinalAtk,
            finalDef: pFinalDef,
            damageGiven: damageToCpu
        },
        cpu: {
            basePowerSum: cEval.basePowerSum,
            pokerInfo: cEval.pokerInfo,
            pokerMult: cEval.pokerInfo.multiplier,
            activeTags: cEval.activeTags,
            atkMult: cEval.atkMult,
            defMult: cEval.defMult,
            jankenMult: cJankenMult,
            finalAtk: cFinalAtk,
            finalDef: cFinalDef,
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
