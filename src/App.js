import React, { useState, useEffect, useRef } from "react";
import { database } from "./firebase";
import { ref, onValue, set, update, get } from "firebase/database";
import {
  insertCoin,
  myPlayer,
  isHost,
  useMultiplayerState,
  usePlayersList,
} from "playroomkit";

// ============================================================================
// 1. CONFIGURAÇÕES GERAIS E CONSTANTES
// ============================================================================
const CardFanIcon = () => (
  <svg
    width="34"
    height="34"
    viewBox="-2 -2 38 38"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="drop-shadow-lg opacity-90 mb-1"
  >
    <rect
      x="2"
      y="2.5"
      width="16"
      height="23"
      rx="3"
      fill="white"
      stroke="#D1D5DB"
      strokeWidth="1.5"
    />
    <text
      x="4"
      y="9"
      fill="#DC2626"
      fontFamily="sans-serif"
      fontSize="5"
      fontWeight="bold"
    >
      ♥
    </text>
    <rect
      x="0"
      y="4.5"
      width="16"
      height="23"
      rx="3"
      transform="rotate(-15 0 4.5)"
      fill="white"
      stroke="#D1D5DB"
      strokeWidth="1.5"
    />
    <text
      x="1"
      y="9"
      fill="#111827"
      fontFamily="sans-serif"
      fontSize="5"
      fontWeight="bold"
      transform="rotate(-15 1 9)"
    >
      ♣
    </text>
    <rect
      x="12"
      y="2.5"
      width="16"
      height="23"
      rx="3"
      transform="rotate(15 12 2.5)"
      fill="white"
      stroke="#D1D5DB"
      strokeWidth="1.5"
    />
    <text
      x="13"
      y="8"
      fill="#DC2626"
      fontFamily="sans-serif"
      fontSize="5"
      fontWeight="bold"
      transform="rotate(15 13 8)"
    >
      ♦
    </text>
    <rect
      x="18"
      y="4.5"
      width="16"
      height="23"
      rx="3"
      transform="rotate(30 18 4.5)"
      fill="white"
      stroke="#D1D5DB"
      strokeWidth="1.5"
    />
    <text
      x="19"
      y="11"
      fill="#111827"
      fontFamily="sans-serif"
      fontSize="5"
      fontWeight="bold"
      transform="rotate(30 19 11)"
    >
      ♠
    </text>
  </svg>
);

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

const TABLE_STYLES = {
  tradicional: "from-green-800 via-green-900 to-black",
  taverna: "from-amber-800 via-amber-900 to-orange-950",
  vegas: "from-red-800 via-red-900 to-black",
  noturno: "from-gray-900 via-gray-950 to-black",
};

const getTableBg = (style) =>
  `bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${
    TABLE_STYLES[style] || TABLE_STYLES.tradicional
  }`;

const CHAT_PHRASES = [
  "Demorou, hein! ⏳",
  "Tá com medo? 🐔",
  "Sorte de principiante! 🍀",
  "Toma essa! 💥",
  "Boa jogada! 👏",
  "Lascou... 😭",
];

// ============================================================================
// COMPONENTES VISUAIS ISOLADOS
// ============================================================================

const PlayerAvatar = ({ src, name, size = "md", isTurn, isOpponent }) => {
  const dim =
    size === "lg"
      ? "w-24 h-24 text-3xl"
      : size === "sm"
      ? "w-8 h-8 text-sm"
      : "w-10 h-10 md:w-12 md:h-12 text-lg";
  const initial = name ? name.charAt(0).toUpperCase() : "?";

  let ringColor = "border-2 border-white/30 shadow-lg";
  if (isTurn !== undefined) {
    ringColor = isTurn
      ? isOpponent
        ? "ring-4 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
        : "ring-4 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)]"
      : "border-2 border-white/30 shadow-lg";
  }

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${dim} rounded-full object-cover ${ringColor} transition-all duration-300`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br from-blue-700 to-indigo-900 ${ringColor} flex items-center justify-center text-white font-black transition-all duration-300`}
    >
      {name.includes("Robô") || name === "Computador" ? "🤖" : initial}
    </div>
  );
};

