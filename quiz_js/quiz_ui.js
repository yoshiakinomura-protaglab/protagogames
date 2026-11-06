/**
 * js/quiz/quiz_ui.js - 典学モード DOM自己生成 ＆ 画面制御（完全マスターCSV駆動版）
 */

const QUIZ_ASSET_PATHS = {
  questionFrame: 'images/quiz/quiz_frame_question.png', // 16:9
  choiceFrame:   'images/quiz/quiz_frame_choice.png',   // 4.5:1
  inputFrame:    'images/quiz/quiz_frame_input.png',    // 4.5:1
  descFrame:     'images/quiz/quiz_frame_desc.png',     // 2.5:1
  timerFrame:    'images/quiz/quiz_frame_timer.png'     // 1:1
};

// 木札画像アセット定義
const QUIZ_TAG_ASSETS = {
    choice: {
        type: 'choice',
        name: '四択',
        image: 'images/tag_choice.png',
        badgeColor: 'border-emerald-500/80 text-emerald-300 bg-emerald-950/80'
    },
    input: {
        type: 'input',
        name: '一問一答',
        image: 'images/tag_input.png',
        badgeColor: 'border-sky-500/80 text-sky-300 bg-sky-950/80'
    },
    desc: {
        type: 'desc',
        name: '記述',
        image: 'images/tag_desc.png',
        badgeColor: 'border-purple-500/80 text-purple-300 bg-purple-950/80'
    },
    random: {
        type: 'random',
        name: '最終試練',
        image: 'images/tag_random.png',
        badgeColor: 'border-amber-400 text-amber-300 bg-amber-950/80'
    }
};

const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

let quizSelection = {
    step: 'title',
    era: '',
    eraName: '',
    level: '',
    levelName: '',
    levelRow: null,      // quiz_master.csv の対象行データ
    dynamicStages: [],   // CSVから自動判定されたステージリスト
    trial: 1,
    trialType: 'fixed',
    trialName: '第一試練'
};

let currentTrialActiveIndex = 0;

// ==========================================
// 1. BGM制御
// ==========================================
function switchQuizBGM(startQuiz) {
    const titleBgm = document.getElementById('bgm-title');
    const quizBgm = document.getElementById('bgm-quiz');

    if (startQuiz) {
        if (titleBgm && !titleBgm.paused) {
            titleBgm.pause();
            titleBgm.dataset.wasPlaying = 'true';
        }
        if (quizBgm) {
            quizBgm.currentTime = 0;
            quizBgm.play().catch(e => console.warn("クイズBGM再生失敗:", e));
        }
    } else {
        if (quizBgm) quizBgm.pause();
        if (titleBgm && titleBgm.dataset.wasPlaying === 'true') {
            titleBgm.play().catch(e => console.warn("タイトルBGM再開失敗:", e));
        }
    }
}

