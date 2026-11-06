/**
 * currency_manager.js - 勾玉（通貨）統合管理システム
 */

// ==========================================
// ★ 勾玉バランス設定マスタ（数値調整はここだけで完結します）
// ==========================================
const MAGATAMA_CONFIG = {
    // 初期配布
    INITIAL_BONUS: 0,             // 初回起動時（プロローグ報酬で賄うため0に設定）

    // ガチャ消費量
    GACHA_SINGLE_COST: 300,       // 単発ガチャ消費量
    GACHA_MULTI_COST: 3000,       // 十連ガチャ消費量

    // ★ ストーリーモード
    STORY_PROLOGUE_CLEAR: 6000,   // プロローグクリア（10連2回分）

    // ★ フリーバトル（演習）初回クリア報酬
    FREE_BATTLE_FIRST_EASY: 3000,   // ★ 初回クリア (10連1回分)
    FREE_BATTLE_FIRST_NORMAL: 3000, // ★★ 初回クリア (10連1回分)
    FREE_BATTLE_FIRST_HARD: 3000,   // ★★★ 初回クリア (10連1回分)

    // ★ フリーバトル（演習）2回目以降の周回報酬
    FREE_BATTLE_REPEAT_EASY: 100,   // ★ 2回目以降勝利
    FREE_BATTLE_REPEAT_NORMAL: 200, // ★★ 2回目以降勝利
    FREE_BATTLE_REPEAT_HARD: 300,   // ★★★ 2回目以降勝利
    FREE_BATTLE_LOSE: 50,           // 敗北（共通）

    // ★ P2P対戦
    P2P_WIN: 300,                 // 勝利
    P2P_LOSE: 100                 // 敗北
};

const STORAGE_KEY_CURRENCY = 'yamato_user_currency';

// ==========================================
// データ取得 ＆ 初期化コア
// ==========================================
function getMagatamaData() {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENCY);
    if (!raw) {
        // 初回起動時：マスタの初期値を付与して保存
        const initialData = {
            amount: MAGATAMA_CONFIG.INITIAL_BONUS,
            isInitialized: true
        };
        localStorage.setItem(STORAGE_KEY_CURRENCY, JSON.stringify(initialData));
        return initialData;
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        return { amount: MAGATAMA_CONFIG.INITIAL_BONUS, isInitialized: true };
    }
}

// 現在の所持勾玉数を取得
function getMagatamaCount() {
    return getMagatamaData().amount || 0;
}

// 所持勾玉数を更新してカスタムイベントを発行
function setMagatamaCount(newAmount) {
    const data = getMagatamaData();
    data.amount = Math.max(0, newAmount);
    localStorage.setItem(STORAGE_KEY_CURRENCY, JSON.stringify(data));
    
    // UIリアルタイム更新用のイベントを発火
    window.dispatchEvent(new CustomEvent('magatamaUpdated', { detail: { amount: data.amount } }));
    return data.amount;
}

// ==========================================
// 報酬付与API
// ==========================================
function grantMagatamaReward(eventKey) {
    const rewardAmount = MAGATAMA_CONFIG[eventKey] || 0;
    if (rewardAmount <= 0) return 0;

    const current = getMagatamaCount();
    const updated = setMagatamaCount(current + rewardAmount);

    console.log(`[勾玉獲得] ${eventKey}: +${rewardAmount} (現在: ${updated})`);
    return rewardAmount;
}

// Direct加算用 (数値を直接指定したい場合)
function addMagatamaDirect(amount) {
    if (amount === 0) return getMagatamaCount();
    const current = getMagatamaCount();
    return setMagatamaCount(current + amount);
}

// ==========================================
// ガチャ消費API
// ==========================================
function consumeMagatamaForGacha(type) {
    const cost = type === 'multi' 
        ? MAGATAMA_CONFIG.GACHA_MULTI_COST 
        : MAGATAMA_CONFIG.GACHA_SINGLE_COST;

    const current = getMagatamaCount();
    if (current < cost) {
        return { success: false, current, cost, need: cost - current };
    }

    const updated = setMagatamaCount(current - cost);
    return { success: true, current: updated, consumed: cost };
}

// グローバル公開
window.MAGATAMA_CONFIG = MAGATAMA_CONFIG;
window.getMagatamaCount = getMagatamaCount;
window.setMagatamaCount = setMagatamaCount;
window.grantMagatamaReward = grantMagatamaReward;
window.addMagatamaDirect = addMagatamaDirect;
window.consumeMagatamaForGacha = consumeMagatamaForGacha;