/**
 * p2p_manager.js - P2P対戦状態・デッキ同期・再戦調停マネージャー
 */

export class P2PManager {
    constructor(networkInstance, gameHooks = {}) {
        this.network = networkInstance;
        this.gameHooks = gameHooks;
        
        this.timerId = null;
        this.timeLeft = 30;
        this.timerUIContainer = null;
        this.timerTextElement = null;

        if (this.network) {
            this.network.onDataReceivedCallback = (data) => this.handleIncomingPacket(data);
        }
    }

    injectTimerUI() {
        if (document.getElementById('p2p-timer-badge')) return;

        const container = document.createElement('div');
        container.id = 'p2p-timer-badge';
        container.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-full shadow-lg backdrop-blur';

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

    removeTimerUI() {
        if (this.timerUIContainer) {
            this.timerUIContainer.remove();
            this.timerUIContainer = null;
            this.timerTextElement = null;
        }
    }

    startTurnTimer() {
        this.stopTurnTimer();
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

    stopTurnTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.removeTimerUI();
    }

    updateTimerDisplay() {
        if (!this.timerTextElement) return;

        this.timerTextElement.innerText = `⏳ ${this.timeLeft}s`;

        if (this.timeLeft <= 5 && this.timeLeft > 0) {
            this.timerTextElement.className = 'text-2xl font-black text-rose-500 font-mono min-w-[3rem] text-center animate-ping';
            this.timerUIContainer.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-rose-950/90 border-2 border-rose-500 px-5 py-2 rounded-full shadow-2xl backdrop-blur';
        } else {
            this.timerTextElement.className = 'text-xl font-black text-amber-400 font-mono min-w-[3rem] text-center';
            this.timerUIContainer.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-full shadow-lg backdrop-blur';
        }
    }

    handleTimeout() {
        const currentSelected = this.gameHooks.getSelectedCards ? this.gameHooks.getSelectedCards() : [];
        const neededCount = 3 - currentSelected.length;

        if (neededCount > 0 && this.gameHooks.autoSelectRemaining) {
            this.gameHooks.autoSelectRemaining(neededCount);
        }

        if (this.gameHooks.submitTurn) {
            this.gameHooks.submitTurn();
        }
    }

    handleIncomingPacket(packet) {
        switch (packet.type) {
            case 'DECK_READY': // 相手がデッキ決定
                if (this.gameHooks.onOpponentDeckReady) this.gameHooks.onOpponentDeckReady(packet.payload);
                break;

            case 'HAND_STAT_UPDATE': // ★追加: 相手の手札・山札ステータス（危険度・じゃんけん枚数）
                if (this.gameHooks.onOpponentHandStatUpdate) this.gameHooks.onOpponentHandStatUpdate(packet.payload);
                break;

            case 'TURN_CHOICE': // 相手の3枚選択
                if (this.gameHooks.onOpponentTurnChoice) this.gameHooks.onOpponentTurnChoice(packet.payload);
                break;

            case 'REMATCH_SAME': // 相手が「同じデッキで再戦」を希望
                if (this.gameHooks.onOpponentRematchSame) this.gameHooks.onOpponentRematchSame();
                break;

            case 'CHANGE_DECK': // 相手が「デッキを選び直す」を選択
                if (this.gameHooks.onOpponentChangeDeck) this.gameHooks.onOpponentChangeDeck();
                break;

            default:
                console.log('[P2P Manager] 受信パケット:', packet);
        }
    }

    // パケット送信フック
    sendDeckReady(deckData) {
        return this.network.send('DECK_READY', deckData);
    }

    // ★追加: 自分の手札ステータス（危険度パワー・じゃんけん枚数）を相手に送信
    sendHandStatUpdate(statData) {
        return this.network.send('HAND_STAT_UPDATE', statData);
    }

    sendTurnChoice(selectedCardsData) {
        this.stopTurnTimer();
        return this.network.send('TURN_CHOICE', selectedCardsData);
    }

    sendRematchSame() {
        return this.network.send('REMATCH_SAME', {});
    }

    sendChangeDeck() {
        return this.network.send('CHANGE_DECK', {});
    }
}
