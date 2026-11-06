/**
 * js/quiz/quiz_result.js - 典学モード 総合リザルト画面＆5段階演出エンジン（デッキ自動置換完備版）
 */

(function() {
    // デッキ保存キー（deck_edit.js と完全同期）
    const STORAGE_KEY_DECKS = 'yamato_縁_saved_decks_v1';

    /**
     * 保存済み全デッキ（1〜10枠）内の通常カードIDを覚醒カードIDへ自動スワップ
     * @param {string} oldCardId 通常カードID
     * @param {string} newCardId 覚醒カードID
     */
    function swapCardInSavedDecks(oldCardId, newCardId) {
        if (!oldCardId || !newCardId) return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY_DECKS);
            if (!raw) return;

            const decks = JSON.parse(raw);
            let hasChanged = false;

            const oldIdLower = String(oldCardId).trim().toLowerCase();
            const newIdStr = String(newCardId).trim();

            Object.keys(decks).forEach(slotId => {
                const deck = decks[slotId];
                if (!deck) return;

                // 1. JOKER枠のスワップ判定
                if (deck.jokerId && String(deck.jokerId).trim().toLowerCase() === oldIdLower) {
                    deck.jokerId = newIdStr;
                    hasChanged = true;
                }

                // 2. 配下英傑枠（cardIds）のスワップ判定
                if (Array.isArray(deck.cardIds)) {
                    deck.cardIds = deck.cardIds.map(id => {
                        if (String(id).trim().toLowerCase() === oldIdLower) {
                            hasChanged = true;
                            return newIdStr;
                        }
                        return id;
                    });
                }
            });

            if (hasChanged) {
                localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
                console.log(`🎴 [DeckSwap] デッキ内のカードを覚醒IDへ置換しました: ${oldCardId} ➔ ${newCardId}`);
            }
        } catch (e) {
            console.error("デッキ内カード自動置換に失敗:", e);
        }
    }

    /**
     * 所持コレクション内の通常カードを覚醒カードへと置換昇華
     * @param {string} oldCardId 通常カードID
     * @param {string} newCardId 覚醒カードID
     */
    function upgradeCardInCollection(oldCardId, newCardId) {
        if (!oldCardId || !newCardId) return;
        try {
            if (typeof getUserCollection === 'function' && typeof saveUserCollection === 'function') {
                const col = getUserCollection();
                const oldIdStr = String(oldCardId).trim();
                const newIdStr = String(newCardId).trim();

                // 通常カードの所持枚数を覚醒側へ引き継ぎ（最低1枚保証）
                const count = Math.max(1, col[oldIdStr] || 1);
                delete col[oldIdStr]; // 通常カードを除外
                col[newIdStr] = (col[newIdStr] || 0) + count; // 覚醒カードを付与

                saveUserCollection(col);
                window.dispatchEvent(new CustomEvent('yamato_collection_updated', { detail: col }));
                console.log(`🎴 [CollectionUpgrade] コレクションを覚醒置換しました: ${oldIdStr} ➔ ${newIdStr}`);
            } else if (typeof addCardToCollection === 'function') {
                addCardToCollection(newCardId, 1);
            }
        } catch (e) {
            console.error("コレクション覚醒置換に失敗:", e);
        }
    }

    /**
     * 総合リザルト演出メイン関数
     * @param {Object} session - currentQuizSession
     * @param {Object} selection - quizSelection
     */
        async function showQuizResultScreen(session, selection) {
        const resultView = document.getElementById('quiz-result-view');
        if (!resultView) return;

        const isPerfect = session.score === session.questions.length;
        const totalQuestions = session.questions.length;
        const correctCount = session.score;

        // 進行度データの取得
        const progressData = (typeof getQuizProgress === 'function') ? getQuizProgress() : {};
        const eraId = selection.era;
        const levelId = selection.level;
        if (!progressData[eraId]) progressData[eraId] = {};
        if (!progressData[eraId][levelId]) {
            progressData[eraId][levelId] = { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0, cleared: false };
        }
        const lvlProg = progressData[eraId][levelId];
        const masterRow = selection.levelRow || {};
        const totalStages = selection.dynamicStages?.length || 3;

        // 試練番号と試練種別の正規化
        const currentTrialNum = Number(selection.trial) || 1;
        const isRandom = selection.trialType === 'random';

        // --- パターン判定 (1〜5) ---
        let resultType = 1;
        let currentLoopCount = isRandom ? (lvlProg.randomLoops || 0) : (lvlProg.loops || 0);

        if (!isPerfect) {
            resultType = 1; // ① 失敗
        } else {
            // クリア前の状態を記録
            const wasLevelCleared = !!lvlProg.cleared; // すでに全問クリア済みだったか
            const prevTotalLoops = (lvlProg.loops || 0) + (lvlProg.randomLoops || 0);

            // 1. 進行度の更新
            if (!isRandom) {
                lvlProg.stagesCleared = Math.max(lvlProg.stagesCleared || 0, currentTrialNum);
                
                // 通常試練をすべて突破したか判定
                if (lvlProg.stagesCleared >= totalStages) {
                    lvlProg.loops = Math.min(10, (lvlProg.loops || 0) + 1);
                }
            } else {
                lvlProg.randomCleared = true;
                lvlProg.randomLoops = Math.min(10, (lvlProg.randomLoops || 0) + 1);
            }

            // 通常試練全制覇 ＆ 最終試練制覇で「等級完全クリア」
            const isAllStagesDone = (lvlProg.stagesCleared >= totalStages) && (lvlProg.randomCleared || totalStages <= 0);
            if (isAllStagesDone) {
                lvlProg.cleared = true; // ★ 次の等級を解放
            }

            // 2. 周回数と覚醒判定
            const isAllTenLoops = (lvlProg.loops >= 10) && (lvlProg.randomLoops >= 10);
            const isFirstAllClear = !wasLevelCleared && lvlProg.cleared; // ★ 今回初めて全問クリアを達成したか

            if (lvlProg.isAwakened) {
                resultType = 5; // ⑤ 覚醒済みカンストクリア
            } else if (isAllTenLoops) {
                resultType = 4; // ④ すべての試練を10周完走 ➔ 【覚醒】発動！
                lvlProg.isAwakened = true;
            } else if (isFirstAllClear) {
                resultType = 2; // ② すべての試練を初回全問クリア ➔ 【通常カード獲得】！
            } else {
                resultType = 3; // ③ 単一試練クリアまたは通常周回クリア（皆伝）
            }

            // セーブデータへの確実な保存
            if (typeof saveQuizProgress === 'function') {
                saveQuizProgress(progressData);
            } else {
                localStorage.setItem('yamato_quiz_progress_v2', JSON.stringify(progressData));
            }
        }

        const updatedLoop = (selection.trialType === 'random') ? (lvlProg.randomLoops || 0) : (lvlProg.loops || 0);

        // --- カード情報取得（cards.csv から直接画像を解決） ---
        const normalCardId = masterRow.reward_normal_id || '';
        const awkCardId = masterRow.reward_awk_id || '';

        let normalCardImg = 'default.jpg';
        let awkCardImg = 'default.jpg';

        try {
            const res = await fetch('cards.csv');
            if (res.ok) {
                const csvText = await res.text();
                const lines = csvText.trim().split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const idIdx = headers.indexOf('id');
                const imgIdx = headers.indexOf('image_illust');

                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const cols = lines[i].match(/(?:[^\s",]+|"[^"]*")+/g) || lines[i].split(',');
                    const cId = cols[idIdx]?.replace(/^"|"$/g, '').trim().toLowerCase();
                    const cImg = cols[imgIdx]?.replace(/^"|"$/g, '').trim();

                    if (normalCardId && cId === String(normalCardId).trim().toLowerCase()) {
                        normalCardImg = cImg || `${normalCardId}_illust.jpg`;
                    }
                    if (awkCardId && cId === String(awkCardId).trim().toLowerCase()) {
                        awkCardImg = cImg || `${awkCardId}_illust.jpg`;
                    }
                }
            }
        } catch (e) {
            console.error("cards.csv画像取得エラー:", e);
        }

        // --- 報酬付与と内部データ処理 ---
        let rewardMagatama = 0;
        if (resultType === 1) {
            rewardMagatama = 20; // 参加賞
        } else if (resultType === 2) {
            rewardMagatama = 100;
            // ② 初回カード入手
            if (normalCardId && typeof addCardToCollection === 'function') {
                addCardToCollection(normalCardId, 1);
            }
        } else if (resultType === 3) {
            rewardMagatama = 100;
        } else if (resultType === 4) {
            rewardMagatama = 300;
            // ④ 10周満点クリア：所持カードを覚醒置換 ＆ 編成中デッキ全枠を自動スワップ！
            upgradeCardInCollection(normalCardId, awkCardId);
            swapCardInSavedDecks(normalCardId, awkCardId);
        } else if (resultType === 5) {
            rewardMagatama = 200; // カンスト周回ボーナス
        }

        if (rewardMagatama > 0 && window.addMagatamaDirect) {
            window.addMagatamaDirect(rewardMagatama);
        }

        // --- 画面構築 ---
        renderResultHTML(resultView, {
            resultType,
            totalQuestions,
            correctCount,
            selection,
            normalCardImg,
            awkCardImg,
            updatedLoop,
            rewardMagatama,
            cardName: masterRow.reward_name || '武将'
        });

        resultView.classList.remove('hidden');
    }

    /**
     * リザルトHTML構築
     */
    function renderResultHTML(container, data) {
        const { resultType, totalQuestions, correctCount, selection, normalCard, awkCard, updatedLoop, rewardMagatama, cardName } = data;

        let stageHtml = '';

        if (resultType === 1) {
            // ① 失敗
            stageHtml = `
                <div class="flex flex-col items-center justify-center py-4 space-y-3">
                    <div class="w-20 h-20 rounded-full border-4 border-stone-600 bg-stone-900/80 text-stone-400 font-serif font-black text-2xl flex items-center justify-center shadow-inner -rotate-12">
                        未達
                    </div>
                    <p class="font-serif text-sm sm:text-base text-stone-300 tracking-widest text-center px-4 leading-relaxed">
                        全問正解にて試練達成とならん。<br><span class="text-xs text-stone-400">更なる鍛錬を重ね、再び挑まれよ。</span>
                    </p>
                </div>
            `;
        } else if (resultType === 2) {
            // ② 初回クリア（cards.csvの画像を直接表示・跳ねずに金フレア演出）
            const imgPath = data.normalCardImg || 'default.jpg';

            stageHtml = `
                <div class="flex flex-col items-center justify-center py-2 relative">
                    <div class="absolute top-0 right-4 w-13 h-13 rounded-full border-2 border-rose-600 bg-rose-950/90 text-rose-300 font-serif font-black text-xs flex items-center justify-center rotate-12 shadow-xl z-20 pointer-events-none">
                        初制覇
                    </div>
                    <div class="relative w-28 sm:w-32 aspect-[3/4] rounded-xl overflow-hidden border-2 border-amber-400/90 mb-2.5"
                         style="box-shadow: 0 0 25px rgba(245, 158, 11, 0.65), 0 0 50px rgba(217, 119, 6, 0.35);">
                        <img src="images/${imgPath}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-amber-300/10 pointer-events-none"></div>
                    </div>
                    <div class="px-3 py-1 bg-stone-900/95 border border-amber-500/80 rounded-lg text-amber-200 font-serif font-bold text-xs sm:text-sm shadow-md">
                        初クリア！『${cardName}』を獲得！
                    </div>
                    <p class="text-[11px] font-serif text-amber-400/80 mt-1">軍団編成・図鑑に追加されました</p>
                </div>
            `;
            
        } else if (resultType === 3) {
            // ③ 通常周回
            stageHtml = `
                <div class="flex flex-col items-center justify-center py-6 space-y-3">
                    <div class="w-24 h-24 rounded-full border-4 border-rose-600 bg-rose-950/90 text-rose-200 font-serif font-black text-3xl flex items-center justify-center shadow-xl rotate-12 animate-pulse">
                        皆伝
                    </div>
                    <p class="font-serif text-sm sm:text-base text-amber-100 tracking-widest font-bold">
                        見事なる解答、試練制覇せり！
                    </p>
                </div>
            `;
        } else if (resultType === 4) {
            // ④ 覚醒演出（覚醒元 ➔ 覚醒先 の2枚並び：赤フレア版）
            const normalImg = data.normalCardImg || 'default.jpg';
            const awkImg = data.awkCardImg || 'default.jpg';
            const normalName = data.cardName || '武将';
            const awkName = data.awkCardName || `${normalName}【覚醒】`;

            stageHtml = `
                <div class="flex flex-col items-center justify-center py-1 w-full">
                    <!-- カード比較エリア（左：元カード ➡ 右：覚醒カード） -->
                    <div class="flex items-center justify-center gap-2 sm:gap-4 w-full mb-3">
                        
                        <!-- 覚醒元カード -->
                        <div class="flex flex-col items-center w-24 sm:w-28 flex-shrink-0">
                            <div class="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-stone-600 shadow-md opacity-75">
                                <img src="images/${normalImg}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                                <div class="absolute inset-0 bg-black/30"></div>
                            </div>
                            <span class="mt-1.5 font-serif font-bold text-[11px] sm:text-xs text-stone-400 truncate max-w-full text-center">
                                ${normalName}
                            </span>
                        </div>

                        <!-- 昇華矢印 ➔ -->
                        <div class="flex flex-col items-center justify-center px-1">
                            <span class="text-rose-500 text-xl sm:text-2xl font-black drop-shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse">➔</span>
                        </div>

                        <!-- 覚醒先カード（深紅・紅蓮フレア・極印付き） -->
                        <div class="flex flex-col items-center w-28 sm:w-32 flex-shrink-0 relative">
                            <!-- 極印落款（紅朱印） -->
                            <div class="absolute -top-2 -right-2 px-1.5 py-0.5 rounded border border-rose-400 bg-rose-950 text-rose-200 font-serif font-black text-[10px] sm:text-xs rotate-6 shadow-xl z-20 animate-pulse">
                                極・覚醒
                            </div>
                            <!-- ★ 赤フレア光彩＆真紅の境界枠 -->
                            <div class="relative w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-rose-500 scale-105"
                                 style="box-shadow: 0 0 25px rgba(225, 29, 72, 0.75), 0 0 50px rgba(190, 18, 60, 0.45);">
                                <img src="images/${awkImg}" class="w-full h-full object-cover object-top" onerror="this.src='images/default.jpg';">
                                <!-- 赤色光彩グラデーションオーバーレイ -->
                                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-rose-500/20 pointer-events-none"></div>
                            </div>
                            <span class="mt-2 font-serif font-black text-xs sm:text-sm text-rose-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate max-w-full text-center">
                                ${awkName}
                            </span>
                        </div>

                    </div>

                    <!-- メッセージ帯（深紅と朱色基調の和風グラデーション） -->
                    <div class="px-4 py-1.5 bg-gradient-to-r from-stone-900 via-rose-950 to-stone-900 border border-rose-500/80 rounded-lg text-rose-200 font-serif font-black text-xs sm:text-sm shadow-xl">
                        ★ 典学極致：カード覚醒！ ★
                    </div>
                    <p class="text-[11px] font-serif text-rose-400/90 mt-1.5">
                        全編成デッキ内のカードも覚醒へ自動昇華しました
                    </p>
                </div>
            `;
        } else if (resultType === 5) {
            // ⑤ カンスト後クリア
            stageHtml = `
                <div class="flex flex-col items-center justify-center py-6 space-y-3">
                    <div class="w-24 h-24 rounded-full border-4 border-yellow-400 bg-amber-950 text-yellow-300 font-serif font-black text-3xl flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.6)] rotate-12">
                        極
                    </div>
                    <p class="font-serif text-sm sm:text-base text-yellow-200 tracking-widest font-bold">
                        修練の極致に至りし者
                    </p>
                </div>
            `;
        }

        const loopPercent = Math.min(100, (updatedLoop / 10) * 100);
        let progressDetailHtml = '';

        if (resultType === 5) {
            progressDetailHtml = `
                <div class="flex items-center justify-between text-xs font-serif font-bold text-yellow-300 pb-1">
                    <span>修練進捗：極致達成</span>
                    <span class="font-mono">10 / 10 周</span>
                </div>
                <div class="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-yellow-500/60">
                    <div class="h-full bg-gradient-to-r from-amber-500 to-yellow-300 w-full"></div>
                </div>
            `;
        } else {
            const remainLoop = Math.max(0, 10 - updatedLoop);
            const remainText = remainLoop > 0 ? `（覚醒まで あと ${remainLoop} 周）` : '（覚醒達成！）';
            progressDetailHtml = `
                <div class="flex items-center justify-between text-xs font-serif text-stone-300 pb-1">
                    <span>修練進捗 <strong class="text-amber-400 font-normal">${remainText}</strong></span>
                    <span class="font-mono text-amber-300 font-bold">${updatedLoop} / 10 周</span>
                </div>
                <div class="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-amber-900/80">
                    <div class="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-500" style="width: ${loopPercent}%;"></div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="relative w-full max-w-lg mx-auto bg-stone-900/95 border-2 border-amber-600/80 rounded-2xl p-5 sm:p-6 text-center shadow-2xl flex flex-col justify-between backdrop-blur-md select-none">
                <div class="border-b border-amber-900/60 pb-3">
                    <div class="text-xs font-serif text-amber-500/90 tracking-widest mb-1">
                        ${selection.eraName}・${selection.levelName} 【${selection.trialName}】
                    </div>
                    <h2 class="font-serif font-black text-2xl sm:text-3xl text-amber-100 tracking-wider">
                        修練結果報告
                    </h2>
                    <div class="mt-2 text-stone-300 font-serif text-sm">
                        正解数：<span class="font-mono text-xl sm:text-2xl font-black ${resultType === 1 ? 'text-rose-400' : 'text-amber-300'}">${correctCount}</span> / <span class="font-mono">${totalQuestions}</span> 問
                    </div>
                </div>

                <div class="my-2 min-h-[170px] flex items-center justify-center">
                    ${stageHtml}
                </div>

                <div class="bg-stone-950/80 border border-amber-900/60 rounded-xl p-3 mb-4 space-y-2">
                    ${progressDetailHtml}
                    <div class="flex items-center justify-between text-xs pt-1 border-t border-stone-800/80">
                        <span class="text-stone-400 font-serif">修練報酬</span>
                        <span class="font-mono font-bold text-amber-300 flex items-center gap-1">
                            <i class="fa-solid fa-gem text-[11px] text-emerald-400"></i> +${rewardMagatama} 勾玉
                        </span>
                    </div>
                </div>

                <div class="flex space-x-3 pt-1">
                    <button onclick="restartCurrentTrial()" 
                            style="background: linear-gradient(to right, #44403c, #292524) !important; border: 1px solid #78716c !important; color: #f5f5f4 !important;"
                            class="flex-1 py-2.5 rounded-lg font-serif font-bold text-xs sm:text-sm active:scale-95 transition cursor-pointer shadow">
                        再挑戦
                    </button>
                    <button onclick="goToQuizMenuStep('trial')" 
                            style="background: linear-gradient(to right, #92400e, #b45309, #92400e) !important; border: 1px solid #d97706 !important; color: #fef3c7 !important;"
                            class="flex-1 py-2.5 rounded-lg font-serif font-bold text-xs sm:text-sm active:scale-95 transition cursor-pointer shadow">
                        試練選択へ
                    </button>
                </div>
            </div>
        `;
    }

    window.showQuizResultScreen = showQuizResultScreen;
})();