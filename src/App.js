import React, { useState, useEffect, useRef } from "react";
import { database } from "./firebase";
import { ref, onValue, set, update, get, remove } from "firebase/database";

// ============================================================================
// 1. CONFIGURAÇÕES GERAIS E CONSTANTES
// ============================================================================
const SUITS = {
  hearts: { symbol: "♥️", color: "text-red-600", name: "Copas" },
  diamonds: { symbol: "♦️", color: "text-red-600", name: "Ouros" },
  clubs: { symbol: "♣️", color: "text-slate-900", name: "Paus" },
  spades: { symbol: "♠️", color: "text-slate-900", name: "Espadas" },
};

const RANKS = [
  { label: "A" },
  { label: "7" },
  { label: "K" },
  { label: "J" },
  { label: "Q" },
  { label: "6" },
  { label: "5" },
  { label: "4" },
  { label: "3" },
  { label: "2" },
];

const POINTS_GOAL = 31;

export default function App() {
  // ============================================================================
  // 2. ESTADOS DO FIREBASE E LOBBY (SISTEMA DE PIN)
  // ============================================================================
  const [playerName, setPlayerName] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [me, setMe] = useState(null); // { id, name, isHost }
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [localProcessing, setLocalProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentHint, setCurrentHint] = useState(null);

  // Referência para evitar bugs de lag
  const stateRef = useRef(roomData);
  useEffect(() => {
    stateRef.current = roomData;
  }, [roomData]);

  // Limpa a dica quando a mesa muda
  useEffect(() => {
    setCurrentHint(null);
  }, [roomData?.tableCards?.length, roomData?.turn]);

  // ============================================================================
  // 3. FUNÇÕES DE REDE E LOBBY
  // ============================================================================
  const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

  const createRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Digite seu nome primeiro!");
    const newPin = generatePin();
    const myId = `player_${Date.now()}`;
    const newMe = { id: myId, name: playerName, isHost: true };

    const initialRoomData = {
      gameState: "lobby",
      hostId: myId,
      players: { [myId]: newMe },
      deck: [],
      tableCards: [],
      trumpSuit: null,
      turn: null,
      hands: {},
      roundScores: { [myId]: 0 },
      gamePoints: { [myId]: 0 },
      tocoTarget: null,
      lives: 3,
      trickHistory: [],
    };

    await set(ref(database, `rooms/${newPin}`), initialRoomData);
    setMe(newMe);
    setRoomId(newPin);
  };

  const joinRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Digite seu nome primeiro!");
    if (!pinInput.trim() || pinInput.length !== 4)
      return setErrorMsg("Digite um PIN válido de 4 números!");

    const roomRef = ref(database, `rooms/${pinInput}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
      const myId = `player_${Date.now()}`;
      const newMe = { id: myId, name: playerName, isHost: false };

      await update(ref(database, `rooms/${pinInput}/players`), {
        [myId]: newMe,
      });

      await update(ref(database, `rooms/${pinInput}/roundScores`), {
        [myId]: 0,
      });
      await update(ref(database, `rooms/${pinInput}/gamePoints`), {
        [myId]: 0,
      });

      setMe(newMe);
      setRoomId(pinInput);
    } else {
      setErrorMsg("Sala não encontrada. Verifique o PIN.");
    }
  };

  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setRoomData(snapshot.val());
      } else {
        setErrorMsg("A sala foi fechada.");
        setRoomId(null);
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  const syncState = (updates) => {
    if (!roomId) return;
    update(ref(database, `rooms/${roomId}`), updates);
  };

  // ============================================================================
  // 4. LÓGICA DO JOGO
  // ============================================================================
  const playersList = roomData?.players ? Object.values(roomData.players) : [];
  const gameState = roomData?.gameState || "lobby";
  const tableCards = roomData?.tableCards || [];
  const deck = roomData?.deck || [];
  const hands = roomData?.hands || {};
  const turn = roomData?.turn;
  const trumpSuit = roomData?.trumpSuit;
  const roundScores = roomData?.roundScores || {};
  const gamePoints = roomData?.gamePoints || {};
  const tocoTarget = roomData?.tocoTarget;
  const lives = roomData?.lives || 3;
  const trickHistory = roomData?.trickHistory || [];
  const trickFeedback = roomData?.trickFeedback || null;
  const roundResult = roomData?.roundResult || null;

  const getCardPower = (card, currentTrump, leadSuit) => {
    const basePower = {
      A: 100,
      7: 90,
      K: 80,
      J: 70,
      Q: 60,
      6: 50,
      5: 40,
      4: 30,
      3: 20,
      2: 10,
    };
    let power = basePower[card.label] || 0;
    if (card.suit === currentTrump) {
      let trumpPower = 0;
      if (card.label === "A") trumpPower = 100;
      if (card.label === "3") trumpPower = 95;
      if (card.label === "7") trumpPower = 90;
      if (card.label === "2") trumpPower = 85;
      if (card.label === "K") trumpPower = 80;
      if (card.label === "4") trumpPower = 75;
      if (card.label === "J") trumpPower = 70;
      if (card.label === "5") trumpPower = 65;
      if (card.label === "Q") trumpPower = 60;
      if (card.label === "6") trumpPower = 55;
      return 1000 + trumpPower;
    }
    if (card.suit === leadSuit) return 100 + power;
    return 0;
  };

  const getCardPoints = (card, currentTrump) => {
    const label = card.label;
    const isTrump = card.suit === currentTrump;
    if (label === "A") return 11;
    if (label === "7") return 10;
    if (label === "K") return 4;
    if (label === "J") return 3;
    if (label === "Q") return 2;
    if (isTrump) {
      if (label === "3") return 10;
      if (label === "2") return 10;
      if (label === "4") return 4;
      if (label === "5") return 3;
      if (label === "6") return 2;
    }
    return 0;
  };

  // ============================================================================
  // O "CÉREBRO" DE DICAS (Inteligência Artificial do Toco - ATUALIZADO)
  // ============================================================================
  const generateHint = () => {
    if (!me?.id || turn !== me.id) return;

    const myHand = hands[me.id] || [];
    if (myHand.length === 0) return;

    const myCurrentScore = roundScores[me.id] || 0;
    const isFirstToPlay = tableCards.length === 0;

    let bestCard = null;
    let explanation = "";

    // Separar as cartas em grupos lógicos
    const myTrumps = myHand
      .filter((card) => card.suit === trumpSuit)
      .sort(
        (a, b) =>
          getCardPower(a, trumpSuit, trumpSuit) -
          getCardPower(b, trumpSuit, trumpSuit)
      );
    const lowTrumps = myTrumps.filter((card) =>
      ["Q", "J", "K", "4", "5", "6"].includes(card.label)
    );
    const sortedHandByPtsAsc = [...myHand].sort(
      (a, b) => getCardPoints(a, trumpSuit) - getCardPoints(b, trumpSuit)
    );

    // REGRA DE OURO: Tudo ou Nada (Se bater 31, joga!)
    if (!isFirstToPlay) {
      const opCard = tableCards[0].card;
      const leadSuit = opCard.suit;
      const tablePoints = getCardPoints(opCard, trumpSuit);
      const opPower = getCardPower(opCard, trumpSuit, leadSuit);

      for (let card of myHand) {
        const cardPts = getCardPoints(card, trumpSuit);
        const cardPower = getCardPower(card, trumpSuit, leadSuit);

        // Se eu ganho a mão E a soma passa de 31
        if (
          cardPower > opPower &&
          myCurrentScore + tablePoints + cardPts >= POINTS_GOAL
        ) {
          setCurrentHint({
            cardId: card.id,
            text: "Jogue esta! Você vai chegar aos 31 pontos e ganhar a partida agora!",
          });
          return;
        }
      }
    }

    if (isFirstToPlay) {
      // SOU O PRIMEIRO A JOGAR
      if (lowTrumps.length > 0) {
        bestCard = lowTrumps[0]; // Menor trunfo para pescar
        explanation =
          "Tática da Pescaria: Saia cortando baixo para forçar o oponente a gastar um trunfo alto à toa ou te dar a mão de graça.";
      } else {
        // Pega a carta da mão que dá MENOS PONTOS para o oponente
        bestCard = sortedHandByPtsAsc[0];
        const pts = getCardPoints(bestCard, trumpSuit);

        if (pts === 0) {
          explanation =
            "Saída Segura: Jogue um Limpo para ver a reação do oponente.";
        } else if (pts < 10) {
          explanation =
            "Você não tem Limpos. Saia com a carta de menor valor para que o prejuízo seja o menor possível.";
        } else {
          explanation =
            "Mão Biscada! Você só tem cartas valiosas. Sacrifique a de menor valor.";
        }
      }
    } else {
      // SOU O SEGUNDO A JOGAR (Contra-ataque)
      const opCard = tableCards[0].card;
      const opPts = getCardPoints(opCard, trumpSuit);
      const leadSuit = opCard.suit;
      const opPower = getCardPower(opCard, trumpSuit, leadSuit);

      const winningCards = myHand.filter(
        (c) => getCardPower(c, trumpSuit, leadSuit) > opPower
      );
      const winningLeadSuit = winningCards.filter((c) => c.suit === leadSuit);
      const winningTrumps = winningCards.filter((c) => c.suit === trumpSuit);

      // Se eu posso ganhar do mesmo naipe E a mesa tem algum ponto (mesmo que seja 2 pontos)
      if (
        winningLeadSuit.length > 0 &&
        (opPts > 0 || getCardPoints(winningLeadSuit[0], trumpSuit) > 0)
      ) {
        // Escolhe a carta do naipe que me garante a maior pontuação
        const bestWinningLead = [...winningLeadSuit].sort(
          (a, b) => getCardPoints(b, trumpSuit) - getCardPoints(a, trumpSuit)
        )[0];
        bestCard = bestWinningLead;
        explanation = `Incarte perfeito! Você ganha a mão e garante ${
          opPts + getCardPoints(bestCard, trumpSuit)
        } pontos.`;

        // Se eu não tenho o naipe da mesa, mas tenho trunfo para cortar pontos (mesmo que poucos pontos)
      } else if (winningTrumps.length > 0 && opPts > 0) {
        // Escolhe o menor trunfo possível para não gastar os fortes à toa
        const efficientCut = winningTrumps.sort(
          (a, b) =>
            getCardPower(a, trumpSuit, leadSuit) -
            getCardPower(b, trumpSuit, leadSuit)
        )[0];
        bestCard = efficientCut;
        explanation = `Corte! A carta dele vale ${opPts} pontos. Use seu trunfo para roubar!`;

        // Se não dá para ganhar OU se a mesa tem 0 pontos e não quero gastar carta à toa
      } else {
        bestCard = sortedHandByPtsAsc[0]; // Pega a carta que dá o menor prejuízo
        if (getCardPoints(bestCard, trumpSuit) === 0) {
          explanation =
            "Você não consegue vencer (ou não vale a pena). Jogue um Limpo para não dar pontos a ele.";
        } else {
          explanation =
            "Você vai perder esta mão. Jogue a carta de MENOR valor para o prejuízo ser pequeno.";
        }
      }
    }

    if (bestCard) {
      setCurrentHint({ cardId: bestCard.id, text: explanation });
    }
  };

  const createDeepShuffleDeck = () => {
    let newDeck = [];
    Object.keys(SUITS).forEach((suitKey) => {
      RANKS.forEach((rank) => {
        newDeck.push({
          ...rank,
          suit: suitKey,
          id: `${suitKey}-${rank.label}-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
        });
      });
    });
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  };

  const startGameFirstTime = () => {
    if (!me?.isHost) return;
    const pts = {};
    playersList.forEach((p) => (pts[p.id] = 0));
    const randomStartId =
      playersList[Math.floor(Math.random() * playersList.length)].id;
    syncState({ gamePoints: pts, tocoTarget: randomStartId });
    setTimeout(() => startNewHand(randomStartId), 100);
  };

  const startNewHand = (targetId) => {
    if (!me?.isHost) return;
    const rScores = {};
    playersList.forEach((p) => (rScores[p.id] = 0));
    syncState({
      deck: createDeepShuffleDeck(),
      roundScores: rScores,
      tableCards: [],
      trickFeedback: null,
      roundResult: null,
      trickHistory: [],
      hands: {},
      gameState: "choose_trump",
    });
    setLocalProcessing(false);
  };

  const confirmTrumpAndDeal = (suit) => {
    syncState({ trumpSuit: suit, gameState: "dealing" });
    setLocalProcessing(false);
  };

  useEffect(() => {
    if (me?.isHost && gameState === "dealing" && roomData) {
      const currentDeck = [...roomData.deck];
      const newHands = {};
      playersList.forEach((p, index) => {
        newHands[p.id] = currentDeck.slice(index * 4, (index + 1) * 4);
      });
      const remaining = currentDeck.slice(playersList.length * 4);
      syncState({
        hands: newHands,
        deck: remaining,
        turn: roomData.tocoTarget,
        gameState: "playing",
      });
    }
  }, [gameState, me?.isHost]);

  const handleCardClick = (card) => {
    if (!me?.id || gameState !== "playing" || turn !== me.id || localProcessing)
      return;
    const alreadyPlayed = tableCards.some((tc) => tc.playerId === me.id);
    if (alreadyPlayed) return;

    setLocalProcessing(true);
    setCurrentHint(null); // Esconde a dica ao jogar

    const myHand = hands[me.id] || [];
    const newHand = myHand.filter((c) => c.id !== card.id);
    const newTable = [...tableCards, { playerId: me.id, card }];

    let nextTurn = turn;
    if (newTable.length < playersList.length) {
      const myIdx = playersList.findIndex((p) => p.id === me.id);
      const nextIdx = (myIdx + 1) % playersList.length;
      nextTurn = playersList[nextIdx].id;
    }

    syncState({
      [`hands/${me.id}`]: newHand,
      tableCards: newTable,
      turn: nextTurn,
    });
  };

  useEffect(() => {
    if (
      me?.isHost &&
      tableCards.length === playersList.length &&
      playersList.length >= 2
    ) {
      const timer = setTimeout(() => {
        resolveRound(tableCards);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [tableCards, playersList.length]);

  useEffect(() => {
    if (tableCards.length === 0) setLocalProcessing(false);
    if (me?.id && turn === me.id) setLocalProcessing(false);
  }, [tableCards.length, turn, me?.id]);

  const resolveRound = (cards) => {
    const currentRS = stateRef.current?.roundScores || {};
    const currentT = stateRef.current?.trumpSuit;
    const currentHistory = stateRef.current?.trickHistory || [];

    let validCards = cards;
    if (cards.length > 2) validCards = cards.slice(-2);

    const p1 = validCards[0];
    const p2 = validCards[1];

    if (!p1 || !p2) {
      syncState({ tableCards: [] });
      return;
    }

    const leadSuit = p1.card.suit;
    const p1Power = getCardPower(p1.card, currentT, leadSuit);
    const p2Power = getCardPower(p2.card, currentT, leadSuit);
    const winnerId = p1Power > p2Power ? p1.playerId : p2.playerId;
    const pts =
      getCardPoints(p1.card, currentT) + getCardPoints(p2.card, currentT);

    const newScores = { ...currentRS };
    newScores[winnerId] = (newScores[winnerId] || 0) + pts;
    const winnerName =
      playersList.find((p) => p.id === winnerId)?.name || "Oponente";
    const trickData = {
      id: Date.now(),
      winnerId: winnerId,
      pts: pts,
      cards: [p1.card, p2.card],
    };

    syncState({
      roundScores: newScores,
      trickFeedback: { winnerName, pts },
      trickHistory: [...currentHistory, trickData],
      tableCards: [],
    });

    if (newScores[winnerId] >= POINTS_GOAL) {
      handleGameEnd(winnerId);
    } else {
      setTimeout(() => {
        const freshDeck = [...(stateRef.current?.deck || [])];
        const freshHands = { ...(stateRef.current?.hands || {}) };

        if (freshDeck.length >= 2) {
          const c1 = freshDeck.shift();
          const c2 = freshDeck.shift();
          const loserId = p1.playerId === winnerId ? p2.playerId : p1.playerId;
          if (freshHands[winnerId])
            freshHands[winnerId] = [...(freshHands[winnerId] || []), c1];
          if (freshHands[loserId])
            freshHands[loserId] = [...(freshHands[loserId] || []), c2];
        }
        syncState({ hands: freshHands, deck: freshDeck, turn: winnerId });
      }, 300);
      setTimeout(() => syncState({ trickFeedback: null }), 2500);
    }
  };

  const handleGameEnd = (winnerId) => {
    const {
      tocoTarget: currentTarget,
      lives: currentLives,
      gamePoints: currentGP,
    } = stateRef.current;

    const loserId = playersList.find((p) => p.id !== winnerId)?.id;
    let resultType = "";
    let updates = {};

    if (winnerId === currentTarget) {
      resultType = "escaped";
      updates = { tocoTarget: loserId, lives: 3 };
    } else {
      const newLives = currentLives - 1;
      updates = { lives: newLives };
      if (newLives > 0) {
        resultType = "life_lost";
      } else {
        resultType = "toco_confirmed";
        const gPoints = { ...currentGP };
        gPoints[loserId] = (gPoints[loserId] || 0) + 1;
        updates = { gamePoints: gPoints, lives: 3 };
      }
    }

    updates.roundResult = {
      type: resultType,
      winnerId: winnerId,
      loserId: loserId,
    };
    updates.gameState = "round_end";
    updates.trickFeedback = null;
    syncState(updates);
  };

  // ============================================================================
  // 5. TELAS VISUAIS
  // ============================================================================

  if (!roomId) {
    return (
      <div
        className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col items-center justify-center text-white font-sans p-4"
        translate="no"
      >
        <h1 className="text-6xl md:text-7xl font-extrabold mb-2 drop-shadow-2xl tracking-tighter flex items-center justify-center gap-3 notranslate">
          <span className="text-yellow-400">♦️</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600">
            TOCO
          </span>
          <span className="text-yellow-500">♣️</span>
        </h1>
        <p className="text-yellow-500/80 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase mb-8 drop-shadow-md">
          Desenvolvido por Ryan Kilberth
        </p>

        <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center w-full max-w-sm shadow-2xl">
          <p className="mb-6 text-gray-300 font-bold uppercase tracking-wider text-sm">
            Entrar no Jogo
          </p>
          <input
            type="text"
            placeholder="Seu Nome ou Apelido"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full bg-black/50 border border-white/20 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-yellow-500 text-center font-bold"
          />
          {errorMsg && (
            <p className="text-red-400 text-sm mb-4 font-bold animate-pulse">
              {errorMsg}
            </p>
          )}
          <button
            onClick={createRoom}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-black py-3 rounded-xl hover:from-yellow-400 hover:to-yellow-500 shadow-lg mb-6 uppercase tracking-widest text-sm transition-transform active:scale-95"
          >
            CRIAR NOVA SALA
          </button>
          <div className="flex items-center gap-2 mb-6">
            <div className="h-px bg-white/20 flex-1"></div>
            <span className="text-xs text-gray-500 uppercase">Ou</span>
            <div className="h-px bg-white/20 flex-1"></div>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              maxLength={4}
              className="w-full bg-black/50 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 text-center font-mono text-xl tracking-widest"
            />
            <button
              onClick={joinRoom}
              className="bg-blue-600 text-white font-black px-6 py-3 rounded-xl hover:bg-blue-500 shadow-lg uppercase text-sm transition-transform active:scale-95"
            >
              ENTRAR
            </button>
          </div>
        </div>
      </div>
    );
  }

  const EndGameMessage = () => {
    if (!roundResult) return null;
    const iAmWinner = me?.id === roundResult.winnerId;
    const iAmLoser = me?.id === roundResult.loserId;

    if (roundResult.type === "escaped") {
      if (iAmWinner)
        return (
          <span className="text-green-400 drop-shadow-md">
            UFA! ME LIVREI! 😅
          </span>
        );
      if (iAmLoser)
        return (
          <span className="text-yellow-400 drop-shadow-md">
            ELE SE LIVROU! O TOCO AGORA É SEU! 🫵
          </span>
        );
      return <span>O ALVO ESCAPOU!</span>;
    }
    if (roundResult.type === "life_lost") {
      if (iAmLoser)
        return (
          <span className="text-red-400 drop-shadow-md">
            PERDI UMA VIDA! 💔
          </span>
        );
      if (iAmWinner)
        return (
          <span className="text-green-400 drop-shadow-md">
            VOCÊ TIROU UMA VIDA DELE! ⚔️
          </span>
        );
      return <span>ALVO PERDEU VIDA!</span>;
    }
    if (roundResult.type === "toco_confirmed") {
      if (iAmLoser)
        return (
          <span className="text-red-600 drop-shadow-md">
            QUE PENA! PEGUEI O TOCO. 🪵
          </span>
        );
      if (iAmWinner)
        return (
          <span className="text-yellow-400 drop-shadow-md">
            AÊ! VOCÊ DEU UM TOCO NELE! 🏆
          </span>
        );
      return <span>TOCO CONFIRMADO!</span>;
    }
    return null;
  };

  const CardFace = ({ card, playable, onClick, isHinted }) => {
    const isTrump = card.suit === trumpSuit;
    const opacityClass =
      localProcessing && playable ? "opacity-50 cursor-wait" : "opacity-100";
    const color = SUITS[card.suit].color;
    const sym = SUITS[card.suit].symbol;
    const hintClass = isHinted
      ? "ring-4 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.8)] -translate-y-4 scale-105"
      : "";

    const renderCenter = () => {
      if (card.label === "A")
        return <div className="text-6xl md:text-7xl drop-shadow-md">{sym}</div>;
      if (card.label === "K")
        return <div className="text-5xl md:text-6xl drop-shadow-md">🤴</div>;
      if (card.label === "Q")
        return <div className="text-5xl md:text-6xl drop-shadow-md">👸</div>;
      if (card.label === "J")
        return <div className="text-5xl md:text-6xl drop-shadow-md">💂</div>;
      const num = parseInt(card.label);
      if (!isNaN(num)) {
        let cols = "grid-cols-2";
        if (num === 2 || num === 3) cols = "grid-cols-1";
        return (
          <div
            className={`grid ${cols} gap-x-3 gap-y-1 items-center justify-items-center h-full py-2 w-full px-2`}
          >
            {Array.from({ length: num }).map((_, i) => (
              <span
                key={i}
                className={`text-xl md:text-2xl leading-none ${
                  i >= Math.ceil(num / 2) ? "rotate-180" : ""
                }`}
              >
                {sym}
              </span>
            ))}
          </div>
        );
      }
      return null;
    };

    return (
      <div
        onClick={() => playable && !localProcessing && onClick(card)}
        className={`w-[72px] h-[104px] md:w-24 md:h-36 bg-gradient-to-br from-white to-gray-50 rounded-lg md:rounded-xl border border-gray-300 shadow-xl flex flex-col items-center justify-between select-none relative transition-all duration-300 transform overflow-hidden ${opacityClass} ${hintClass} ${
          playable && !localProcessing
            ? "cursor-pointer hover:-translate-y-6 hover:shadow-[0_0_20px_rgba(250,204,21,0.6)] hover:ring-4 ring-yellow-400 z-10 scale-105"
            : ""
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none text-8xl md:text-[100px] overflow-hidden">
          {sym}
        </div>
        <div
          className={`absolute top-1 left-1.5 flex flex-col items-center leading-none ${color}`}
        >
          <span className="font-bold text-[11px] md:text-sm tracking-tighter">
            {card.label}
          </span>
          <span className="text-[9px] md:text-xs -mt-0.5">{sym}</span>
        </div>
        <div
          className={`flex-1 flex items-center justify-center w-full mt-2 ${color}`}
        >
          {renderCenter()}
        </div>
        <div
          className={`absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180 ${color}`}
        >
          <span className="font-bold text-[11px] md:text-sm tracking-tighter">
            {card.label}
          </span>
          <span className="text-[9px] md:text-xs -mt-0.5">{sym}</span>
        </div>
        {isTrump && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 rounded-full shadow-lg border-2 border-white flex items-center justify-center z-20">
            <div className="w-2.5 h-2.5 bg-yellow-600 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>
    );
  };

  const MiniCard = ({ card }) => (
    <div className="relative w-10 h-14 bg-white rounded border border-gray-300 shadow-sm flex flex-col items-center justify-center p-1 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none text-4xl">
        {SUITS[card.suit].symbol}
      </div>
      <span
        className={`text-xs font-bold leading-none z-10 ${
          SUITS[card.suit].color
        }`}
      >
        {card.label}
      </span>
      <span className={`text-xl z-10 ${SUITS[card.suit].color}`}>
        {SUITS[card.suit].symbol}
      </span>
    </div>
  );

  const CardBack = () => (
    <div
      className="w-[72px] h-[104px] md:w-24 md:h-36 bg-blue-900 rounded-lg md:rounded-xl border-2 border-white/80 shadow-2xl flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
      }}
    >
      <div className="absolute inset-1 border border-white/50 rounded-md md:rounded-lg pointer-events-none"></div>
      <div className="w-8 h-12 md:w-10 md:h-16 border-2 border-white/30 rounded-lg flex items-center justify-center bg-blue-800/80">
        <span className="text-white/20 text-2xl md:text-3xl">♠</span>
      </div>
    </div>
  );

  if (gameState === "lobby") {
    return (
      <div
        className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col items-center justify-center text-white font-sans p-4"
        translate="no"
      >
        <h1 className="text-6xl md:text-7xl font-extrabold mb-2 drop-shadow-2xl tracking-tighter flex items-center justify-center gap-3 notranslate">
          <span className="text-yellow-400">♦️</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600">
            TOCO
          </span>
          <span className="text-yellow-500">♣️</span>
        </h1>
        <p className="text-yellow-500/80 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase mb-8 drop-shadow-md">
          Desenvolvido por Ryan Kilberth
        </p>
        <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center w-full max-w-sm shadow-2xl relative">
          <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black font-black px-6 py-2 rounded-full border-4 border-white shadow-lg text-lg flex items-center gap-2">
            PIN:{" "}
            <span className="font-mono text-2xl tracking-widest bg-white/30 px-2 rounded">
              {roomId}
            </span>
          </div>
          <p className="mt-6 mb-4 text-gray-300 font-bold uppercase tracking-wider text-sm">
            Jogadores na Mesa
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {playersList.map((p) => (
              <div
                key={p.id}
                className="bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-2 rounded-xl font-bold shadow-lg border-b-4 border-blue-900 notranslate flex items-center gap-2"
              >
                {p.isHost && <span title="Host">👑</span>}
                {p.name}
              </div>
            ))}
          </div>
          {me?.isHost && playersList.length >= 2 ? (
            <button
              onClick={startGameFirstTime}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-black py-4 rounded-xl hover:from-yellow-400 hover:to-yellow-500 shadow-[0_10px_20px_rgba(234,179,8,0.3)] transition-all transform hover:scale-105 active:scale-95 uppercase tracking-widest text-lg"
            >
              INICIAR JOGO
            </button>
          ) : (
            <div className="animate-pulse text-yellow-200 text-sm font-medium bg-yellow-900/30 py-3 rounded-xl border border-yellow-500/20">
              {playersList.length < 2
                ? "Aguardando jogador 2..."
                : "O Host iniciará a partida..."}
            </div>
          )}
        </div>
      </div>
    );
  }

  const myHand = hands[me?.id] || [];
  const opponent = playersList.find((p) => p.id !== me?.id);
  const opHandCount = hands[opponent?.id]?.length || 0;
  const showCards = gameState === "playing" || gameState === "round_end";
  const myTricks = trickHistory.filter((t) => t.winnerId === me?.id);

  return (
    <div
      className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col font-sans overflow-hidden notranslate text-white"
      translate="no"
    >
      {/* PLACAR */}
      <div className="bg-black/30 backdrop-blur-md border-b border-white/10 shadow-2xl h-24 flex w-full relative z-20">
        {playersList[0] && (
          <div
            className={`flex-1 flex flex-col justify-center px-4 border-r border-white/10 ${
              turn === playersList[0].id ? "bg-white/5" : ""
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-bold truncate text-lg md:text-xl drop-shadow">
                {playersList[0].name}
              </span>
              {tocoTarget === playersList[0].id && (
                <div className="flex gap-1 text-lg drop-shadow">
                  {[...Array(lives)].map((_, i) => (
                    <span key={i}>❤️</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between mt-1">
              <span className="text-yellow-400 font-mono text-3xl font-bold drop-shadow-md">
                {roundScores[playersList[0].id] || 0}
                <span className="text-sm text-gray-400 font-sans">/31</span>
              </span>
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Tocos:{" "}
                <span className="text-white font-bold text-sm bg-white/10 px-2 py-0.5 rounded">
                  {gamePoints[playersList[0].id] || 0}
                </span>
              </span>
            </div>
          </div>
        )}
        <div className="w-12 flex items-center justify-center bg-black/60 text-gray-500 font-black text-sm italic border-x border-white/10 shadow-inner">
          VS
        </div>
        {playersList[1] && (
          <div
            className={`flex-1 flex flex-col justify-center px-4 border-l border-white/10 ${
              turn === playersList[1].id ? "bg-white/5" : ""
            }`}
          >
            <div className="flex justify-between items-center flex-row-reverse">
              <span className="font-bold truncate text-lg md:text-xl drop-shadow">
                {playersList[1].name}
              </span>
              {tocoTarget === playersList[1].id && (
                <div className="flex gap-1 text-lg drop-shadow">
                  {[...Array(lives)].map((_, i) => (
                    <span key={i}>❤️</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between mt-1 flex-row-reverse">
              <span className="text-yellow-400 font-mono text-3xl font-bold drop-shadow-md">
                {roundScores[playersList[1].id] || 0}
                <span className="text-sm text-gray-400 font-sans">/31</span>
              </span>
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Tocos:{" "}
                <span className="text-white font-bold text-sm bg-white/10 px-2 py-0.5 rounded">
                  {gamePoints[playersList[1].id] || 0}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* BALÃO DE DICA (Flutuante no meio da tela) */}
      {currentHint && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-blue-900/95 backdrop-blur-md border-2 border-blue-400 p-4 rounded-2xl shadow-2xl animate-fade-in text-center relative">
            <button
              onClick={() => setCurrentHint(null)}
              className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full text-xs font-bold shadow border border-white"
            >
              X
            </button>
            <p className="text-sm md:text-base font-medium text-blue-50 leading-tight">
              🤖 <strong>Dica do Bot:</strong>
              <br />
              {currentHint.text}
            </p>
          </div>
        </div>
      )}

      {/* MESA E BARALHO */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full">
        <div className="absolute top-4 flex -space-x-4 md:-space-x-6 transition-all duration-500 hover:-space-x-2">
          {showCards &&
            Array.from({ length: opHandCount }).map((_, i) => (
              <CardBack key={i} />
            ))}
        </div>
        <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
          {deck.length > 0 && (
            <div
              className="w-[52px] h-[76px] md:w-20 md:h-28 bg-blue-900 border-2 border-white/50 rounded-lg flex items-center justify-center shadow-2xl relative"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
              }}
            >
              <div className="absolute inset-1 border border-white/30 rounded border-dashed"></div>
              <div className="absolute -top-2 -right-2 bg-red-600 text-[10px] md:text-xs text-white font-bold rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center border-2 border-white shadow">
                {deck.length}
              </div>
            </div>
          )}
          {trumpSuit && (
            <div className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-full border-4 border-yellow-500 flex items-center justify-center text-xl md:text-3xl shadow-[0_0_15px_rgba(250,204,21,0.5)]">
              <span className={SUITS[trumpSuit].color}>
                {SUITS[trumpSuit].symbol}
              </span>
            </div>
          )}
        </div>
        <div className="relative flex flex-col items-center justify-center w-full translate-y-6 md:translate-y-12">
          <div className="flex gap-6 md:gap-12 items-center h-40 md:h-48 z-10">
            {tableCards.map((tc, i) => (
              <div
                key={tc.card.id}
                className="flex flex-col items-center animate-bounce"
              >
                <CardFace card={tc.card} playable={false} />
                <span className="bg-black/60 backdrop-blur text-white text-[10px] md:text-xs px-3 md:px-4 py-1 rounded-full mt-3 font-bold shadow-lg border border-white/20">
                  {playersList.find((p) => p.id === tc.playerId)?.name}
                </span>
              </div>
            ))}
          </div>
          {trickFeedback && (
            <div className="absolute z-30 bg-white/95 backdrop-blur px-8 py-4 rounded-2xl border-4 border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.6)] animate-fade-in text-center transform scale-110">
              <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                VENCEU A MÃO
              </p>
              <p className="text-2xl md:text-3xl font-black text-blue-900 mb-2">
                {trickFeedback.winnerName}
              </p>
              <span className="inline-block bg-green-100 text-green-700 font-extrabold px-3 py-1 rounded-full text-base md:text-lg border border-green-300">
                +{trickFeedback.pts} pts
              </span>
            </div>
          )}
        </div>
      </div>

      {/* MINHA MÃO E CONTROLES */}
      <div className="bg-gradient-to-t from-black/95 to-transparent pb-8 pt-4 w-full flex flex-col items-center relative">
        {showCards && (
          <>
            {/* BOTÃO DA PILHA (Esquerda) */}
            <div className="absolute left-4 bottom-32 md:bottom-12 z-40">
              <button
                onClick={() => setShowHistory(true)}
                className="text-white/60 hover:text-white transition-all duration-200 flex flex-col items-center gap-1 active:scale-95"
              >
                <span className="text-2xl md:text-3xl drop-shadow-lg opacity-80">
                  🗂️
                </span>
                <span className="text-[10px] md:text-xs font-bold tracking-wider">
                  Pilha ({myTricks.length})
                </span>
              </button>
            </div>

            {/* NOVO BOTÃO DA DICA (Direita, agora fácil de clicar!) */}
            {turn === me?.id && (
              <div className="absolute right-4 bottom-32 md:bottom-12 z-40">
                <button
                  onClick={generateHint}
                  className="text-yellow-400 hover:text-yellow-300 transition-all duration-200 flex flex-col items-center gap-1 active:scale-95 animate-pulse"
                  title="Pedir uma dica"
                >
                  <span className="text-2xl md:text-3xl drop-shadow-lg opacity-90">
                    💡
                  </span>
                  <span className="text-[10px] md:text-xs font-bold tracking-wider text-yellow-400">
                    Dica
                  </span>
                </button>
              </div>
            )}
          </>
        )}

        <div className="mb-4 h-10 flex items-center justify-center">
          {turn === me?.id ? (
            <span className="bg-yellow-400 text-black font-black px-8 py-2 md:py-3 rounded-full animate-pulse shadow-[0_0_25px_rgba(250,204,21,0.5)] border-2 border-white tracking-widest text-sm md:text-base uppercase cursor-default">
              SUA VEZ DE JOGAR
            </span>
          ) : (
            <span className="text-gray-300 text-xs md:text-sm bg-black/50 backdrop-blur px-6 py-2 rounded-full flex items-center gap-2 border border-white/10">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></div>{" "}
              Aguardando jogada...
            </span>
          )}
        </div>
        <div className="flex -space-x-3 md:space-x-4 px-4 h-32 md:h-44 items-end pb-2">
          {showCards &&
            myHand.map((card) => (
              <div
                key={card.id}
                className="transition-transform duration-200 hover:-translate-y-6 hover:z-20"
              >
                <CardFace
                  card={card}
                  playable={turn === me?.id}
                  onClick={handleCardClick}
                  isHinted={currentHint?.cardId === card.id}
                />
              </div>
            ))}
        </div>
      </div>

      {/* MODAL: ESCOLHA DE TRUNFO */}
      {gameState === "choose_trump" && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {tocoTarget === me?.id ? (
            <div className="bg-white rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(250,204,21,0.4)] max-w-sm w-full border-4 border-yellow-500 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-3 bg-yellow-500"></div>
              <h2 className="text-3xl font-black mb-2 text-gray-800 mt-2">
                VOCÊ ESTÁ NO TOCO!
              </h2>
              <p className="text-gray-500 mb-8 text-sm font-medium">
                Escolha o naipe do trunfo para começar.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(SUITS).map((s) => (
                  <button
                    key={s}
                    onClick={() => confirmTrumpAndDeal(s)}
                    className="group border-2 border-gray-100 p-6 rounded-2xl hover:bg-yellow-50 hover:border-yellow-400 flex flex-col items-center transition-all duration-200 active:scale-95 shadow-sm hover:shadow-md bg-gray-50"
                  >
                    <span className="text-5xl mb-3 group-hover:scale-125 transition-transform duration-200">
                      {SUITS[s].symbol}
                    </span>
                    <span className="text-xs font-bold text-gray-400 group-hover:text-yellow-600 uppercase tracking-widest">
                      {SUITS[s].name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-white bg-black/60 p-8 rounded-3xl border border-white/20 backdrop-blur-md shadow-2xl">
              <div className="text-6xl mb-6 animate-bounce drop-shadow-lg">
                🃏
              </div>
              <h2 className="text-3xl font-black text-yellow-400 mb-2 drop-shadow">
                Aguardando Trunfo...
              </h2>
              <p className="text-gray-300 text-sm font-medium">
                O Alvo está escolhendo o naipe de corte.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODAL: HISTÓRICO DA PILHA */}
      {showHistory && (
        <div className="absolute inset-0 bg-black/95 z-[60] flex flex-col items-center p-6 overflow-y-auto backdrop-blur-md">
          <div className="w-full max-w-md flex justify-between items-center mb-6 mt-4">
            <h2 className="text-3xl font-black text-yellow-400 drop-shadow">
              Sua Pilha 🗂️
            </h2>
            <button
              onClick={() => setShowHistory(false)}
              className="text-white bg-red-600 hover:bg-red-500 rounded-full w-10 h-10 flex items-center justify-center font-bold shadow-lg text-xl transition-transform active:scale-90"
            >
              &times;
            </button>
          </div>
          <div className="w-full max-w-md flex flex-col gap-4 pb-10">
            {myTricks.length === 0 ? (
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl text-center shadow-inner">
                <p className="text-gray-400 font-medium">
                  Você ainda não levou nenhuma mão nesta rodada.
                </p>
              </div>
            ) : (
              myTricks.map((trick, index) => (
                <div
                  key={trick.id}
                  className="bg-white/10 p-4 rounded-xl border border-white/20 flex flex-col items-center relative shadow-lg"
                >
                  <div className="flex justify-between w-full text-sm mb-3 border-b border-white/10 pb-2">
                    <span className="text-gray-300 font-bold uppercase tracking-wider">
                      Mão #{index + 1}
                    </span>
                    <span className="font-bold text-green-400 bg-green-900/30 px-3 py-1 rounded shadow-sm">
                      +{trick.pts} pts
                    </span>
                  </div>
                  <div className="flex gap-4">
                    {trick.cards.map((c) => (
                      <MiniCard key={c.id} card={c} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: FIM DE RODADA */}
      {gameState === "round_end" && (
        <div className="absolute inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-black p-1 rounded-3xl shadow-[0_0_80px_rgba(234,179,8,0.4)] max-w-sm w-full border border-gray-700">
            <div className="bg-gray-900/50 backdrop-blur-md p-10 rounded-[22px] text-center">
              <div className="text-3xl font-black text-white mb-8 uppercase flex flex-col gap-3 leading-tight tracking-wide drop-shadow-md">
                <EndGameMessage />
              </div>
              {me?.isHost ? (
                <button
                  onClick={() => startNewHand(tocoTarget)}
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-extrabold py-5 px-8 rounded-xl hover:from-yellow-400 hover:to-yellow-500 shadow-[0_10px_20px_rgba(234,179,8,0.3)] uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95 text-lg"
                >
                  Próxima Mão
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3 mt-8 opacity-70">
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin shadow-lg"></div>
                  <p className="text-white text-sm font-bold uppercase tracking-widest">
                    Aguardando Host...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
