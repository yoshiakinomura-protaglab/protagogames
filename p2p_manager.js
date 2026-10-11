/**
 * p2p_manager.js - P2P対戦状態＆タイマー動的管理モジュール
 * 役割: ターン同期、30秒制限タイマーUIの動的注入、タイムアウト時の自動カード選択
 */

export class P2PManager {
    /**
     * @param {P2PNetwork} networkInstance p2p_network.js のインスタンス
     * @param {Object} gameHooks ゲーム本体の操作関数（カード選択、出撃決定などのコールバック）
     */
    constructor(networkInstance, gameHooks = {}) {
        this.network = networkInstance;
        this.gameHooks = gameHooks; // { getSelectedCards, selectCardByIndex, submitTurn }
        
        // タイマー状態
        this.timerId = null;
        this.timeLeft = 30;
        this.timerUIContainer = null;
        this.timerTextElement = null;

        // パケット受信時のハンドラー登録
        if (this.network) {
            this.network.onDataReceivedCallback = (data) => this.handleIncomingPacket(data);
        }
    }

    // ==========================================
    // 1. 動的UI (タイマー) の注入と制御
    // ==========================================

    /**
     * 30秒タイマーのUIを画面上部（ヘッダー付近）に動的挿入
     */
    injectTimerUI() {
        if (document.getElementById('p2p-timer-badge')) return;

        // タイマー要素を作成
        const container = document.createElement('div');
        container.id = 'p2p-timer-badge';
        container.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-full shadow-lg backdrop-blur transition-all duration-300';

        container.innerHTML = `
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Turn Time</span>
            <div id="p2p-timer-text" class="text-xl font-black text-amber-400 font-mono min-w-[3rem] text-center">
                ⏳ 30s
            </div>
        `;

        document.body.appendChild(container);
        this.timerUIContainer = container;
        this.timerTextElement = document.getElementById('p2p-timer-text');
    }

    /**
     * タイマーUIの削除
     */
    removeTimerUI() {
        if (this.timerUIContainer) {
            this.timerUIContainer.remove();
            this.timerUIContainer = null;
            this.timerTextElement = null;
        }
    }

    /**
     * 30秒カウントダウンを開始
     */
    startTurnTimer() {
        this.stopTurnTimer(); // 二重起動防止
        this.injectTimerUI();

        this.timeLeft = 30;
        this.updateTimerDisplay();

        this.timerId = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                this.stopTurnTimer();
                this.handleTimeout();
            }
        }, 1000);
    }

    /**
     * タイマーを停止
     */
    stopTurnTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    /**
     * 残り時間に応じて表示・アニメーションを変更
     */
    updateTimerDisplay() {
        if (!this.timerTextElement) return;

        this.timerTextElement.innerText = `⏳ ${this.timeLeft}s`;

        // 残り5秒以下の強烈な演出（赤色＆拡大・点滅）
        if (this.timeLeft <= 5 && this.timeLeft > 0) {
            this.timerTextElement.className = 'text-2xl font-black text-rose-500 font-mono min-w-[3rem] text-center animate-ping';
            this.timerUIContainer.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-rose-950/90 border-2 border-rose-500 px-5 py-2 rounded-full shadow-2xl backdrop-blur';
        } else {
            this.timerTextElement.className = 'text-xl font-black text-amber-400 font-mono min-w-[3rem] text-center';
            this.timerUIContainer.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-full shadow-lg backdrop-blur';
        }
    }

    // ==========================================
    // 2. タイムアウト（放置時）の補正処理
    // ==========================================

    /**
     * 0秒になった時の強制選択ロジック
     */
    handleTimeout() {
        console.warn('[P2P Manager] タイムアウト発生！足りないカードを左から自動選択します。');

        if (this.timerTextElement) {
            this.timerTextElement.innerText = '⚠️ TIME OUT';
            this.timerTextElement.className = 'text-sm font-bold text-rose-400 font-mono text-center';
        }

        // ゲーム本体側から現在の選択カード状況を取得
        const currentSelected = this.gameHooks.getSelectedCards ? this.gameHooks.getSelectedCards() : [];
        const neededCount = 3 - currentSelected.length;

        // 3枚に満たない場合、左端（インデックス0番）から順に未選択カードを選択補正
        if (neededCount > 0 && this.gameHooks.autoSelectRemaining) {
            this.gameHooks.autoSelectRemaining(neededCount);
        }

        // 決定・送信処理の自動実行
        if (this.gameHooks.submitTurn) {
            this.gameHooks.submitTurn();
        }
    }

    // ==========================================
    // 3. 通信パケットの調停・同期ハンドラー
    // ==========================================

    /**
     * 受信パケットの振り分け処理
     */
    handleIncomingPacket(packet) {
        switch (packet.type) {
            case 'GAME_START':
                console.log('[P2P Manager] 対戦開始パケット受信', packet.payload);
                this.startTurnTimer();
                if (this.gameHooks.onGameStart) this.gameHooks.onGameStart(packet.payload);
                break;

            case 'TURN_CHOICE':
                console.log('[P2P Manager] 相手の手札選択受信', packet.payload);
                if (this.gameHooks.onOpponentSubmitted) this.gameHooks.onOpponentSubmitted(packet.payload);
                break;

            case 'NEXT_TURN':
                console.log('[P2P Manager] 次ターン開始パケット受信');
                this.startTurnTimer();
                if (this.gameHooks.onNextTurn) this.gameHooks.onNextTurn();
                break;

            default:
                console.log('[P2P Manager] 未定義のパケット:', packet);
        }
    }

    /**
     * 自分の手札選択が完了した際に呼ぶメソッド
     */
    sendTurnChoice(selectedCardsData) {
        this.stopTurnTimer();
        if (this.timerTextElement) {
            this.timerTextElement.innerText = '⌛ 相手待機中...';
            this.timerTextElement.className = 'text-xs text-slate-400 font-bold';
        }
        return this.network.send('TURN_CHOICE', selectedCardsData);
    }
}