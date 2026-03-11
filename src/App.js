import React, { useState, useEffect, useRef } from "react";
import { database } from "./firebase";
import { ref, onValue, set, update, get, remove } from "firebase/database";

// ============================================================================
// 1. CONFIGURAÇÕES GERAIS E CONSTANTES
// ============================================================================
const SUITS = {
  hearts: {
    symbol: "♥",
    defaultColor: "text-red-600",
    darkColor: "text-red-400",
    luxoColor: "text-red-500",
    name: "Copas",
  },
  diamonds: {
    symbol: "♦",
    defaultColor: "text-red-600",
    darkColor: "text-red-400",
    luxoColor: "text-red-500",
    name: "Ouros",
  },
  clubs: {
    symbol: "♣",
    defaultColor: "text-slate-900",
    darkColor: "text-white",
    luxoColor: "text-yellow-400",
    name: "Paus",
  },
  spades: {
    symbol: "♠",
    defaultColor: "text-slate-900",
    darkColor: "text-white",
    luxoColor: "text-yellow-400",
    name: "Espadas",
  },
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
  // 2. ESTADOS GERAIS
  // ============================================================================
  const [playerName, setPlayerName] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [me, setMe] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const isOfflineRef = useRef(false);

  const [localProcessing, setLocalProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentHint, setCurrentHint] = useState(null);

  // ============================================================================
  // ESTADOS DE CONFIGURAÇÃO E ÁUDIO
  // ============================================================================
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("tocoSettings");
    return saved
      ? JSON.parse(saved)
      : {
          sound: true,
          vibration: true,
          showHints: true,
          saveName: false,
          deckStyle: "luxo",
          cardSize: "normal",
        };
  });

  useEffect(() => {
    localStorage.setItem("tocoSettings", JSON.stringify(settings));
    if (settings.saveName && playerName.trim()) {
      localStorage.setItem("tocoPlayerName", playerName);
    } else if (!settings.saveName) {
      localStorage.removeItem("tocoPlayerName");
    }
  }, [settings, playerName]);

  useEffect(() => {
    if (settings.saveName) {
      const savedName = localStorage.getItem("tocoPlayerName");
      if (savedName) setPlayerName(savedName);
    }
  }, []);

  const updateSetting = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }));
  const toggleSetting = (key) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  // GERADOR DE EFEITOS SONOROS (Sintetizador Web Nativo)
  const playSoundEffect = (type) => {
    if (!settings.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "card") {
        // Som curto e seco da carta
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "win") {
        // Som alegre de vitória
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === "lose") {
        // Som triste de perder vida
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(250, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const stateRef = useRef(roomData);
  useEffect(() => {
    stateRef.current = roomData;
  }, [roomData]);
  useEffect(() => {
    setCurrentHint(null);
  }, [roomData?.tableCards?.length, roomData?.turn]);

  // ============================================================================
  // 3. LÓGICA DE REDE E RECONEXÃO
  // ============================================================================
  const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

  const syncState = (updates) => {
    if (isOfflineRef.current) {
      setRoomData((prev) => {
        const newData = { ...prev, ...updates };
        stateRef.current = newData;
        return newData;
      });
    } else {
      if (!roomId) return;
      update(ref(database, `rooms/${roomId}`), updates);
    }
  };

  const exitGame = () => {
    setRoomId(null);
    setRoomData(null);
    setIsSinglePlayer(false);
    isOfflineRef.current = false;
    setShowSettings(false);
  };

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

    setIsSinglePlayer(false);
    isOfflineRef.current = false;
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
      const currentRoomData = snapshot.val();
      const existingPlayers = Object.values(currentRoomData.players || {});

      // SISTEMA DE RECONEXÃO: Busca se o nome já existe na sala
      const matchedPlayer = existingPlayers.find(
        (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
      );

      let myId;
      let newMe;

      if (matchedPlayer) {
        // Se o nome existe, o jogador recupera a cadeira dele!
        myId = matchedPlayer.id;
        newMe = matchedPlayer;
      } else if (existingPlayers.length >= 2) {
        return setErrorMsg("A sala já está cheia!");
      } else {
        // Se não existe e tem vaga, entra como novo jogador
        myId = `player_${Date.now()}`;
        newMe = { id: myId, name: playerName, isHost: false };
        await update(ref(database, `rooms/${pinInput}/players`), {
          [myId]: newMe,
        });
        await update(ref(database, `rooms/${pinInput}/roundScores`), {
          [myId]: 0,
        });
        await update(ref(database, `rooms/${pinInput}/gamePoints`), {
          [myId]: 0,
        });
      }

      setIsSinglePlayer(false);
      isOfflineRef.current = false;
      setMe(newMe);
      setRoomId(pinInput);
    } else {
      setErrorMsg("Sala não encontrada. Verifique o PIN.");
    }
  };

  const startSinglePlayer = () => {
    if (!playerName.trim()) return setErrorMsg("Digite seu nome primeiro!");
    const myId = `player_${Date.now()}`;
    const botId = `bot_1`;
    const newMe = { id: myId, name: playerName, isHost: true };
    const botPlayer = { id: botId, name: "Computador", isHost: false };

    setMe(newMe);
    setIsSinglePlayer(true);
    isOfflineRef.current = true;
    setRoomId("SINGLE");

    const initialRoomData = {
      gameState: "choose_trump",
      hostId: myId,
      players: { [myId]: newMe, [botId]: botPlayer },
      deck: createDeepShuffleDeck(),
      tableCards: [],
      trumpSuit: null,
      turn: null,
      hands: {},
      roundScores: { [myId]: 0, [botId]: 0 },
      gamePoints: { [myId]: 0, [botId]: 0 },
      tocoTarget: myId,
      lives: 3,
      trickHistory: [],
    };

    setRoomData(initialRoomData);
    stateRef.current = initialRoomData;
  };

  useEffect(() => {
    if (!roomId || isOfflineRef.current) return;
    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setRoomData(snapshot.val());
      } else {
        setErrorMsg("A sala foi fechada pelo Host.");
        setRoomId(null);
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  // ============================================================================
  // 4. LÓGICA E CÉREBRO DO JOGO
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

  const getBestCardToPlay = (
    playerId,
    currentHand,
    currentTable,
    currentTrump,
    currentScore
  ) => {
    const isFirstToPlay = currentTable.length === 0;
    const myTrumps = currentHand
      .filter((card) => card.suit === currentTrump)
      .sort(
        (a, b) =>
          getCardPower(a, currentTrump, currentTrump) -
          getCardPower(b, currentTrump, currentTrump)
      );
    const lowTrumps = myTrumps.filter((card) =>
      ["Q", "J", "K", "4", "5", "6"].includes(card.label)
    );
    const sortedHandByPtsAsc = [...currentHand].sort(
      (a, b) => getCardPoints(a, currentTrump) - getCardPoints(b, currentTrump)
    );

    if (!isFirstToPlay) {
      const opCard = currentTable[0].card;
      const leadSuit = opCard.suit;
      const tablePoints = getCardPoints(opCard, currentTrump);
      const opPower = getCardPower(opCard, currentTrump, leadSuit);
      for (let card of currentHand) {
        const cardPts = getCardPoints(card, currentTrump);
        const cardPower = getCardPower(card, currentTrump, leadSuit);
        if (
          cardPower > opPower &&
          currentScore + tablePoints + cardPts >= POINTS_GOAL
        )
          return card;
      }
    }

    if (isFirstToPlay) {
      if (lowTrumps.length > 0) return lowTrumps[0];
      return sortedHandByPtsAsc[0];
    } else {
      const opCard = currentTable[0].card;
      const opPts = getCardPoints(opCard, currentTrump);
      const leadSuit = opCard.suit;
      const opPower = getCardPower(opCard, currentTrump, leadSuit);
      const opIsTrump = opCard.suit === currentTrump;

      const winningCards = currentHand.filter(
        (c) => getCardPower(c, currentTrump, leadSuit) > opPower
      );
      const winningLeadSuit = winningCards.filter((c) => c.suit === leadSuit);
      const winningTrumps = winningCards.filter((c) => c.suit === currentTrump);

      if (
        winningLeadSuit.length > 0 &&
        (opPts > 0 || getCardPoints(winningLeadSuit[0], currentTrump) > 0)
      ) {
        return [...winningLeadSuit].sort(
          (a, b) =>
            getCardPoints(b, currentTrump) - getCardPoints(a, currentTrump)
        )[0];
      } else if (!opIsTrump && winningTrumps.length > 0 && opPts >= 2) {
        return winningTrumps[0];
      } else {
        return sortedHandByPtsAsc[0];
      }
    }
  };

  const generateHint = () => {
    if (!me?.id || turn !== me.id) return;
    const myHand = hands[me.id] || [];
    if (myHand.length === 0) return;

    const bestCard = getBestCardToPlay(
      me.id,
      myHand,
      tableCards,
      trumpSuit,
      roundScores[me.id] || 0
    );
    if (!bestCard) return;

    let explanation = "";
    const isFirstToPlay = tableCards.length === 0;

    if (
      !isFirstToPlay &&
      getCardPower(bestCard, trumpSuit, tableCards[0].card.suit) >
        getCardPower(tableCards[0].card, trumpSuit, tableCards[0].card.suit) &&
      (roundScores[me.id] || 0) +
        getCardPoints(tableCards[0].card, trumpSuit) +
        getCardPoints(bestCard, trumpSuit) >=
        POINTS_GOAL
    ) {
      explanation =
        "Jogue esta! Você vai chegar aos 31 pontos e ganhar a partida agora!";
    } else if (isFirstToPlay) {
      if (bestCard.suit === trumpSuit)
        explanation =
          "Saia cortando baixo para forçar o oponente a gastar um trunfo alto à toa ou te dar a mão de graça.";
      else if (getCardPoints(bestCard, trumpSuit) === 0)
        explanation = "Jogue um Limpo para ver a reação do oponente.";
      else
        explanation =
          "Você não tem Limpos. Saia com a carta de menor valor para que o prejuízo seja pequeno.";
    } else {
      const leadSuit = tableCards[0].card.suit;
      if (
        bestCard.suit === leadSuit &&
        getCardPower(bestCard, trumpSuit, leadSuit) >
          getCardPower(tableCards[0].card, trumpSuit, leadSuit)
      ) {
        if (leadSuit === trumpSuit)
          explanation =
            "Corte! Você tem um trunfo maior. Roube os pontos da mesa.";
        else
          explanation =
            "Encarte! Jogue uma carta maior do mesmo naipe e garanta os pontos.";
      } else if (
        bestCard.suit === trumpSuit &&
        getCardPower(bestCard, trumpSuit, leadSuit) >
          getCardPower(tableCards[0].card, trumpSuit, leadSuit)
      ) {
        explanation =
          "Corte! A carta dele vale pontos. Use seu trunfo baixo para roubar.";
      } else {
        if (getCardPoints(bestCard, trumpSuit) === 0)
          explanation =
            "Não vale a pena gastar carta boa. Jogue um Limpo para não dar pontos a ele.";
        else
          explanation =
            "Descarte a sua carta de MENOR valor para diminuir o prejuízo.";
      }
    }
    setCurrentHint({ cardId: bestCard.id, text: explanation });
  };

  // Lógica do Computador
  useEffect(() => {
    if (!isOfflineRef.current || gameState !== "choose_trump") return;
    const bot = playersList.find((p) => p.id !== me?.id);
    if (bot && tocoTarget === bot.id) {
      const timer = setTimeout(() => {
        const suits = Object.keys(SUITS);
        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        syncState({ trumpSuit: randomSuit, gameState: "dealing" });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState, tocoTarget]);

  useEffect(() => {
    if (!isOfflineRef.current || gameState !== "playing") return;
    const bot = playersList.find((p) => p.id !== me?.id);
    if (bot && turn === bot.id) {
      const timer = setTimeout(() => {
        const botId = bot.id;
        const currentHands = stateRef.current?.hands || {};
        const botHand = currentHands[botId] || [];
        if (botHand.length === 0) return;

        const botScore = stateRef.current?.roundScores[botId] || 0;
        const cardToPlay = getBestCardToPlay(
          botId,
          botHand,
          stateRef.current.tableCards,
          stateRef.current.trumpSuit,
          botScore
        );

        if (cardToPlay) {
          playSoundEffect("card"); // Computador também faz barulho!
          const newHand = botHand.filter((c) => c.id !== cardToPlay.id);
          const newTable = [
            ...stateRef.current.tableCards,
            { playerId: botId, card: cardToPlay },
          ];
          let nextTurn = turn;
          if (newTable.length < playersList.length) nextTurn = me.id;
          syncState({
            hands: { ...currentHands, [botId]: newHand },
            tableCards: newTable,
            turn: nextTurn,
          });
        }
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [turn, gameState, tableCards.length]);

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
    if (tableCards.some((tc) => tc.playerId === me.id)) return;

    if (settings.vibration && navigator.vibrate) navigator.vibrate(40);
    playSoundEffect("card"); // Toca o som!

    setLocalProcessing(true);
    setCurrentHint(null);

    const currentHands = stateRef.current?.hands || {};
    const myHand = currentHands[me.id] || [];
    const newHand = myHand.filter((c) => c.id !== card.id);
    const newTable = [...tableCards, { playerId: me.id, card }];

    let nextTurn = turn;
    if (newTable.length < playersList.length) {
      const myIdx = playersList.findIndex((p) => p.id === me.id);
      const nextIdx = (myIdx + 1) % playersList.length;
      nextTurn = playersList[nextIdx].id;
    }
    syncState({
      hands: { ...currentHands, [me.id]: newHand },
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

    if (winnerId === me?.id) {
      playSoundEffect("win");
    } else {
      playSoundEffect("lose");
      if (settings.vibration && navigator.vibrate)
        navigator.vibrate([100, 50, 100]);
    }

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
  // 5. COMPONENTES VISUAIS REUTILIZÁVEIS
  // ============================================================================

  // MODAL DE CONFIGURAÇÕES GLOBAL (Disponível no Lobby e no Jogo)
  const SettingsModal = () => (
    <div className="absolute inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-gray-900 border border-yellow-500/30 rounded-3xl w-full max-w-sm p-6 shadow-[0_0_50px_rgba(234,179,8,0.2)]">
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h2 className="text-2xl font-black text-yellow-400">Configurações</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-white bg-red-600 rounded-full w-8 h-8 font-bold"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex justify-between items-center text-white font-medium">
            <span>💾 Lembrar meu Nome</span>
            <input
              type="checkbox"
              checked={settings.saveName}
              onChange={() => toggleSetting("saveName")}
              className="w-6 h-6 accent-yellow-500"
            />
          </label>
          <label className="flex justify-between items-center text-white font-medium">
            <span>💡 Exibir botão de Dicas</span>
            <input
              type="checkbox"
              checked={settings.showHints}
              onChange={() => toggleSetting("showHints")}
              className="w-6 h-6 accent-yellow-500"
            />
          </label>
          <label className="flex justify-between items-center text-white font-medium">
            <span>📳 Vibração (Tátil)</span>
            <input
              type="checkbox"
              checked={settings.vibration}
              onChange={() => toggleSetting("vibration")}
              className="w-6 h-6 accent-yellow-500"
            />
          </label>
          <label className="flex justify-between items-center text-white font-medium">
            <span>🔊 Efeitos Sonoros</span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={() => toggleSetting("sound")}
              className="w-6 h-6 accent-yellow-500"
            />
          </label>

          <div className="text-white font-medium border-t border-white/10 pt-3">
            <span className="mb-2 block">📱 Tamanho das Cartas (Celular)</span>
            <select
              value={settings.cardSize}
              onChange={(e) => updateSetting("cardSize", e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm focus:border-yellow-500 text-white"
            >
              <option value="normal">Normal</option>
              <option value="large">Grande (Mais visível)</option>
            </select>
          </div>

          <div className="text-white font-medium pt-1">
            <span className="mb-2 block">🃏 Estilo do Baralho</span>
            <select
              value={settings.deckStyle}
              onChange={(e) => updateSetting("deckStyle", e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm focus:border-yellow-500 text-white"
            >
              <option value="default">Padrão (Branco)</option>
              <option value="dark">Modo Dark (Noturno)</option>
              <option value="luxo">Cassino (Luxo)</option>
            </select>
          </div>

          {/* BOTÃO PARA VOLTAR PARA A TELA INICIAL */}
          {roomId && (
            <button
              onClick={exitGame}
              className="w-full mt-4 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-500 transition-colors uppercase tracking-widest text-sm border border-red-400"
            >
              🚪 Sair da Partida
            </button>
          )}
        </div>
      </div>
    </div>
  );

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
    const { deckStyle, cardSize } = settings;
    const suitDef = SUITS[card.suit];
    const isTrump = card.suit === trumpSuit;
    const opacityClass =
      localProcessing && playable ? "opacity-50 cursor-wait" : "opacity-100";
    const sym =
      card.suit === "diamonds"
        ? "♦"
        : card.suit === "clubs"
        ? "♣"
        : SUITS[card.suit].symbol;
    const hintClass = isHinted
      ? "ring-4 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.8)] -translate-y-4 scale-105"
      : "";

    let cardBg = "bg-gradient-to-br from-white to-gray-50";
    let cardBorder = "border-gray-300";
    let cardTextColor = suitDef.defaultColor;

    if (deckStyle === "dark") {
      cardBg = "bg-gradient-to-br from-gray-800 to-gray-900";
      cardBorder = "border-gray-600";
      cardTextColor = suitDef.darkColor;
    } else if (deckStyle === "luxo") {
      cardBg = "bg-gradient-to-br from-black to-slate-950";
      cardBorder = "border-yellow-600/50";
      cardTextColor = suitDef.luxoColor;
    }

    // Aplicação do tamanho configurado
    const sizeClasses =
      cardSize === "large"
        ? "w-[84px] h-[120px] md:w-28 md:h-40"
        : "w-[72px] h-[104px] md:w-24 md:h-36";

    const renderCenter = () => {
      if (card.label === "K")
        return <div className="text-4xl md:text-5xl drop-shadow-sm">🤴</div>;
      if (card.label === "Q")
        return <div className="text-4xl md:text-5xl drop-shadow-sm">👸</div>;
      if (card.label === "J")
        return <div className="text-4xl md:text-5xl drop-shadow-sm">💂</div>;
      const num = parseInt(card.label);
      if (!isNaN(num)) {
        let grid = "grid-cols-1";
        if (num >= 4) grid = "grid-cols-2";
        if (num >= 7) grid = "grid-cols-3";
        return (
          <div
            className={`grid ${grid} gap-1 items-center justify-items-center h-full w-full px-1.5 ${cardTextColor}`}
          >
            {Array.from({ length: num }).map((_, i) => (
              <span
                key={i}
                className={`text-base md:text-lg leading-none ${
                  i >= Math.ceil(num / 2) ? "rotate-180" : ""
                }`}
              >
                {suitDef.symbol}
              </span>
            ))}
          </div>
        );
      }
      return (
        <div
          className={`text-5xl md:text-6xl drop-shadow-sm font-sans ${cardTextColor}`}
        >
          {suitDef.symbol}
        </div>
      );
    };

    return (
      <div
        onClick={() => playable && !localProcessing && onClick(card)}
        className={`${sizeClasses} ${cardBg} rounded-lg md:rounded-xl border ${cardBorder} shadow-xl flex flex-col items-center justify-between select-none relative transition-all duration-300 transform overflow-hidden p-1.5 md:p-2 ${opacityClass} ${hintClass} ${
          playable && !localProcessing
            ? "cursor-pointer hover:-translate-y-6 hover:shadow-[0_0_20px_rgba(250,204,21,0.6)] hover:ring-4 ring-yellow-400 z-10 scale-105"
            : ""
        }`}
      >
        <div
          className={`absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none text-8xl md:text-[100px] overflow-hidden font-sans ${cardTextColor}`}
        >
          {suitDef.symbol}
        </div>
        <div
          className={`absolute top-1 left-1.5 flex flex-col items-center justify-center ${cardTextColor} z-10`}
        >
          <span className="font-bold text-[12px] md:text-sm tracking-tighter leading-none">
            {card.label}
          </span>
          <span className="text-[11px] md:text-xs mt-[2px] leading-none font-sans">
            {suitDef.symbol}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center w-full mt-3 mb-2 px-1 z-10">
          {renderCenter()}
        </div>
        <div
          className={`absolute bottom-1 right-1.5 flex flex-col items-center justify-center rotate-180 ${cardTextColor} z-10`}
        >
          <span className="font-bold text-[12px] md:text-sm tracking-tighter leading-none">
            {card.label}
          </span>
          <span className="text-[11px] md:text-xs mt-[2px] leading-none font-sans">
            {suitDef.symbol}
          </span>
        </div>
        {isTrump && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 rounded-full shadow-lg border-2 border-white flex items-center justify-center z-20">
            <div className="w-2.5 h-2.5 bg-yellow-600 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>
    );
  };

  const MiniCard = ({ card }) => {
    const { deckStyle } = settings;
    const suitDef = SUITS[card.suit];
    let textColor = suitDef.defaultColor;
    let bgClass = "bg-white border-gray-300";
    if (deckStyle === "dark") {
      textColor = suitDef.darkColor;
      bgClass = "bg-gray-800 border-gray-600";
    } else if (deckStyle === "luxo") {
      textColor = suitDef.luxoColor;
      bgClass = "bg-black border-yellow-600/50";
    }
    return (
      <div
        className={`relative w-10 h-14 ${bgClass} rounded border shadow-sm flex flex-col items-center justify-center p-1 overflow-hidden`}
      >
        <div
          className={`absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none text-4xl font-sans ${textColor}`}
        >
          {suitDef.symbol}
        </div>
        <span className={`text-xs font-bold leading-none z-10 ${textColor}`}>
          {card.label}
        </span>
        <span className={`text-xl z-10 font-sans ${textColor}`}>
          {suitDef.symbol}
        </span>
      </div>
    );
  };

  const CardBack = () => {
    const { cardSize } = settings;
    const sizeClasses =
      cardSize === "large"
        ? "w-[84px] h-[120px] md:w-28 md:h-40"
        : "w-[72px] h-[104px] md:w-24 md:h-36";
    return (
      <div
        className={`${sizeClasses} bg-blue-900 rounded-lg md:rounded-xl border-2 border-white/80 shadow-2xl flex items-center justify-center relative overflow-hidden p-2`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
        }}
      >
        <div className="absolute inset-1 border border-white/50 rounded-md md:rounded-lg pointer-events-none"></div>
        <div className="w-8 h-12 md:w-10 md:h-16 border-2 border-white/30 rounded-lg flex items-center justify-center bg-blue-800/80 p-1">
          <span className="text-white/20 text-2xl md:text-3xl">♠</span>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDERIZAÇÃO PRINCIPAL
  // ============================================================================

  if (!roomId) {
    return (
      <div
        className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col items-center font-sans p-4 overflow-y-auto relative"
        translate="no"
      >
        {/* BOTÃO E MODAL GLOBAL DE CONFIGURAÇÕES */}
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-6 right-6 text-3xl opacity-70 hover:opacity-100 hover:rotate-90 transition-all duration-300"
        >
          ⚙️
        </button>
        {showSettings && <SettingsModal />}

        <div className="w-full max-w-sm flex flex-col items-center pt-8 md:pt-12 pb-24">
          <h1 className="text-6xl md:text-7xl font-extrabold mb-2 drop-shadow-2xl tracking-tighter flex items-center justify-center gap-2 notranslate">
            <span className="font-sans" style={{ color: "#facc15" }}>
              ♦
            </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600">
              TOCO
            </span>
            <span className="font-sans" style={{ color: "#eab308" }}>
              ♣
            </span>
          </h1>
          <p className="text-yellow-500/80 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase mb-10 drop-shadow-md text-center">
            Desenvolvido por Ryan Kilberth
          </p>

          <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full shadow-2xl">
            <input
              type="text"
              placeholder="Seu Nome ou Apelido"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-black/50 border border-white/20 text-white rounded-xl px-4 py-4 mb-6 focus:outline-none focus:border-yellow-500 text-center font-bold text-lg"
            />
            {errorMsg && (
              <p className="text-red-400 text-sm mb-4 font-bold animate-pulse text-center">
                {errorMsg}
              </p>
            )}

            <button
              onClick={startSinglePlayer}
              className="w-full bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-black py-4 rounded-xl shadow-lg mb-6 uppercase tracking-widest text-sm transition-transform active:scale-95 border border-blue-500 flex items-center justify-center gap-2"
            >
              <span className="text-xl">🤖</span> JOGAR SOZINHO
            </button>

            <div className="flex items-center gap-2 mb-6">
              <div className="h-px bg-white/20 flex-1"></div>
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                Multiplayer
              </span>
              <div className="h-px bg-white/20 flex-1"></div>
            </div>

            <button
              onClick={createRoom}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-black py-3 rounded-xl hover:from-yellow-400 hover:to-yellow-500 shadow-lg mb-4 uppercase tracking-widest text-sm transition-transform active:scale-95"
            >
              CRIAR NOVA SALA
            </button>
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
      </div>
    );
  }

  // --- TELA DE LOBBY (Se não for Single Player) ---
  if (gameState === "lobby" && !isSinglePlayer) {
    return (
      <div
        className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col items-center justify-center text-white font-sans p-4 relative"
        translate="no"
      >
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-6 right-6 text-3xl opacity-70 hover:opacity-100 hover:rotate-90 transition-all duration-300 z-50"
        >
          ⚙️
        </button>
        {showSettings && <SettingsModal />}

        <h1 className="text-6xl md:text-7xl font-extrabold mb-2 drop-shadow-2xl tracking-tighter flex items-center justify-center gap-3 notranslate overflow-visible">
          <span
            className="text-yellow-400 font-sans"
            style={{ color: "#facc15" }}
          >
            ♦
          </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600">
            TOCO
          </span>
          <span
            className="text-yellow-500 font-sans"
            style={{ color: "#eab308" }}
          >
            ♣
          </span>
        </h1>
        <p className="text-yellow-500/80 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase mb-8 drop-shadow-md">
          Desenvolvido por Ryan Kilberth
        </p>

        <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center w-full max-w-sm shadow-2xl relative overflow-visible">
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
      className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-800 via-green-900 to-black flex flex-col font-sans overflow-hidden notranslate text-white relative"
      translate="no"
    >
      {/* BOTÃO E MODAL GLOBAL DE CONFIGURAÇÕES NA MESA */}
      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-4 left-1/2 transform -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 text-3xl opacity-60 hover:opacity-100 hover:rotate-90 transition-all duration-300 z-50 drop-shadow-md bg-black/30 rounded-full p-1 backdrop-blur-sm"
      >
        ⚙️
      </button>
      {showSettings && <SettingsModal />}

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
                {playersList[0].id === "bot_1"
                  ? "🤖 Computador"
                  : playersList[0].name}
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

        {/* EXIBIÇÃO DO PIN DE RECONEXÃO */}
        <div className="w-16 flex flex-col items-center justify-center bg-black/60 text-gray-500 font-black text-sm border-x border-white/10 shadow-inner">
          <span className="italic mb-1">VS</span>
          {!isSinglePlayer && (
            <span className="text-[10px] text-yellow-500/80 notranslate bg-black/50 px-1.5 rounded">
              {roomId}
            </span>
          )}
        </div>

        {playersList[1] && (
          <div
            className={`flex-1 flex flex-col justify-center px-4 border-l border-white/10 ${
              turn === playersList[1].id ? "bg-white/5" : ""
            }`}
          >
            <div className="flex justify-between items-center flex-row-reverse">
              <span className="font-bold truncate text-lg md:text-xl drop-shadow">
                {playersList[1].id === "bot_1"
                  ? "🤖 Computador"
                  : playersList[1].name}
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

      {/* BALÃO DE DICA */}
      {currentHint && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm">
          <div className="bg-blue-900/95 backdrop-blur-md border-2 border-blue-400 p-4 rounded-2xl shadow-2xl animate-fade-in text-center relative">
            <button
              onClick={() => setCurrentHint(null)}
              className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full text-xs font-bold shadow border border-white z-50"
            >
              X
            </button>
            <p className="text-sm md:text-base font-medium text-white leading-tight">
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
              <span className={`${SUITS[trumpSuit].defaultColor} font-sans`}>
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
                  {playersList.find((p) => p.id === tc.playerId)?.id === "bot_1"
                    ? "Computador"
                    : playersList.find((p) => p.id === tc.playerId)?.name}
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
                {trickFeedback.winnerName === "Computador"
                  ? "🤖 Computador"
                  : trickFeedback.winnerName}
              </p>
              <span className="inline-block bg-green-100 text-green-700 font-extrabold px-3 py-1 rounded-full text-base md:text-lg border border-green-300">
                +{trickFeedback.pts} pts
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-t from-black/95 to-transparent pb-8 pt-4 w-full flex flex-col items-center relative z-10">
        {showCards && (
          <>
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
            {turn === me?.id && settings.showHints && (
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

        <div className="flex -space-x-3 md:space-x-4 px-4 h-32 md:h-44 items-end pb-2 overflow-visible">
          {showCards &&
            myHand.map((card) => (
              <div
                key={card.id}
                className="transition-transform duration-200 hover:-translate-y-6 hover:z-20 overflow-visible"
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

      {gameState === "choose_trump" && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {tocoTarget === me?.id ? (
            <div className="bg-white rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(250,204,21,0.4)] max-w-sm w-full border-4 border-yellow-500 relative overflow-visible">
              <div className="absolute top-0 left-0 w-full h-3 bg-yellow-500"></div>
              <h2 className="text-3xl font-black mb-2 text-gray-800 mt-2">
                VOCÊ ESTÁ NO TOCO!
              </h2>
              <p className="text-gray-500 mb-8 text-sm font-medium">
                Escolha o naipe do trunfo para começar.
              </p>
              <div className="grid grid-cols-2 gap-4 overflow-visible">
                {Object.keys(SUITS).map((s) => (
                  <button
                    key={s}
                    onClick={() => confirmTrumpAndDeal(s)}
                    className="group border-2 border-gray-100 p-6 rounded-2xl hover:bg-yellow-50 hover:border-yellow-400 flex flex-col items-center transition-all duration-200 active:scale-95 shadow-sm hover:shadow-md bg-gray-50 overflow-visible"
                  >
                    <span
                      className={`${SUITS[s].defaultColor} text-5xl mb-3 group-hover:scale-125 transition-transform duration-200 font-sans`}
                    >
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

      {showHistory && (
        <div className="absolute inset-0 bg-black/95 z-[60] flex flex-col items-center p-6 overflow-y-auto backdrop-blur-md">
          <div className="w-full max-w-md flex justify-between items-center mb-6 mt-4 z-10">
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

      {gameState === "round_end" && (
        <div className="absolute inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-black p-1 rounded-3xl shadow-[0_0_80px_rgba(234,179,8,0.4)] max-w-sm w-full border border-gray-700">
            <div className="bg-gray-900/50 backdrop-blur-md p-10 rounded-[22px] text-center overflow-visible">
              <div className="text-3xl font-black text-white mb-8 uppercase flex flex-col gap-3 leading-tight tracking-wide drop-shadow-md overflow-visible">
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
