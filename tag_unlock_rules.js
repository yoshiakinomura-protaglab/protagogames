/**
 * tag_unlock_rules.js - 特性タグ解放判定エンジン（外部データ非同期連動版）
 */

let tagUnlockRulesDb = [];
let cachedCardsDb = []; // cards.csv のキャッシュ用

/**
 * 1. 解放ルールCSV（tag_unlock_rules.csv）のロード
 */
async function loadTagUnlockRules() {
    try {
        const response = await fetch('tag_unlock_rules.csv');
        if (!response.ok) throw new Error("tag_unlock_rules.csv ロード失敗");
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        
        tagUnlockRulesDb = lines.slice(1).map(line => {
            if (!line.trim()) return null;
            const cols = line.split(',').map(c => c.trim());
            const row = {};
            headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
            return row;
        }).filter(Boolean);

        console.log("📜 [TagRules] タグ解放ルールをロードしました", tagUnlockRulesDb);
    } catch (e) {
        console.warn("⚠️ tag_unlock_rules.csv の読み込みエラー:", e);
    }
}

/**
 * cards.csv データをセット（デバッグツールやタイトル画面から読み込み時にキャッシュ）
 */
function setCachedCardsDb(cardsDb) {
    cachedCardsDb = cardsDb;
}

/**
 * 2. 解放可否判定メインロジック
 */
function canUnlockTag(tagName, cardsDb = cachedCardsDb) {
    // デバッグモード時は全解放
    if (typeof getAppMode === 'function' && getAppMode() === 'DEBUG_ALL') return true;

    // 解放済みチェック
    const hero = getHeroData();
    if (hero.unlockedTags && hero.unlockedTags.includes(tagName)) return true;

    const collection = getUserCollection();
    const rule = tagUnlockRulesDb.find(r => r.tag === tagName);

    // ルール未定義の場合はCランク扱い（関連カード1枚所持で解放）
    if (!rule) {
        return checkTagTotalOwnedCount(tagName, 1, collection, cardsDb);
    }

    const reqCount = Number(rule.required_count) || 1;

    switch (rule.unlock_type) {
        case 'INITIAL':
            return true;

        case 'SPECIFIC_CARD':
            // 特定のカードIDの所持枚数をチェック
            const cardId = String(rule.target_card_id);
            return (collection[cardId] || 0) >= reqCount;

        case 'TAG_SUM':
        default:
            // タグ持ちカードの合計所持数をチェック
            return checkTagTotalOwnedCount(tagName, reqCount, collection, cardsDb);
    }
}

/**
 * タグ持ちカードの合計所持数算出
 */
function checkTagTotalOwnedCount(tagName, requiredCount, collection, cardsDb = []) {
    if (!cardsDb || cardsDb.length === 0) return false;
    let total = 0;
    cardsDb.forEach(card => {
        const rawTags = String(card.tags || card.tag || '');
        if (rawTags.includes(tagName)) {
            total += (collection[String(card.id)] || 0);
        }
    });
    return total >= requiredCount;
}

// 起動時にルールCSVを自動ロード
window.addEventListener('DOMContentLoaded', () => {
    loadTagUnlockRules();
});