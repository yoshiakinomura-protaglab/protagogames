/**
 * js/quiz/quiz_storage.js - 典学モード 進行度セーブ ＆ カード獲得・覚醒置換
 */

const STORAGE_KEY_QUIZ_PROGRESS = 'yamato_quiz_progress_v2';
const STORAGE_KEY_OWNED_CARDS = 'yamato_owned_cards_v1';
const QUIZ_STORAGE_KEY_DECKS = 'yamato_縁_saved_decks_v1';

function getQuizProgress() {
    const defaultData = {
        nara: {
            basic: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            normal: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            hard: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 }
        }
    };
    const raw = localStorage.getItem(STORAGE_KEY_QUIZ_PROGRESS);
    if (!raw) return defaultData;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.nara) parsed.nara = defaultData.nara;
        return parsed;
    } catch (e) {
        return defaultData;
    }
}

function saveQuizProgress(data) {
    localStorage.setItem(STORAGE_KEY_QUIZ_PROGRESS, JSON.stringify(data));
}

// 試練のアンロック判定（第1試練は常に解放、以降は前試練満点クリアが条件）
function isTrialUnlocked(eraId, levelId, trialIndex) {
    if (trialIndex === 0) return true;
    const progress = getQuizProgress();
    const lvlProg = progress[eraId]?.[levelId] || { stagesCleared: 0 };
    return (lvlProg.stagesCleared || 0) >= trialIndex;
}

// 昇段ランダム検定のアンロック判定（最終試練を満点クリア済みか）
function isRandomTestUnlocked(eraId, levelId, totalStages) {
    const progress = getQuizProgress();
    const lvlProg = progress[eraId]?.[levelId] || { stagesCleared: 0 };
    return (lvlProg.stagesCleared || 0) >= totalStages;
}

// 初回満点クリア報酬（通常カード付与）
function grantNormalRewardCard(normalId, cardName) {
    let owned = [];
    try {
        owned = JSON.parse(localStorage.getItem(STORAGE_KEY_OWNED_CARDS)) || [];
    } catch(e) { owned = []; }

    const hasCard = owned.some(c => c.id === normalId || c.id === `${normalId}_awk`);
    if (!hasCard) {
        owned.push({
            id: normalId,
            name: cardName,
            acquiredAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEY_OWNED_CARDS, JSON.stringify(owned));
        return true;
    }
    return false;
}

// 10周達成報酬（所持カード＆保存デッキ1〜10内の通常IDを覚醒IDに置換）
function replaceWithAwakenedCard(normalId, awakenedId, cardName) {
    let owned = [];
    try {
        owned = JSON.parse(localStorage.getItem(STORAGE_KEY_OWNED_CARDS)) || [];
    } catch(e) { owned = []; }

    if (owned.some(c => c.id === awakenedId)) return false;

    // 1. 所持リスト置換
    owned = owned.filter(c => c.id !== normalId);
    owned.push({
        id: awakenedId,
        name: `${cardName}【覚醒】`,
        acquiredAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY_OWNED_CARDS, JSON.stringify(owned));

    // 2. 編成中デッキ（1〜10）内の通常IDを覚醒IDに置換
    try {
        const rawDecks = localStorage.getItem(QUIZ_STORAGE_KEY_DECKS);
        if (rawDecks) {
            const decks = JSON.parse(rawDecks);
            let deckUpdated = false;

            Object.keys(decks).forEach(deckIndex => {
                const deck = decks[deckIndex];
                if (!deck) return;

                if (deck.jokerId === normalId) {
                    deck.jokerId = awakenedId;
                    deckUpdated = true;
                }

                if (Array.isArray(deck.cardIds)) {
                    deck.cardIds = deck.cardIds.map(id => {
                        if (id === normalId) {
                            deckUpdated = true;
                            return awakenedId;
                        }
                        return id;
                    });
                }
            });

            if (deckUpdated) {
                localStorage.setItem(QUIZ_STORAGE_KEY_DECKS, JSON.stringify(decks));
            }
        }
    } catch(e) {
        console.error("デッキ内ID置換失敗:", e);
    }

    return true;
}