const CardFace = ({
  card,
  playable,
  onClick,
  isHinted,
  trumpSuit,
  localProcessing,
  settings,
}) => {
  const { deckStyle, cardSize } = settings;
  const suitDef = SUITS[card.suit];
  const isTrump = card.suit === trumpSuit;
  const opacityClass =
    localProcessing && playable ? "opacity-50 cursor-wait" : "opacity-100";
  const hintClass = isHinted
    ? "ring-4 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.8)] -translate-y-4 scale-105 z-20"
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

const MiniCard = ({ card, settings }) => {
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

const CardBack = ({ settings, isMini = false }) => {
  const { cardSize } = settings;
  const sizeClasses = isMini
    ? "w-10 h-14 md:w-12 md:h-16 border"
    : cardSize === "large"
    ? "w-[84px] h-[120px] md:w-28 md:h-40 border-2"
    : "w-[72px] h-[104px] md:w-24 md:h-36 border-2";

  return (
    <div
      className={`${sizeClasses} bg-blue-900 rounded-lg md:rounded-xl border-white/80 shadow-lg flex items-center justify-center relative overflow-hidden p-1 md:p-2`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
      }}
    >
      <div className="absolute inset-1 border border-white/50 rounded-md md:rounded-lg pointer-events-none"></div>
      <div
        className={`${
          isMini ? "w-4 h-6" : "w-8 h-12 md:w-10 md:h-16"
        } border-2 border-white/30 rounded-lg flex items-center justify-center bg-blue-800/80`}
      >
        <span className="text-white/20 text-lg md:text-3xl">♠</span>
      </div>
    </div>
  );
};

// COMPONENTE: Oponente na Borda da Mesa (Exclusivo 2v2)
const EdgePlayer = ({
  player,
  handCount,
  position,
  isTurn,
  isOpponent,
  tocoTarget,
  lives,
  settings,
}) => {
  if (!player) return null;
  const isTarget = tocoTarget === player.id;

  let containerClass =
    "absolute flex flex-col items-center z-10 transition-all ";
  let flexDir = "flex-col";
  let infoAlign = "text-center";

  // POSIÇÕES CORRIGIDAS - Nuvem, Esquerda e Direita mais harmoniosos
  if (position === "top") {
    containerClass += "top-4 md:top-6 left-1/2 -translate-x-1/2";
  } else if (position === "left") {
    containerClass +=
      "left-2 md:left-6 top-[60%] -translate-y-1/2 flex-row gap-4";
    flexDir = "flex-col items-start";
    infoAlign = "text-left";
  } else if (position === "right") {
    containerClass +=
      "right-2 md:right-6 top-[60%] -translate-y-1/2 flex-row-reverse gap-4";
    flexDir = "flex-col items-end";
    infoAlign = "text-right";
  }

  return (
    <div className={containerClass}>
      <div className={`flex ${flexDir} gap-1 text-center`}>
        <PlayerAvatar
          src={player.avatar}
          name={player.name}
          size="sm"
          isTurn={isTurn}
          isOpponent={isOpponent}
        />
        <div
          className={`bg-black/50 backdrop-blur rounded px-2 py-0.5 text-white/90 flex flex-col ${infoAlign} gap-0.5 shadow-md border border-white/10`}
        >
          <span className="text-[10px] md:text-xs font-bold block truncate max-w-[70px]">
            {player.name}
          </span>
          {isTarget && (
            <div className="flex gap-0.5">
              {[...Array(lives)].map((_, i) => (
                <span key={i} className="text-[6px]">
                  ❤️
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {handCount > 0 && (
        <div
          className={`relative flex ${
            position === "top" ? "flex-row -space-x-5" : "flex-col -space-y-8"
          } items-center justify-center transition-all duration-300 opacity-90 hover:opacity-100 ${
            position === "top" ? "mt-2" : ""
          }`}
        >
          {Array.from({ length: handCount }).map((_, i) => {
            const offset = i - (handCount - 1) / 2;
            const angle = offset * 12;
            let transformStyle = "";

            if (position === "top") {
              transformStyle = `rotate(${angle}deg) translateY(${
                Math.abs(offset) * 4
              }px)`;
            } else if (position === "left") {
              transformStyle = `rotate(${90 + angle}deg) translateX(${
                -Math.abs(offset) * 4
              }px)`;
            } else if (position === "right") {
              transformStyle = `rotate(${-90 + angle}deg) translateX(${
                Math.abs(offset) * 4
              }px)`;
            }

            return (
              <div
                key={i}
                style={{
                  transform: transformStyle,
                  transformOrigin: "center center",
                }}
                className="transition-all duration-300 drop-shadow-md"
              >
                <CardBack settings={settings} isMini={true} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function App() {
  // ============================================================================
  // 2. ESTADOS GERAIS E CONFIGURAÇÕES
  // ============================================================================
  const [playerName, setPlayerName] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [me, setMe] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [avatarBase64, setAvatarBase64] = useState("");
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const isOfflineRef = useRef(false);

  const [selectedMode, setSelectedMode] = useState("1v1");

  const [isNetworkOffline, setIsNetworkOffline] = useState(!navigator.onLine);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentHint, setCurrentHint] = useState(null);

  const [showEmotes, setShowEmotes] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [activeReaction, setActiveReaction] = useState(null);
  const [activeChatMessage, setActiveChatMessage] = useState(null);
  const [isShaking, setIsShaking] = useState(false);

  const fileInputRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("tocoSettings");
    return saved
      ? JSON.parse(saved)
      : {
          sound: true,
          vibration: true,
          showHints: true,
          saveName: false,
          deckStyle: "default",
          cardSize: "normal",
          animations: true,
          tableStyle: "tradicional",
        };
  });

  useEffect(() => {
    const handleOnline = () => setIsNetworkOffline(false);
    const handleOffline = () => setIsNetworkOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("tocoSettings", JSON.stringify(settings));
    if (settings.saveName && playerName.trim())
      localStorage.setItem("tocoPlayerName", playerName);
    else if (!settings.saveName) localStorage.removeItem("tocoPlayerName");
  }, [settings, playerName]);

  useEffect(() => {
    if (settings.saveName) {
      const savedName = localStorage.getItem("tocoPlayerName");
      if (savedName) setPlayerName(savedName);
    }
    const savedAvatar = localStorage.getItem("tocoPlayerAvatar");
    if (savedAvatar) setAvatarBase64(savedAvatar);
  }, []);

  useEffect(() => {
    if (roomData?.currentReaction) {
      setActiveReaction(roomData.currentReaction.emoji);
      const timer = setTimeout(() => setActiveReaction(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [roomData?.currentReaction?.ts]);

  useEffect(() => {
    if (roomData?.currentMessage) {
      setActiveChatMessage(roomData.currentMessage);
      const timer = setTimeout(() => setActiveChatMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [roomData?.currentMessage?.ts]);

  const updateSetting = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }));
  const toggleSetting = (key) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const forceUpdateGame = () => {
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    window.location.reload(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 100;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setAvatarBase64(compressedBase64);
        localStorage.setItem("tocoPlayerAvatar", compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

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
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "heavy_card") {
        osc.type = "square";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        if (settings.vibration && navigator.vibrate)
          navigator.vibrate([50, 50, 50]);
      } else if (type === "win") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === "lose") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(250, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === "trick_win") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === "trick_lose") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
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
      if (!roomId || isNetworkOffline) return;
      update(ref(database, `rooms/${roomId}`), updates);
    }
  };

  const exitGame = () => {
    setRoomId(null);
    setRoomData(null);
    setIsSinglePlayer(false);
    isOfflineRef.current = false;
    setShowSettings(false);
    setShowRules(false);
  };

  const createRoom = async () => {
    if (isNetworkOffline)
      return setErrorMsg("Conecte-se à internet para jogar online.");
    if (!playerName.trim()) return setErrorMsg("Digite seu nome primeiro!");
    const newPin = generatePin();
    const myId = `player_${Date.now()}`;
    const newMe = {
      id: myId,
      name: playerName,
      isHost: true,
      avatar: avatarBase64,
    };

    const initialRoomData = {
      gameState: "lobby",
      hostId: myId,
      gameMode: selectedMode,
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
      currentReaction: null,
      sweepingTo: null,
      currentMessage: null,
    };

    setIsSinglePlayer(false);
    isOfflineRef.current = false;
    await set(ref(database, `rooms/${newPin}`), initialRoomData);
    setMe(newMe);
    setRoomId(newPin);
  };

  const joinRoom = async () => {
    if (isNetworkOffline)
      return setErrorMsg("Conecte-se à internet para jogar online.");
    if (!playerName.trim()) return setErrorMsg("Digite seu nome primeiro!");
    if (!pinInput.trim() || pinInput.length !== 4)
      return setErrorMsg("Digite um PIN válido de 4 números!");

    const roomRef = ref(database, `rooms/${pinInput}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
      const currentRoomData = snapshot.val();
      const existingPlayers = Object.values(currentRoomData.players || {});
      const matchedPlayer = existingPlayers.find(
        (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
      );

      const maxPlayers = currentRoomData.gameMode === "2v2" ? 4 : 2;

      let myId;
      let newMe;

      if (matchedPlayer) {
        myId = matchedPlayer.id;
        newMe = matchedPlayer;
        if (avatarBase64)
          await update(ref(database, `rooms/${pinInput}/players/${myId}`), {
            avatar: avatarBase64,
          });
      } else if (existingPlayers.length >= maxPlayers) {
        return setErrorMsg("A sala já está cheia!");
      } else {
        myId = `player_${Date.now()}`;
        newMe = {
          id: myId,
          name: playerName,
          isHost: false,
          avatar: avatarBase64,
        };
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
    const newMe = {
      id: myId,
      name: playerName,
      isHost: true,
      avatar: avatarBase64,
    };

    const bots = {};
    if (selectedMode === "2v2") {
      bots["bot_1"] = {
        id: "bot_1",
        name: "Robô Esquerda",
        isHost: false,
        avatar: "",
      };
      bots["bot_2"] = {
        id: "bot_2",
        name: "Robô Aliado",
        isHost: false,
        avatar: "",
      };
      bots["bot_3"] = {
        id: "bot_3",
        name: "Robô Direita",
        isHost: false,
        avatar: "",
      };
    } else {
      bots["bot_1"] = {
        id: "bot_1",
        name: "Computador",
        isHost: false,
        avatar: "",
      };
    }

    setMe(newMe);
    setIsSinglePlayer(true);
    isOfflineRef.current = true;
    setRoomId("SINGLE");

    const initialRoomData = {
      gameState: "choose_trump",
      hostId: myId,
      gameMode: selectedMode,
      players: { [myId]: newMe, ...bots },
      deck: createDeepShuffleDeck(),
      tableCards: [],
      trumpSuit: null,
      turn: null,
      hands: {},
      roundScores: {},
      gamePoints: {},
      tocoTarget: myId,
      lives: 3,
      trickHistory: [],
      currentReaction: null,
      sweepingTo: null,
      currentMessage: null,
    };

    setRoomData(initialRoomData);
    stateRef.current = initialRoomData;
  };

  const sendEmote = (emoji) => {
    if (isNetworkOffline) return;
    syncState({ currentReaction: { emoji, senderId: me.id, ts: Date.now() } });
    setShowEmotes(false);
  };

  const sendChatMessage = (text) => {
    if (isNetworkOffline) return;
    syncState({ currentMessage: { text, senderId: me.id, ts: Date.now() } });
    setShowChat(false);
  };

  useEffect(() => {
    if (!roomId || isOfflineRef.current || isNetworkOffline) return;
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
  }, [roomId, isNetworkOffline]);

  // ============================================================================
  // 4. LÓGICA E CÉREBRO DO JOGO
  // ============================================================================
  const playersList = roomData?.players ? Object.values(roomData.players) : [];
  const gameState = roomData?.gameState || "lobby";
  const gameMode = roomData?.gameMode || "1v1";
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

  const myIdx =
    playersList.findIndex((p) => p.id === me?.id) !== -1
      ? playersList.findIndex((p) => p.id === me?.id)
      : 0;
  const is2v2 = gameMode === "2v2";

  const myTeam = is2v2
    ? [playersList[myIdx], playersList[(myIdx + 2) % 4]].filter(Boolean)
    : [playersList[myIdx]];
  const opTeam = is2v2
    ? [playersList[(myIdx + 1) % 4], playersList[(myIdx + 3) % 4]].filter(
        Boolean
      )
    : [playersList[(myIdx + 1) % 2]];

  const leftPlayer = is2v2 ? playersList[(myIdx + 1) % 4] : null;
  const topPlayer = is2v2
    ? playersList[(myIdx + 2) % 4]
    : playersList[(myIdx + 1) % 2];
  const rightPlayer = is2v2 ? playersList[(myIdx + 3) % 4] : null;

  const myTeamScore = myTeam.reduce(
    (acc, p) => acc + (roundScores[p?.id] || 0),
    0
  );
  const opTeamScore = opTeam.reduce(
    (acc, p) => acc + (roundScores[p?.id] || 0),
    0
  );
  const myTeamTocos = myTeam.reduce(
    (acc, p) => acc + (gamePoints[p?.id] || 0),
    0
  );
  const opTeamTocos = opTeam.reduce(
    (acc, p) => acc + (gamePoints[p?.id] || 0),
    0
  );

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

  const checkIfHeavy = (playedCard, currentTable, trump) => {
    if (currentTable.length === 0) {
      return (
        ["A", "7"].includes(playedCard.label) ||
        (playedCard.suit === trump && ["3", "2"].includes(playedCard.label))
      );
    }
    const leadSuit = currentTable[0].card.suit;
    const isEncarte = playedCard.suit === leadSuit;
    const isCorte = playedCard.suit === trump && playedCard.suit !== leadSuit;

    if (isEncarte && ["A", "7"].includes(playedCard.label)) return true;
    if (isCorte && ["3", "2"].includes(playedCard.label)) return true;
    return false;
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
      const leadSuit = currentTable[0].card.suit;
      let maxTablePower = 0;
      let tablePoints = 0;
      for (let tc of currentTable) {
        tablePoints += getCardPoints(tc.card, currentTrump);
        let pwr = getCardPower(tc.card, currentTrump, leadSuit);
        if (pwr > maxTablePower) maxTablePower = pwr;
      }

      for (let card of currentHand) {
        const cardPts = getCardPoints(card, currentTrump);
        const cardPower = getCardPower(card, currentTrump, leadSuit);
        if (
          cardPower > maxTablePower &&
          currentScore + tablePoints + cardPts >= POINTS_GOAL
        )
          return card;
      }
    }

    if (isFirstToPlay) {
      if (lowTrumps.length > 0) return lowTrumps[0];
      return sortedHandByPtsAsc[0];
    } else {
      const leadSuit = currentTable[0].card.suit;
      let maxTablePower = 0;
      let opPts = 0;
      let hasTrumpOnTable = false;

      for (let tc of currentTable) {
        opPts += getCardPoints(tc.card, currentTrump);
        let pwr = getCardPower(tc.card, currentTrump, leadSuit);
        if (pwr > maxTablePower) maxTablePower = pwr;
        if (tc.card.suit === currentTrump) hasTrumpOnTable = true;
      }

      const winningCards = currentHand.filter(
        (c) => getCardPower(c, currentTrump, leadSuit) > maxTablePower
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
      } else if (!hasTrumpOnTable && winningTrumps.length > 0 && opPts >= 2) {
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
      myTeamScore
    );
    if (!bestCard) return;

    let explanation = "";
    const isFirstToPlay = tableCards.length === 0;

    if (
      !isFirstToPlay &&
      getCardPower(bestCard, trumpSuit, tableCards[0].card.suit) >
        getCardPower(tableCards[0].card, trumpSuit, tableCards[0].card.suit) &&
      myTeamScore +
        getCardPoints(tableCards[0].card, trumpSuit) +
        getCardPoints(bestCard, trumpSuit) >=
        POINTS_GOAL
    ) {
      explanation =
        "Jogue esta! Você vai chegar aos 31 pontos e ganhar a partida agora!";
    } else if (isFirstToPlay) {
      if (bestCard.suit === trumpSuit)
        explanation =
          "Saia cortando baixo para forçar os oponentes a gastarem trunfos altos.";
      else if (getCardPoints(bestCard, trumpSuit) === 0)
        explanation = "Jogue um Limpo para ver a reação deles.";
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
          "Corte! As cartas deles valem pontos. Use seu trunfo baixo para roubar.";
      } else {
        if (getCardPoints(bestCard, trumpSuit) === 0)
          explanation =
            "Não vale a pena gastar carta boa. Jogue um Limpo para não dar pontos a eles.";
        else
          explanation =
            "Descarte a sua carta de MENOR valor para diminuir o prejuízo.";
      }
    }
    setCurrentHint({ cardId: bestCard.id, text: explanation });
  };

  useEffect(() => {
    if (!isOfflineRef.current || gameState !== "choose_trump") return;
    const currentTargetPlayer = playersList.find((p) => p.id === tocoTarget);

    if (currentTargetPlayer && currentTargetPlayer.id !== me?.id) {
      const timer = setTimeout(() => {
        const suits = Object.keys(SUITS);
        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        syncState({ trumpSuit: randomSuit, gameState: "dealing" });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState, tocoTarget, playersList, me?.id]);

  useEffect(() => {
    if (!isOfflineRef.current || gameState !== "playing") return;
    const currentTurnIdx = playersList.findIndex((p) => p.id === turn);
    const bot = playersList[currentTurnIdx];

    if (bot && bot.id !== me?.id && tableCards.length < playersList.length) {
      const timer = setTimeout(() => {
        const botId = bot.id;
        const currentHands = stateRef.current?.hands || {};
        const botHand = currentHands[botId] || [];
        if (botHand.length === 0) return;

        const isMyTeamBot = myTeam.some((p) => p.id === botId);
        const botScore = isMyTeamBot ? myTeamScore : opTeamScore;

        const cardToPlay = getBestCardToPlay(
          botId,
          botHand,
          stateRef.current.tableCards,
          stateRef.current.trumpSuit,
          botScore
        );

        if (cardToPlay) {
          const isHeavy = checkIfHeavy(
            cardToPlay,
            stateRef.current.tableCards,
            stateRef.current.trumpSuit
          );
          const newHand = botHand.filter((c) => c.id !== cardToPlay.id);
          const newTable = [
            ...stateRef.current.tableCards,
            { playerId: botId, card: cardToPlay, isHeavy },
          ];

          let nextTurn = turn;
          if (newTable.length < playersList.length) {
            nextTurn =
              playersList[(currentTurnIdx + 1) % playersList.length].id;
          } else {
            nextTurn = null;
          }
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
    const requiredPlayers = gameMode === "2v2" ? 4 : 2;
    if (playersList.length < requiredPlayers)
      return setErrorMsg(`Aguardando mais jogadores para ${gameMode}...`);

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
      sweepingTo: null,
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
    if (tableCards.length >= playersList.length) return;

    if (
      settings.vibration &&
      navigator.vibrate &&
      !checkIfHeavy(card, tableCards, trumpSuit)
    )
      navigator.vibrate(40);

    setLocalProcessing(true);
    setCurrentHint(null);

    const currentHands = stateRef.current?.hands || {};
    const myHand = currentHands[me.id] || [];
    const newHand = myHand.filter((c) => c.id !== card.id);

    const isHeavy = checkIfHeavy(card, tableCards, trumpSuit);
    const newTable = [...tableCards, { playerId: me.id, card, isHeavy }];

    const currentTurnIdx = playersList.findIndex((p) => p.id === turn);
    let nextTurn = turn;
    if (newTable.length < playersList.length) {
      nextTurn = playersList[(currentTurnIdx + 1) % playersList.length].id;
    } else {
      nextTurn = null;
    }
    syncState({
      hands: { ...currentHands, [me.id]: newHand },
      tableCards: newTable,
      turn: nextTurn,
    });
  };

  const prevTableLength = useRef(0);
  useEffect(() => {
    if (tableCards.length > prevTableLength.current) {
      const lastCard = tableCards[tableCards.length - 1];
      if (lastCard.isHeavy && settings.animations) {
        playSoundEffect("heavy_card");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 400);
      } else {
        playSoundEffect("card");
      }
    }
    prevTableLength.current = tableCards.length;
  }, [tableCards, settings.animations]);

  useEffect(() => {
    if (
      me?.isHost &&
      tableCards.length === playersList.length &&
      playersList.length > 0
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
    if (validCards.length === 0) return;

    const leadSuit = validCards[0].card.suit;
    let winnerCard = validCards[0];
    let maxPower = getCardPower(validCards[0].card, currentT, leadSuit);
    let pts = getCardPoints(validCards[0].card, currentT);

    for (let i = 1; i < validCards.length; i++) {
      pts += getCardPoints(validCards[i].card, currentT);
      let pwr = getCardPower(validCards[i].card, currentT, leadSuit);
      if (pwr > maxPower) {
        maxPower = pwr;
        winnerCard = validCards[i];
      }
    }

    const winnerId = winnerCard.playerId;
    const isMyTeamWin = myTeam.some((p) => p.id === winnerId);

    if (isMyTeamWin) playSoundEffect("trick_win");
    else playSoundEffect("trick_lose");

    const newScores = { ...currentRS };
    newScores[winnerId] = (newScores[winnerId] || 0) + pts;
    const winnerName =
      playersList.find((p) => p.id === winnerId)?.name || "Alguém";
    const trickData = {
      id: Date.now(),
      winnerId: winnerId,
      pts: pts,
      cards: validCards.map((c) => c.card),
    };

    syncState({
      roundScores: newScores,
      trickFeedback: { winnerName, pts },
      trickHistory: [...currentHistory, trickData],
      sweepingTo: winnerId,
    });

    const updatedTeamAScore = myTeam.reduce(
      (acc, p) => acc + (newScores[p?.id] || 0),
      0
    );
    const updatedTeamBScore = opTeam.reduce(
      (acc, p) => acc + (newScores[p?.id] || 0),
      0
    );

    if (updatedTeamAScore >= POINTS_GOAL || updatedTeamBScore >= POINTS_GOAL) {
      const winningTeam = updatedTeamAScore >= POINTS_GOAL ? myTeam : opTeam;
      setTimeout(() => {
        syncState({ tableCards: [], sweepingTo: null });
        handleGameEnd(winningTeam);
      }, 800);
    } else {
      setTimeout(() => {
        const freshDeck = [...(stateRef.current?.deck || [])];
        const freshHands = { ...(stateRef.current?.hands || {}) };

        validCards.forEach((tc) => {
          if (freshDeck.length > 0) {
            const c = freshDeck.shift();
            if (freshHands[tc.playerId])
              freshHands[tc.playerId] = [...(freshHands[tc.playerId] || []), c];
          }
        });

        syncState({
          hands: freshHands,
          deck: freshDeck,
          turn: winnerId,
          tableCards: [],
          sweepingTo: null,
        });
      }, 800);

      setTimeout(() => syncState({ trickFeedback: null }), 2500);
    }
  };

  const handleGameEnd = (winningTeam) => {
    const {
      tocoTarget: currentTarget,
      lives: currentLives,
      gamePoints: currentGP,
    } = stateRef.current;

    const currentTargetIdx = playersList.findIndex(
      (p) => p.id === currentTarget
    );
    const targetIsInWinningTeam = winningTeam.some(
      (p) => p.id === currentTarget
    );

    let resultType = "";
    let updates = {};

    const isMyTeamWinner = winningTeam === myTeam;
    if (isMyTeamWinner) playSoundEffect("win");
    else {
      playSoundEffect("lose");
      if (settings.vibration && navigator.vibrate)
        navigator.vibrate([100, 50, 100]);
    }

    if (targetIsInWinningTeam) {
      let nextOpIdx = (currentTargetIdx + 1) % playersList.length;
      resultType = "escaped";
      updates = { tocoTarget: playersList[nextOpIdx].id, lives: 3 };
    } else {
      const newLives = currentLives - 1;
      updates = { lives: newLives };

      if (newLives > 0) {
        resultType = "life_lost";
      } else {
        resultType = "toco_confirmed";
        const gPoints = { ...currentGP };

        const loserTeam = winningTeam === myTeam ? opTeam : myTeam;
        loserTeam.forEach((p) => (gPoints[p.id] = (gPoints[p.id] || 0) + 1));

        let partnerIdx = (currentTargetIdx + 2) % playersList.length;

        updates = {
          gamePoints: gPoints,
          lives: 3,
          tocoTarget: playersList[partnerIdx].id,
        };
      }
    }

    updates.roundResult = { type: resultType, isMyTeamWinner };
    updates.gameState = "round_end";
    updates.trickFeedback = null;
    syncState(updates);
  };

  const getEndGameMessage = () => {
    if (!roundResult) return null;
    const { type, isMyTeamWinner } = roundResult;

    if (type === "escaped") {
      if (isMyTeamWinner)
        return (
          <span className="text-green-400 drop-shadow-md">
            {is2v2 ? "SEU TIME" : "VOCÊ"} SE LIVROU! 😅
          </span>
        );
      else
        return (
          <span className="text-yellow-400 drop-shadow-md">
            {is2v2 ? "ELES ESCAPARAM" : "ELE ESCAPOU"}! O TOCO É{" "}
            {is2v2 ? "DE VOCÊS" : "SEU"}! 🫵
          </span>
        );
    }
    if (type === "life_lost") {
      if (!isMyTeamWinner)
        return (
          <span className="text-red-400 drop-shadow-md">
            {is2v2 ? "SEU TIME" : "VOCÊ"} PERDEU 1 VIDA! 💔
          </span>
        );
      else
        return (
          <span className="text-green-400 drop-shadow-md">
            VOCÊS TIRARAM UMA VIDA DELES! ⚔️
          </span>
        );
    }
    if (type === "toco_confirmed") {
      if (!isMyTeamWinner)
        return (
          <span className="text-red-600 drop-shadow-md">
            QUE PENA! {is2v2 ? "SEU TIME" : "VOCÊ"} PEGOU O TOCO. 🪵
          </span>
        );
      else
        return (
          <span className="text-yellow-400 drop-shadow-md">
            AÊ! {is2v2 ? "VOCÊS DERAM" : "VOCÊ DEU"} UM TOCO NELES! 🏆
          </span>
        );
    }
    return null;
  };

  // ============================================================================
  // 5. COMPONENTES VISUAIS REUTILIZÁVEIS E TELAS
  // ============================================================================

  const RulesModal = () => (
    <div className="absolute inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-gray-900 border border-blue-500/30 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4 sticky top-0 bg-gray-900 z-10">
          <h2 className="text-2xl font-black text-blue-400 flex items-center gap-2">
            📖 Cartilha do Toco
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="text-white bg-red-600 rounded-full w-8 h-8 font-bold hover:bg-red-500 transition-colors"
          >
            &times;
          </button>
        </div>
        <div className="flex flex-col gap-6 text-sm text-gray-200">
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2 border-l-4 border-yellow-500 pl-2">
              🎯 O Objetivo
            </h3>
            <p>
              O objetivo de cada rodada é ser o primeiro a alcançar{" "}
              <strong>31 pontos</strong>. Ao fazer isso, você dá um "Toco" e
              tira uma vida (❤️) do adversário. Se ele perder as 3 vidas, o Toco
              é confirmado!
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2 border-l-4 border-yellow-500 pl-2">
              🔢 Valor das Cartas (Pontos)
            </h3>
            <div className="grid grid-cols-5 gap-2 text-center font-bold">
              <div className="bg-white/10 rounded p-2">
                <span className="text-xl block">A</span> 11 pts
              </div>
              <div className="bg-white/10 rounded p-2">
                <span className="text-xl block">7</span> 10 pts
              </div>
              <div className="bg-white/10 rounded p-2">
                <span className="text-xl block">K</span> 4 pts
              </div>
              <div className="bg-white/10 rounded p-2">
                <span className="text-xl block">J</span> 3 pts
              </div>
              <div className="bg-white/10 rounded p-2">
                <span className="text-xl block">Q</span> 2 pts
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              *Cartas 6, 5, 4, 3 e 2 (fora do trunfo) são "limpas" e valem 0
              pontos.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2 border-l-4 border-yellow-500 pl-2">
              ✨ O Poder do Trunfo
            </h3>
            <p className="mb-2">
              Quando o naipe é o Trunfo da rodada, as cartas baixas ganham
              superpoderes e passam a valer pontos:
            </p>
            <div className="grid grid-cols-5 gap-2 text-center font-bold">
              <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2">
                <span className="text-xl block text-blue-400">3</span> 10 pts
              </div>
              <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2">
                <span className="text-xl block text-blue-400">2</span> 10 pts
              </div>
              <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2">
                <span className="text-xl block text-blue-400">4</span> 4 pts
              </div>
              <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2">
                <span className="text-xl block text-blue-400">5</span> 3 pts
              </div>
              <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2">
                <span className="text-xl block text-blue-400">6</span> 2 pts
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2 border-l-4 border-yellow-500 pl-2">
              ⚔️ Hierarquia de Força
            </h3>
            <p className="mb-1 text-xs text-gray-400">
              Quem ganha a mão? (Da mais forte para a mais fraca)
            </p>
            <div className="bg-black/50 p-3 rounded-lg border border-white/5">
              <p className="mb-2">
                <strong className="text-white">Naipe Normal:</strong>
                <br /> A &gt; 7 &gt; K &gt; J &gt; Q &gt; 6 &gt; 5 &gt; 4 &gt; 3
                &gt; 2
              </p>
              <p>
                <strong className="text-blue-400">No Trunfo:</strong>
                <br /> A &gt; 3 &gt; 7 &gt; 2 &gt; K &gt; 4 &gt; J &gt; 5 &gt; Q
                &gt; 6
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

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
          <button
            onClick={forceUpdateGame}
            className="w-full bg-blue-600/90 text-white font-bold py-2 rounded-xl hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
          >
            <span>🔄</span> Forçar Atualização
          </button>

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

          <label className="flex justify-between items-center text-white font-medium border-t border-white/10 pt-4">
            <span>✨ Animações de Mesa</span>
            <input
              type="checkbox"
              checked={settings.animations ?? true}
              onChange={() => toggleSetting("animations")}
              className="w-6 h-6 accent-yellow-500"
            />
          </label>

          <div className="text-white font-medium pt-3 border-t border-white/10 mt-2">
            <span className="mb-2 block">🎨 Estilo da Mesa</span>
            <select
              value={settings.tableStyle || "tradicional"}
              onChange={(e) => updateSetting("tableStyle", e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm focus:border-yellow-500 text-white"
            >
              <option value="tradicional">Cassino (Verde)</option>
              <option value="taverna">Taverna (Âmbar/Madeira)</option>
              <option value="vegas">Vegas VIP (Vermelho)</option>
              <option value="noturno">Modo Noturno (Preto)</option>
            </select>
          </div>

          <div className="text-white font-medium pt-1">
            <span className="mb-2 block">📱 Tamanho das Cartas</span>
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
          {roomId && (
            <button
              onClick={exitGame}
              className="w-full mt-4 bg-red-600/90 text-white font-bold py-3 rounded-xl hover:bg-red-500 transition-colors uppercase tracking-widest text-sm border border-red-400"
            >
              🚪 Sair da Partida
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // --- TELA INICIAL ---
  if (!roomId) {
    return (
      <div
        className={`min-h-screen ${getTableBg(
          settings.tableStyle
        )} flex flex-col items-center justify-start pt-12 md:pt-24 pb-32 font-sans p-4 relative overflow-y-auto w-full`}
        translate="no"
      >
        <div className="absolute top-6 right-4 md:right-6 flex flex-col items-center gap-3 z-50">
          <button
            onClick={() => setShowSettings(true)}
            className="text-3xl opacity-70 hover:opacity-100 hover:rotate-90 transition-all duration-300 drop-shadow-md"
            title="Configurações"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="text-2xl opacity-70 hover:opacity-100 transition-all duration-300 bg-black/40 rounded-full w-10 h-10 flex items-center justify-center border border-white/20 shadow-lg"
            title="Como Jogar"
          >
            ❓
          </button>
        </div>

        {showSettings && <SettingsModal />}
        {showRules && <RulesModal />}

        <div className="w-full max-w-sm flex flex-col items-center">
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

          {isNetworkOffline && (
            <div className="w-full bg-red-600/80 text-white font-bold text-xs py-3 px-4 rounded-xl mb-4 animate-pulse text-center border border-red-400 shadow-lg">
              ⚠️ Sem conexão. Apenas o Modo Computador está disponível.
            </div>
          )}

          <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full shadow-2xl mb-8 flex flex-col items-center">
            <div
              className="relative mb-6 cursor-pointer transform hover:scale-105 transition-transform"
              onClick={() => fileInputRef.current?.click()}
            >
              <PlayerAvatar src={avatarBase64} name={playerName} size="lg" />
              <div className="absolute bottom-0 right-0 bg-blue-600 rounded-full p-2 border-2 border-black shadow-lg">
                📸
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>

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

            <div className="flex gap-4 mb-6 w-full">
              <button
                onClick={() => setSelectedMode("1v1")}
                className={`flex-1 py-3 rounded-xl font-black uppercase text-sm tracking-wider transition-all shadow-md ${
                  selectedMode === "1v1"
                    ? "bg-yellow-500 text-black border-2 border-white"
                    : "bg-black/50 text-gray-400 border border-white/10 hover:text-white"
                }`}
              >
                1 VS 1
              </button>
              <button
                onClick={() => setSelectedMode("2v2")}
                className={`flex-1 py-3 rounded-xl font-black uppercase text-sm tracking-wider transition-all shadow-md ${
                  selectedMode === "2v2"
                    ? "bg-yellow-500 text-black border-2 border-white"
                    : "bg-black/50 text-gray-400 border border-white/10 hover:text-white"
                }`}
              >
                2 VS 2
              </button>
            </div>

            <button
              onClick={startSinglePlayer}
              className="w-full bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-black py-4 rounded-xl shadow-lg mb-6 uppercase tracking-widest text-sm transition-transform active:scale-95 border border-blue-500 flex items-center justify-center gap-2"
            >
              <span className="text-xl">🤖</span> JOGAR SOZINHO
            </button>

            <div className="flex items-center gap-2 mb-6 opacity-60">
              <div className="h-px bg-white/20 flex-1"></div>
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                Multiplayer
              </span>
              <div className="h-px bg-white/20 flex-1"></div>
            </div>

            <button
              onClick={createRoom}
              disabled={isNetworkOffline}
              className={`w-full font-black py-3 rounded-xl shadow-lg mb-4 uppercase tracking-widest text-sm transition-transform active:scale-95 ${
                isNetworkOffline
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500"
              }`}
            >
              CRIAR NOVA SALA
            </button>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="PIN"
                value={pinInput}
                disabled={isNetworkOffline}
                onChange={(e) => setPinInput(e.target.value)}
                maxLength={4}
                className="w-full bg-black/50 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 text-center font-mono text-xl tracking-widest disabled:opacity-50"
              />
              <button
                onClick={joinRoom}
                disabled={isNetworkOffline}
                className={`font-black px-6 py-3 rounded-xl shadow-lg uppercase text-sm transition-transform active:scale-95 ${
                  isNetworkOffline
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-500"
                }`}
              >
                ENTRAR
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- TELA DE AGUARDANDO JOGADOR ---
  if (gameState === "lobby" && !isSinglePlayer) {
    const requiredPlayers = gameMode === "2v2" ? 4 : 2;
    return (
      <div
        className={`min-h-screen ${getTableBg(
          settings.tableStyle
        )} flex flex-col items-center justify-start pt-16 md:pt-24 pb-32 text-white font-sans p-4 relative overflow-y-auto w-full`}
        translate="no"
      >
        <button
          onClick={exitGame}
          className="absolute top-6 left-6 text-xl md:text-2xl opacity-70 hover:opacity-100 hover:-translate-x-1 transition-all duration-300 z-50 bg-black/40 rounded-full p-3 backdrop-blur-sm border border-white/10 shadow-lg"
          title="Sair da Sala"
        >
          ⬅️
        </button>

        <div className="absolute top-6 right-4 md:right-6 flex flex-col items-center gap-3 z-50">
          <button
            onClick={() => setShowSettings(true)}
            className="text-3xl opacity-70 hover:opacity-100 hover:rotate-90 transition-all duration-300 drop-shadow-md"
            title="Configurações"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="text-2xl opacity-70 hover:opacity-100 transition-all duration-300 bg-black/40 rounded-full w-10 h-10 flex items-center justify-center border border-white/20 shadow-lg"
            title="Como Jogar"
          >
            ❓
          </button>
        </div>

        {showSettings && <SettingsModal />}
        {showRules && <RulesModal />}

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

        <div className="bg-black/60 border border-white/20 px-6 py-2 rounded-full mb-8 shadow-inner">
          <span className="text-yellow-400 font-black tracking-widest uppercase">
            Modo {gameMode}
          </span>
        </div>

        <div className="bg-black/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center w-full max-w-sm shadow-2xl relative overflow-visible mb-8">
          <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black font-black px-6 py-2 rounded-full border-4 border-white shadow-lg text-lg flex items-center gap-2">
            PIN:{" "}
            <span className="font-mono text-2xl tracking-widest bg-white/30 px-2 rounded">
              {roomId}
            </span>
          </div>
          <p className="mt-6 mb-4 text-gray-300 font-bold uppercase tracking-wider text-sm">
            Jogadores na Mesa ({playersList.length}/{requiredPlayers})
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {playersList.map((p) => (
              <div
                key={p.id}
                className="bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-2 rounded-xl font-bold shadow-lg border-b-4 border-blue-900 notranslate flex items-center gap-2"
              >
                <PlayerAvatar src={p.avatar} name={p.name} size="sm" />
                {p.isHost && <span title="Host">👑</span>}
                {p.name}
              </div>
            ))}
          </div>
          {errorMsg && (
            <p className="text-red-400 text-sm mb-4 font-bold animate-pulse text-center">
              {errorMsg}
            </p>
          )}
          {me?.isHost && playersList.length >= requiredPlayers ? (
            <button
              onClick={startGameFirstTime}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-black py-4 rounded-xl hover:from-yellow-400 hover:to-yellow-500 shadow-[0_10px_20px_rgba(234,179,8,0.3)] transition-all transform hover:scale-105 active:scale-95 uppercase tracking-widest text-lg"
            >
              INICIAR JOGO
            </button>
          ) : (
            <div className="animate-pulse text-yellow-200 text-sm font-medium bg-yellow-900/30 py-3 rounded-xl border border-yellow-500/20">
              {playersList.length < requiredPlayers
                ? "Aguardando mais jogadores..."
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

  const myTricks = is2v2
    ? trickHistory.filter((t) => myTeam.some((p) => p.id === t.winnerId))
    : trickHistory.filter((t) => t.winnerId === me?.id);

  // --- TELA DA MESA DE JOGO ---
  return (
    <div
      className={`min-h-screen ${getTableBg(
        settings.tableStyle
      )} flex flex-col font-sans overflow-hidden notranslate text-white relative ${
        isShaking ? "animate-shake" : ""
      }`}
      translate="no"
    >
      <style>{`
        @keyframes float-emoji {
          0% { opacity: 0; transform: translateY(50px) scale(0.5); }
          15% { opacity: 1; transform: translateY(0px) scale(1.5); }
          85% { opacity: 1; transform: translateY(-20px) scale(1.5); }
          100% { opacity: 0; transform: translateY(-100px) scale(0.8); }
        }
        .animate-emoji { animation: float-emoji 2.5s ease-out forwards; }

        @keyframes chat-bubble {
          0% { opacity: 0; transform: scale(0.8) translateY(-10px); }
          10% { opacity: 1; transform: scale(1) translateY(0); }
          90% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.8) translateY(10px); }
        }
        .animate-chat { animation: chat-bubble 3.5s ease-in-out forwards; }

        @keyframes deal-up {
          0% { transform: translateY(150px) scale(0.5); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-deal-up { animation: deal-up 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes deal-table {
          0% { transform: translateY(-50px) scale(0.5); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-deal-table { animation: deal-table 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes sweep-left {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          100% { transform: translate(-30vw, -30vh) scale(0) rotate(-90deg); opacity: 0; }
        }
        .animate-sweep-left { animation: sweep-left 0.7s ease-in forwards; }

        @keyframes sweep-right {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          100% { transform: translate(30vw, -30vh) scale(0) rotate(90deg); opacity: 0; }
        }
        .animate-sweep-right { animation: sweep-right 0.7s ease-in forwards; }

        @keyframes screen-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-2px, -3px) rotate(-1deg); }
          20% { transform: translate(3px, 2px) rotate(1deg); }
          30% { transform: translate(-3px, 0px) rotate(0deg); }
          40% { transform: translate(2px, -2px) rotate(1deg); }
          50% { transform: translate(-1px, 3px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
        }
        .animate-shake { animation: screen-shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }

        @keyframes heavy-card-drop {
           0% { transform: scale(2.5); opacity: 0; filter: drop-shadow(0 0 50px rgba(250,204,21,1)); }
           100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 20px rgba(250,204,21,0.6)); }
        }
        .animate-heavy-drop { animation: heavy-card-drop 0.3s ease-out forwards; z-index: 50; }
      `}</style>

      {/* PLACAR UNIFICADO */}
      <div className="grid grid-cols-[1fr_auto_1fr] w-full h-24 bg-black/30 backdrop-blur-md border-b border-white/10 shadow-2xl relative z-20">
        <div
          className={`flex flex-col justify-center px-3 md:px-4 border-r border-white/10 overflow-hidden ${
            !is2v2 && turn === playersList[0]?.id ? "bg-white/5" : ""
          }`}
        >
          <div className="flex justify-between items-center w-full gap-2">
            <div className="flex items-center gap-2">
              {!is2v2 ? (
                <>
                  <PlayerAvatar
                    src={playersList[0]?.avatar}
                    name={playersList[0]?.name}
                  />
                  <span className="font-bold text-base md:text-xl drop-shadow truncate text-white">
                    {playersList[0]?.id === "bot_1"
                      ? "Computador"
                      : playersList[0]?.name}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex -space-x-2">
                    <PlayerAvatar
                      src={myTeam[0]?.avatar}
                      name={myTeam[0]?.name}
                      size="sm"
                      isTurn={turn === myTeam[0]?.id}
                    />
                    {myTeam[1] && (
                      <PlayerAvatar
                        src={myTeam[1]?.avatar}
                        name={myTeam[1]?.name}
                        size="sm"
                        isTurn={turn === myTeam[1]?.id}
                      />
                    )}
                  </div>
                  <span className="font-black text-base md:text-xl drop-shadow truncate text-yellow-400">
                    NÓS
                  </span>
                </>
              )}
            </div>

            {(!is2v2 && tocoTarget === playersList[0]?.id) ||
            (is2v2 && myTeam.some((p) => p.id === tocoTarget)) ? (
              <div className="flex flex-shrink-0 text-sm md:text-lg drop-shadow">
                {[...Array(lives)].map((_, i) => (
                  <span key={i}>❤️</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-end justify-between mt-1 pl-12">
            <span className="text-yellow-400 font-mono text-2xl md:text-3xl font-bold drop-shadow-md">
              {!is2v2 ? roundScores[playersList[0]?.id] || 0 : myTeamScore}
              <span className="text-xs md:text-sm text-gray-400 font-sans">
                /31
              </span>
            </span>
            <span className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide">
              Tocos:{" "}
              <span className="text-white font-bold text-xs md:text-sm bg-white/10 px-1.5 py-0.5 rounded">
                {!is2v2 ? gamePoints[playersList[0]?.id] || 0 : myTeamTocos}
              </span>
            </span>
          </div>
        </div>

        <div className="w-14 md:w-16 flex flex-col items-center justify-center bg-black/60 border-x border-white/10 shadow-inner px-1">
          <span className="text-gray-500 font-black text-sm italic mb-1">
            VS
          </span>
          {!isSinglePlayer && (
            <span
              className="text-[9px] md:text-[10px] text-yellow-500/80 notranslate bg-black/50 px-1 rounded shadow-inner"
              title="PIN da Sala"
            >
              {roomId}
            </span>
          )}
          {is2v2 && (
            <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">
              2v2
            </span>
          )}
        </div>

        <div
          className={`flex flex-col justify-center px-3 md:px-4 border-l border-white/10 overflow-hidden ${
            !is2v2 && turn === playersList[1]?.id ? "bg-white/5" : ""
          }`}
        >
          <div className="flex justify-between items-center flex-row-reverse w-full gap-2">
            <div className="flex items-center flex-row-reverse gap-2">
              {!is2v2 ? (
                <>
                  <PlayerAvatar
                    src={playersList[1]?.avatar}
                    name={playersList[1]?.name}
                  />
                  <span className="font-bold text-base md:text-xl drop-shadow truncate text-right text-white">
                    {playersList[1]?.id === "bot_1"
                      ? "Computador"
                      : playersList[1]?.name}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex -space-x-2 flex-row-reverse space-x-reverse">
                    <PlayerAvatar
                      src={opTeam[0]?.avatar}
                      name={opTeam[0]?.name}
                      size="sm"
                      isTurn={turn === opTeam[0]?.id}
                      isOpponent={true}
                    />
                    {opTeam[1] && (
                      <PlayerAvatar
                        src={opTeam[1]?.avatar}
                        name={opTeam[1]?.name}
                        size="sm"
                        isTurn={turn === opTeam[1]?.id}
                        isOpponent={true}
                      />
                    )}
                  </div>
                  <span className="font-black text-base md:text-xl drop-shadow truncate text-right text-red-400">
                    ELES
                  </span>
                </>
              )}
            </div>

            {(!is2v2 && tocoTarget === playersList[1]?.id) ||
            (is2v2 && opTeam.some((p) => p.id === tocoTarget)) ? (
              <div className="flex flex-shrink-0 text-sm md:text-lg drop-shadow justify-end">
                {[...Array(lives)].map((_, i) => (
                  <span key={i}>❤️</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-end justify-between mt-1 pr-12 flex-row-reverse">
            <span className="text-yellow-400 font-mono text-2xl md:text-3xl font-bold drop-shadow-md">
              {!is2v2 ? roundScores[playersList[1]?.id] || 0 : opTeamScore}
              <span className="text-xs md:text-sm text-gray-400 font-sans">
                /31
              </span>
            </span>
            <span className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide">
              Tocos:{" "}
              <span className="text-white font-bold text-xs md:text-sm bg-white/10 px-1.5 py-0.5 rounded">
                {!is2v2 ? gamePoints[playersList[1]?.id] || 0 : opTeamTocos}
              </span>
            </span>
          </div>
        </div>
      </div>

      {activeReaction && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-[150]">
          <div className="text-[120px] md:text-[160px] animate-emoji drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] filter">
            {activeReaction}
          </div>
        </div>
      )}

      {activeChatMessage && (
        <div className="pointer-events-none absolute top-[100px] left-1/2 -translate-x-1/2 z-[140] bg-white text-blue-900 font-black text-sm px-6 py-3 rounded-3xl shadow-2xl border-2 border-gray-200 animate-chat whitespace-nowrap">
          <span className="text-gray-500 mr-2 text-xs">
            {playersList.find((p) => p.id === activeChatMessage.senderId)?.name}
            :
          </span>
          {activeChatMessage.text}
        </div>
      )}

      <div className="absolute top-28 right-2 md:right-4 flex flex-col gap-3 z-50">
        <button
          onClick={() => setShowSettings(true)}
          className="text-2xl opacity-60 hover:opacity-100 transition-all duration-300 bg-black/40 rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg"
          title="Configurações"
        >
          ⚙️
        </button>
        <button
          onClick={() => setShowRules(true)}
          className="text-xl opacity-60 hover:opacity-100 transition-all duration-300 bg-black/40 rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg font-bold"
          title="Como Jogar"
        >
          ❓
        </button>
      </div>

      {showSettings && <SettingsModal />}
      {showRules && <RulesModal />}

      {/* BALÃO DE DICAS (In-clicável e posicionado bem acima da mão do jogador) */}
      {currentHint && (
        <div className="absolute bottom-40 md:bottom-32 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm pointer-events-none">
          <div className="bg-blue-900/95 backdrop-blur-md border-2 border-blue-400 p-4 rounded-2xl shadow-2xl animate-fade-in text-center relative pointer-events-auto">
            <button
              onClick={() => setCurrentHint(null)}
              className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full text-xs font-bold shadow border border-white z-50 cursor-pointer"
            >
              X
            </button>
            <p className="text-sm md:text-base font-medium text-white leading-tight">
              {currentHint.text}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center relative w-full mt-4">
        {/* RENDERIZAÇÃO 1v1 */}
        {!is2v2 && showCards && (
          <div className="absolute top-8 md:top-12 flex -space-x-4 md:-space-x-6 transition-all duration-500 hover:-space-x-2 z-10">
            {Array.from({ length: opHandCount }).map((_, i) => (
              <CardBack key={i} settings={settings} />
            ))}
          </div>
        )}

        {/* RENDERIZAÇÃO DOS OPONENTES E PARCEIRO NA BORDA DA TELA (2v2) */}
        {is2v2 && showCards && topPlayer && (
          <EdgePlayer
            player={topPlayer}
            position="top"
            handCount={hands[topPlayer.id]?.length || 0}
            isTurn={turn === topPlayer.id}
            isOpponent={false}
            tocoTarget={tocoTarget}
            lives={lives}
            settings={settings}
          />
        )}

        {is2v2 && showCards && leftPlayer && (
          <EdgePlayer
            player={leftPlayer}
            position="left"
            handCount={hands[leftPlayer.id]?.length || 0}
            isTurn={turn === leftPlayer.id}
            isOpponent={true}
            tocoTarget={tocoTarget}
            lives={lives}
            settings={settings}
          />
        )}

        {is2v2 && showCards && rightPlayer && (
          <EdgePlayer
            player={rightPlayer}
            position="right"
            handCount={hands[rightPlayer.id]?.length || 0}
            isTurn={turn === rightPlayer.id}
            isOpponent={true}
            tocoTarget={tocoTarget}
            lives={lives}
            settings={settings}
          />
        )}

        {/* ÁREA CENTRAL: Baralho e Trunfo */}
        <div
          className={`absolute ${
            is2v2
              ? "left-4 md:left-12 top-[15%] md:top-[20%]"
              : "left-4 md:left-8 top-1/2 -translate-y-1/2"
          } flex flex-col items-center gap-4 opacity-80 hover:opacity-100 transition-all`}
        >
          {deck.length > 0 && (
            <div
              className={`${
                is2v2
                  ? "w-12 h-16 md:w-16 md:h-24"
                  : "w-[52px] h-[76px] md:w-20 md:h-28"
              } bg-blue-900 border-2 border-white/50 rounded-lg flex items-center justify-center shadow-xl relative`}
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
              }}
            >
              <div className="absolute inset-1 border border-white/30 rounded border-dashed"></div>
              <div className="absolute -top-2 -right-2 bg-red-600 text-[10px] text-white font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow">
                {deck.length}
              </div>
            </div>
          )}
          {trumpSuit && (
            <div
              className={`${
                is2v2
                  ? "w-8 h-8 md:w-12 md:h-12 border-2"
                  : "w-10 h-10 md:w-14 md:h-14 border-4"
              } bg-white rounded-full border-yellow-500 flex items-center justify-center ${
                is2v2 ? "text-lg md:text-2xl" : "text-xl md:text-3xl"
              } shadow-[0_0_15px_rgba(250,204,21,0.5)]`}
            >
              <span className={`${SUITS[trumpSuit].defaultColor} font-sans`}>
                {SUITS[trumpSuit].symbol}
              </span>
            </div>
          )}
        </div>

        {/* ÁREA DA MESA COM CARTAS JOGADAS */}
        <div
          className={`relative flex flex-col items-center justify-center w-full ${
            is2v2
              ? "translate-y-12 md:translate-y-16"
              : "translate-y-6 md:translate-y-12"
          }`}
        >
          <div
            className={`${
              is2v2
                ? "grid grid-cols-2 gap-x-8 gap-y-4"
                : "flex gap-4 md:gap-8 flex-wrap"
            } items-center justify-items-center min-h-[160px] z-10 px-4`}
          >
            {tableCards.map((tc) => {
              const sweepingTo = roomData?.sweepingTo;
              const isLeft =
                sweepingTo === playersList[0]?.id ||
                sweepingTo === leftPlayer?.id;
              const isAnimEnabled = settings.animations ?? true;

              let animationClass = "";
              if (sweepingTo) {
                animationClass = isAnimEnabled
                  ? isLeft
                    ? "animate-sweep-left"
                    : "animate-sweep-right"
                  : "opacity-0";
              } else if (isAnimEnabled) {
                animationClass = tc.isHeavy
                  ? "animate-heavy-drop"
                  : "animate-deal-table";
              }

              return (
                <div
                  key={tc.card.id}
                  className={`flex flex-col items-center ${animationClass}`}
                >
                  <CardFace
                    card={tc.card}
                    playable={false}
                    settings={settings}
                    trumpSuit={trumpSuit}
                  />
                  <span className="bg-black/60 backdrop-blur text-white text-[10px] md:text-xs px-3 md:px-4 py-1 rounded-full mt-3 font-bold shadow-lg border border-white/20">
                    {playersList.find((p) => p.id === tc.playerId)?.name ||
                      "Robô"}
                  </span>
                </div>
              );
            })}
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

      <div className="bg-gradient-to-t from-black/95 to-transparent pb-8 pt-4 w-full flex flex-col items-center relative z-10">
        {showCards && (
          <>
            {/* BOTÃO DA PILHA E AVATAR ORGANIZADOS EM COLUNA */}
            <div
              className={`absolute left-4 ${
                is2v2
                  ? "bottom-44 md:bottom-32 gap-6"
                  : "bottom-48 md:bottom-20 gap-2"
              } z-40 flex flex-col items-center`}
            >
              <button
                onClick={() => setShowHistory(true)}
                className="text-white/60 hover:text-white transition-all duration-200 flex flex-col items-center gap-1 active:scale-95"
              >
                <CardFanIcon />
                <span className="text-[10px] md:text-xs font-bold tracking-wider">
                  Mãos ({myTricks.length})
                </span>
              </button>

              {is2v2 && (
                <div className="flex flex-col items-center gap-1">
                  <PlayerAvatar
                    src={me?.avatar}
                    name={playerName}
                    size="sm"
                    isTurn={turn === me?.id}
                    isOpponent={false}
                  />
                  {tocoTarget === me?.id && (
                    <div className="flex gap-0.5 mt-0.5 justify-center">
                      {[...Array(lives)].map((_, i) => (
                        <span key={i} className="text-[8px]">
                          ❤️
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isSinglePlayer && (
              <div className="absolute right-4 bottom-48 md:bottom-20 z-40 flex flex-col items-end gap-2">
                {showEmotes && (
                  <div className="flex flex-col gap-2 mb-2 bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/20 shadow-xl items-center">
                    <button
                      onClick={() => sendEmote("🤣")}
                      className="text-2xl hover:scale-125 transition-transform"
                    >
                      🤣
                    </button>
                    <button
                      onClick={() => sendEmote("😡")}
                      className="text-2xl hover:scale-125 transition-transform"
                    >
                      😡
                    </button>
                    <button
                      onClick={() => sendEmote("😭")}
                      className="text-2xl hover:scale-125 transition-transform"
                    >
                      😭
                    </button>
                    <button
                      onClick={() => sendEmote("🤡")}
                      className="text-2xl hover:scale-125 transition-transform"
                    >
                      🤡
                    </button>
                  </div>
                )}
                {showChat && (
                  <div className="flex flex-col gap-2 mb-2 bg-black/80 backdrop-blur-md p-3 rounded-2xl border border-white/20 shadow-xl items-end text-sm">
                    {CHAT_PHRASES.map((phrase) => (
                      <button
                        key={phrase}
                        onClick={() => sendChatMessage(phrase)}
                        className="text-white hover:text-yellow-400 text-right whitespace-nowrap font-medium py-1 transition-colors"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowChat(!showChat);
                      setShowEmotes(false);
                    }}
                    className="text-2xl opacity-80 hover:opacity-100 transition-opacity active:scale-90 bg-black/40 rounded-full w-12 h-12 flex items-center justify-center border border-white/10 shadow-lg"
                    title="Chat Rápido"
                  >
                    💬
                  </button>
                  <button
                    onClick={() => {
                      setShowEmotes(!showEmotes);
                      setShowChat(false);
                    }}
                    className="text-3xl opacity-80 hover:opacity-100 transition-opacity active:scale-90 bg-black/40 rounded-full w-12 h-12 flex items-center justify-center border border-white/10 shadow-lg"
                    title="Reagir"
                  >
                    😀
                  </button>
                </div>
              </div>
            )}

            {turn === me?.id && settings.showHints && (
              <div
                className={`absolute right-4 ${
                  !isSinglePlayer
                    ? "bottom-[260px] md:bottom-36"
                    : "bottom-48 md:bottom-20"
                } z-40 transition-all`}
              >
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
            myHand.map((card, index) => (
              <div
                key={card.id}
                className={`transition-transform duration-200 hover:-translate-y-6 hover:z-20 overflow-visible ${
                  settings.animations ?? true ? "animate-deal-up" : ""
                }`}
                style={{
                  animationDelay: `${index * 0.1}s`,
                  animationFillMode: "backwards",
                }}
              >
                <CardFace
                  card={card}
                  playable={turn === me?.id}
                  onClick={handleCardClick}
                  isHinted={currentHint?.cardId === card.id}
                  settings={settings}
                  trumpSuit={trumpSuit}
                  localProcessing={localProcessing}
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
              Mãos {is2v2 ? "do Time" : "da Rodada"} 🗂️
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
                  {is2v2 ? "Seu time" : "Você"} ainda não levou nenhuma mão.
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
                      <MiniCard key={c.id} card={c} settings={settings} />
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
                {getEndGameMessage()}
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
