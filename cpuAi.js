/**
 * cpuAi.js - CPU思考エンジンモジュール
 */

/**
 * 渡された手札（5枚想定）の中から、最も強い（ATK + DEF が最大になる）3枚を選択する
 * @param {Array} handCards - CPUの現在の持ち手札（カードオブジェクトの配列）
 * @param {Object} tagMaster - 特性タグのマスタデータ
 * @returns {Array} 選択された3枚のカードオブジェクト配列
 */
export function selectCpuBattleCards(handCards, tagMaster = {}) {
    if (!handCards || handCards.length < 3) {
        return handCards || [];
    }

    // 5枚の中から3枚を選ぶ全組み合わせ（5C3 = 10通り）を生成
    const combinations = getCombinations(handCards, 3);
    let bestCombination = combinations[0];
    let maxScore = -1;

    combinations.forEach(combo => {
        const score = evaluateCardComboScore(combo, tagMaster);
        if (score > maxScore) {
            maxScore = score;
            bestCombination = combo;
        }
    });

    return bestCombination;
}

// 配列から n 枚を選ぶ組み合わせを求める
function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    
    const head = arr[0];
    const tail = arr.slice(1);
    
    const withHead = getCombinations(tail, k - 1).map(c => [head, ...c]);
    const withoutHead = getCombinations(tail, k);
    
    return [...withHead, ...withoutHead];
}

// 3枚の組み合わせの強度スコア（計算機上の ATK + DEF の概算）を計算
function evaluateCardComboScore(cards, tagMaster) {
    // 1. Power合計
    const basePowerSum = cards.reduce((sum, c) => sum + (parseInt(c.power, 10) || 0), 0);

    // 2. トランプ役倍率
    const pokerMult = getPokerMultiplier(cards);

    // 3. 特性タグ倍率（GEN, SUP, ATK, DEF）の積算
    const tagCounts = {};
    cards.forEach(c => {
        if (Array.isArray(c.tags)) {
            c.tags.forEach(t => {
                const rawName = (typeof t === 'object' ? (t.name || t.label) : String(t)).replace(/[\(（].*?[\)）]/, '').trim();
                if (rawName) tagCounts[rawName] = (tagCounts[rawName] || 0) + 1;
            });
        }
    });

    let baseMultSum = 1.0;
    let atkMultSum = 1.0;
    let defMultSum = 1.0;

    Object.entries(tagCounts).forEach(([tagName, cnt]) => {
        const master = tagMaster[tagName] || { category: "GEN", minCards: 2, mult1: 1.0, mult2: 1.2, mult3: 1.5 };
        if (cnt >= master.minCards) {
            let mult = 1.0;
            if (cnt === 1) mult = master.mult1;
            else if (cnt === 2) mult = master.mult2;
            else if (cnt >= 3) mult = master.mult3;

            if (master.category === 'GEN' || master.category === 'SUP') {
                baseMultSum *= mult;
            } else if (master.category === 'ATK') {
                atkMultSum *= mult;
            } else if (master.category === 'DEF') {
                defMultSum *= mult;
            }
        }
    });

    const estAtk = basePowerSum * baseMultSum * atkMultSum * pokerMult;
    const estDef = basePowerSum * baseMultSum * defMultSum * pokerMult;

    return estAtk + estDef;
}

// トランプ役倍率の判定
function getPokerMultiplier(cards) {
    const ranks = cards.map(c => String(c.rank || '1').toUpperCase());
    const jokerCount = ranks.filter(r => r === 'JOKER' || r === 'JK').length;
    const normalRanks = ranks.filter(r => r !== 'JOKER' && r !== 'JK');

    if (jokerCount >= 2) return 2.0;
    if (jokerCount === 1) {
        if (normalRanks[0] === normalRanks[1]) return 2.0;
        if (canFormStraightWithJoker(normalRanks)) return 1.5;
        return 1.2;
    }

    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 2.0;
    if (isStraight(ranks)) return 1.5;
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) return 1.2;

    return 1.0;
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