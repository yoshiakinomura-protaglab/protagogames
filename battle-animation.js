// battle-animation.js - デバフ予約の表示タイミング最適化 ＆ 墨嵐演出完全版
class BattleAnimationManager {
    constructor() {
        this.overlay = null;
        this.isSkipped = false;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initDOM());
        } else {
            this.initDOM();
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    initDOM() {
        if (document.getElementById('battle-anim-overlay')) {
            this.overlay = document.getElementById('battle-anim-overlay');
            return;
        }

        if (!document.body) return;

        const overlayHTML = `
            <div id="battle-anim-overlay" class="fixed inset-0 z-50 bg-slate-950 text-white h-screen w-screen flex flex-col justify-between overflow-hidden font-sans select-none p-2 sm:p-4 hidden">
                <div class="absolute top-3 right-4 text-[10px] sm:text-xs font-mono text-slate-400 animate-pulse z-50 pointer-events-none">
                    [画面タップでスキップ ▶▶]
                </div>

                <div class="flex-1 w-full max-w-5xl mx-auto flex flex-col justify-between items-center pt-2 pb-1 relative">
                    
                    <!-- AREA 1: 画像エリア -->
                    <div id="ba-area-cards" class="w-full flex flex-col items-center flex-shrink-0">
                        <div class="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-3xl">
                            <div id="ba-card-0" class="aspect-[3/4] bg-slate-900 border-2 border-slate-300 rounded-2xl overflow-hidden shadow-2xl relative opacity-0 transition-all duration-300">
                                <img id="ba-card-img-0" src="" class="w-full h-full object-cover object-top">
                                <div id="ba-card-name-0" class="absolute bottom-0 inset-x-0 bg-slate-950/80 p-1 text-center font-yuji text-xs text-amber-300 truncate">--</div>
                            </div>
                            <div id="ba-card-1" class="aspect-[3/4] bg-slate-900 border-2 border-slate-300 rounded-2xl overflow-hidden shadow-2xl relative opacity-0 transition-all duration-300">
                                <img id="ba-card-img-1" src="" class="w-full h-full object-cover object-top">
                                <div id="ba-card-name-1" class="absolute bottom-0 inset-x-0 bg-slate-950/80 p-1 text-center font-yuji text-xs text-amber-300 truncate">--</div>
                            </div>
                            <div id="ba-card-2" class="aspect-[3/4] bg-slate-900 border-2 border-slate-300 rounded-2xl overflow-hidden shadow-2xl relative opacity-0 transition-all duration-300">
                                <img id="ba-card-img-2" src="" class="w-full h-full object-cover object-top">
                                <div id="ba-card-name-2" class="absolute bottom-0 inset-x-0 bg-slate-950/80 p-1 text-center font-yuji text-xs text-amber-300 truncate">--</div>
                            </div>
                        </div>
                    </div>

                    <!-- AREA 2: 特性＆メッセージエリア -->
                    <div id="ba-area-message" class="w-full h-56 flex flex-col items-center justify-center flex-shrink-0 bg-gradient-to-r from-transparent via-slate-950/85 to-transparent backdrop-blur-md my-auto">
                        <div id="ba-message-tag-content" class="flex flex-col items-center justify-center w-full h-full hidden">
                            <div id="ba-tag-sub-label" class="text-xs sm:text-sm font-bold font-yuji text-white/90 tracking-widest text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mb-1">
                                ⚔️ 敵軍特性発動！
                            </div>
                            <div id="ba-giant-tag-text" class="text-4xl sm:text-6xl font-black font-yuji tracking-[0.2em] text-center leading-none"></div>
                        </div>

                        <div id="ba-message-shobu-content" class="flex items-center justify-center w-full h-full hidden">
                            <div id="ba-shobu-text" class="text-6xl sm:text-8xl font-black font-yuji shobu-glow tracking-[0.25em] text-center leading-none my-auto">勝負！</div>
                        </div>
                    </div>

                    <!-- AREA 3: 敵軍数値エリア -->
                    <div id="ba-area-stats" class="w-full flex-1 flex flex-col items-center justify-center relative min-h-[180px]">
                        
                        <!-- 敵軍デバフ予約バッジ配置コンテナ -->
                        <div id="ba-enemy-debuff-badges" class="absolute top-0 right-4 flex flex-col gap-1 items-end z-20"></div>

                        <!-- 段階A: 基本ATK/DEF ＋ 倍率連鎖 -->
                        <div id="ba-stats-phase-1" class="w-full flex flex-col items-center justify-center opacity-0 relative">
                            <div id="ba-base-stats-box" class="grid grid-cols-2 gap-8 sm:gap-16 w-full max-w-2xl text-center">
                                <div>
                                    <div class="text-xs sm:text-sm font-bold text-rose-400 font-yuji mb-1 tracking-wider">敵軍 基本ATK</div>
                                    <div id="ba-base-atk-num" class="text-5xl sm:text-7xl font-impact atk-glow italic pr-3">0</div>
                                </div>
                                <div>
                                    <div class="text-xs sm:text-sm font-bold text-blue-400 font-yuji mb-1 tracking-wider">敵軍 基本DEF</div>
                                    <div id="ba-base-def-num" class="text-5xl sm:text-7xl font-impact def-glow italic pr-3">0</div>
                                </div>
                            </div>

                            <div id="ba-mult-box" class="grid grid-cols-2 gap-6 sm:gap-12 w-full max-w-xl text-center mt-4 sm:mt-6">
                                <div id="ba-box-atk-mult" class="flex flex-col items-center bg-slate-900/90 border-2 border-rose-500/50 p-2.5 sm:p-3 rounded-2xl shadow-2xl overflow-visible transition-all duration-200">
                                    <div class="text-xs font-bold text-rose-300 font-yuji">ATK倍率連鎖</div>
                                    <div id="ba-atk-mult-val" class="text-3xl sm:text-5xl font-impact gold-glow italic mt-0.5 pr-3 inline-block">×1.00</div>
                                </div>
                                <div id="ba-box-def-mult" class="flex flex-col items-center bg-slate-900/90 border-2 border-blue-500/50 p-2.5 sm:p-3 rounded-2xl shadow-2xl overflow-visible transition-all duration-200">
                                    <div class="text-xs font-bold text-blue-300 font-yuji">DEF倍率連鎖</div>
                                    <div id="ba-def-mult-val" class="text-3xl sm:text-5xl font-impact gold-glow italic mt-0.5 pr-3 inline-block">×1.00</div>
                                </div>
                            </div>
                        </div>

                        <!-- 段階B: 確定ATK/DEF -->
                        <div id="ba-stats-phase-2" class="w-full hidden grid grid-cols-2 gap-4 sm:gap-8 text-center px-2">
                            <div class="flex flex-col items-center justify-center">
                                <div class="text-sm sm:text-xl font-black text-rose-300 font-yuji mb-2 tracking-widest bg-rose-950/90 px-6 py-1 rounded-full border-2 border-rose-500 shadow-2xl">⚔️ 確定 敵ATK</div>
                                <div id="ba-final-atk-num" class="text-[14vw] sm:text-[130px] leading-none font-impact atk-glow italic tracking-tighter pr-4">0</div>
                            </div>
                            <div class="flex flex-col items-center justify-center">
                                <div class="text-sm sm:text-xl font-black text-blue-300 font-yuji mb-2 tracking-widest bg-blue-950/90 px-6 py-1 rounded-full border-2 border-blue-500 shadow-2xl">🛡️ 確定 敵DEF</div>
                                <div id="ba-final-def-num" class="text-[14vw] sm:text-[130px] leading-none font-impact def-glow italic tracking-tighter pr-4">0</div>
                            </div>
                        </div>
                    </div>

                    <!-- スライド切替 -->
                    <div id="ba-slide-cutin-banner" class="fixed inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-amber-950/95 border-y-4 border-amber-500 z-40 py-5 shadow-2xl opacity-0 pointer-events-none">
                        <div class="text-center">
                            <div id="ba-cutin-title" class="text-3xl sm:text-4xl font-black font-yuji text-amber-300 tracking-widest drop-shadow"></div>
                            <div id="ba-cutin-sub" class="text-xs sm:text-sm text-amber-100 mt-1 font-bold tracking-wider"></div>
                        </div>
                    </div>
                </div>

                <!-- 対峙ライン -->
                <div class="w-full max-w-5xl mx-auto my-1 flex items-center justify-center relative flex-shrink-0">
                    <div class="w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_15px_rgba(245,158,11,0.8)]"></div>
                    <div class="absolute bg-slate-950 border border-amber-500/80 px-4 py-0.5 rounded-full text-[10px] font-yuji font-bold text-amber-300 shadow-lg tracking-widest">VS 陣形対峙</div>
                </div>

                <!-- AREA 4: 自軍エリア（左：ATK / 右：DEF に左右反転） -->
                <div id="ba-area-player" class="w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-1 flex-shrink-0 relative">
                    
                    <!-- 自軍被デバフ予約バッジ配置コンテナ -->
                    <div id="ba-player-debuff-badges" class="absolute -top-3 right-4 flex flex-col gap-1 items-end z-20"></div>

                    <div id="ba-player-stats-box" class="w-full bg-slate-900/90 border border-slate-700 rounded-2xl p-2 sm:p-3 shadow-2xl relative">
                        <div class="grid grid-cols-2 gap-8 sm:gap-16 w-full max-w-3xl mx-auto text-center">
                            <div>
                                <div class="text-[10px] font-bold text-yellow-300 font-yuji">味方 ATK (攻撃力)</div>
                                <div id="ba-player-atk-num" class="text-3xl sm:text-5xl font-impact yellow-glow italic pr-2">0</div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-emerald-400 font-yuji">味方 DEF (防御力)</div>
                                <div id="ba-player-def-num" class="text-3xl sm:text-5xl font-impact green-glow italic pr-2">0</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHTML);
        this.overlay = document.getElementById('battle-anim-overlay');

        this.overlay.addEventListener('click', () => {
            if (this.isSkipped) return;
            this.isSkipped = true;

            const isFinalGame = this.currentData && this.currentData.isGameOver;

            if (!isFinalGame) {
                // 通常ターン：黒渦（墨嵐）を上から重ねる
                if (!document.querySelector('.sumi-arashi-overlay')) {
                    const sumiEl = document.createElement('div');
                    sumiEl.className = 'sumi-arashi-overlay';
                    document.body.appendChild(sumiEl);
                    this.triggerShake();
                }
            } else {
                // 決着ターン：アニメは動かしたまま、上からゆっくりホワイトアウトを被せる
                if (!document.querySelector('.whiteout-transition-overlay')) {
                    const whiteOverlay = document.createElement('div');
                    whiteOverlay.className = 'whiteout-transition-overlay';
                    document.body.appendChild(whiteOverlay);
                    
                    // 描画フレームを挟んでから滑らかに opacity 1 へ変化
                    requestAnimationFrame(() => {
                        whiteOverlay.style.opacity = '1';
                    });
                }
            }
        });
    }

    triggerShake() {
        if (!this.overlay) return;
        this.overlay.classList.remove('heavy-shake');
        void this.overlay.offsetWidth;
        this.overlay.classList.add('heavy-shake');
    }

    highlightCards(cardIndexes, category = 'GEN') {
        this.clearCardGlows();

        let glowClass = 'card-glow-gold';
        if (category === 'ATK') glowClass = 'card-glow-red';
        if (category === 'DEF') glowClass = 'card-glow-blue';
        if (category === 'DEB') glowClass = 'card-glow-purple';

        (cardIndexes || []).forEach(idx => {
            const card = document.getElementById(`ba-card-${idx}`);
            if (card) {
                card.classList.remove('border-slate-300');
                card.classList.add(glowClass);
            }
        });
    }

    clearCardGlows() {
        [0, 1, 2].forEach(idx => {
            const card = document.getElementById(`ba-card-${idx}`);
            if (card) {
                card.classList.remove('card-glow-red', 'card-glow-blue', 'card-glow-gold', 'card-glow-purple');
                card.classList.add('border-slate-300');
            }
        });
    }

    async showGiantTag(text, category = 'GEN') {
        const tagContent = document.getElementById('ba-message-tag-content');
        const shobuContent = document.getElementById('ba-message-shobu-content');
        const giantTagText = document.getElementById('ba-giant-tag-text');
        
        if (!tagContent || !giantTagText) return;

        shobuContent.classList.add('hidden');
        tagContent.classList.remove('hidden');

        giantTagText.innerText = text;
        giantTagText.className = "text-4xl sm:text-6xl font-black font-yuji tracking-[0.2em] text-center leading-none";

        if (category === 'ATK') {
            giantTagText.classList.add('red-glow');
        } else if (category === 'DEF') {
            giantTagText.classList.add('blue-glow');
        } else if (category === 'DEB') {
            giantTagText.classList.add('purple-glow');
        } else {
            giantTagText.classList.add('gold-glow');
        }

        giantTagText.classList.remove('pop-slam');
        void giantTagText.offsetWidth;
        giantTagText.classList.add('pop-slam');
        this.triggerShake();
    }

    async runSlideAcross(title, sub, bgBorderStyle = "bg-amber-950/95 border-amber-500") {
        const slideBanner = document.getElementById('ba-slide-cutin-banner');
        if (!slideBanner) return;
        document.getElementById('ba-cutin-title').innerHTML = title;
        document.getElementById('ba-cutin-sub').innerText = sub;
        slideBanner.className = `fixed inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center ${bgBorderStyle} border-y-4 z-40 py-5 shadow-2xl opacity-100 slide-across`;
        this.triggerShake();
        await this.sleep(1400);
        slideBanner.className = "fixed inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-amber-950/95 border-y-4 border-amber-500 z-40 py-5 opacity-0 pointer-events-none";
    }

    // デバフ予約バッジ追加（絵文字削除・和風表記化）
    addDebuffBadge(isPlayerDebuffToEnemy, tagName, mult) {
        const containerId = isPlayerDebuffToEnemy ? 'ba-enemy-debuff-badges' : 'ba-player-debuff-badges';
        const container = document.getElementById(containerId);
        if (!container) return;

        const badgeId = `badge-${isPlayerDebuffToEnemy ? 'p' : 'e'}-${tagName}`;
        if (document.getElementById(badgeId)) return;

        const label = isPlayerDebuffToEnemy ? '敵弱体' : '自軍弱体';
        const badgeHTML = `
            <div id="${badgeId}" class="debuff-badge pop-slam">
                <span>${label}: ${tagName} (×${mult})</span>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', badgeHTML);
    }

    // モヤモヤの中央にピッタリ重なるテキスト（絶対配置・最前面z-index:9999）
    async triggerPurpleFogEffect(targetAreaId, titleText, onEffectApplied) {
        const targetArea = document.getElementById(targetAreaId);
        if (!targetArea) return;

        const fogEl = document.createElement('div');
        fogEl.className = 'purple-fog-overlay';

        const textEl = document.createElement('div');
        textEl.className = 'absolute inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-none pop-slam p-2';
        textEl.innerHTML = `
            <div class="bg-slate-950/90 border-2 border-purple-400 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.9)] text-center">
                <div class="text-xl sm:text-3xl font-black font-yuji text-yellow-300 tracking-widest drop-shadow-[0_4px_8px_rgba(0,0,0,1)]">
                    ${titleText}
                </div>
                <div class="text-xs sm:text-sm font-bold text-purple-200 mt-1 tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    ステータス減少効果適用！
                </div>
            </div>
        `;

        targetArea.appendChild(fogEl);
        targetArea.appendChild(textEl);
        this.triggerShake();

        await this.sleep(800);
        if (onEffectApplied) onEffectApplied();

        targetArea.classList.remove('stat-drop');
        void targetArea.offsetWidth;
        targetArea.classList.add('stat-drop');

        await this.sleep(800);
        fogEl.remove();
        textEl.remove();
    }

    async play(data) {
        this.isSkipped = false;
        this.currentData = data; // ★ 今回の再生データを保持
        this.isGameOver = Boolean(data && data.isGameOver);
        if (!this.overlay) this.initDOM();
        if (!this.overlay) return;

        this.resetUI(data);
        this.overlay.classList.remove('hidden');

        // ★ アニメーション再生（スキップ時は裏でアニメが流れたまま黒渦が上から被さる）
        await this.runSequence(data);

        // ★ 2. 通常ターンのスキップ時のみ：黒渦が完全に不透明になるまでアニメを保持
        if (!this.isGameOver && this.isSkipped) {
            await this.sleep(400);
        }

        // ★ 3. 通常ターンのみアニメ画面を隠す（決着時は main.js のホワイトアウト100%到達後に隠すため維持）
        if (!this.isGameOver) {
            this.overlay.classList.add('hidden');
        }
    }

    resetUI(data) {
        // ★ 再戦時のフリーズ防止：内部状態とフラグを完全にリセット！
        this.isSkipped = false;
        this.isGameOver = Boolean(data && data.isGameOver);
        this.currentData = data;

        // 残存している白幕・黒幕・モヤモヤがあれば綺麗に即時消去
        document.querySelectorAll('.whiteout-transition-overlay, .sumi-arashi-overlay, .purple-fog-overlay').forEach(el => el.remove());

        (data.cpuCards || []).forEach((c, i) => {
            if (i < 3) {
                document.getElementById(`ba-card-img-${i}`).src = c.image || 'images/default.jpg';
                document.getElementById(`ba-card-name-${i}`).innerText = c.name || '';
                const cardEl = document.getElementById(`ba-card-${i}`);
                if (cardEl) cardEl.className = "aspect-[3/4] bg-slate-900 border-2 border-slate-300 rounded-2xl overflow-hidden shadow-2xl relative opacity-0 transition-all duration-300";
            }
        });

        this.clearCardGlows();

        this.clearCardGlows();
        
        // ★ バッジエリアを完全にクリア（数値表示時までバッジを出さない）
        document.getElementById('ba-enemy-debuff-badges').innerHTML = '';
        document.getElementById('ba-player-debuff-badges').innerHTML = '';

        document.getElementById('ba-message-tag-content').classList.add('hidden');
        document.getElementById('ba-message-shobu-content').classList.add('hidden');
        document.getElementById('ba-shobu-text').classList.remove('pop-slam');

        document.getElementById('ba-stats-phase-1').className = "w-full flex flex-col items-center justify-center opacity-0";
        document.getElementById('ba-stats-phase-2').className = "w-full hidden grid grid-cols-2 gap-4 sm:gap-8 text-center px-2";

        document.getElementById('ba-base-atk-num').innerText = (data.enemyBaseAtk || 0).toLocaleString();
        document.getElementById('ba-base-def-num').innerText = (data.enemyBaseDef || 0).toLocaleString();
        document.getElementById('ba-atk-mult-val').innerText = "×1.00";
        document.getElementById('ba-def-mult-val').innerText = "×1.00";

        document.getElementById('ba-player-atk-num').innerText = (data.playerBaseAtk || data.playerAtk || 0).toLocaleString();
        document.getElementById('ba-player-def-num').innerText = (data.playerBaseDef || data.playerDef || 0).toLocaleString();
    }

    async runSequence(data) {
        await this.sleep(300); if(this.isSkipped) return;

        // ★ 横切りカットイン「⚔️ 敵軍 参陣！」
        await this.runSlideAcross("⚔️ 敵軍 参陣！", "敵軍のカードが配置されます！", "bg-rose-950/95 border-rose-600");
        await this.sleep(300); if(this.isSkipped) return;
        
        // 1. 武将カード叩きつけ登場
        for (let i = 0; i < 3; i++) {
            const card = document.getElementById(`ba-card-${i}`);
            if (card) {
                card.classList.remove('opacity-0');
                card.classList.add('slam-in');
                this.triggerShake();
                await this.sleep(450); if(this.isSkipped) return;
            }
        }

        // 2. 基本ATK/DEFを表示
        const statsPhase1 = document.getElementById('ba-stats-phase-1');
        statsPhase1.classList.remove('opacity-0');
        statsPhase1.classList.add('pop-slam');

        // ★【ここがポイント！】基本数値が表示されると同時に自軍デバフバッジを右上に出現させる！
        if (data.playerDebuffs && data.playerDebuffs.length > 0) {
            data.playerDebuffs.forEach(d => {
                this.addDebuffBadge(true, d.name, d.mult || 0.7);
            });
        }

        this.triggerShake();
        await this.sleep(1200); if(this.isSkipped) return;

        // 3. 特性タグの順番発動
        let lastAtkMult = 1.0;
        let lastDefMult = 1.0;

        for (const tag of (data.tags || [])) {
            this.highlightCards(tag.targetIndexes || [], tag.category || 'GEN');
            await this.showGiantTag(tag.name, tag.category || 'GEN');

            // 敵の特性タグがデバフ（DEB）だった瞬間に、敵デバフバッジを表示！
            if (tag.category === 'DEB') {
                this.addDebuffBadge(false, tag.name, tag.debMult || tag.mult || 0.7);
            }
            
            await this.sleep(200); if(this.isSkipped) return;

            // 通常特性（ATK/DEF/GEN/SUP）の場合は倍率を更新
            if (tag.category !== 'DEB') {
                const boxAtk = document.getElementById('ba-box-atk-mult');
                const boxDef = document.getElementById('ba-box-def-mult');

                document.getElementById('ba-atk-mult-val').innerText = `×${tag.atkMult.toFixed(2)}`;
                document.getElementById('ba-def-mult-val').innerText = `×${tag.defMult.toFixed(2)}`;

                if (tag.atkMult > lastAtkMult && boxAtk) {
                    boxAtk.classList.add('scale-110');
                    setTimeout(() => boxAtk.classList.remove('scale-110'), 250);
                }
                if (tag.defMult > lastDefMult && boxDef) {
                    boxDef.classList.add('scale-110');
                    setTimeout(() => boxDef.classList.remove('scale-110'), 250);
                }

                lastAtkMult = tag.atkMult;
                lastDefMult = tag.defMult;
            }

            await this.sleep(1200); if(this.isSkipped) return;
        }

        this.clearCardGlows();
        document.getElementById('ba-message-tag-content').classList.add('hidden');

        // ★ 3.5. 敵軍ポーカー役演出の追加
        if (data.poker && data.poker.multiplier > 1.0) {
            await this.runSlideAcross(`🃏 敵軍役発動：${data.poker.name}`, `役効果により倍率上昇！`, "bg-purple-950/95 border-purple-500");
            if (data.poker.atkMult) document.getElementById('ba-atk-mult-val').innerText = `×${data.poker.atkMult.toFixed(2)}`;
            if (data.poker.defMult) document.getElementById('ba-def-mult-val').innerText = `×${data.poker.defMult.toFixed(2)}`;
            await this.sleep(1200); if(this.isSkipped) return;
        }

        // 4. じゃんけん判定
        if (data.janken) {
            await this.runSlideAcross(data.janken.title, data.janken.sub, "bg-amber-950/95 border-amber-500");
            
            // 敵軍倍率の更新
            if (data.janken.atkMult) document.getElementById('ba-atk-mult-val').innerText = `×${data.janken.atkMult.toFixed(2)}`;
            if (data.janken.defMult) document.getElementById('ba-def-mult-val').innerText = `×${data.janken.defMult.toFixed(2)}`;

            // ★ 自軍数値の更新（じゃんけん結果のみ反映・デバフ未適用の数値！）＆ 振動演出
            const playerStatsBox = document.getElementById('ba-player-stats-box');
            if (playerStatsBox) {
                const jankenAtk = data.playerAfterJankenAtk !== undefined ? data.playerAfterJankenAtk : (data.playerAtk || 0);
                const jankenDef = data.playerAfterJankenDef !== undefined ? data.playerAfterJankenDef : (data.playerDef || 0);

                document.getElementById('ba-player-atk-num').innerText = jankenAtk.toLocaleString();
                document.getElementById('ba-player-def-num').innerText = jankenDef.toLocaleString();

                playerStatsBox.classList.remove('pop-slam');
                void playerStatsBox.offsetWidth;
                playerStatsBox.classList.add('pop-slam');
                this.triggerShake();
            }

            await this.sleep(1200); if(this.isSkipped) return;
        }
        
        // 5. 紫の妖気モヤモヤ（デバフ発動フェーズ）

        // ① 自軍デバフ発動（敵を弱体化！）➔ ba-stats-phase-1 の枠内中央に表示
        if (data.playerDebuffs && data.playerDebuffs.length > 0) {
            const d = data.playerDebuffs[0];
            await this.triggerPurpleFogEffect('ba-stats-phase-1', `敵軍弱体【${d.name}】`, () => {
                if (data.enemyAfterDebuffAtkMult) document.getElementById('ba-atk-mult-val').innerText = `×${data.enemyAfterDebuffAtkMult.toFixed(2)}`;
                if (data.enemyAfterDebuffDefMult) document.getElementById('ba-def-mult-val').innerText = `×${data.enemyAfterDebuffDefMult.toFixed(2)}`;
            });
            await this.sleep(600); if(this.isSkipped) return;
        }

        // ② 敵軍デバフ発動（味方が弱体化！）➔ ba-player-stats-box（味方数値枠本体）の枠内中央に表示
        if (data.enemyDebuffs && data.enemyDebuffs.length > 0) {
            const d = data.enemyDebuffs[0];
            await this.triggerPurpleFogEffect('ba-player-stats-box', `自軍弱体【${d.name}】`, () => {
                document.getElementById('ba-player-atk-num').innerText = (data.playerAtk || 0).toLocaleString();
                document.getElementById('ba-player-def-num').innerText = (data.playerDef || 0).toLocaleString();
            });
            await this.sleep(600); if(this.isSkipped) return;
        }

        statsPhase1.classList.add('hidden');

        // 6. 「勝負！」＆ 最終確定数値表示
        const shobuContent = document.getElementById('ba-message-shobu-content');
        shobuContent.classList.remove('hidden');
        document.getElementById('ba-shobu-text').classList.add('pop-slam');

        document.getElementById('ba-final-atk-num').innerText = (data.enemyFinalAtk || 0).toLocaleString();
        document.getElementById('ba-final-def-num').innerText = (data.enemyFinalDef || 0).toLocaleString();

        const statsPhase2 = document.getElementById('ba-stats-phase-2');
        statsPhase2.classList.remove('hidden');
        statsPhase2.classList.add('flash-glow-mega');
        this.triggerShake();
        await this.sleep(2200); if(this.isSkipped) return;

       // 7. 演出の締めくくり
        if (this.isSkipped) {
            // スキップ時は残存バッジやモヤモヤを即時消去
            document.querySelectorAll('.purple-fog-overlay').forEach(el => el.remove());
        }

        if (!this.isGameOver) {
            // --- 【通常ターン】：黒渦が100%覆うのを待ってからアニメUI消去 ---
            if (!document.querySelector('.sumi-arashi-overlay')) {
                const sumiEl = document.createElement('div');
                sumiEl.className = 'sumi-arashi-overlay';
                document.body.appendChild(sumiEl);
                this.triggerShake();
            }

            await this.sleep(400);
            this.overlay.classList.add('hidden');

        } else {
            // --- 【決着ターン】：白幕が100%真っ白（透過率0%）になるまで待機 ---
            let whiteEl = document.querySelector('.whiteout-transition-overlay');
            if (!whiteEl) {
                whiteEl = document.createElement('div');
                whiteEl.className = 'whiteout-transition-overlay';
                document.body.appendChild(whiteEl);
                requestAnimationFrame(() => {
                    whiteEl.style.opacity = '1';
                });
            }

            // ★ 白幕が滑らかに画面を100%覆い尽くす（透過率0%になる）までしっかりアニメを流しながら待つ！(500ms)
            await this.sleep(500);

            // 100%真っ白になった瞬間にアニメ画面を消して main.js へバトンタッチ！
            this.overlay.classList.add('hidden');
        }
    }
}

window.battleAnim = new BattleAnimationManager();