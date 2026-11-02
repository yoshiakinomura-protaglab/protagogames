/**
 * js/quiz/quiz_ui.js - 典学モード DOM自己生成 ＆ 画面制御
 */

let quizSelection = {
    step: 'title',
    era: 'nara',
    eraName: '奈良',
    level: 'basic',
    levelName: '初級',
    levelData: null,
    trial: 1,
    trialType: 'fixed',
    trialName: '第一試練'
};

// ==========================================
// 1. クイズ用全画面HTMLの自己生成・注入
// ==========================================
function ensureQuizModalDOM() {
    if (document.getElementById('quiz-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.className = 'fixed inset-0 z-50 hidden flex flex-col justify-between p-4 sm:p-8 select-none bg-stone-950 quiz-screen-bg';
    modal.innerHTML = `
        <audio id="bgm-quiz" src="audio/quiz_bgm.mp3" loop preload="none"></audio>

        <!-- 1. 典学 タイトル幕 -->
        <div id="quiz-view-title" onclick="goToQuizMenuStep('era')" class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-30 bg-stone-950/40">
            <div class="text-center flex flex-col items-center">
                <p class="animate-quiz-fade-1 text-amber-500/80 font-serif text-base sm:text-xl tracking-[0.4em] mb-4">歴史修練場</p>
                <div class="animate-quiz-fade-2 mb-8 flex justify-center">
                    <img src="images/quiz_logo.png" alt="典学" class="max-w-[280px] sm:max-w-[420px] md:max-w-[500px] w-auto h-auto drop-shadow-[0_15px_30px_rgba(0,0,0,0.95)] pointer-events-none select-none">
                </div>
                <div class="animate-quiz-fade-3 inline-block">
                    <div class="py-2.5 px-8 border-y-2 border-amber-600/60 text-amber-200 font-serif text-lg sm:text-xl tracking-widest animate-pulse bg-stone-900/60 backdrop-blur-sm shadow-xl">
                        画面に触れて修練を開始
                    </div>
                </div>
            </div>
            <button onclick="event.stopPropagation(); closeQuizModal();" class="absolute top-6 right-6 px-4 py-1.5 bg-stone-900/80 border border-stone-700 hover:border-rose-500 text-stone-300 hover:text-rose-300 rounded text-sm transition">
                <i class="fa-solid fa-person-walking-arrow-right mr-1.5"></i>戻る
            </button>
        </div>

        <!-- 2. 選択メニュー階層コンテナ（時代 ➔ 等級 ➔ 試練） -->
        <div id="quiz-view-select" class="absolute inset-0 flex flex-col justify-between p-6 sm:p-10 z-20 hidden">
            <div class="w-full max-w-5xl mx-auto flex items-center justify-between border-b border-amber-900/60 pb-3">
                <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <span class="text-amber-400 font-serif text-xl sm:text-2xl font-bold flex items-center">
                        <i class="fa-solid fa-scroll mr-2 text-amber-500"></i>典学修練録
                    </span>
                    <span id="quiz-select-breadcrumb" class="text-stone-400 text-xs sm:text-sm font-serif"></span>
                    <h2 id="quiz-select-heading" class="text-amber-200 font-serif text-sm sm:text-base font-bold pl-2 border-l border-amber-800/80"></h2>
                </div>
                <button onclick="handleQuizMenuBack()" class="px-3 py-1 bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-stone-300 rounded text-sm transition">
                    <i class="fa-solid fa-arrow-left mr-1"></i>戻る
                </button>
            </div>
            <div class="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-start pt-3 pb-2 overflow-hidden">
                <div id="quiz-select-grid" class="w-full overflow-y-auto pr-1"></div>
            </div>
            <div class="w-full max-w-4xl mx-auto text-center text-stone-500 text-xs tracking-widest font-serif">
                大和の縁 〜典学修練場〜
            </div>
        </div>

        <!-- 3. 開始直前カウントダウン幕 -->
        <div id="quiz-view-countdown" class="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/80 backdrop-blur-sm z-40 hidden select-none pointer-events-none">
            <p id="quiz-countdown-sub" class="text-amber-400/90 font-serif text-xl sm:text-2xl mb-4 tracking-widest"></p>
            <div id="quiz-countdown-num" class="text-8xl sm:text-9xl font-mono font-black text-amber-300 drop-shadow-[0_0_35px_rgba(245,158,11,0.8)] animate-ping">5</div>
            <p class="text-stone-400 text-sm font-serif mt-6 tracking-widest">いざ、尋常に修練へ入らん――</p>
        </div>

        <!-- 4. 出題画面（3形式共通マウント版） -->
        <div id="quiz-view-battle" class="flex flex-col justify-between h-full w-full hidden">
            <header class="w-full max-w-4xl mx-auto flex items-center justify-between border-b border-amber-900/60 pb-3">
                <div class="flex items-center space-x-3">
                    <span id="quiz-title-badge" class="px-3 py-1 bg-amber-950/80 border border-amber-600/60 text-amber-300 font-bold text-sm tracking-widest rounded shadow"></span>
                    <span id="quiz-progress-text" class="text-stone-400 font-serif text-sm sm:text-base font-semibold"></span>
                </div>
                <div class="flex items-center space-x-2 bg-stone-900/80 px-4 py-1.5 rounded-full border border-amber-800/50 shadow-inner">
                    <i class="fa-solid fa-stopwatch text-amber-400 text-base animate-pulse"></i>
                    <span id="quiz-timer" class="font-mono text-lg sm:text-xl font-bold text-amber-300 w-16 text-center">15.00</span>
                </div>
                <button onclick="closeQuizModal()" class="px-3 py-1 bg-stone-900/90 border border-stone-700 hover:border-rose-500/80 text-stone-300 hover:text-rose-300 rounded text-sm transition">
                    <i class="fa-solid fa-person-walking-arrow-right mr-1"></i>退出
                </button>
            </header>

            <div class="w-full max-w-4xl mx-auto bg-stone-900 h-2 rounded-full overflow-hidden border border-stone-800 my-2">
                <div id="quiz-timer-bar" class="bg-amber-500 h-full w-full transition-all duration-75"></div>
            </div>

            <main class="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center py-2 sm:py-6">
                <div class="bg-stone-900/90 border-2 border-amber-800/60 rounded-2xl p-6 sm:p-8 shadow-2xl mb-4 relative overflow-hidden">
                    <div id="quiz-type-indicator" class="absolute top-3 left-4 px-2 py-0.5 rounded text-[11px] font-bold border"></div>
                    <p id="quiz-question-text" class="text-lg sm:text-2xl font-serif font-bold text-stone-100 leading-relaxed text-center min-h-[70px] flex items-center justify-center pt-2">
                        読み込み中...
                    </p>
                </div>

                <!-- ★ 3形式が動的に差し替わる共通回答マウント -->
                <div id="quiz-answer-mount" class="w-full"></div>

                <div id="quiz-feedback-box" class="mt-4 p-4 rounded-xl border text-sm sm:text-base hidden transition shadow-lg">
                    <div id="quiz-feedback-result" class="font-bold text-base sm:text-lg mb-1 flex items-center"></div>
                    <div id="quiz-feedback-desc" class="text-stone-300 font-serif leading-relaxed"></div>
                </div>
            </main>

            <footer class="w-full max-w-4xl mx-auto text-center py-2 text-stone-500 text-xs tracking-widest font-serif">
                大和の縁 〜典学修練場〜
            </footer>
        </div>

        <!-- 5. 出陣確認モーダル -->
        <div id="quiz-confirm-dialog" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-stone-900 border-2 border-amber-600/80 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl">
                <div class="text-amber-400 text-3xl mb-3"><i class="fa-solid fa-feather-pointed"></i></div>
                <h3 class="text-lg font-serif font-bold text-stone-300 mb-2">試練への出陣確認</h3>
                <p id="quiz-confirm-target-text" class="text-xl sm:text-2xl font-serif font-bold text-amber-200 mb-6 border-y border-amber-900/60 py-3"></p>
                <div class="flex space-x-4">
                    <button onclick="closeQuizConfirmDialog()" class="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg border border-stone-600 font-bold transition">選び直す</button>
                    <button onclick="executeQuizStartCountdown()" class="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg border border-amber-500 font-bold shadow-lg transition">はい（挑む）</button>
                </div>
            </div>
        </div>

        <!-- 6. リザルト画面 -->
        <div id="quiz-result-view" class="absolute inset-0 bg-stone-950/98 flex flex-col items-center justify-center p-6 hidden z-40">
            <div class="max-w-md w-full bg-stone-900/90 border-2 border-amber-600/70 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
                <i class="fa-solid fa-award text-5xl text-amber-400 mb-3 animate-bounce"></i>
                <h3 class="text-2xl sm:text-3xl font-serif font-bold text-amber-200 mb-2">修練完了</h3>
                <p id="quiz-result-score" class="text-stone-300 font-mono text-lg mb-6"></p>
                <div class="bg-stone-950 border border-amber-600/60 rounded-xl p-4 mb-6 shadow-inner">
                    <div id="quiz-reward-text" class="text-base sm:text-lg font-serif font-bold text-amber-100"></div>
                </div>
                <div class="flex space-x-4">
                    <button onclick="restartCurrentTrial()" class="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-lg border border-stone-600 transition">再挑戦</button>
                    <button onclick="goToQuizMenuStep('trial')" class="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-amber-50 font-bold rounded-lg border border-amber-500 shadow-lg transition">試練選択へ</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 星ゲージ生成
function renderStarGauge(rate) {
    const filledStars = Math.min(5, Math.floor(rate / 0.20));
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += i <= filledStars 
            ? '<span class="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">★</span>' 
            : '<span class="text-stone-600/80">★</span>';
    }
    return starsHtml;
}

function showView(viewName) {
    ensureQuizModalDOM();
    const titleEl = document.getElementById('quiz-view-title');
    const selectEl = document.getElementById('quiz-view-select');
    const battleEl = document.getElementById('quiz-view-battle');
    const countdownEl = document.getElementById('quiz-view-countdown');
    const resultEl = document.getElementById('quiz-result-view');

    [titleEl, selectEl, battleEl, countdownEl, resultEl].forEach(el => el?.classList.add('hidden'));

    if (viewName === 'title' && titleEl) {
        titleEl.classList.remove('hidden');
    } else if (viewName === 'select') {
        selectEl?.classList.remove('hidden');
    } else if (viewName === 'battle') {
        battleEl?.classList.remove('hidden');
    }
}

// 階層選択メニュー制御
function goToQuizMenuStep(step) {
    quizSelection.step = step;
    showView('select');

    const grid = document.getElementById('quiz-select-grid');
    const heading = document.getElementById('quiz-select-heading');
    const breadcrumb = document.getElementById('quiz-select-breadcrumb');
    if (!grid || !heading || !breadcrumb) return;

    grid.innerHTML = '';

    // 1. 時代選択
    if (step === 'era') {
        heading.innerText = '挑む時代を選択せよ';
        breadcrumb.innerText = '時代選択';
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 max-h-[75vh] overflow-y-auto px-1 py-1 w-full";

        QUIZ_ERAS.forEach(era => {
            const btn = document.createElement('button');
            if (era.banner) {
                btn.className = "relative w-full h-28 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-xl text-left bg-stone-900";
                btn.innerHTML = `
                    <img src="${era.banner}" alt="${era.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-transparent to-black/30"></div>
                    <div class="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] sm:text-xs font-serif">
                        <span class="text-amber-400 font-mono font-bold drop-shadow">修練開放中</span>
                    </div>
                `;
            } else {
                btn.className = "py-4 sm:py-5 px-3 bg-stone-900/90 hover:bg-amber-950/70 active:scale-[0.98] border-2 border-amber-900/60 hover:border-amber-500 rounded-xl flex items-center justify-center text-center transition duration-150 group shadow-md";
                btn.innerHTML = `<span class="text-base sm:text-xl font-serif font-bold text-amber-100 group-hover:text-amber-300 tracking-wider">${era.name}</span>`;
            }
            btn.onclick = () => {
                quizSelection.era = era.id;
                quizSelection.eraName = era.name;
                goToQuizMenuStep('level');
            };
            grid.appendChild(btn);
        });

    // 2. 等級選択
    } else if (step === 'level') {
        heading.innerText = '等級を選択せよ';
        breadcrumb.innerText = quizSelection.eraName;
        grid.className = "flex flex-col justify-between gap-2.5 sm:gap-3 h-[72vh] w-full max-w-xl mx-auto overflow-hidden px-2 py-1";

        const progressData = getQuizProgress();
        const progress = progressData[quizSelection.era] || {
            basic: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            normal: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            hard: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 }
        };

        NARA_LEVELS.forEach((lvl, idx) => {
            let isUnlocked = true;
            if (idx === 1) isUnlocked = progress.basic.cleared;
            if (idx === 2) isUnlocked = progress.normal.cleared;

            const lvlData = progress[lvl.id] || { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 };
            const fixedCleared = Math.min(lvl.stages, lvlData.stagesCleared || 0);
            const loopDone = Math.min(10, lvlData.loops || 0) + Math.min(10, lvlData.randomLoops || 0);
            const randomCleared = lvlData.randomCleared ? 1 : 0;
            const currentSum = fixedCleared + loopDone + randomCleared;
            const requiredTotal = lvl.stages + 10 + 1 + 10;
            const rate = Math.min(1.0, currentSum / requiredTotal);
            const stars = renderStarGauge(rate);
            const ratePercent = Math.min(100, Math.floor(rate * 100));

            const btn = document.createElement('button');
            const fitStyle = "height: calc((72vh - 24px) / 3); max-width: calc((72vh - 24px) / 3 * 16 / 7); aspect-ratio: 16 / 7;";

            if (isUnlocked) {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-xl sm:rounded-2xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-2xl text-left bg-stone-900 block cursor-pointer mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${lvl.banner}" alt="${lvl.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-950/25 to-transparent"></div>
                    <div class="absolute bottom-2 left-4 right-4 flex flex-col gap-1.5 pointer-events-none">
                        <div class="flex items-center justify-between">
                            <div class="text-sm sm:text-base tracking-widest flex items-center select-none">${stars}</div>
                            <div class="text-[10px] sm:text-xs text-amber-400 font-mono font-bold drop-shadow">${ratePercent}%</div>
                        </div>
                        <div class="w-full bg-stone-950/90 h-1.5 rounded-full overflow-hidden border border-amber-900/60 shadow-inner">
                            <div class="bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 h-full transition-all duration-300" style="width: ${ratePercent}%;"></div>
                        </div>
                    </div>
                `;
                btn.onclick = () => {
                    quizSelection.level = lvl.id;
                    quizSelection.levelName = lvl.name;
                    quizSelection.levelData = lvl;
                    goToQuizMenuStep('trial');
                };
            } else {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-xl sm:rounded-2xl overflow-hidden border-2 border-stone-800 text-left bg-stone-950 opacity-60 grayscale pointer-events-none block mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${lvl.banner}" alt="${lvl.name}" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-stone-950/75 flex flex-col items-center justify-center">
                        <i class="fa-solid fa-lock text-amber-500/80 text-xl sm:text-2xl mb-1 drop-shadow"></i>
                        <span class="text-stone-300 font-serif text-[11px] sm:text-xs tracking-wider">${idx === 1 ? '初級 満点クリアで解放' : '中級 満点クリアで解放'}</span>
                    </div>
                `;
            }
            grid.appendChild(btn);
        });

    // 3. 試練一覧（木札バナー ＆ 順次アンロック）
    } else if (step === 'trial') {
        const lvl = quizSelection.levelData || NARA_LEVELS[0];
        heading.innerText = '試練を選択せよ';
        breadcrumb.innerText = `${quizSelection.eraName} > ${quizSelection.levelName}`;
        grid.className = "flex flex-col gap-3 max-w-xl mx-auto w-full max-h-[75vh] overflow-y-auto px-1 py-1";

        for (let i = 1; i <= lvl.stages; i++) {
            const trialIdx = i - 1;
            const trialType = lvl.stageTypes[trialIdx] || 'choice';
            const tagAsset = QUIZ_TAG_ASSETS[trialType] || QUIZ_TAG_ASSETS.choice;
            const isUnlocked = isTrialUnlocked(quizSelection.era, lvl.id, trialIdx);
            const trialName = `第${NUMBER_KANJI[trialIdx]}試練`;

            const btn = document.createElement('button');
            if (isUnlocked) {
                btn.className = "relative w-full h-20 rounded-xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-150 shadow-lg text-left bg-stone-900 group cursor-pointer";
                btn.innerHTML = `
                    <img src="${tagAsset.image}" alt="${tagAsset.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.style.display='none'">
                    <div class="absolute inset-0 bg-gradient-to-r from-stone-950/85 via-stone-950/40 to-transparent"></div>
                    <div class="relative z-10 h-full flex items-center justify-between px-5 font-serif">
                        <div>
                            <div class="text-lg sm:text-xl font-bold text-amber-100 group-hover:text-amber-300 drop-shadow">${trialName}</div>
                            <div class="text-[11px] text-stone-300 mt-0.5">拾問（10問）</div>
                        </div>
                        <span class="px-2.5 py-1 text-xs font-bold rounded border ${tagAsset.badgeColor}">
                            ${tagAsset.name}
                        </span>
                    </div>
                `;
                btn.onclick = () => {
                    quizSelection.trial = i;
                    quizSelection.trialType = 'fixed';
                    quizSelection.trialName = `${trialName}（${tagAsset.name}）`;
                    openQuizConfirmDialog();
                };
            } else {
                btn.className = "relative w-full h-20 rounded-xl overflow-hidden border border-stone-800 text-left bg-stone-950 opacity-50 grayscale pointer-events-none";
                btn.innerHTML = `
                    <img src="${tagAsset.image}" alt="${tagAsset.name}" class="absolute inset-0 w-full h-full object-cover" onerror="this.style.display='none'">
                    <div class="absolute inset-0 bg-stone-950/80 flex items-center justify-center space-x-2">
                        <i class="fa-solid fa-lock text-amber-500/80 text-lg"></i>
                        <span class="text-stone-300 font-serif text-xs">第${NUMBER_KANJI[trialIdx - 1]}試練 満点クリアで解放</span>
                    </div>
                `;
            }
            grid.appendChild(btn);
        }

        // 昇段ランダム検定ボタン（最終ステージクリアで解放）
        const randomUnlocked = isRandomTestUnlocked(quizSelection.era, lvl.id, lvl.stages);
        const randomBtn = document.createElement('button');

        if (randomUnlocked) {
            randomBtn.className = "relative w-full h-22 rounded-xl overflow-hidden border-2 border-amber-400 bg-gradient-to-r from-amber-950 via-stone-900 to-amber-950 hover:from-amber-900 p-4 shadow-xl text-left group cursor-pointer transition active:scale-[0.99] mt-2";
            randomBtn.innerHTML = `
                <div class="flex items-center justify-between font-serif">
                    <div class="flex items-center space-x-3">
                        <i class="fa-solid fa-dice text-amber-400 text-2xl animate-spin-slow"></i>
                        <div>
                            <div class="text-base sm:text-lg font-bold text-amber-200 group-hover:text-amber-100">昇段ランダム検定</div>
                            <div class="text-[11px] text-amber-400/80">四択・一問一答・記述が混在</div>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 text-xs font-bold rounded border border-amber-400 text-amber-300 bg-amber-950/80 animate-pulse">解放中</span>
                </div>
            `;
            randomBtn.onclick = () => {
                quizSelection.trial = 0;
                quizSelection.trialType = 'random';
                quizSelection.trialName = '昇段ランダム検定';
                openQuizConfirmDialog();
            };
        } else {
            randomBtn.className = "relative w-full h-22 rounded-xl overflow-hidden border border-stone-800 bg-stone-950/60 p-4 opacity-50 grayscale pointer-events-none mt-2";
            randomBtn.innerHTML = `
                <div class="flex items-center justify-center space-x-2 font-serif text-stone-400 text-xs h-full">
                    <i class="fa-solid fa-lock text-amber-500/70 text-base"></i>
                    <span>全試練（第${NUMBER_KANJI[lvl.stages - 1]}試練まで）満点クリアで解放</span>
                </div>
            `;
        }
        grid.appendChild(randomBtn);
    }
}

function handleQuizMenuBack() {
    if (quizSelection.step === 'era') {
        showView('title');
    } else if (quizSelection.step === 'level') {
        goToQuizMenuStep('era');
    } else if (quizSelection.step === 'trial') {
        goToQuizMenuStep('level');
    }
}

// 出陣確認ダイアログ
function openQuizConfirmDialog() {
    const dialog = document.getElementById('quiz-confirm-dialog');
    const text = document.getElementById('quiz-confirm-target-text');
    if (dialog && text) {
        text.innerText = `${quizSelection.eraName} ${quizSelection.levelName} ${quizSelection.trialName}`;
        dialog.classList.remove('hidden');
    }
}

function closeQuizConfirmDialog() {
    document.getElementById('quiz-confirm-dialog')?.classList.add('hidden');
}

// カウントダウン開始
function executeQuizStartCountdown() {
    closeQuizConfirmDialog();
    const countdownView = document.getElementById('quiz-view-countdown');
    const countdownNum = document.getElementById('quiz-countdown-num');
    const countdownSub = document.getElementById('quiz-countdown-sub');

    countdownSub.innerText = `${quizSelection.eraName} ${quizSelection.levelName} ${quizSelection.trialName}`;
    countdownView.classList.remove('hidden');

    let count = 5;
    countdownNum.innerText = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNum.innerText = count;
            countdownNum.classList.remove('animate-ping');
            void countdownNum.offsetWidth;
            countdownNum.classList.add('animate-ping');
        } else if (count === 0) {
            countdownNum.innerText = "始！";
        } else {
            clearInterval(timer);
            countdownView.classList.add('hidden');
            startSelectedQuiz();
        }
    }, 1000);
}

// 出題開始
async function startSelectedQuiz() {
    showView('battle');

    if (cachedQuizData.allLevelQuestions.length === 0) {
        await loadLevelQuizData(quizSelection.era, quizSelection.level);
    }

    let questions = [];
    if (quizSelection.trialType === 'random') {
        questions = getRandomExamQuestions();
    } else {
        questions = getFixedPackageQuestions(quizSelection.trial);
    }

    if (!questions || questions.length === 0) {
        alert(`${quizSelection.eraName}【${quizSelection.levelName}】の ${quizSelection.trialName} データがまだ存在しません。`);
        goToQuizMenuStep('trial');
        return;
    }

    currentQuizSession = {
        questions: questions,
        currentIndex: 0,
        score: 0,
        timer: null,
        timeRemaining: 15.0,
        perQuestionTime: 15.0,
        isLocked: false
    };

    document.getElementById('quiz-result-view')?.classList.add('hidden');
    document.getElementById('quiz-feedback-box')?.classList.add('hidden');
    document.getElementById('quiz-title-badge').innerText = `${quizSelection.eraName}・${quizSelection.levelName}`;

    renderCurrentQuestion();
}

// 1問ごとのレンダリング（3形式動的マウント）
function renderCurrentQuestion() {
    const session = currentQuizSession;
    const q = session.questions[session.currentIndex];
    session.isLocked = false;
    session.timeRemaining = session.perQuestionTime;

    document.getElementById('quiz-progress-text').innerText = `第 ${session.currentIndex + 1} / ${session.questions.length} 問`;
    document.getElementById('quiz-question-text').innerText = q.question;
    document.getElementById('quiz-feedback-box').classList.add('hidden');

    const mount = document.getElementById('quiz-answer-mount');
    mount.innerHTML = '';

    const indicator = document.getElementById('quiz-type-indicator');
    const qType = q.q_type || 'choice';
    const tagInfo = QUIZ_TAG_ASSETS[qType] || QUIZ_TAG_ASSETS.choice;
    indicator.className = `absolute top-3 left-4 px-2 py-0.5 rounded text-[11px] font-bold border ${tagInfo.badgeColor}`;
    indicator.innerText = tagInfo.name;

    // A. 四択UI
    if (qType === 'choice') {
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4";
        const choices = getShuffledChoices(q);
        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = "w-full py-4 sm:py-5 px-5 bg-stone-900/90 hover:bg-stone-800 active:scale-[0.98] border-2 border-amber-900/60 hover:border-amber-500 rounded-xl text-left text-base sm:text-xl font-serif font-bold text-stone-200 transition duration-150 flex items-center justify-between shadow-md";
            btn.innerHTML = `<span>${ch.text}</span><i class="fa-solid fa-chevron-right text-stone-600 text-sm"></i>`;
            btn.onclick = () => submitAnswer(ch.isCorrect, q);
            grid.appendChild(btn);
        });
        mount.appendChild(grid);

    // B. 一問一答（直打ち）UI
    } else if (qType === 'input') {
        const wrap = document.createElement('div');
        wrap.className = "flex flex-col sm:flex-row gap-3 w-full max-w-xl mx-auto";
        wrap.innerHTML = `
            <input type="text" id="quiz-direct-input" placeholder="用語を入力（Enterで回答）" 
                   class="flex-1 px-4 py-3.5 bg-stone-950 border-2 border-amber-800/80 focus:border-amber-400 rounded-xl text-amber-100 font-serif text-lg outline-none shadow-inner" autocomplete="off">
            <button id="quiz-direct-submit" class="px-6 py-3.5 bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-serif font-bold rounded-xl border border-amber-500 shadow-lg transition">
                回答する
            </button>
        `;
        mount.appendChild(wrap);

        const inputEl = document.getElementById('quiz-direct-input');
        const submitBtn = document.getElementById('quiz-direct-submit');

        setTimeout(() => inputEl?.focus(), 50);

        const handleInputSubmit = () => {
            const val = inputEl.value;
            if (!val.trim()) return;
            const isOk = judgeUserAnswer(val, q);
            submitAnswer(isOk, q);
        };

        submitBtn.onclick = handleInputSubmit;
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') handleInputSubmit();
        };

    // C. 記述UI
    } else if (qType === 'desc') {
        const wrap = document.createElement('div');
        wrap.className = "flex flex-col gap-3 w-full max-w-xl mx-auto";
        wrap.innerHTML = `
            <textarea id="quiz-desc-input" rows="3" placeholder="要点を簡潔に入力せよ" 
                      class="w-full px-4 py-3 bg-stone-950 border-2 border-amber-800/80 focus:border-amber-400 rounded-xl text-amber-100 font-serif text-base outline-none shadow-inner resize-none"></textarea>
            <button id="quiz-desc-submit" class="w-full py-3 bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-serif font-bold rounded-xl border border-amber-500 shadow-lg transition">
                回答を提出
            </button>
        `;
        mount.appendChild(wrap);

        const descEl = document.getElementById('quiz-desc-input');
        const submitBtn = document.getElementById('quiz-desc-submit');

        setTimeout(() => descEl?.focus(), 50);

        submitBtn.onclick = () => {
            const val = descEl.value;
            if (!val.trim()) return;
            const isOk = judgeUserAnswer(val, q);
            submitAnswer(isOk, q);
        };
    }

    startQuestionTimer(q);
}

function startQuestionTimer(currentQuestion) {
    clearInterval(currentQuizSession.timer);
    updateTimerUI();

    const interval = 50;
    currentQuizSession.timer = setInterval(() => {
        currentQuizSession.timeRemaining -= interval / 1000;
        if (currentQuizSession.timeRemaining <= 0) {
            currentQuizSession.timeRemaining = 0;
            clearInterval(currentQuizSession.timer);
            submitAnswer(false, currentQuestion, true);
        }
        updateTimerUI();
    }, interval);
}

function updateTimerUI() {
    const remain = Math.max(0, currentQuizSession.timeRemaining);
    document.getElementById('quiz-timer').innerText = remain.toFixed(2);
    const pct = (remain / currentQuizSession.perQuestionTime) * 100;
    const bar = document.getElementById('quiz-timer-bar');
    if (bar) {
        bar.style.width = `${pct}%`;
        bar.className = pct < 30 ? "bg-rose-500 h-full w-full transition-all" : "bg-amber-500 h-full w-full transition-all";
    }
}

function submitAnswer(isCorrect, questionItem, isTimeout = false) {
    if (currentQuizSession.isLocked) return;
    currentQuizSession.isLocked = true;
    clearInterval(currentQuizSession.timer);

    const feedbackBox = document.getElementById('quiz-feedback-box');
    const resultText = document.getElementById('quiz-feedback-result');
    const descText = document.getElementById('quiz-feedback-desc');
    feedbackBox.classList.remove('hidden');

    const correctAnswerStr = questionItem.choice1 || questionItem.answer || "";

    if (isCorrect) {
        currentQuizSession.score++;
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-emerald-600 bg-emerald-950/70 text-stone-200 shadow-lg";
        resultText.innerHTML = `<span class="text-emerald-400 text-lg"><i class="fa-solid fa-circle-check mr-2"></i>正解</span>`;
    } else {
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-rose-600 bg-rose-950/70 text-stone-200 shadow-lg";
        const reason = isTimeout ? "時間切れ！" : "不正解...";
        resultText.innerHTML = `
            <span class="text-rose-400 text-lg"><i class="fa-solid fa-circle-xmark mr-2"></i>${reason}</span>
            <span class="ml-3 text-sm text-stone-300">正解: <strong class="text-amber-300 font-serif">${correctAnswerStr}</strong></span>
        `;
    }
    descText.innerText = questionItem.explanation || "";

    setTimeout(() => {
        currentQuizSession.currentIndex++;
        if (currentQuizSession.currentIndex < currentQuizSession.questions.length) {
            renderCurrentQuestion();
        } else {
            showQuizResult();
        }
    }, 1300);
}

// リザルト画面 ＆ カード報酬・覚醒スワップ処理
function showQuizResult() {
    const session = currentQuizSession;
    const resultView = document.getElementById('quiz-result-view');
    const scoreText = document.getElementById('quiz-result-score');
    const rewardText = document.getElementById('quiz-reward-text');

    scoreText.innerText = `${session.questions.length}問中 ${session.score}問 正解`;

    const isPerfect = session.score === session.questions.length;
    let rewardHtml = '';

    if (isPerfect) {
        const progressData = getQuizProgress();
        const eraProg = progressData[quizSelection.era];
        const lvlProg = eraProg[quizSelection.level];
        const cardInfo = NARA_CARD_REWARDS[quizSelection.level];

        if (quizSelection.trialType === 'fixed') {
            lvlProg.stagesCleared = Math.max(lvlProg.stagesCleared, quizSelection.trial);
            if (lvlProg.stagesCleared >= (quizSelection.levelData?.stages || 3)) {
                lvlProg.cleared = true;
                lvlProg.loops = (lvlProg.loops || 0) + 1;
            }
        } else if (quizSelection.trialType === 'random') {
            lvlProg.randomCleared = true;
            lvlProg.randomLoops = (lvlProg.randomLoops || 0) + 1;
        }

        saveQuizProgress(progressData);

        // ① 初回満点クリア報酬（通常カード付与）
        if (cardInfo) {
            const isFirst = grantNormalRewardCard(cardInfo.normalId, cardInfo.name);
            if (isFirst) {
                rewardHtml += `<div class="text-amber-300 font-bold text-base sm:text-lg animate-bounce">【初制覇報酬】カード『${cardInfo.name}』獲得！</div>`;
            }
        }

        // ② 10周完走時（進捗100%）の覚醒カードIDスワップ
        const fixedCleared = Math.min(quizSelection.levelData?.stages || 3, lvlProg.stagesCleared || 0);
        const loopDone = Math.min(10, lvlProg.loops || 0) + Math.min(10, lvlProg.randomLoops || 0);
        const randomCleared = lvlProg.randomCleared ? 1 : 0;
        const totalSum = fixedCleared + loopDone + randomCleared;
        const totalReq = (quizSelection.levelData?.stages || 3) + 10 + 1 + 10;

        if (cardInfo && totalSum >= totalReq) {
            const justAwakened = replaceWithAwakenedCard(cardInfo.normalId, cardInfo.awakenedId, cardInfo.name);
            if (justAwakened) {
                rewardHtml += `
                    <div class="mt-2 p-2 bg-gradient-to-r from-amber-600/50 via-yellow-400/60 to-amber-600/50 border border-yellow-300 rounded-lg text-yellow-100 font-bold text-xs sm:text-sm tracking-wider animate-pulse shadow-lg">
                        ★ 典学極致：『${cardInfo.name}』が覚醒し、真の姿へと昇華した！ ★
                    </div>
                `;
            }
        }

        if (!rewardHtml) {
            rewardHtml = `<span class="text-amber-300 font-bold">満点達成！修練の記録を更新した。</span>`;
        }

        if (window.addMagatamaDirect) addMagatamaDirect(500);
    } else {
        rewardHtml = `<span class="text-stone-400">満点達成で進行度アップ！再挑戦しよう。</span>`;
    }

    rewardText.innerHTML = rewardHtml;
    resultView.classList.remove('hidden');
}

function restartCurrentTrial() {
    document.getElementById('quiz-result-view')?.classList.add('hidden');
    executeQuizStartCountdown();
}

function openQuizModal() {
    ensureQuizModalDOM();
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.remove('hidden');
    switchQuizBGM(true); // ★ ここを追加（クイズBGM再生開始）
    showView('title');
}

function closeQuizModal() {
    if (typeof currentQuizSession !== 'undefined' && currentQuizSession.timer) {
        clearInterval(currentQuizSession.timer);
    }
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.add('hidden');
    closeQuizConfirmDialog();
    switchQuizBGM(false); // ★ ここを追加（タイトルBGM再開）
}


// ==========================================
// BGM切り替え制御
// ==========================================
function switchQuizBGM(startQuiz) {
    const titleBgm = document.getElementById('bgm-title');
    const quizBgm = document.getElementById('bgm-quiz');

    if (startQuiz) {
        // タイトルBGMを一時停止し、クイズBGMを再生
        if (titleBgm && !titleBgm.paused) {
            titleBgm.pause();
            titleBgm.dataset.wasPlaying = 'true';
        }
        if (quizBgm) {
            quizBgm.currentTime = 0;
            quizBgm.play().catch(e => console.warn("クイズBGM再生失敗:", e));
        }
    } else {
        // クイズBGMを止め、タイトルBGMを再開
        if (quizBgm) quizBgm.pause();
        if (titleBgm && titleBgm.dataset.wasPlaying === 'true') {
            titleBgm.play().catch(e => console.warn("タイトルBGM再開失敗:", e));
        }
    }
}

// グローバル公開
window.openQuizModal = openQuizModal;
window.closeQuizModal = closeQuizModal;
window.goToQuizMenuStep = goToQuizMenuStep;
window.handleQuizMenuBack = handleQuizMenuBack;
window.openQuizConfirmDialog = openQuizConfirmDialog;
window.closeQuizConfirmDialog = closeQuizConfirmDialog;
window.executeQuizStartCountdown = executeQuizStartCountdown;
window.restartCurrentTrial = restartCurrentTrial;