// ==========================================
// 2. モーダルDOM自己生成
// ==========================================
function ensureQuizModalDOM() {
    if (document.getElementById('quiz-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.className = 'fixed inset-0 z-50 hidden flex flex-col justify-between p-2 sm:p-6 select-none bg-stone-950 quiz-screen-bg';
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
            <button onclick="event.stopPropagation(); closeQuizModal();" class="absolute top-6 right-6 px-4 py-1.5 bg-stone-900/80 border border-stone-700 hover:border-rose-500 text-stone-300 hover:text-rose-300 rounded text-sm transition z-50 cursor-pointer">
                <i class="fa-solid fa-person-walking-arrow-right mr-1.5"></i>戻る
            </button>
        </div>

        <!-- 2. 選択メニュー階層コンテナ（時代 ➔ 等級 ➔ 試練） -->
        <div id="quiz-view-select" class="absolute inset-0 flex flex-col justify-between p-3 sm:p-6 z-20 hidden">
            <div class="w-full max-w-5xl mx-auto flex items-center justify-between border-b border-amber-900/60 pb-3">
                <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <span class="text-amber-400 font-serif text-lg sm:text-2xl font-bold flex items-center">
                        <i class="fa-solid fa-scroll mr-2 text-amber-500"></i>典学修練録
                    </span>
                    <span id="quiz-select-breadcrumb" class="text-stone-400 text-xs sm:text-sm font-serif"></span>
                    <h2 id="quiz-select-heading" class="text-amber-200 font-serif text-sm sm:text-base font-bold pl-2 border-l border-amber-800/80"></h2>
                </div>
                <button onclick="handleQuizMenuBack()" class="px-3 py-1 bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-stone-300 rounded text-sm transition cursor-pointer">
                    <i class="fa-solid fa-arrow-left mr-1"></i>戻る
                </button>
            </div>
            <div class="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-start pt-2 pb-2 overflow-hidden relative">
                <div id="quiz-select-grid" class="w-full h-full overflow-hidden flex flex-col"></div>
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

        <!-- 4. 出題画面（和風装飾・高品位版） -->
        <div id="quiz-view-battle" class="flex flex-col justify-between h-full w-full max-w-4xl mx-auto px-2 sm:px-4 py-2 hidden relative z-20">
            <!-- ヘッダー：左に進捗、右上に大型円形タイマー＆退出ボタン -->
            <header class="w-full max-w-3xl mx-auto flex items-center justify-between pb-1 px-1 select-none">
                <div class="flex items-center space-x-2 sm:space-x-3">
                    <span id="quiz-title-badge" class="px-3 py-1 bg-gradient-to-r from-amber-950 to-stone-900 border border-amber-600/70 text-amber-300 font-serif font-black text-xs sm:text-sm tracking-widest rounded-lg shadow-md"></span>
                    <span id="quiz-progress-text" class="text-stone-300 font-serif text-xs sm:text-sm font-semibold tracking-wider"></span>
                </div>
                
                <div class="flex items-center space-x-3">
                    <!-- ① タイマー文字を1サイズ縮小（text-base sm:text-lg） -->
                    <div class="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 drop-shadow-xl">
                        <img src="${QUIZ_ASSET_PATHS.timerFrame}" class="absolute inset-0 w-full h-full object-contain pointer-events-none z-0">
                        <span id="quiz-timer" class="relative z-10 font-serif font-black text-stone-900 text-base sm:text-lg tracking-tighter">15.00</span>
                    </div>

                    <button onclick="closeQuizModal()" class="px-3 py-1.5 bg-stone-900/90 hover:bg-rose-950/80 border border-stone-700 hover:border-rose-500/80 text-stone-300 hover:text-rose-200 rounded-lg text-xs sm:text-sm transition duration-150 cursor-pointer shadow">
                        <i class="fa-solid fa-person-walking-arrow-right mr-1"></i>退出
                    </button>
                </div>
            </header>

            <!-- ② タイムバー（問題枠の上に長く配置） -->
            <div class="w-full max-w-3xl mx-auto bg-stone-950/90 h-2 sm:h-2.5 rounded-full overflow-hidden border border-amber-900/80 my-1.5 shadow-inner relative">
                <div id="quiz-timer-bar" class="h-full w-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-75"></div>
            </div>

            <!-- メイン出題・回答エリア -->
            <main class="w-full flex-1 flex flex-col justify-center py-1 overflow-y-auto no-scrollbar">
                <!-- ③ 問題表示枠 (16:9 和紙有効矩形を正確に指定) -->
                <div class="relative w-full max-w-3xl mx-auto aspect-video mb-3 flex items-center justify-center drop-shadow-2xl select-none">
                    <img src="${QUIZ_ASSET_PATHS.questionFrame}" class="absolute inset-0 w-full h-full object-contain pointer-events-none z-0">
                    
                    <!-- 文鎮の下から和紙下端までの有効領域（top:24%, bottom:8%, left:12%, right:12%） -->
                    <div class="absolute top-[24%] bottom-[8%] left-[12%] right-[12%] z-10 flex flex-col items-center justify-center text-center overflow-hidden">
                        <div id="quiz-question-text" class="w-full h-full flex flex-col items-center justify-center font-serif font-bold text-stone-900 text-sm sm:text-lg md:text-xl leading-relaxed select-none">
                            読み込み中...
                        </div>
                    </div>
                </div>

                <!-- 回答マウント領域 -->
                <div id="quiz-answer-mount" class="w-full"></div>

            </main>

            <!-- フッター -->
            <footer class="w-full text-center py-1 text-stone-500 text-[11px] tracking-[0.2em] font-serif border-t border-amber-950/40">
                大和の縁 〜典学修練場〜
            </footer>
        </div>

        <!-- 5. 出陣確認ダイアログ -->
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

// ==========================================
// 3. 階層選択メニュー（完全マスターCSV駆動）
// ==========================================
async function goToQuizMenuStep(step) {
    quizSelection.step = step;
    showView('select');

    await loadQuizMasterCSV();

    const grid = document.getElementById('quiz-select-grid');
    const heading = document.getElementById('quiz-select-heading');
    const breadcrumb = document.getElementById('quiz-select-breadcrumb');
    if (!grid || !heading || !breadcrumb) return;

    grid.innerHTML = '';

    // 1. 時代選択（is_active === "1" の時代のみ動的表示）
    if (step === 'era') {
        heading.innerText = '挑む時代を選択せよ';
        breadcrumb.innerText = '時代選択';
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 max-h-[75vh] overflow-y-auto px-1 py-1 w-full";

        const activeEras = getActiveErasFromMaster();

        if (activeEras.length === 0) {
            grid.innerHTML = `<div class="text-stone-400 font-serif text-center col-span-2 py-12">現在開放されている修練場はありません。</div>`;
            return;
        }

        activeEras.forEach(era => {
            const btn = document.createElement('button');
            btn.className = "relative w-full h-28 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-xl text-left bg-stone-900 cursor-pointer";
            btn.innerHTML = `
                <img src="${era.banner}" alt="${era.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='images/quiz_carousel_bg.jpg'">
                <div class="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-transparent to-black/30"></div>
                <div class="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs font-serif">
                    <span class="text-amber-100 font-bold text-lg drop-shadow">${era.name}</span>
                    <span class="text-amber-400 font-mono font-bold drop-shadow">修練開放中</span>
                </div>
            `;
            btn.onclick = () => {
                quizSelection.era = era.id;
                quizSelection.eraName = era.name;
                goToQuizMenuStep('level');
            };
            grid.appendChild(btn);
        });

    // 2. 等級選択（選択中の時代で is_active === "1" の等級のみ動的表示）
    } else if (step === 'level') {
        heading.innerText = '等級を選択せよ';
        breadcrumb.innerText = quizSelection.eraName;
        grid.className = "flex flex-col justify-center gap-3.5 h-[72vh] w-full max-w-xl mx-auto overflow-hidden px-2 py-1";

        const activeLevels = getActiveLevelsForEra(quizSelection.era);
        const progressData = getQuizProgress();
        const progress = progressData[quizSelection.era] || {};

        activeLevels.forEach((row, idx) => {
            const lvlId = row.level_id;
            const lvlData = progress[lvlId] || { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 };

            // 前等級クリアアンロック判定
            let isUnlocked = true;
            if (idx > 0) {
                const prevLvlId = activeLevels[idx - 1].level_id;
                isUnlocked = progress[prevLvlId]?.cleared || false;
            }

            const banner = row.level_banner || `images/quiz_${quizSelection.era}_${lvlId}_banner.jpg`;
            const fixedCleared = Math.min(3, lvlData.stagesCleared || 0);
            const loopDone = Math.min(10, lvlData.loops || 0) + Math.min(10, lvlData.randomLoops || 0);
            const randomCleared = lvlData.randomCleared ? 1 : 0;
            const rate = Math.min(1.0, (fixedCleared + loopDone + randomCleared) / 24);
            const stars = renderStarGauge(rate);
            const ratePercent = Math.min(100, Math.floor(rate * 100));

            const btn = document.createElement('button');
            const fitStyle = `height: ${Math.floor(65 / activeLevels.length)}vh; max-height: 180px; aspect-ratio: 16 / 7;`;

            if (isUnlocked) {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-2xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-2xl text-left bg-stone-900 block cursor-pointer mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${banner}" alt="${row.level_name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='images/quiz_carousel_bg.jpg'">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-950/25 to-transparent"></div>
                    <div class="absolute top-3 left-4">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/80 border border-amber-500/60 text-amber-300 font-serif">${row.level_name}</span>
                        <h3 class="text-xl sm:text-2xl font-serif font-black text-amber-100 mt-1">${row.level_name}修練</h3>
                    </div>
                    <div class="absolute bottom-2 left-4 right-4 flex flex-col gap-1 pointer-events-none">
                        <div class="flex items-center justify-between">
                            <div class="text-xs sm:text-sm tracking-widest flex items-center select-none">${stars}</div>
                            <div class="text-[10px] sm:text-xs text-amber-400 font-mono font-bold drop-shadow">${ratePercent}%</div>
                        </div>
                        <div class="w-full bg-stone-950/90 h-1.5 rounded-full overflow-hidden border border-amber-900/60 shadow-inner">
                            <div class="bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 h-full transition-all duration-300" style="width: ${ratePercent}%;"></div>
                        </div>
                    </div>
                `;
                btn.onclick = async () => {
                    quizSelection.level = lvlId;
                    quizSelection.levelName = row.level_name;
                    quizSelection.levelRow = row;

                    // 対象CSVをロードして試練構成を自動解析
                    await loadTargetQuizCSV(row.quiz_csv);
                    quizSelection.dynamicStages = getLevelStageInfo();

                    goToQuizMenuStep('trial');
                };
            } else {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-2xl overflow-hidden border-2 border-stone-800 text-left bg-stone-950 opacity-60 grayscale pointer-events-none block mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <div class="absolute inset-0 bg-stone-950/85 flex flex-col items-center justify-center">
                        <i class="fa-solid fa-lock text-amber-500/80 text-2xl mb-1 drop-shadow"></i>
                        <span class="text-stone-300 font-serif text-xs tracking-wider">前等級 満点制覇で開放</span>
                    </div>
                `;
            }
            grid.appendChild(btn);
        });

    // 3. 試練一覧（木札カルーセル ＆ 勾玉星図）
    } else if (step === 'trial') {
        const lvl = quizSelection.levelRow || { level_id: quizSelection.level, level_name: quizSelection.levelName };
        heading.innerText = '試練を選択せよ';
        breadcrumb.innerText = `${quizSelection.eraName} > ${quizSelection.levelName}`;
        
        if (!quizSelection.dynamicStages || quizSelection.dynamicStages.length === 0) {
            const csvPath = quizSelection.levelRow?.quiz_csv || `quiz/quiz_${quizSelection.era}_${quizSelection.level}.csv`;
            await loadTargetQuizCSV(csvPath);
            quizSelection.dynamicStages = getLevelStageInfo();
        }

        renderTrialCarouselView(grid, lvl);
    }
}

// ==========================================
// 4. 試練カルーセル ＆ 勾玉星図描画
// ==========================================
const STAR_CHART_COORDS = [
    { x: 18, y: 55 },
    { x: 26, y: 40 },
    { x: 35, y: 32 },
    { x: 44, y: 48 },
    { x: 53, y: 62 },
    { x: 62, y: 50 },
    { x: 70, y: 35 },
    { x: 76, y: 24 },
    { x: 80, y: 45 },
    { x: 84, y: 60 }
];

function renderTrialCarouselView(container, lvl) {
    const eraId = quizSelection.era;
    const levelId = lvl.level_id || quizSelection.level;
    const progressData = getQuizProgress();
    const lvlProg = progressData[eraId]?.[levelId] || { stagesCleared: 0, loops: 0 };

    const stagesList = quizSelection.dynamicStages && quizSelection.dynamicStages.length > 0 
        ? quizSelection.dynamicStages 
        : [
            { stageNum: 1, type: 'choice' },
            { stageNum: 2, type: 'input' },
            { stageNum: 3, type: 'desc' }
        ];

    const totalStages = stagesList.length;
    const randomUnlocked = isRandomTestUnlocked(eraId, levelId, totalStages);
    const totalItemsCount = totalStages + 1; // 通常試練 + 最終試練

    container.className = "w-full h-full flex flex-col overflow-hidden relative";
    container.innerHTML = `
        <!-- ① 上部：格子戸背景 ＆ 縦長木札 横カルーセル（52%） -->
        <div class="relative w-full h-[52%] overflow-hidden flex items-center justify-center border-b border-amber-900/60 rounded-t-xl" 
             style="background-image: url('images/quiz_carousel_bg.jpg'); background-size: cover; background-position: center;">
            <div class="absolute inset-0 bg-stone-950/20 pointer-events-none"></div>

            <!-- 左右送り矢印ボタン -->
            <button onclick="scrollTrialCarousel(-1)" class="absolute left-2 z-30 w-8 h-12 bg-black/60 hover:bg-black/90 active:scale-95 text-amber-400 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button onclick="scrollTrialCarousel(1)" class="absolute right-2 z-30 w-8 h-12 bg-black/60 hover:bg-black/90 active:scale-95 text-amber-400 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer">
                <i class="fa-solid fa-chevron-right"></i>
            </button>

            <!-- 横スクロールコンテナ -->
            <div id="trial-carousel-slider" class="w-full h-full flex items-center gap-6 px-[35%] overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar py-3">
                ${stagesList.map((stg, idx) => {
                    const stageNum = stg.stageNum;
                    const trialType = stg.type;
                    const tagAsset = QUIZ_TAG_ASSETS[trialType] || QUIZ_TAG_ASSETS.choice;
                    const isUnlocked = isTrialUnlocked(eraId, levelId, idx);
                    const trialName = `第${NUMBER_KANJI[idx] || (idx + 1)}試練`;
                    const isCleared = (lvlProg.stagesCleared || 0) > idx;
                    const isMaxLoop = (lvlProg.loops || 0) >= 10;

                    return `
                    <div id="trial-card-${idx}" 
                         onclick="${isUnlocked ? `window.handleTrialCardClick(${idx}, ${stageNum}, '${trialType}', '${trialName}')` : ''}"
                         data-index="${idx}"
                         class="trial-card-item relative flex-shrink-0 h-[92%] aspect-[1/2.4] snap-center rounded-lg transition-transform duration-300 select-none cursor-pointer group ${isUnlocked ? 'hover:scale-[1.03] active:scale-95' : 'filter brightness-75'}">
                        
                        <!-- 木札画像（CSVの形式から自動決定） -->
                        <img src="${tagAsset.image}" class="w-full h-full object-contain pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]" alt="${trialName}">

                        <!-- 札の文字 -->
                        <div class="absolute inset-0 pt-24 pb-10 px-4 flex flex-col items-center justify-center pointer-events-none">
                            <div class="font-serif font-black text-amber-100 tracking-[0.25em] text-base sm:text-lg [writing-mode:vertical-rl] drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                                ${trialName}
                            </div>
                        </div>

                        <!-- 封印鎖 -->
                        ${!isUnlocked ? `
                            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <img src="images/tag_locked_overlay.png" class="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" alt="封印">
                            </div>
                        ` : ''}

                        <!-- クリア朱印 -->
                        ${isCleared ? `
                            <div class="absolute top-[30%] right-6 sm:right-6 w-7 h-7 rounded-full border-2 ${
                                isMaxLoop 
                                    ? 'border-yellow-400 bg-amber-950 text-yellow-300 shadow-yellow-500/50' 
                                    : 'border-rose-600 bg-rose-950 text-rose-300'
                            } font-serif font-black text-xs flex items-center justify-center rotate-12 shadow-xl z-20 pointer-events-none">
                                ${isMaxLoop ? '極' : '済'}
                            </div>
                        ` : ''}

                        <!-- 周回カウント -->
                        ${isCleared ? `
                            <div class="absolute bottom-6 sm:bottom-7 inset-x-1 flex justify-center pointer-events-none z-20">
                                <span class="px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-mono font-extrabold tracking-tight shadow-lg border ${
                                    isMaxLoop 
                                        ? 'bg-amber-950/95 border-yellow-400 text-yellow-300 shadow-yellow-500/40' 
                                        : 'bg-stone-950/95 border-amber-600/70 text-amber-200'
                                }">
                                    ${lvlProg.loops || 1}/10 クリア
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    `;
                }).join('')}

                <!-- ★ 最終試練（ランダム検定） -->
                <div id="trial-card-${totalStages}" 
                     onclick="${randomUnlocked ? `window.handleTrialCardClick(${totalStages}, 0, 'random', '最終試練')` : ''}"
                     data-index="${totalStages}"
                     class="trial-card-item relative flex-shrink-0 h-[92%] aspect-[1/2.4] snap-center rounded-lg transition-transform duration-300 select-none cursor-pointer group ${randomUnlocked ? 'hover:scale-[1.03] active:scale-95' : 'filter brightness-75'}">
                    
                    <img src="images/tag_random.png" class="w-full h-full object-contain pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]" alt="最終試練" onerror="this.src='images/tag_desc.png'">

                    <div class="absolute inset-0 pt-24 pb-10 px-4 flex flex-col items-center justify-center pointer-events-none">
                        <div class="font-serif font-black text-stone-950 tracking-[0.2em] text-base sm:text-lg [writing-mode:vertical-rl] drop-shadow-[0_1px_1px_rgba(255,215,0,0.8)]">
                            最終試練
                        </div>
                    </div>

                    ${!randomUnlocked ? `
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <img src="images/tag_locked_overlay.png" class="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" alt="封印">
                        </div>
                    ` : ''}

                    ${lvlProg.randomCleared ? `
                        <div class="absolute top-[30%] right-6 sm:right-6 w-7 h-7 rounded-full border-2 ${
                            (lvlProg.randomLoops || 0) >= 10 
                                ? 'border-yellow-400 bg-amber-950 text-yellow-300 shadow-yellow-500/50' 
                                : 'border-rose-600 bg-rose-950 text-rose-300'
                        } font-serif font-black text-xs flex items-center justify-center rotate-12 shadow-xl z-20 pointer-events-none">
                            ${(lvlProg.randomLoops || 0) >= 10 ? '極' : '済'}
                        </div>
                        <div class="absolute bottom-6 sm:bottom-7 inset-x-1 flex justify-center pointer-events-none z-20">
                            <span class="px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-mono font-extrabold tracking-tight shadow-lg border ${
                                (lvlProg.randomLoops || 0) >= 10 
                                    ? 'bg-amber-950/95 border-yellow-400 text-yellow-300 shadow-yellow-500/40' 
                                    : 'bg-stone-950/95 border-amber-600/70 text-amber-200'
                            }">
                                ${lvlProg.randomLoops || 1}/10 クリア
                            </span>
                        </div>
                    ` : ''}
                </div>

            </div>
        </div>

        <!-- ② 下部：絵巻星図背景 ＆ 勾玉星図マップ -->
        <div class="relative w-full h-[48%] overflow-hidden flex items-center justify-center bg-stone-950 p-2 sm:p-4">
            
            <div class="relative h-full aspect-[16/8] max-w-full rounded-lg shadow-2xl flex items-center justify-center overflow-hidden border border-amber-950"
                 style="background-image: url('images/quiz_star_chart_bg.jpg'); background-size: 100% 100%; background-repeat: no-repeat; background-position: center;">
                
                <div class="absolute inset-0">
                    ${Array.from({ length: totalItemsCount }).map((_, idx) => {
                        const pos = STAR_CHART_COORDS[idx % STAR_CHART_COORDS.length];
                        const isFinal = idx === totalStages;

                        let isUnlocked = false;
                        let isCleared = false;
                        let isMaxLoop = false;
                        let labelText = `${idx + 1}`;

                        if (!isFinal) {
                            isUnlocked = isTrialUnlocked(eraId, levelId, idx);
                            isCleared = (lvlProg.stagesCleared || 0) > idx;
                            isMaxLoop = (lvlProg.loops || 0) >= 10;
                        } else {
                            isUnlocked = randomUnlocked;
                            isCleared = !!lvlProg.randomCleared;
                            isMaxLoop = (lvlProg.randomLoops || 0) >= 10;
                            labelText = "終";
                        }

                        let magatamaImg = 'images/magatama_gray.png';
                        if (isMaxLoop) magatamaImg = 'images/magatama_gold.png';
                        else if (isCleared) magatamaImg = 'images/magatama_green.png';

                        return `
                        <div id="magatama-node-${idx}"
                             onclick="jumpToCarouselIndex(${idx})"
                             style="left: ${pos.x}%; top: ${pos.y}%;"
                             class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 flex flex-col items-center group">
                            
                            <div class="magatama-icon-wrapper relative w-6 h-6 sm:w-8 sm:h-8 transition-all duration-300 group-hover:scale-125">
                                <img src="${magatamaImg}" class="w-full h-full object-contain filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]" alt="勾玉">
                            </div>
                            <span class="text-[9px] font-mono font-bold ${isFinal ? 'text-yellow-300 font-serif' : 'text-amber-200'} -mt-0.5 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                                ${labelText}
                            </span>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

        </div>
    `;

    setupCarouselScrollEvents(totalItemsCount);
}

function setupCarouselScrollEvents(totalStages) {
    const slider = document.getElementById('trial-carousel-slider');
    if (!slider) return;

    slider.onscroll = () => {
        const center = slider.scrollLeft + slider.clientWidth / 2;
        let closestIdx = 0;
        let minDiff = Infinity;

        for (let i = 0; i < totalStages; i++) {
            const card = document.getElementById(`trial-card-${i}`);
            if (card) {
                const cardCenter = card.offsetLeft + card.clientWidth / 2;
                const diff = Math.abs(center - cardCenter);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = i;
                }
            }
        }
        updateActiveIndexDisplay(closestIdx);
    };

    updateActiveIndexDisplay(0);
}

function updateActiveIndexDisplay(index) {
    currentTrialActiveIndex = index;

    document.querySelectorAll('.trial-card-item').forEach((el, i) => {
        if (i === index) {
            el.style.transform = 'scale(1.08)';
            el.style.filter = 'brightness(1.05)';
            el.style.zIndex = '10';
        } else {
            el.style.transform = 'scale(0.92)';
            el.style.filter = 'brightness(0.7)';
            el.style.zIndex = '1';
        }
    });

    document.querySelectorAll('[id^="magatama-node-"]').forEach((node, i) => {
        const wrapper = node.querySelector('.magatama-icon-wrapper');
        if (!wrapper) return;
        if (i === index) {
            wrapper.style.filter = 'drop-shadow(0 0 10px rgba(251, 191, 36, 1)) drop-shadow(0 0 20px rgba(245, 158, 11, 0.8))';
            wrapper.style.transform = 'scale(1.25)';
        } else {
            wrapper.style.filter = 'none';
            wrapper.style.transform = 'scale(1.0)';
        }
    });
}

function scrollTrialCarousel(direction) {
    const slider = document.getElementById('trial-carousel-slider');
    if (!slider) return;
    const nextIdx = Math.max(0, currentTrialActiveIndex + direction);
    jumpToCarouselIndex(nextIdx);
}

window.scrollTrialCarousel = scrollTrialCarousel;

window.jumpToCarouselIndex = function(index) {
    const slider = document.getElementById('trial-carousel-slider');
    const targetCard = document.getElementById(`trial-card-${index}`);
    if (slider && targetCard) {
        const targetScrollLeft = targetCard.offsetLeft - (slider.clientWidth / 2) + (targetCard.clientWidth / 2);
        slider.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    }
};

window.handleTrialCardClick = function(index, stageNum, trialType, trialName) {
    if (currentTrialActiveIndex !== index) {
        jumpToCarouselIndex(index);
    } else {
        quizSelection.trial = stageNum;
        quizSelection.trialType = trialType;
        quizSelection.trialName = trialName;
        openQuizConfirmDialog();
    }
};

window.selectTrialItem = function(stageNum, trialType, trialName) {
    quizSelection.trial = stageNum;
    quizSelection.trialType = 'fixed';
    quizSelection.trialName = trialName;
    openQuizConfirmDialog();
};

window.selectRandomExamItem = function() {
    quizSelection.trial = 0;
    quizSelection.trialType = 'random';
    quizSelection.trialName = '最終試練';
    openQuizConfirmDialog();
};

function handleQuizMenuBack() {
    if (quizSelection.step === 'era') {
        showView('title');
    } else if (quizSelection.step === 'level') {
        goToQuizMenuStep('era');
    } else if (quizSelection.step === 'trial') {
        goToQuizMenuStep('level');
    }
}

// ==========================================
// 5. 出陣カウントダウン ＆ 出題
// ==========================================
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

async function startSelectedQuiz() {
    showView('battle');

    const csvPath = quizSelection.levelRow?.quiz_csv || `quiz/quiz_${quizSelection.era}_${quizSelection.level}.csv`;
    if (cachedQuizData.csvPath !== csvPath || cachedQuizData.allLevelQuestions.length === 0) {
        await loadTargetQuizCSV(csvPath);
    }

    let questions = [];
    if (quizSelection.trialType === 'random') {
        questions = getRandomExamQuestions();
    } else {
        questions = getFixedPackageQuestions(quizSelection.trial);
    }

    if (!questions || questions.length === 0) {
        alert(`${quizSelection.eraName}【${quizSelection.levelName}】の ${quizSelection.trialName} データが存在しません。`);
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

function renderCurrentQuestion() {
    const session = currentQuizSession;
    const q = session.questions[session.currentIndex];
    session.isLocked = false;

    // 個別制限時間
    const limitSec = (q.time_limit && !isNaN(parseFloat(q.time_limit))) ? parseFloat(q.time_limit) : 15.0;
    session.perQuestionTime = limitSec;
    session.timeRemaining = limitSec;

    document.getElementById('quiz-progress-text').innerText = `第 ${session.currentIndex + 1} / ${session.questions.length} 問`;
    
    // 和紙エリアの中身を純粋な問題文に初期化
    const qTextEl = document.getElementById('quiz-question-text');
    if (qTextEl) {
        qTextEl.innerHTML = `<span class="leading-relaxed whitespace-pre-wrap">${q.question}</span>`;
    }

    const mount = document.getElementById('quiz-answer-mount');
    mount.innerHTML = '';

    const qType = q.q_type || 'choice';

    // A. 四択UI（②左余白をml-[27%]に拡大 ＆ ③文字をtext-base sm:text-lgに拡大）
    if (qType === 'choice') {
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full max-w-3xl mx-auto";
        const choices = getShuffledChoices(q);
        const choiceLabels = ['壱', '弐', '参', '肆'];

        choices.forEach((ch, idx) => {
            const btn = document.createElement('button');
            btn.type = "button";
            btn.className = "quiz-choice-item group relative w-full aspect-[4.5/1] flex items-center transition-all duration-200 active:scale-[0.98] outline-none cursor-pointer overflow-hidden";
            btn.dataset.isCorrect = ch.isCorrect ? "true" : "false";

            btn.innerHTML = `
                <img src="${QUIZ_ASSET_PATHS.choiceFrame}" class="absolute inset-0 w-full h-full object-contain pointer-events-none z-0 group-hover:brightness-105">
                
                <!-- 左側正方形金枠の真ん中にセンタリング -->
                <div class="absolute left-[3.5%] w-[15%] h-full flex items-center justify-center font-serif font-black text-amber-500/90 text-sm sm:text-base pointer-events-none z-10">
                    ${choiceLabels[idx]}
                </div>
                
                <!-- 右側和紙エリアの内側にテキストを配置 -->
                <div class="relative z-10 w-full h-full ml-[27%] mr-[5%] flex items-center justify-start text-left pr-2">
                    <span class="font-serif font-bold text-stone-900 text-base sm:text-lg line-clamp-2 leading-snug">
                        ${ch.text}
                    </span>
                </div>
            `;
            btn.onclick = () => {
                const judge = judgeUserAnswer(ch.isCorrect, q);
                submitAnswer(judge.isCorrect, q, false, judge.feedback, idx);
            };
            grid.appendChild(btn);
        });
        mount.appendChild(grid); // 画面（#quiz-answer-mount）へ反映

    // B. 一問一答（直打ち）UI
    } else if (qType === 'input') {
        const wrap = document.createElement('div');
        wrap.className = "w-full max-w-3xl mx-auto px-4 flex justify-center";
        wrap.innerHTML = `
            <!-- 全体基準コンテナ -->
            <div class="relative w-full max-w-2xl flex items-center justify-center select-none">
                <!-- 短冊画像 -->
                <img src="${QUIZ_ASSET_PATHS.inputFrame}" class="h-auto max-h-24 sm:max-h-28 object-contain block pointer-events-none drop-shadow-md" alt="短冊">

                <!-- 独立操作レイヤー -->
                <div class="absolute inset-0 pointer-events-none z-10">
                    <!-- テキスト入力エリア（和紙内完全フィット） -->
                    <div class="absolute left-[34%] right-[33%] top-[15%] bottom-[15%] pointer-events-auto flex items-center px-2">
                        <input type="text" id="quiz-direct-input" placeholder="ここに入力..." 
                               class="w-full bg-transparent border-none outline-none font-serif font-black text-stone-900 text-sm sm:text-base md:text-lg placeholder-stone-500/80 tracking-wider" 
                               autocomplete="off">
                    </div>

                    <!-- 決定ボタン判定エリア（木札直上・透明クリック面） -->
                    <button id="quiz-direct-submit" type="button" 
                            class="absolute left-[64%] w-[5.8%] bottom-[13%] h-[34%] pointer-events-auto cursor-pointer active:scale-95 transition opacity-0" 
                            title="決定">
                    </button>
                </div>
            </div>
        `;
        mount.appendChild(wrap);

        const inputEl = document.getElementById('quiz-direct-input');
        const submitBtn = document.getElementById('quiz-direct-submit');

        setTimeout(() => inputEl?.focus(), 100);

        const handleInputSubmit = () => {
            const val = inputEl.value;
            if (!val.trim()) return;
            inputEl.disabled = true;
            submitBtn.style.pointerEvents = 'none';
            const judge = judgeUserAnswer(val, q);
            submitAnswer(judge.isCorrect, q, false, judge.feedback);
        };

        submitBtn.onclick = handleInputSubmit;
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') handleInputSubmit();
        };

    // C. 記述UI【本番確定版】
    } else if (qType === 'desc') {
        const wrap = document.createElement('div');
        // 問題枠と全く同じ幅・配置
        wrap.className = "w-full max-w-3xl mx-auto flex justify-center";
        wrap.innerHTML = `
            <!-- 全体基準コンテナ -->
            <div class="relative w-full aspect-[2.5/1] flex items-center justify-center select-none">
                <!-- 和紙記述画像 (コンテナ全域にフィット) -->
                <img src="${QUIZ_ASSET_PATHS.descFrame}" class="absolute inset-0 w-full h-full object-fill pointer-events-none drop-shadow-lg" alt="記述用紙">

                <!-- 独立操作レイヤー -->
                <div class="absolute inset-0 pointer-events-none z-10">
                    
                    <!-- テキストエリア（和紙内完全フィット） -->
                    <div class="absolute left-[22%] right-[22%] top-[10%] bottom-[30%] pointer-events-auto p-2 flex">
                        <textarea id="quiz-desc-input" placeholder="ここに入力..." 
                                  class="w-full h-full bg-transparent border-none outline-none resize-none font-serif font-bold text-stone-900 text-sm sm:text-base md:text-lg leading-relaxed placeholder-stone-600/90" 
                                  maxlength="200"></textarea>
                    </div>

                    <!-- 文字数カウント -->
                    <div id="quiz-desc-char-count" 
                         class="absolute left-[22%] bottom-[18%] w-[15%] h-[10%] pointer-events-none font-serif font-bold text-xs text-stone-800 flex items-center">
                        0 / 150 字
                    </div>

                    <!-- 「提出」ボタン判定エリア（木札直上・透明クリック面） -->
                    <button id="quiz-desc-submit" type="button" 
                            class="absolute right-[15%] bottom-[10%] w-[12%] h-[28%] pointer-events-auto cursor-pointer active:scale-95 transition opacity-0" 
                            title="提出">
                    </button>
                </div>
            </div>
        `;
        mount.appendChild(wrap);

        const descEl = document.getElementById('quiz-desc-input');
        const submitBtn = document.getElementById('quiz-desc-submit');
        const countEl = document.getElementById('quiz-desc-char-count');

        descEl.oninput = () => {
            countEl.innerText = `${descEl.value.length} / 150 字`;
        };

        setTimeout(() => descEl?.focus(), 100);

        const handleDescSubmit = () => {
            const val = descEl.value;
            if (!val.trim()) return;
            descEl.disabled = true;
            submitBtn.style.pointerEvents = 'none';
            const judge = judgeUserAnswer(val, q);
            submitAnswer(judge.isCorrect, q, false, judge.feedback);
        };

        submitBtn.onclick = handleDescSubmit;
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
    const minutes = Math.floor(remain / 60);
    const seconds = Math.floor(remain % 60);

    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const timerEl = document.getElementById('quiz-timer');
    const bar = document.getElementById('quiz-timer-bar');

    if (timerEl) {
        timerEl.innerText = formatted;
        const ratio = remain / currentQuizSession.perQuestionTime;
        if (ratio <= 0.25) {
            timerEl.className = "relative z-10 font-serif font-black text-red-700 text-base sm:text-lg tracking-tighter animate-pulse";
        } else {
            timerEl.className = "relative z-10 font-serif font-black text-stone-900 text-base sm:text-lg tracking-tighter";
        }
    }

    // ② タイムバーの幅と警告色を更新
    if (bar) {
        const pct = (remain / currentQuizSession.perQuestionTime) * 100;
        bar.style.width = `${pct}%`;

        if (pct <= 25) {
            bar.className = "h-full w-full bg-gradient-to-r from-rose-700 via-red-500 to-rose-400 transition-all";
        } else if (pct <= 50) {
            bar.className = "h-full w-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-400 transition-all";
        } else {
            bar.className = "h-full w-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all";
        }
    }
}

/**
 * quiz_ui.js の回答送信・フィードバック・次へボタン制御部分
 */

function submitAnswer(isCorrect, questionItem, isTimeout = false, feedbackDetail = '', selectedIndex = null) {
    if (currentQuizSession.isLocked) return;
    currentQuizSession.isLocked = true;
    clearInterval(currentQuizSession.timer);

    if (isCorrect) {
        currentQuizSession.score++;
    }

    // 1. 四択ボタンの発光・グレーアウト制御
    const choiceButtons = document.querySelectorAll('.quiz-choice-item');
    if (choiceButtons.length > 0) {
        choiceButtons.forEach((btn, idx) => {
            btn.style.pointerEvents = 'none'; // クリック無効化
            const isThisCorrect = btn.dataset.isCorrect === "true";
            const isThisSelected = (selectedIndex !== null && idx === selectedIndex);

            if (isThisCorrect) {
                // 正解札：青く発光
                btn.className = "quiz-choice-item relative w-full aspect-[4.5/1] flex items-center outline-none overflow-hidden ring-2 ring-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.9)] brightness-115 rounded-lg z-20 scale-[1.02] transition-all duration-300";
            } else if (isThisSelected && !isCorrect) {
                // 誤答札：赤く発光
                btn.className = "quiz-choice-item relative w-full aspect-[4.5/1] flex items-center outline-none overflow-hidden ring-2 ring-rose-600 drop-shadow-[0_0_15px_rgba(225,29,72,0.9)] brightness-115 rounded-lg z-20 scale-[1.02] transition-all duration-300";
            } else {
                // その他札：グレーアウト
                btn.className = "quiz-choice-item relative w-full aspect-[4.5/1] flex items-center outline-none overflow-hidden opacity-35 grayscale brightness-75 rounded-lg transition-all duration-300";
            }
        });
    }

    // 2. 和紙（問題表示枠）の内部を「問題・結果・解説・次へ」に統合
    const qTextEl = document.getElementById('quiz-question-text');
    const correctAnswerStr = questionItem.choice1 || questionItem.answer || "";

   let resultBadgeHtml = '';
    if (isCorrect) {
        resultBadgeHtml = `
            <div class="flex items-center justify-center text-emerald-800 font-serif font-black text-base sm:text-xl tracking-widest">
                <i class="fa-solid fa-circle-check mr-2 text-lg sm:text-2xl text-emerald-700"></i>正解！
                ${feedbackDetail ? `<span class="text-xs font-normal ml-2 text-emerald-900">${feedbackDetail}</span>` : ''}
            </div>
        `;
    } else {
        const reason = isTimeout ? "時間切れ！" : "不正解...";
        resultBadgeHtml = `
            <div class="flex items-center justify-center text-rose-800 font-serif font-black text-base sm:text-xl tracking-widest">
                <i class="fa-solid fa-circle-xmark mr-2 text-lg sm:text-2xl text-rose-700"></i>${reason}
                ${feedbackDetail ? `<span class="text-xs font-normal ml-2 text-rose-900">${feedbackDetail}</span>` : ''}
            </div>
        `;
    }

    if (qTextEl) {
        qTextEl.innerHTML = `
            <div class="w-full h-full flex flex-col justify-between text-stone-900 select-none py-0.5">
                <!-- ① 正解・不正解（上部・1行） -->
                <div class="shrink-0 pb-1 border-b border-stone-400/60">
                    ${resultBadgeHtml}
                </div>

                <!-- ② 問題（中央上・和紙の幅いっぱいに中央揃え） -->
                <div class="flex-1 flex items-center justify-center px-4 py-1 text-center overflow-y-auto no-scrollbar">
                    <p class="font-serif font-bold text-stone-900 text-xs sm:text-sm md:text-base leading-snug">
                        <span class="text-amber-900/80 mr-1 font-bold">【問】</span>${questionItem.question}
                    </p>
                </div>

                <hr class="border-t border-stone-400/60 w-full shrink-0">

                <!-- ③ 解説（中央下・横幅全開で自然に全文表示） -->
                <div class="flex-1 flex items-center justify-start px-4 py-1 text-left overflow-y-auto no-scrollbar">
                    <p class="font-serif text-xs sm:text-sm md:text-base text-sky-950 font-medium leading-relaxed">
                        <span class="text-cyan-800 font-bold mr-1">【解説】</span>${questionItem.explanation || '解説はありません。'}
                    </p>
                </div>

                <!-- ④ 次へボタン（最下段・右寄せ独立バー：インライン確定版） -->
                <div class="shrink-0 pt-0.5 flex justify-end px-2">
                    <button id="quiz-btn-next-question" onclick="proceedToNextQuestion()" 
                            style="background: linear-gradient(to right, #92400e, #b45309, #92400e) !important; border: 1px solid #d97706 !important; color: #fef3c7 !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4) !important;"
                            class="px-5 py-1.5 active:scale-95 font-serif font-black text-xs sm:text-sm rounded-lg flex items-center gap-1.5 cursor-pointer transition">
                        <span>次へ</span>
                        <span style="font-family: sans-serif; font-size: 11px; transform: translateY(-0.5px);">➔</span>
                    </button>
                </div>
            </div>
        `;
    }

    setTimeout(() => {
        document.getElementById('quiz-btn-next-question')?.focus();
    }, 60);
}

// 「次へ進む」ボタン押下時の進行処理
window.proceedToNextQuestion = function() {
    currentQuizSession.currentIndex++;
    if (currentQuizSession.currentIndex < currentQuizSession.questions.length) {
        renderCurrentQuestion();
    } else {
        showQuizResult();
    }
};

// 四択・直打ち・記述の回答ハンドラー更新
// ※ judgeUserAnswer の戻り値 { isCorrect, feedback } を受け取って渡すように対応
function handleAnswerSubmit(userInput, q) {
    const judge = judgeUserAnswer(userInput, q);
    submitAnswer(judge.isCorrect, q, false, judge.feedback);
}

// ==========================================
// 6. リザルト画面（quiz_result.js へ委譲）
// ==========================================
function showQuizResult() {
    if (typeof showQuizResultScreen === 'function') {
        showQuizResultScreen(currentQuizSession, quizSelection);
    } else {
        console.error("quiz_result.js が読み込まれていません。");
    }
}

function restartCurrentTrial() {
    document.getElementById('quiz-result-view')?.classList.add('hidden');
    executeQuizStartCountdown();
}

function openQuizModal() {
    ensureQuizModalDOM();
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.remove('hidden');
    switchQuizBGM(true);
    showView('title');
}

function closeQuizModal() {
    if (typeof currentQuizSession !== 'undefined' && currentQuizSession && currentQuizSession.timer) {
        clearInterval(currentQuizSession.timer);
    }
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.add('hidden');
    closeQuizConfirmDialog();
    switchQuizBGM(false);
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