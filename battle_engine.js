/**
 * battle_engine.js - Solo/P2P 共通バトル計算・演出モジュール
 * (main_bu.js の計算・演出・リザルト表示ロジックを切り出した immutable モジュール)
 */

const CATEGORY_CONFIG = {
    ATK: { color: "bg-rose-950/90 text-rose-300 border-rose-600", icon: "fa-hand-fist" },
    SUP: { color: "bg-amber-950/90 text-amber-300 border-amber-600", icon: "fa-flag" },
    DEF: { color: "bg-blue-950/90 text-blue-300 border-blue-600", icon: "fa-shield-halved" },
    DEB: { color: "bg-purple-950/90 text-purple-300 border-purple-600", icon: "fa-skull" },
    GEN: { color: "bg-slate-950/90 text-slate-300 border-slate-700", icon: "fa-scroll" }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function runBattleAnimation(playerCards, cpuCards, battleResult, gameState, playSceneBGMFn) {
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
    if (window.refreshAllUI) window.refreshAllUI();
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

        if (typeof playSceneBGMFn === 'function') {
            playSceneBGMFn(resultType, true);
        }

        showGameResultCutin(resultType, gameState);
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

        showTurnResultModal(playerCards, cpuCards, battleResult, gameState);

        await sleep(200);

        sumiEl.style.transition = 'opacity 0.4s ease-out';
        sumiEl.style.opacity = '0';
        await sleep(400);
        sumiEl.remove();
    }
}

function showTurnResultModal(playerCards, cpuCards, battleResult, gameState, viewTurnIndex = null) {
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
                    class="w-full py-2 px-1 rounded-xl border text-[10px] sm:text-xs font-yuji transition-all text-center ${btnStyle}">
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

function showGameResultCutin(resultType, gameState) {
    const modal = document.getElementById('game-result-cutin-modal');
    const cutinImg = document.getElementById('result-cutin-img');
    const toResultBtn = document.getElementById('btn-cutin-to-result');
    const titleBtn = document.getElementById('btn-cutin-title');

    if (!modal || !cutinImg) return;

    const playerJokerId = gameState.playerDeckIds[0] || 'c00000';

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
                showTurnResultModal(playerCards, cpuCards, battleResult, gameState);
            }
        };
    }
}

// 🟢 P2P / Solo から呼び出す共通エントリポイント
window.executeBattleSequence = async function(playerCards, cpuCards, gameState, playSceneBGMFn) {
    // 1. バトル計算
    const battleResult = calculateBattleResult(playerCards, cpuCards, gameState.tagMaster);

    // 2. 履歴保存
    gameState.lastBattleResult = { playerCards, cpuCards, battleResult };
    gameState.turnHistory[gameState.turn - 1] = {
        turnNum: gameState.turn,
        playerCards: playerCards,
        cpuCards: cpuCards,
        battleResult: battleResult
    };

    // 3. アニメーション実行 ➔ リザルト表示
    await runBattleAnimation(playerCards, cpuCards, battleResult, gameState, playSceneBGMFn);
};

// p2p_main.js や外部から直接呼べるように window へ一括公開
window.executeBattleSequence = executeBattleSequence;
window.calculateBattleResult = calculateBattleResult;
window.getPokerHandInfo = getPokerHandInfo;
window.triggerTurnCutin = triggerTurnCutin;
