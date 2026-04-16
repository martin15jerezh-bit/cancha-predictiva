"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { applyBoxscoreImports, areSameTeam, getPointDifferential, LIGA_DOS_COMPETITION, parseNumber, seedData } from "@/lib/data";
import { BoxscoreImport, CompetitionKey, DatasetMap, GameRow, PlayerGameStatRow, PlayerRow, ShotRow, TeamRow } from "@/lib/types";
import {
  buildEditableReport,
  buildScoutingModel,
  databaseTables,
  EvidenceLevel,
  MatchupScout,
  roleCapabilities,
  ScoutingFilters,
  SourceTrace,
  UserRole
} from "@/lib/scouting";

const STORAGE_KEY = "dos-premium-scouting-v1";
const TRACE_KEY = "dos-premium-source-trace-v1";

const tabs = [
  "Dashboard",
  "Equipos",
  "Jugadores",
  "Rotacion",
  "Carta de tiro",
  "Cuartos",
  "Comparativo",
  "Informes",
  "Presentaciones",
  "Notas",
  "Carga",
  "Admin"
] as const;

type TabKey = (typeof tabs)[number];
type NoteScope = "rival" | "partido" | "jugador" | "equipo";
type RangeKey = "Ultimos 3 partidos" | "Ultimos 5 partidos" | "Ultimos 8 disponibles";
type LocalityKey = "Local y visita" | "Solo local" | "Solo visita";
type PrivateNote = {
  id: string;
  scope: NoteScope;
  title: string;
  body: string;
  userRole: UserRole;
  createdAt: string;
};
type OfficialSyncPayload = {
  teams: TeamRow[];
  players: PlayerRow[];
  games: GameRow[];
  syncedAt: string;
  sources: string[];
  error?: string;
};

function getVisibleTabs(role: UserRole) {
  return tabs.filter((item) => {
    if (item === "Admin") {
      return role === "admin";
    }
    if ((item === "Informes" || item === "Presentaciones" || item === "Notas") && role === "jugador") {
      return item === "Informes";
    }
    return true;
  });
}

function evidenceClass(evidence: EvidenceLevel) {
  if (evidence === "dato confirmado") {
    return "confirmed";
  }
  if (evidence === "inferencia estadistica") {
    return "inferred";
  }
  return "tactical";
}

function teamThemeFor(name: string): CSSProperties {
  const palettes = [
    ["#0f766e", "#dff7f1"],
    ["#b91c1c", "#fff1f2"],
    ["#2563eb", "#eff6ff"],
    ["#7c2d12", "#fff7ed"],
    ["#365314", "#f7fee7"],
    ["#4f46e5", "#eef2ff"]
  ] as const;
  const index = name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  const [primary, soft] = palettes[index];
  return {
    "--team-primary": primary,
    "--team-soft": soft
  } as CSSProperties;
}

function EvidencePill({ evidence, confidence }: { evidence: EvidenceLevel; confidence?: number }) {
  return (
    <span className={`evidence-pill ${evidenceClass(evidence)}`}>
      {evidence}
      {typeof confidence === "number" ? ` · ${(confidence * 100).toFixed(0)}%` : ""}
    </span>
  );
}

function MetricTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}

function TeamRecordCard({
  label,
  scout,
  sampleSize
}: {
  label: string;
  scout: MatchupScout["ownTeam"];
  sampleSize: number;
}) {
  return (
    <article className="record-card">
      <span>{label}</span>
      <strong>{scout.recentRecord}</strong>
      <small>{scout.team.gamesPlayed} PJ tabla · muestra {scout.sampleRecord}</small>
      <div className="recent-games">
        <b>Ultimos {sampleSize} partidos</b>
        {scout.recentGames.length > 0 ? (
          scout.recentGames.map((game) => (
            <div className="recent-game-row" key={`${scout.team.teamId}-${game.date}-${game.opponent}`}>
              <i className={`result-badge ${game.result === "G" ? "win" : "loss"}`}>{game.result}</i>
              <strong>{game.score}</strong>
              <em>{game.venue === "Local" ? "vs" : "@"} {game.opponent}</em>
              <small>{game.venue}</small>
            </div>
          ))
        ) : (
          <p className="empty-recent-games">Sin partidos confirmados para este filtro.</p>
        )}
      </div>
    </article>
  );
}

function PlayerImpactCard({
  label,
  player,
  tone
}: {
  label: string;
  player?: MatchupScout["ownPlayers"][number];
  tone: "threat" | "advantage";
}) {
  if (!player) {
    return (
      <article className={`player-impact-card ${tone}`}>
        <span>{label}</span>
        <h4>Sin muestra individual</h4>
        <p>Faltan estadisticas oficiales suficientes para priorizar un jugador.</p>
      </article>
    );
  }

  const stats = [
    ["PTS/PJ", player.points],
    ["REB/PJ", player.rebounds],
    ["AST/PJ", player.assists],
    ["MIN/PJ", player.minutes],
    ["EF tiro", player.shootingEfficiency ?? "s/d"],
    ["Impacto", player.recentImpactIndex]
  ];

  return (
    <article className={`player-impact-card ${tone}`}>
      <span>{label}</span>
      <h4>{player.name}</h4>
      <div className="player-role-strip">
        <span>{player.role}</span>
        <span>{player.playerType}</span>
      </div>
      <p>{tone === "threat" ? player.defensiveKey : player.decisionTrigger}</p>
      <div className="player-stat-grid">
        {stats.map(([statLabel, statValue]) => (
          <div key={statLabel}>
            <small>{statLabel}</small>
            <strong>{statValue}</strong>
          </div>
        ))}
      </div>
      <small className="impact-reason">
        {player.strength} · amenaza {player.threatIndex}
      </small>
    </article>
  );
}

function formatRotationName(name: string) {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned.includes(",")) {
    return cleaned;
  }

  const [surname, ...givenParts] = cleaned.split(",");
  const givenName = givenParts.join(" ").trim();
  return givenName ? `${givenName} ${surname.trim()}` : surname.trim();
}

function PlayerChipList({ players, featured = false }: { players: string[]; featured?: boolean }) {
  if (!players.length) {
    return <span className="empty-chip">Sin muestra suficiente</span>;
  }

  return (
    <div className="player-chip-list">
      {players.map((player, index) => (
        <span className={`player-chip ${featured ? "featured" : ""}`} key={`${player}-${index}`}>
          {formatRotationName(player)}
        </span>
      ))}
    </div>
  );
}

function RotationBlock({
  title,
  tag,
  players,
  caption,
  featured = false
}: {
  title: string;
  tag: string;
  players: string[];
  caption: string;
  featured?: boolean;
}) {
  return (
    <article className={`rotation-card ${featured ? "featured" : ""}`}>
      <header>
        <div>
          <span>{tag}</span>
          <h4>{title}</h4>
        </div>
        <strong>{players.length ? `${players.length} jug.` : "s/d"}</strong>
      </header>
      <PlayerChipList players={players} featured={featured} />
      <p>{caption}</p>
    </article>
  );
}

function RotationSignal({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="rotation-signal">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}

function DecisionCard({ decision }: { decision: MatchupScout["decisionBrief"][number] }) {
  return (
    <article className={`decision-card ${decision.tone}`}>
      <span>{decision.label}</span>
      <strong>{decision.value}</strong>
      <p>{decision.action}</p>
      <EvidencePill evidence={decision.evidence} confidence={decision.confidence} />
    </article>
  );
}

function SignalList({ title, signals }: { title: string; signals: MatchupScout["tacticalKeys"] }) {
  return (
    <section className="module-panel">
      <div className="module-heading">
        <p className="eyebrow">Lectura tecnica</p>
        <h3>{title}</h3>
      </div>
      <div className="signal-list">
        {signals.map((signal) => (
          <article className="signal-row" key={`${signal.label}-${signal.value}`}>
            <div>
              <strong>{signal.label}</strong>
              <p>{signal.value}</p>
            </div>
            <EvidencePill evidence={signal.evidence} confidence={signal.confidence} />
          </article>
        ))}
      </div>
    </section>
  );
}

type ShotPeriodFilter = "Todo" | "1" | "2" | "3" | "4";
type ShotGameFilter = "Todos" | string;
type ShotPlayerSection = "Amenaza principal" | "Titulares probables" | "Primeros cambios" | "Rotacion 8-9";
type ShotPlayerCard = {
  name: string;
  role: string;
  tag: string;
  section: ShotPlayerSection;
  rank: number;
  player?: MatchupScout["rivalPlayers"][number];
  shots: ShotRow[];
};

function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function personNameTokens(value: string) {
  return normalizePersonName(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function personIdentity(value: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const [surnamePart, givenPart = ""] = cleaned.split(",").map((part) => part.trim());
  const hasComma = cleaned.includes(",");
  const normalizedSurnameTokens = personNameTokens(surnamePart);
  const normalizedGivenTokens = personNameTokens(givenPart);

  if (hasComma) {
    return {
      givenInitial: normalizedGivenTokens[0]?.[0] ?? "",
      surnameTokens: normalizedSurnameTokens,
      tokens: [...normalizedSurnameTokens, ...normalizedGivenTokens]
    };
  }

  const tokens = personNameTokens(value);
  if (tokens.length === 0) {
    return { givenInitial: "", surnameTokens: [], tokens: [] };
  }
  if (tokens[0].length === 1) {
    return {
      givenInitial: tokens[0],
      surnameTokens: tokens.slice(1),
      tokens
    };
  }
  if (tokens.length >= 3) {
    return {
      givenInitial: tokens[0][0] ?? "",
      surnameTokens: tokens.slice(1),
      tokens
    };
  }
  return {
    givenInitial: "",
    surnameTokens: tokens,
    tokens
  };
}

function nameCompletenessScore(value: string) {
  const identity = personIdentity(value);
  return identity.tokens.reduce((score, token) => score + (token.length > 1 ? 2 : 0), 0) + (value.includes(",") ? 1 : 0);
}

function sameShotPlayer(playerName: string, shotName: string) {
  const player = normalizePersonName(playerName);
  const shot = normalizePersonName(shotName);
  if (!player || !shot) {
    return false;
  }
  if (player === shot || player.includes(shot) || shot.includes(player)) {
    return true;
  }
  const playerIdentity = personIdentity(playerName);
  const shotIdentity = personIdentity(shotName);
  const playerSurnames = playerIdentity.surnameTokens.filter((token) => token.length > 2);
  const shotSurnames = shotIdentity.surnameTokens.filter((token) => token.length > 2);
  const surnameOverlap = playerSurnames.filter((token) => shotSurnames.includes(token)).length;
  const initialsCompatible =
    !playerIdentity.givenInitial || !shotIdentity.givenInitial || playerIdentity.givenInitial === shotIdentity.givenInitial;

  if (Math.min(playerSurnames.length, shotSurnames.length) >= 2) {
    return surnameOverlap >= 2 && initialsCompatible;
  }

  return surnameOverlap >= 1 && (initialsCompatible || Math.min(playerSurnames.length, shotSurnames.length) === 1);
}

function uniqueNames(values: Array<string | undefined>) {
  const result: string[] = [];
  values.forEach((value) => {
    if (!value) {
      return;
    }
    const key = normalizePersonName(value);
    if (!key) {
      return;
    }
    const existingIndex = result.findIndex((item) => sameShotPlayer(item, value));
    if (existingIndex >= 0) {
      if (nameCompletenessScore(value) > nameCompletenessScore(result[existingIndex])) {
        result[existingIndex] = value;
      }
      return;
    }
    result.push(value);
  });
  return result;
}

function roundOne(value: number) {
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function percentText(made: number, attempts: number) {
  return attempts > 0 ? `${Math.round((made / attempts) * 100)}%` : "s/d";
}

function clampPoint(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shotPoint(shot: ShotRow) {
  return {
    x: clampPoint(shot.x, 3, 97),
    y: clampPoint((shot.y / 100) * 56, 3, 53)
  };
}

function shotZone(shot: ShotRow) {
  const lane = shot.y >= 34 && shot.y <= 66;
  const deepPaint = shot.x <= 18 || shot.x >= 82;
  if (shot.actionType === "3pt") {
    if ((shot.x <= 16 || shot.x >= 84) && (shot.y <= 22 || shot.y >= 78)) {
      return "esquina";
    }
    return "triple frontal/45";
  }
  if (deepPaint && lane) {
    return "pintura";
  }
  if (shot.y < 35) {
    return "costado izquierdo";
  }
  if (shot.y > 65) {
    return "costado derecho";
  }
  return "media distancia";
}

function shotSide(shot: ShotRow) {
  if (shot.y < 35) {
    return "lado izquierdo";
  }
  if (shot.y > 65) {
    return "lado derecho";
  }
  return "eje central";
}

function shotSummary(shots: ShotRow[]) {
  const attempts = shots.length;
  const made = shots.filter((shot) => shot.made).length;
  const threes = shots.filter((shot) => shot.actionType === "3pt");
  const firstHalf = shots.filter((shot) => shot.period <= 2);
  const secondHalf = shots.filter((shot) => shot.period >= 3);
  const zones = new Map<string, number>();
  const sides = new Map<string, number>();
  const quarters = new Map<number, number>();
  shots.forEach((shot) => {
    zones.set(shotZone(shot), (zones.get(shotZone(shot)) ?? 0) + 1);
    sides.set(shotSide(shot), (sides.get(shotSide(shot)) ?? 0) + 1);
    quarters.set(shot.period, (quarters.get(shot.period) ?? 0) + 1);
  });
  const topZone = [...zones.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSide = [...sides.entries()].sort((a, b) => b[1] - a[1])[0];
  const topQuarter = [...quarters.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    attempts,
    made,
    efficiency: percentText(made, attempts),
    threeAttempts: threes.length,
    threeMade: threes.filter((shot) => shot.made).length,
    firstHalfAttempts: firstHalf.length,
    secondHalfAttempts: secondHalf.length,
    topZone: topZone?.[0] ?? "sin zona dominante",
    topZoneCount: topZone?.[1] ?? 0,
    topSide: topSide?.[0] ?? "sin lado dominante",
    topQuarter: topQuarter?.[0] ? `${topQuarter[0]}C` : "s/d",
    topQuarterAttempts: topQuarter?.[1] ?? 0
  };
}

function buildShotAnalysis(playerName: string, shots: ShotRow[]) {
  const summary = shotSummary(shots);
  if (summary.attempts === 0) {
    return {
      headline: "Sin carta de tiro confirmada para este jugador en la muestra.",
      bullets: [
        "Reimporta el link de Estadisticas completas para capturar la pestana Carta de tiro.",
        "Cuando existan coordenadas, el sistema mostrara zonas, cuartos y plan defensivo."
      ],
      plan: "Plan provisorio: defender segun scouting estadistico y validar con video."
    };
  }

  const pressure =
    summary.secondHalfAttempts > summary.firstHalfAttempts
      ? "aumenta volumen en segunda mitad"
      : summary.firstHalfAttempts > summary.secondHalfAttempts
        ? "carga mas tiros en primera mitad"
        : "reparte volumen entre mitades";
  const plan =
    summary.threeAttempts >= summary.attempts * 0.45
      ? "Pasar por arriba en bloqueos, negar catch and shoot y cerrar con mano alta."
      : summary.topZone === "pintura"
        ? "Cerrar primera linea, cargar ayuda corta y obligarlo a finalizar lejos del aro."
        : "Orientarlo fuera de su zona dominante y conceder tiros de menor eficiencia.";

  return {
    headline: `${playerName} concentra ${summary.topZoneCount}/${summary.attempts} tiros en ${summary.topZone} y ${pressure}.`,
    bullets: [
      `Volumen: ${summary.attempts} tiros en la muestra, ${summary.efficiency} de acierto.`,
      `Mayor carga por cuarto: ${summary.topQuarter} con ${summary.topQuarterAttempts} tiros.`,
      `Tendencia espacial: ${summary.topSide}; triples ${summary.threeMade}/${summary.threeAttempts}.`
    ],
    plan
  };
}

function shotPlanText(playerName: string, shots: ShotRow[]) {
  const analysis = buildShotAnalysis(playerName, shots);
  const summary = shotSummary(shots);
  return [
    `Carta de tiro - ${playerName}`,
    "",
    `Tiros registrados: ${summary.attempts}`,
    `Acierto: ${summary.efficiency}`,
    `Zona dominante: ${summary.topZone}`,
    `Cuarto de mayor volumen: ${summary.topQuarter}`,
    "",
    "Lectura staff",
    analysis.headline,
    ...analysis.bullets.map((item) => `- ${item}`),
    "",
    "Plan defensivo",
    `- ${analysis.plan}`,
    "- Comunicar la regla en una frase simple al jugador asignado.",
    "- Validar con video si el rival cambia volumen entre primera y segunda mitad."
  ].join("\n");
}

function ShotCourt({ shots }: { shots: ShotRow[] }) {
  return (
    <div className="shot-court">
      <svg aria-label="Carta de tiro" role="img" viewBox="0 0 100 56">
        <rect className="court-bg" x="1" y="1" width="98" height="54" rx="2" />
        <line className="court-line" x1="50" y1="1" x2="50" y2="55" />
        <circle className="court-line-fill" cx="50" cy="28" r="6.5" />
        <rect className="court-line-fill" x="1" y="17" width="17" height="22" />
        <rect className="court-line-fill" x="82" y="17" width="17" height="22" />
        <circle className="court-line-fill" cx="9" cy="28" r="2.2" />
        <circle className="court-line-fill" cx="91" cy="28" r="2.2" />
        <path className="court-line-fill" d="M1 7 C18 9 24 18 24 28 C24 38 18 47 1 49" />
        <path className="court-line-fill" d="M99 7 C82 9 76 18 76 28 C76 38 82 47 99 49" />
        {shots.map((shot) => {
          const point = shotPoint(shot);
          return shot.made ? (
            <circle className="shot-dot made" cx={point.x} cy={point.y} key={shot.shotId} r="1.25" />
          ) : (
            <g className="shot-miss" key={shot.shotId}>
              <line x1={point.x - 1.25} y1={point.y - 1.25} x2={point.x + 1.25} y2={point.y + 1.25} />
              <line x1={point.x + 1.25} y1={point.y - 1.25} x2={point.x - 1.25} y2={point.y + 1.25} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function isUploadedGame(gameId: string, notes: string) {
  return notes.toLowerCase().includes("importado desde fiba");
}

function fixtureKey(game: GameRow) {
  return `${game.date}-${game.homeTeam.toLowerCase()}-${game.awayTeam.toLowerCase()}`;
}

function matchIdFromGame(game: GameRow) {
  return game.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ?? game.notes.match(/(?:FIBA|Genius)\s+(\d+)/)?.[1];
}

function matchIdFromShot(shot: ShotRow) {
  return (
    shot.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ??
    shot.sourceUrl.match(/\/data\/(\d+)/)?.[1] ??
    shot.sourceUrl.match(/\/u\/[^/]+\/(\d+)/)?.[1]
  );
}

function matchIdFromPlayerGameStat(stat: PlayerGameStatRow) {
  return (
    stat.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ??
    stat.sourceUrl.match(/\/data\/(\d+)/)?.[1] ??
    stat.sourceUrl.match(/\/u\/[^/]+\/(\d+)/)?.[1]
  );
}

function dataUrlFromGame(game: GameRow) {
  const matchId = matchIdFromGame(game);
  return matchId ? `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json` : null;
}

function minutesToDecimal(value: string | undefined) {
  const raw = String(value ?? "").trim();
  if (raw.includes(":")) {
    const [minutes, seconds] = raw.split(":").map(Number);
    return (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? seconds / 60 : 0);
  }
  return parseNumber(raw);
}

function formatMinutes(value: number) {
  return `${roundOne(value)} min`;
}

function firstChangeLabel(index: number) {
  if (index === 0) {
    return "1er cambio";
  }
  if (index === 1) {
    return "2do cambio";
  }
  return `${index + 1}o cambio`;
}

function signedDelta(value: number, suffix = "") {
  if (!Number.isFinite(value)) {
    return "s/d";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${roundOne(value)}${suffix}`;
}

function trendState(delta: number, threshold = 2) {
  if (!Number.isFinite(delta)) {
    return "Sin muestra";
  }
  if (delta >= threshold) {
    return "En alza";
  }
  if (delta <= -threshold) {
    return "En caida";
  }
  return "Estable";
}

function pctFromMadeAttempt(made: number, attempted: number) {
  return attempted > 0 ? `${Math.round((made / attempted) * 100)}%` : "s/d";
}

function averagePlayerGameStats(stats: PlayerGameStatRow[]) {
  const games = Math.max(stats.length, 1);
  const totals = stats.reduce(
    (acc, stat) => ({
      minutes: acc.minutes + minutesToDecimal(stat.minutes),
      points: acc.points + parseNumber(stat.points),
      rebounds: acc.rebounds + parseNumber(stat.rebounds),
      assists: acc.assists + parseNumber(stat.assists),
      threeMade: acc.threeMade + parseNumber(stat.threeMade),
      threeAttempted: acc.threeAttempted + parseNumber(stat.threeAttempted)
    }),
    { minutes: 0, points: 0, rebounds: 0, assists: 0, threeMade: 0, threeAttempted: 0 }
  );

  return {
    games: stats.length,
    minutes: totals.minutes / games,
    points: totals.points / games,
    rebounds: totals.rebounds / games,
    assists: totals.assists / games,
    threePct: pctFromMadeAttempt(totals.threeMade, totals.threeAttempted)
  };
}

function seasonThreePct(player?: PlayerRow) {
  if (!player) {
    return "s/d";
  }
  return pctFromMadeAttempt(parseNumber(player.threeMade), parseNumber(player.threeAttempted));
}

function recentTeamMetrics(scout: MatchupScout["ownTeam"]) {
  const games = scout.recentGames;
  if (games.length === 0) {
    return { points: 0, differential: 0 };
  }
  const totals = games.reduce(
    (acc, game) => {
      const [ownScore, opponentScore] = game.score.split("-").map((value) => parseNumber(value));
      return {
        points: acc.points + ownScore,
        differential: acc.differential + ownScore - opponentScore
      };
    },
    { points: 0, differential: 0 }
  );

  return {
    points: totals.points / games.length,
    differential: totals.differential / games.length
  };
}

function seasonTeamMetrics(team: TeamRow) {
  const games = Math.max(parseNumber(team.gamesPlayed), 1);
  return {
    points: parseNumber(team.pointsFor) / games,
    rebounds: parseNumber(team.reboundsPerGame),
    assists: parseNumber(team.assistsPerGame),
    differential: getPointDifferential(team)
  };
}

function replaceLigaDosDataset(current: DatasetMap, official: OfficialSyncPayload): DatasetMap {
  const importedGames = current.games.filter((game) => game.competition === LIGA_DOS_COMPETITION && isUploadedGame(game.gameId, game.notes));
  const importedByFixture = new Map(importedGames.map((game) => [fixtureKey(game), game]));
  const importedByMatchId = new Map<string, GameRow>();
  importedGames.forEach((game) => {
    const matchId = matchIdFromGame(game);
    if (matchId) {
      importedByMatchId.set(matchId, game);
    }
  });
  const officialKeys = new Set(official.games.map(fixtureKey));
  const officialMatchIds = new Set(official.games.map(matchIdFromGame).filter((matchId): matchId is string => Boolean(matchId)));
  const mergedOfficialGames = official.games.map((game) => {
    const matchId = matchIdFromGame(game);
    const imported = importedByFixture.get(fixtureKey(game)) ?? (matchId ? importedByMatchId.get(matchId) : undefined);
    return imported ? { ...imported, date: game.date, phase: game.phase, week: game.week } : game;
  });
  const preservedImportedGames = importedGames.filter((game) => {
    const matchId = matchIdFromGame(game);
    return !officialKeys.has(fixtureKey(game)) && (!matchId || !officialMatchIds.has(matchId));
  });

  return {
    teams: [
      ...current.teams.filter((team) => team.competition !== LIGA_DOS_COMPETITION),
      ...official.teams
    ],
    players: [
      ...current.players.filter((player) => player.competition !== LIGA_DOS_COMPETITION),
      ...official.players
    ],
    games: [
      ...current.games.filter((game) => game.competition !== LIGA_DOS_COMPETITION),
      ...mergedOfficialGames,
      ...preservedImportedGames
    ],
    playerGameStats: current.playerGameStats ?? [],
    shots: current.shots ?? []
  };
}

function migrateStoredDataset(current: DatasetMap): DatasetMap {
  const hasOfficialSync = current.teams.some((team) => team.competition === LIGA_DOS_COMPETITION && team.teamId.startsWith("GENIUS-"));

  if (hasOfficialSync) {
    return { ...current, playerGameStats: current.playerGameStats ?? [], shots: current.shots ?? [] };
  }

  const seedLigaTeams = seedData.teams.filter((team) => team.competition === LIGA_DOS_COMPETITION);
  const seedLigaPlayers = seedData.players.filter((player) => player.competition === LIGA_DOS_COMPETITION);
  const seedLigaGames = seedData.games.filter((game) => game.competition === LIGA_DOS_COMPETITION);
  const importedGames = current.games.filter((game) => game.competition === LIGA_DOS_COMPETITION && isUploadedGame(game.gameId, game.notes));
  const importedKeys = new Set(importedGames.map(fixtureKey));

  return {
    teams: [
      ...current.teams.filter((team) => team.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaTeams
    ],
    players: [
      ...current.players.filter((player) => player.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaPlayers
    ],
    games: [
      ...current.games.filter((game) => game.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaGames.filter((game) => !importedKeys.has(fixtureKey(game))),
      ...importedGames
    ],
    playerGameStats: current.playerGameStats ?? [],
    shots: current.shots ?? []
  };
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfLine(line: string, maxLength = 88) {
  const cleanedLine = line
    .replace(/^###\s+/, "")
    .replace(/^##\s+/, "")
    .replace(/^#\s+/, "")
    .replace(/^\-\s+/, "- ");
  const words = normalizePdfText(cleanedLine).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function buildPdf(content: string) {
  const sourceLines = content.split("\n").flatMap((line) => wrapPdfLine(line));
  const pages: string[][] = [];
  for (let index = 0; index < sourceLines.length; index += 42) {
    pages.push(sourceLines.slice(index, index + 42));
  }

  const objects: string[] = [];
  const pageRefs: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectNumber = 3 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(pageObjectNumber);
    const text = [
      "BT",
      "/F1 11 Tf",
      "50 790 Td",
      "14 TL",
      ...pageLines.map((line) => `(${line}) Tj T*`),
      "ET"
    ].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function downloadPdf(filename: string, content: string) {
  const blob = new Blob([buildPdf(content)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    return fallback;
  }
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function ScoutingPlatform() {
  const [data, setData] = useState<DatasetMap>(seedData);
  const [sourceTrace, setSourceTrace] = useState<SourceTrace[]>([]);
  const [role, setRole] = useState<UserRole>("admin");
  const [tab, setTab] = useState<TabKey>("Dashboard");
  const [ownTeam, setOwnTeam] = useState("Sportiva Italiana");
  const [rivalTeam, setRivalTeam] = useState("Illapel Basquetbol");
  const [range, setRange] = useState<RangeKey>("Ultimos 5 partidos");
  const [locality, setLocality] = useState<LocalityKey>("Local y visita");
  const [selectedShotPlayer, setSelectedShotPlayer] = useState("");
  const [shotPeriod, setShotPeriod] = useState<ShotPeriodFilter>("Todo");
  const [shotGameFilter, setShotGameFilter] = useState<ShotGameFilter>("Todos");
  const [urls, setUrls] = useState("");
  const [ingestStatus, setIngestStatus] = useState("Listo para pegar links FEBACHILE / Genius Sports.");
  const [officialSyncStatus, setOfficialSyncStatus] = useState("Base oficial lista para sincronizar standings, equipos, rosters y fixture.");
  const [shotImportStatus, setShotImportStatus] = useState("Carta de tiro lista para generar desde los partidos oficiales del rival.");
  const [isShotImporting, setIsShotImporting] = useState(false);
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [noteForm, setNoteForm] = useState({ scope: "rival" as NoteScope, title: "", body: "" });
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData(migrateStoredDataset(loadJson(STORAGE_KEY, seedData)));
      setSourceTrace(loadJson(TRACE_KEY, []));
      setNotes(loadJson("dos-premium-notes-v1", []));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    window.localStorage.setItem(TRACE_KEY, JSON.stringify(sourceTrace));
  }, [sourceTrace, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    window.localStorage.setItem("dos-premium-notes-v1", JSON.stringify(notes));
  }, [notes, storageReady]);

  const competition = LIGA_DOS_COMPETITION as CompetitionKey;
  const teams = data.teams.filter((team) => team.competition === competition);
  const isPlayerView = role === "jugador";
  const canAdmin = role === "admin";
  const canCreateReports = role === "admin" || role === "entrenador" || role === "asistente";
  const visibleTabs = getVisibleTabs(role);
  const scoutingFilters = useMemo<ScoutingFilters>(() => {
    const sampleSize = range === "Ultimos 3 partidos" ? 3 : range === "Ultimos 8 disponibles" ? 8 : 5;
    const filterLocality = locality === "Solo local" ? "home" : locality === "Solo visita" ? "away" : "all";
    return { sampleSize, locality: filterLocality };
  }, [locality, range]);
  const model = useMemo(
    () => buildScoutingModel(data, competition, ownTeam, rivalTeam, sourceTrace, scoutingFilters),
    [competition, data, ownTeam, rivalTeam, scoutingFilters, sourceTrace]
  );

  const handleImport = async () => {
    const parsedUrls = urls
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    if (parsedUrls.length === 0) {
      setIngestStatus("Pega al menos un link oficial antes de procesar.");
      return;
    }

    setIngestStatus("Procesando tabla Genius, links de Estadisticas completas y boxscores...");
    const response = await fetch("/api/import-boxscores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: parsedUrls, competition })
    });
    const payload = (await response.json()) as { imports: BoxscoreImport[]; errors: string[] };

    if (payload.imports.length > 0) {
      setData((current) => applyBoxscoreImports(current, payload.imports));
      const now = new Date().toISOString();
      setSourceTrace((current) => [
        ...payload.imports.map((item) => ({
          id: `${item.game.gameId}-${now}`,
          sourceUrl: item.sourceUrl,
          loadedAt: now,
          loadedBy: "Admin Liga DOS",
          status: "procesado" as const,
          confirmedFields: ["equipos", "marcador", "jugadores", "minutos", "puntos", "rebotes", "asistencias", "carta de tiro"],
          inferredFields: ["rol estimado", "rotacion probable", "cuartos proyectados", "amenaza rival"],
          manualCorrections: []
        })),
        ...current
      ]);
    }

    const shotEventsImported = payload.imports.reduce((total, item) => total + (item.shots?.length ?? 0), 0);
    setIngestStatus(
      `Procesados ${payload.imports.length} links · ${shotEventsImported} tiros de Carta de tiro capturados. ${
        payload.errors.length > 0 ? `Observaciones: ${payload.errors.join(" | ")}` : "Datos persistidos en la base local del MVP."
      }`
    );
  };

  const handleShotAutoImport = async () => {
    if (!model) {
      setShotImportStatus("Falta seleccionar equipo propio y rival antes de capturar la carta de tiro.");
      return;
    }

    const rivalName = model.rivalTeam.team.name;
    const targetUrls = Array.from(new Set(rivalSampleGames.map(dataUrlFromGame).filter((url): url is string => Boolean(url))));

    if (targetUrls.length === 0) {
      setShotImportStatus("No encontre IDs oficiales en la muestra. Primero sincroniza Liga DOS oficial o pega links de Estadisticas completas en Carga.");
      return;
    }

    setIsShotImporting(true);
    setShotImportStatus(`Capturando carta de tiro de ${rivalName} desde ${targetUrls.length} partidos oficiales...`);

    try {
      const response = await fetch("/api/import-boxscores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: targetUrls, competition })
      });
      const payload = (await response.json()) as { imports: BoxscoreImport[]; errors: string[] };

      if (!response.ok) {
        setShotImportStatus(payload.errors?.join(" | ") || "No se pudo capturar la carta de tiro desde Genius/FIBA.");
        return;
      }

      if (payload.imports.length > 0) {
        setData((current) => applyBoxscoreImports(current, payload.imports));
        const now = new Date().toISOString();
        setSourceTrace((current) => [
          ...payload.imports.map((item) => ({
            id: `${item.game.gameId}-shots-${now}`,
            sourceUrl: item.sourceUrl,
            loadedAt: now,
            loadedBy: "Admin Liga DOS",
            status: "procesado" as const,
            confirmedFields: ["carta de tiro", "jugadores", "marcador", "minutos", "puntos"],
            inferredFields: ["zonas dominantes", "plan defensivo por jugador", "tendencia por cuarto"],
            manualCorrections: []
          })),
          ...current
        ]);
      }

      const shotEventsImported = payload.imports.reduce((total, item) => total + (item.shots?.length ?? 0), 0);
      setShotImportStatus(
        shotEventsImported > 0
          ? `Carta de tiro actualizada para ${rivalName}: ${shotEventsImported} tiros confirmados desde ${payload.imports.length} partidos.`
          : `Se leyeron ${payload.imports.length} partidos, pero no venian coordenadas de carta de tiro. ${payload.errors.join(" | ")}`
      );
    } catch (error) {
      setShotImportStatus(error instanceof Error ? error.message : "Fallo inesperado al capturar carta de tiro.");
    } finally {
      setIsShotImporting(false);
    }
  };

  const handleOfficialSync = async () => {
    setOfficialSyncStatus("Sincronizando interfaces oficiales de Genius: equipos, standings por zona, fixture, rosters y estadisticas por equipo...");

    try {
      const response = await fetch("/api/sync-liga-dos", { method: "POST" });
      const payload = (await response.json()) as OfficialSyncPayload;

      if (!response.ok || payload.error) {
        setOfficialSyncStatus(payload.error ?? "No se pudo completar la sincronizacion oficial.");
        return;
      }

      setData((current) => replaceLigaDosDataset(current, payload));
      const now = payload.syncedAt ?? new Date().toISOString();
      setSourceTrace((current) => [
        {
          id: `liga-dos-official-${now}`,
          sourceUrl: "https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48159%2Fstandings",
          loadedAt: now,
          loadedBy: "Admin Liga DOS",
          status: "procesado",
          confirmedFields: [
            "equipos",
            "standings por zona",
            "fixture oficial",
            "marcadores",
            "rosters",
            "estadisticas de jugador por equipo"
          ],
          inferredFields: ["rotacion probable", "quinteto probable", "cierres de partido", "amenaza rival"],
          manualCorrections: []
        },
        ...current
      ]);
      setOfficialSyncStatus(
        `Sincronizacion oficial completa: ${payload.teams.length} equipos, ${payload.players.length} jugadores y ${payload.games.length} partidos desde ${payload.sources.join(", ")}.`
      );
    } catch (error) {
      setOfficialSyncStatus(error instanceof Error ? error.message : "Fallo inesperado al sincronizar Genius.");
    }
  };

  const addNote = () => {
    if (!noteForm.title.trim() || !noteForm.body.trim()) {
      return;
    }

    setNotes((current) => [
      {
        id: crypto.randomUUID(),
        scope: noteForm.scope,
        title: noteForm.title.trim(),
        body: noteForm.body.trim(),
        userRole: role,
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setNoteForm({ scope: noteForm.scope, title: "", body: "" });
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    if (!getVisibleTabs(nextRole).includes(tab)) {
      setTab("Dashboard");
    }
  };

  if (!model) {
    return (
      <main className="premium-shell">
        <section className="module-panel">
          <p className="eyebrow">Liga DOS Chile</p>
          <h1>Faltan equipos para construir el modelo de scouting.</h1>
        </section>
      </main>
    );
  }

  const quarterChart = model.quarterModel.map((quarter) => ({
    quarter: quarter.quarter,
    Favor: quarter.pointsFor,
    Contra: quarter.pointsAgainst,
    Diferencial: quarter.differential
  }));
  const standings = [...teams].sort((teamA, teamB) => {
    const winsDelta = parseNumber(teamB.wins) - parseNumber(teamA.wins);
    if (winsDelta !== 0) {
      return winsDelta;
    }
    return getPointDifferential(teamB) - getPointDifferential(teamA);
  });
  const selectedZone = model.ownTeam.team.zone || model.rivalTeam.team.zone;
  const zoneStandings = standings.filter((team) => team.zone === selectedZone);
  const groupedStandings = Array.from(new Set(standings.map((team) => team.zone).filter(Boolean))).map((zone) => ({
    zone,
    teams: standings.filter((team) => team.zone === zone)
  }));
  const competitionGames = data.games
    .filter((game) => game.competition === competition)
    .sort((gameA, gameB) => gameB.date.localeCompare(gameA.date));
  const competitionPlayers = data.players.filter((player) => player.competition === competition);
  const uploadedGames = competitionGames.filter((game) => isUploadedGame(game.gameId, game.notes));
  const pendingGames = competitionGames.filter((game) => !isUploadedGame(game.gameId, game.notes));
  const playerRows = isPlayerView ? model.rivalPlayers.slice(0, 4) : model.rivalPlayers.slice(0, 10);
  const ownLead = model.ownPlayers[0];
  const rivalThreat = model.rivalPlayers[0];
  const rivalSampleGames = competitionGames
    .filter((game) => game.status === "Final" && (areSameTeam(game.homeTeam, model.rivalTeam.team.name) || areSameTeam(game.awayTeam, model.rivalTeam.team.name)))
    .filter((game) => {
      if (scoutingFilters.locality === "home") {
        return areSameTeam(game.homeTeam, model.rivalTeam.team.name);
      }
      if (scoutingFilters.locality === "away") {
        return areSameTeam(game.awayTeam, model.rivalTeam.team.name);
      }
      return true;
    })
    .slice(0, scoutingFilters.sampleSize);
  const shotGameOptions = rivalSampleGames
    .map((game) => {
      const value = matchIdFromGame(game) ?? game.gameId;
      const rivalIsHome = areSameTeam(game.homeTeam, model.rivalTeam.team.name);
      const opponent = rivalIsHome ? game.awayTeam : game.homeTeam;
      const rivalScore = rivalIsHome ? game.homeScore : game.awayScore;
      const opponentScore = rivalIsHome ? game.awayScore : game.homeScore;
      const location = rivalIsHome ? "vs" : "@";
      return {
        value,
        label: `${location} ${opponent}`,
        detail: `${game.date} · ${rivalScore}-${opponentScore}`
      };
    })
    .filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const shotGameOptionValues = new Set(shotGameOptions.map((option) => option.value));
  const activeShotGameFilter = shotGameFilter === "Todos" || shotGameOptionValues.has(shotGameFilter) ? shotGameFilter : "Todos";
  const rivalSampleGameIds = new Set(rivalSampleGames.map((game) => game.gameId));
  const rivalSampleMatchIds = new Set(rivalSampleGames.map(matchIdFromGame).filter((matchId): matchId is string => Boolean(matchId)));
  const rivalShots = (data.shots ?? []).filter((shot) => {
    const shotMatchId = matchIdFromShot(shot);
    const belongsToSample =
      rivalSampleGameIds.has(shot.gameId) || Boolean(shotMatchId && rivalSampleMatchIds.has(shotMatchId));
    return shot.competition === competition && areSameTeam(shot.teamName, model.rivalTeam.team.name) && belongsToSample;
  });
  const rivalPlayerGameStats = (data.playerGameStats ?? []).filter((stat) => {
    const statMatchId = matchIdFromPlayerGameStat(stat);
    const belongsToSample =
      rivalSampleGameIds.has(stat.gameId) || Boolean(statMatchId && rivalSampleMatchIds.has(statMatchId));
    return stat.competition === competition && areSameTeam(stat.teamName, model.rivalTeam.team.name) && belongsToSample;
  });
  const filterShotsByGame = (shots: ShotRow[]) => {
    if (activeShotGameFilter === "Todos") {
      return shots;
    }
    return shots.filter((shot) => shot.gameId === activeShotGameFilter || matchIdFromShot(shot) === activeShotGameFilter);
  };
  const filterStatsByGame = (stats: PlayerGameStatRow[]) => {
    if (activeShotGameFilter === "Todos") {
      return stats;
    }
    return stats.filter((stat) => stat.gameId === activeShotGameFilter || matchIdFromPlayerGameStat(stat) === activeShotGameFilter);
  };
  const playerMinutesLabel = (playerName: string, player?: MatchupScout["rivalPlayers"][number]) => {
    const playerStats = filterStatsByGame(rivalPlayerGameStats.filter((stat) => sameShotPlayer(playerName, stat.name)));
    if (playerStats.length > 0) {
      const minutes = playerStats.reduce((total, stat) => total + minutesToDecimal(stat.minutes), 0) / playerStats.length;
      return activeShotGameFilter === "Todos" ? `${formatMinutes(minutes)}/PJ` : formatMinutes(minutes);
    }
    return player ? `${formatMinutes(player.minutes)}/PJ` : "min s/d";
  };
  const activeRivalShots = filterShotsByGame(rivalShots);
  const activeShotGameCount = activeShotGameFilter === "Todos" ? rivalSampleGames.length : Math.min(rivalSampleGames.length, 1);
  const mainThreatName = model.rivalPlayers[0]?.name;
  const starterNamesAfterThreat = model.rivalRotation.starters
    .filter((name) => !mainThreatName || !sameShotPlayer(name, mainThreatName))
    .slice(0, 4);
  const firstChangeNames = model.rivalRotation.firstChanges
    .filter((name) => !mainThreatName || !sameShotPlayer(name, mainThreatName))
    .filter((name) => !starterNamesAfterThreat.some((starter) => sameShotPlayer(starter, name)));
  const rotationCandidates = uniqueNames([
    mainThreatName,
    ...starterNamesAfterThreat,
    ...firstChangeNames,
    ...model.rivalRotation.coreRotation,
    ...model.rivalPlayers.slice(0, 12).map((player) => player.name)
  ]);
  const confirmedShotPlayerNames = uniqueNames(rivalShots.map((shot) => shot.playerName))
    .sort((nameA, nameB) => {
      const shotsA = rivalShots.filter((shot) => sameShotPlayer(nameA, shot.playerName)).length;
      const shotsB = rivalShots.filter((shot) => sameShotPlayer(nameB, shot.playerName)).length;
      return shotsB - shotsA;
    })
    .slice(0, 12);
  const shotPlayerNames = uniqueNames([...rotationCandidates, ...confirmedShotPlayerNames]).slice(0, 9);
  const shotPlayerCards: ShotPlayerCard[] = shotPlayerNames.map((name, index) => {
    const player = model.rivalPlayers.find((item) => sameShotPlayer(item.name, name));
    const playerShots = rivalShots.filter((shot) => sameShotPlayer(name, shot.playerName));
    const isMainThreat = Boolean(mainThreatName && sameShotPlayer(name, mainThreatName));
    const isStarter = model.rivalRotation.starters.some((starter) => sameShotPlayer(starter, name));
    const firstChangeIndex = model.rivalRotation.firstChanges.findIndex((change) => sameShotPlayer(change, name));
    const isFirstChange = firstChangeIndex >= 0;
    const section: ShotPlayerSection = isMainThreat
      ? "Amenaza principal"
      : isStarter
        ? "Titulares probables"
        : isFirstChange
          ? "Primeros cambios"
          : "Rotacion 8-9";
    return {
      name,
      player,
      shots: playerShots,
      role: player?.role ?? (isStarter ? "Titular probable" : "Rotacion"),
      tag: isMainThreat ? "Amenaza principal" : isStarter ? "Titular" : isFirstChange ? firstChangeLabel(firstChangeIndex) : "Rotacion",
      section,
      rank: index + 1
    };
  });
  const shotPlayerSections = [
    {
      title: "Amenaza principal",
      caption: "Prioridad 1 del plan defensivo",
      cards: shotPlayerCards.filter((card) => card.section === "Amenaza principal")
    },
    {
      title: "Titulares probables",
      caption: "Otros 4 del quinteto inicial",
      cards: shotPlayerCards.filter((card) => card.section === "Titulares probables")
    },
    {
      title: "Primeros cambios",
      caption: "Orden probable de ingreso desde banca",
      cards: shotPlayerCards.filter((card) => card.section === "Primeros cambios")
    },
    {
      title: "Rotacion 8-9",
      caption: "Profundidad que completa la preparacion",
      cards: shotPlayerCards.filter((card) => card.section === "Rotacion 8-9")
    }
  ].filter((section) => section.cards.length > 0);
  const activeShotPlayer = shotPlayerCards.find((player) => player.name === selectedShotPlayer) ?? shotPlayerCards[0];
  const activePlayerShots = activeShotPlayer?.shots ?? [];
  const activeGamePlayerShots = filterShotsByGame(activePlayerShots);
  const filteredShotChart =
    shotPeriod === "Todo"
      ? activeGamePlayerShots
      : activeGamePlayerShots.filter((shot) => shot.period === Number(shotPeriod));
  const activeShotSummary = shotSummary(activeGamePlayerShots);
  const filteredShotSummary = shotSummary(filteredShotChart);
  const activeShotAnalysis = buildShotAnalysis(activeShotPlayer?.name ?? "Jugador rival", activeGamePlayerShots);
  const activePlayerStats = filterStatsByGame(
    rivalPlayerGameStats.filter((stat) => activeShotPlayer?.name && sameShotPlayer(activeShotPlayer.name, stat.name))
  );
  const activeRecentStats = averagePlayerGameStats(activePlayerStats);
  const activeBasePlayerRow = competitionPlayers.find((player) => activeShotPlayer?.name && sameShotPlayer(player.name, activeShotPlayer.name));
  const activeBasePlayer = activeShotPlayer?.player;
  const activeTrendRows = [
    {
      label: "PTS/PJ",
      recent: activeRecentStats.games > 0 ? activeRecentStats.points : activeBasePlayer?.points ?? 0,
      base: activeBasePlayer?.points ?? 0,
      suffix: ""
    },
    {
      label: "MIN/PJ",
      recent: activeRecentStats.games > 0 ? activeRecentStats.minutes : activeBasePlayer?.minutes ?? 0,
      base: activeBasePlayer?.minutes ?? 0,
      suffix: ""
    },
    {
      label: "REB/PJ",
      recent: activeRecentStats.games > 0 ? activeRecentStats.rebounds : activeBasePlayer?.rebounds ?? 0,
      base: activeBasePlayer?.rebounds ?? 0,
      suffix: ""
    },
    {
      label: "AST/PJ",
      recent: activeRecentStats.games > 0 ? activeRecentStats.assists : activeBasePlayer?.assists ?? 0,
      base: activeBasePlayer?.assists ?? 0,
      suffix: ""
    }
  ];
  const activePointsDelta = activeTrendRows[0].recent - activeTrendRows[0].base;
  const activeTrendLabel = trendState(activePointsDelta, 3);
  const playerScoutingSections = shotPlayerSections.map((section) => ({
    ...section,
    players: section.cards
      .map((card) => model.rivalPlayers.find((player) => sameShotPlayer(player.name, card.name)))
      .filter((player): player is MatchupScout["rivalPlayers"][number] => Boolean(player))
  })).filter((section) => section.players.length > 0);
  const ownRecentComparison = recentTeamMetrics(model.ownTeam);
  const rivalRecentComparison = recentTeamMetrics(model.rivalTeam);
  const ownSeasonComparison = seasonTeamMetrics(model.ownTeam.team);
  const rivalSeasonComparison = seasonTeamMetrics(model.rivalTeam.team);
  const comparisonDecision =
    ownRecentComparison.points - ownSeasonComparison.points >= rivalRecentComparison.points - rivalSeasonComparison.points
      ? "Nuestra forma reciente esta por sobre la base: sostener ritmo, pero asegurar seleccion de tiro si el partido se traba."
      : "El rival llega con mejor impulso relativo: bajar posesiones faciles y forzar ejecuciones largas desde el inicio.";
  const storedShotCount = data.shots?.length ?? 0;
  const shotEmptyCopy =
    storedShotCount === 0
      ? "Todavia no hay tiros guardados. Reimporta los links de Estadisticas completas para que la carta quede persistida."
      : "Hay tiros guardados, pero no calzan con este jugador en el rival y rango actual. Revisa el rival seleccionado o reimporta sus partidos recientes.";

  return (
    <main className="premium-shell" style={teamThemeFor(model.ownTeam.team.name)}>
      <section className="premium-hero">
        <div className="hero-main">
          <p className="eyebrow">Liga DOS Chile · Scouting privado</p>
          <h1>Scouting tactico Liga DOS.</h1>
          <p>
            Datos oficiales, inferencias auditables y reportes PDF para preparar rival, rotacion y plan de partido.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => setTab(canAdmin ? "Admin" : "Dashboard")}>
              {canAdmin ? "Cargar links oficiales" : "Ver tablero"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setTab("Informes")}>
              Generar informe
            </button>
          </div>
        </div>
        <aside className="hero-side">
          <div className="league-photo" aria-label="Basquetbol chileno en competencia" />
          <span>Perfil activo</span>
          <strong>{role}</strong>
          <small>{model.ownTeam.team.name}</small>
          <select value={role} onChange={(event) => handleRoleChange(event.target.value as UserRole)}>
            {Object.keys(roleCapabilities).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </aside>
      </section>

      <section className="control-bar">
        <label>
          Equipo propio
          <select value={ownTeam} onChange={(event) => setOwnTeam(event.target.value)}>
            {teams.map((team) => (
              <option key={team.teamId} value={team.name}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rival
          <select value={rivalTeam} onChange={(event) => setRivalTeam(event.target.value)}>
            {teams.map((team) => (
              <option key={team.teamId} value={team.name}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Muestra
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)}>
            <option>Ultimos 3 partidos</option>
            <option>Ultimos 5 partidos</option>
            <option>Ultimos 8 disponibles</option>
          </select>
        </label>
        <label>
          Condicion
          <select value={locality} onChange={(event) => setLocality(event.target.value as LocalityKey)}>
            <option>Local y visita</option>
            <option>Solo local</option>
            <option>Solo visita</option>
          </select>
        </label>
      </section>

      <nav className="module-nav" aria-label="Modulos de scouting">
        {visibleTabs.map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">
            {item}
          </button>
        ))}
      </nav>

      {tab === "Dashboard" ? (
        <section className="module-grid">
          <section className="module-panel decision-room">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Capa 1 · lectura rapida</p>
                <h3>Si solo tienes 30 segundos</h3>
              </div>
              <EvidencePill evidence={model.prediction.evidence} confidence={model.prediction.confidence} />
            </div>
            <div className="decision-grid">
              {model.decisionBrief.slice(0, isPlayerView ? 4 : 6).map((decision) => (
                <DecisionCard decision={decision} key={decision.label} />
              ))}
            </div>
          </section>
          <section className="module-panel identity-panel">
            <div className="module-heading">
              <p className="eyebrow">Identidad rival</p>
              <h3>{model.rivalIdentity.summary}</h3>
            </div>
            <div className="identity-grid">
              <MetricTile label="Ritmo" value={model.rivalIdentity.rhythm} caption={model.rivalIdentity.offensiveStyle} />
              <MetricTile label="Defensa" value={model.rivalIdentity.defensiveStyle} caption={model.rivalIdentity.clutchBehavior} />
              <MetricTile label="Dependencia" value={model.rivalIdentity.playerDependency} caption="Lectura de carga ofensiva" />
              <MetricTile label="Prediccion" value={`${model.prediction.ownWinProbability}%`} caption={`${model.prediction.trend} · margen ${model.prediction.marginRange}`} />
            </div>
          </section>
          <section className="module-panel core-keys">
            <div className="module-heading">
              <p className="eyebrow">Motor de decisiones</p>
              <h3>Claves del partido</h3>
            </div>
            <div className="key-list">
              {model.tacticalKeysCore.slice(0, isPlayerView ? 3 : 4).map((key) => (
                <article key={key.title}>
                  <strong>{key.title}</strong>
                  <p>{key.action}</p>
                  <small>{key.why} · Gatillo: {key.trigger}</small>
                  <EvidencePill evidence={key.evidence} confidence={key.confidence} />
                </article>
              ))}
            </div>
          </section>
          {isPlayerView ? (
            <section className="module-panel player-mode-panel">
              <div className="module-heading">
                <p className="eyebrow">Modo jugador</p>
                <h3>Lo que hay que saber</h3>
              </div>
              <div className="player-brief-list">
                {model.playerModeBrief.map((item) => <p key={item}>{item}</p>)}
              </div>
            </section>
          ) : null}
          <TeamRecordCard label="Equipo propio" scout={model.ownTeam} sampleSize={scoutingFilters.sampleSize} />
          <TeamRecordCard label="Rival" scout={model.rivalTeam} sampleSize={scoutingFilters.sampleSize} />
          <PlayerImpactCard label="Amenaza rival" player={rivalThreat} tone="threat" />
          <PlayerImpactCard label="Ventaja propia" player={ownLead} tone="advantage" />
          <section className="module-panel standings-panel">
            <div className="module-heading">
              <p className="eyebrow">Tabla Liga DOS · {selectedZone}</p>
              <h3>Como va la zona</h3>
            </div>
            <div className="standings-list">
              {zoneStandings.map((team, index) => (
                <article className="standing-row" key={team.teamId}>
                  <span>{index + 1}</span>
                  <strong>{team.name}</strong>
                  <small>{team.zone} · {team.gamesPlayed} PJ</small>
                  <b>{team.wins}-{team.losses}</b>
                  <em>{getPointDifferential(team).toFixed(1)}</em>
                </article>
              ))}
            </div>
            <p className="standings-note">La tabla se filtra por la zona del equipo propio seleccionado.</p>
          </section>
          <SignalList title="Alertas automaticas" signals={model.tacticalKeys.slice(0, isPlayerView ? 3 : 6)} />
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Tendencia por cuartos</p>
              <h3>Modelo inicial</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={quarterChart}>
                <CartesianGrid stroke="rgba(255,255,255,0.12)" />
                <XAxis dataKey="quarter" stroke="#cbd5c7" />
                <YAxis stroke="#cbd5c7" />
                <Tooltip contentStyle={{ background: "#11120f", border: "1px solid #3f453b", borderRadius: 8 }} />
                <Area dataKey="Favor" stroke="#2dd4bf" fill="#2dd4bf33" />
                <Area dataKey="Contra" stroke="#f97316" fill="#f9731633" />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        </section>
      ) : null}

      {tab === "Carga" ? (
        <section className="module-panel">
          <div className="module-heading">
            <div>
              <p className="eyebrow">Base de datos</p>
              <h3>Partidos subidos vs pendientes</h3>
            </div>
            <EvidencePill evidence="dato confirmado" confidence={uploadedGames.length > 0 ? uploadedGames.length / Math.max(competitionGames.length, 1) : 0} />
          </div>
          <div className="load-summary">
            <MetricTile label="Equipos oficiales" value={String(teams.length)} caption="Liga DOS separada por zonas" />
            <MetricTile label="Jugadores en base" value={String(competitionPlayers.length)} caption="Rosters y estadisticas por equipo" />
            <MetricTile label="Partidos en base" value={String(competitionGames.length)} caption="Fixture, resultados e imports locales" />
            <MetricTile label="Boxscores subidos" value={String(uploadedGames.length)} caption="Listos para scouting de jugadores y rotacion" />
            <MetricTile label="Pendientes" value={String(pendingGames.length)} caption="Falta link de Estadisticas completas o data.json" />
          </div>
          {canAdmin ? (
            <div className="sync-strip">
              <button className="primary-button" onClick={handleOfficialSync} type="button">Sincronizar Liga DOS oficial</button>
              <p>{officialSyncStatus}</p>
            </div>
          ) : null}
          <div className="table-shell premium-table upload-table">
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Partido</th>
                  <th>Marcador</th>
                  <th>Zona</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {competitionGames.map((game) => {
                  const uploaded = isUploadedGame(game.gameId, game.notes);
                  return (
                    <tr key={game.gameId}>
                      <td>
                        <span className={`upload-status ${uploaded ? "uploaded" : "pending"}`}>
                          {uploaded ? "Subido" : "Pendiente"}
                        </span>
                      </td>
                      <td>{game.date}</td>
                      <td>{game.homeTeam} vs {game.awayTeam}</td>
                      <td>{game.homeScore && game.awayScore ? `${game.homeScore}-${game.awayScore}` : "Sin marcador"}</td>
                      <td>{game.phase}</td>
                      <td>{game.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "Equipos" ? (
        <section className="two-column">
          <section className="module-panel zone-board">
            <div className="module-heading">
              <p className="eyebrow">Standings por zona</p>
              <h3>Liga DOS separada por grupos</h3>
            </div>
            <div className="zone-board-grid">
              {groupedStandings.map((group) => (
                <article className="zone-standing-card" key={group.zone}>
                  <strong>{group.zone}</strong>
                  {group.teams.map((team, index) => (
                    <div className={team.name === model.ownTeam.team.name || team.name === model.rivalTeam.team.name ? "zone-team-row active" : "zone-team-row"} key={team.teamId}>
                      <span>{index + 1}. {team.name}</span>
                      <b>{team.wins}-{team.losses} · {team.gamesPlayed} PJ</b>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
          {[model.ownTeam, model.rivalTeam].map((team) => (
            <section className="module-panel" key={team.team.teamId}>
              <div className="module-heading">
                <p className="eyebrow">{team.team.zone}</p>
                <h3>{team.team.name}</h3>
              </div>
              <div className="stat-stack">
                <MetricTile label="Record reciente" value={team.recentRecord} caption={team.localitySplit} />
                <MetricTile label="Ataque" value={team.offenseTrend} caption={`${team.team.pointsFor} puntos totales`} />
                <MetricTile label="Defensa" value={team.defenseTrend} caption={`${team.team.pointsAgainst} puntos recibidos`} />
              </div>
              <SignalList title="Fortalezas" signals={team.strengths} />
              <SignalList title="Debilidades" signals={team.weaknesses} />
            </section>
          ))}
        </section>
      ) : null}

      {tab === "Jugadores" ? (
        <section className="module-panel">
          <div className="module-heading">
            <p className="eyebrow">Scouting individual</p>
            <h3>Jugadores de impacto rival</h3>
          </div>
          <div className="player-scout-sections">
            {playerScoutingSections.map((section) => (
              <section className="player-scout-section" key={section.title}>
                <div className="player-section-heading">
                  <span>{section.title}</span>
                  <small>{section.caption}</small>
                </div>
                <div className="player-scout-card-grid">
                  {section.players.map((player) => (
                    <article className={section.title === "Amenaza principal" ? "player-scout-card featured" : "player-scout-card"} key={player.name}>
                      <header>
                        <strong>{player.name}</strong>
                        <span>{player.role}</span>
                      </header>
                      <p>{player.defensiveKey}</p>
                      <div>
                        <small>MIN/PJ <b>{player.minutes}</b></small>
                        <small>PTS/PJ <b>{player.points}</b></small>
                        <small>REB/PJ <b>{player.rebounds}</b></small>
                        <small>AST/PJ <b>{player.assists}</b></small>
                      </div>
                      <em>{player.playerType} · {player.trend}</em>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <details className="player-detail-table">
            <summary>Detalle tecnico completo</summary>
            <div className="table-shell premium-table">
            <table>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Rol estimado</th>
                  <th>Tipo</th>
                  <th>Fortaleza</th>
                  <th>Debilidad</th>
                  <th>Clave defensiva</th>
                  <th>PJ</th>
                  <th>MIN/PJ</th>
                  <th>PTS/PJ</th>
                  <th>REB/PJ</th>
                  <th>AST/PJ</th>
                  <th>AST/PER</th>
                  <th>EF Tiro</th>
                  <th>PPM</th>
                  <th>Impacto/PJ</th>
                  <th>Confiabilidad</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((player) => (
                  <tr key={player.name}>
                    <td>{player.name}</td>
                    <td>{player.role}</td>
                    <td>{player.playerType}</td>
                    <td>{player.strength}</td>
                    <td>{player.weakness}</td>
                    <td>{player.defensiveKey}</td>
                    <td>{player.games}</td>
                    <td>{player.minutes}</td>
                    <td>{player.points}</td>
                    <td>{player.rebounds}</td>
                    <td>{player.assists}</td>
                    <td>{player.assistTurnoverRatio ?? "s/d"}</td>
                    <td>{player.shootingEfficiency ?? "s/d"}</td>
                    <td>{player.pointsPerMinute}</td>
                    <td>{player.recentImpactIndex}</td>
                    <td><EvidencePill evidence={player.evidence} confidence={0.68} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </details>
        </section>
      ) : null}

      {tab === "Rotacion" ? (
        <section className="two-column">
          {[
            { label: "Propia", rotation: model.ownRotation },
            { label: "Rival", rotation: model.rivalRotation }
          ].map(({ label, rotation }) => (
            <section className="module-panel" key={label}>
              <div className="module-heading">
                <div>
                  <p className="eyebrow">Rotacion {label}</p>
                  <h3>{label === "Propia" ? "Mapa de rotacion propia" : "Lectura de rotacion rival"}</h3>
                  <p className="heading-copy">Ultimos registros, minutos, consistencia de aparicion e impacto reciente.</p>
                </div>
                <EvidencePill evidence={rotation.evidence} confidence={rotation.confidence} />
              </div>
              <div className="rotation-layout">
                <RotationBlock
                  title="Quinteto inicial probable"
                  tag="Inicio"
                  players={rotation.starters}
                  caption={rotation.rule}
                  featured
                />
                <div className="rotation-pair">
                  <RotationBlock
                    title="Primeros cambios"
                    tag="Banco inmediato"
                    players={rotation.firstChanges}
                    caption="Minutos y aparicion recurrente."
                  />
                  <RotationBlock
                    title="Cierre bajo presion"
                    tag="Clutch"
                    players={rotation.closers}
                    caption="Indice de impacto reciente y uso en tramo final."
                  />
                </div>
                <RotationBlock
                  title="Rotacion principal"
                  tag="8-9 jugadores"
                  players={rotation.coreRotation}
                  caption="Nucleo estable para preparar cargas, emparejamientos y ventanas de descanso."
                />
                <div className="rotation-signal-grid">
                  <RotationSignal label="Estabilidad" value={rotation.lineupStability} caption="Separacion entre top 5 y banca." />
                  <RotationSignal label="Banco" value={rotation.benchDependency} caption={rotation.benchImpact} />
                  <RotationSignal label="Presion" value={rotation.pressureClosers} caption="Quienes realmente deberian cerrar." />
                </div>
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {tab === "Carta de tiro" ? (
        <section className="shot-module">
          <section className="module-panel shot-header-panel">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Carta de tiro rival · {model.rivalTeam.team.name}</p>
                <h3>Mapa de {model.rivalTeam.team.name}</h3>
                <p className="heading-copy">
                  Rival analizado contra {model.ownTeam.team.name}. Ordenado por amenaza principal, otros 4 titulares, primeros cambios y rotacion de 9.
                </p>
              </div>
              <div className="shot-actions">
                {canAdmin ? (
                  <button
                    className="secondary-button"
                    disabled={isShotImporting || rivalSampleGames.length === 0}
                    onClick={handleShotAutoImport}
                    type="button"
                  >
                    {isShotImporting ? "Generando..." : "Generar carta de tiro"}
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  disabled={!activeShotPlayer || activeGamePlayerShots.length === 0}
                  onClick={() => downloadPdf(`plan-defensivo-${activeShotPlayer?.name ?? "jugador"}.pdf`, shotPlanText(activeShotPlayer?.name ?? "Jugador rival", activeGamePlayerShots))}
                  type="button"
                >
                  Descargar plan
                </button>
              </div>
            </div>
            <div className="shot-summary-strip">
              <MetricTile label="Rival" value={model.rivalTeam.team.name} caption={model.rivalTeam.team.zone} />
              <MetricTile label="Muestra" value={`${activeShotGameCount} PJ`} caption={`${activeShotGameFilter === "Todos" ? range : "Partido seleccionado"} · ${activeRivalShots.length} tiros rival`} />
              <MetricTile label="Tiros jugador" value={String(activeShotSummary.attempts)} caption={`Promedio ${roundOne(activeShotSummary.attempts / Math.max(activeShotGameCount, 1))} por partido`} />
              <MetricTile label="Acierto" value={activeShotSummary.efficiency} caption={`${activeShotSummary.made}/${activeShotSummary.attempts} convertidos`} />
            </div>
            <p className="shot-status">{shotImportStatus}</p>
          </section>

          <section className="shot-layout">
            <aside className="module-panel shot-player-panel">
              <div className="module-heading">
                <p className="eyebrow">Rotacion rival</p>
                <h3>Prioridad defensiva</h3>
              </div>
              <div className="shot-player-list">
                {shotPlayerSections.map((section) => (
                  <div className="shot-player-section" key={section.title}>
                    <div className="shot-section-header">
                      <span>{section.title}</span>
                      <small>{section.caption}</small>
                    </div>
                    {section.cards.map((card) => {
                      const summary = shotSummary(filterShotsByGame(card.shots));
                      const active = activeShotPlayer?.name === card.name;
                      return (
                        <button className={active ? "active" : ""} key={card.name} onClick={() => setSelectedShotPlayer(card.name)} type="button">
                          <span>{card.rank}</span>
                          <strong>{card.name}</strong>
                          <small>{card.tag} · {card.role}</small>
                          <b>{summary.attempts} tiros · {summary.efficiency}</b>
                          <em>{playerMinutesLabel(card.name, card.player)}</em>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <details className="shot-trace">
                <summary>Partidos y confiabilidad</summary>
                <p>
                  Muestra actual de {model.rivalTeam.team.name}: {rivalSampleGames.map((game) => `${game.homeTeam} ${game.homeScore}-${game.awayScore} ${game.awayTeam}`).join(" · ") || "sin partidos oficiales"}.
                  Dato confirmado solo cuando el partido trae coordenadas de Carta de tiro en Genius/FIBA.
                </p>
              </details>
            </aside>

            <section className="module-panel shot-map-panel">
              <div className="module-heading">
                <div>
                  <p className="eyebrow">{activeShotPlayer?.tag ?? "Jugador"}</p>
                  <h3>{activeShotPlayer?.name ?? "Sin jugador seleccionado"}</h3>
                  <p className="heading-copy">{activeShotAnalysis.headline}</p>
                </div>
                <div className="shot-filter-group">
                  <label className="shot-filter wide">
                    Partido
                    <select value={activeShotGameFilter} onChange={(event) => setShotGameFilter(event.target.value as ShotGameFilter)}>
                      <option value="Todos">Todos los partidos</option>
                      {shotGameOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} · {option.detail}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="shot-filter">
                    Cuarto
                    <select value={shotPeriod} onChange={(event) => setShotPeriod(event.target.value as ShotPeriodFilter)}>
                      <option value="Todo">Todo</option>
                      <option value="1">1C</option>
                      <option value="2">2C</option>
                      <option value="3">3C</option>
                      <option value="4">4C</option>
                    </select>
                  </label>
                </div>
              </div>
              <ShotCourt shots={filteredShotChart} />
              <div className="shot-legend">
                <span><i className="legend-made" /> Convertido</span>
                <span><i className="legend-miss" /> Fallado</span>
                <strong>{filteredShotSummary.attempts} tiros visibles · {filteredShotSummary.efficiency}</strong>
              </div>
              <div className="shot-trend-card">
                <header>
                  <span>Tendencia vs base</span>
                  <strong>{activeTrendLabel}</strong>
                  <small>
                    Forma muestra {activeRecentStats.games || activeShotGameCount} PJ · Base temporada · 3PT {activeRecentStats.threePct} vs {seasonThreePct(activeBasePlayerRow)}
                  </small>
                </header>
                <div className="trend-metric-grid">
                  {activeTrendRows.map((metric) => (
                    <article key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{roundOne(metric.recent)}</strong>
                      <small>Base {roundOne(metric.base)} · {signedDelta(metric.recent - metric.base, metric.suffix)}</small>
                    </article>
                  ))}
                </div>
                <p>
                  {activeTrendLabel === "En alza"
                    ? "Volumen reciente sobre su base: subir prioridad defensiva y negar primeros tiros comodos."
                    : activeTrendLabel === "En caida"
                      ? "Produccion reciente bajo su base: mantener scouting, pero no sobrerreaccionar si baja volumen."
                      : "La muestra reciente confirma su base: plan confiable para preparar matchup."}
                </p>
              </div>
              {activeGamePlayerShots.length === 0 ? (
                <div className="shot-empty-state">
                  <strong>Sin coordenadas para este jugador.</strong>
                  <p>{shotEmptyCopy}</p>
                </div>
              ) : null}
            </section>

            <aside className="module-panel shot-analysis-panel">
              <div className="module-heading">
                <p className="eyebrow">Lectura tactica</p>
                <h3>Donde castiga</h3>
              </div>
              <div className="shot-analysis-list">
                {activeShotAnalysis.bullets.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
              <div className="half-split">
                <article>
                  <span>1er tiempo</span>
                  <strong>{activeShotSummary.firstHalfAttempts}</strong>
                  <small>tiros</small>
                </article>
                <article>
                  <span>2do tiempo</span>
                  <strong>{activeShotSummary.secondHalfAttempts}</strong>
                  <small>tiros</small>
                </article>
              </div>
              <div className="defense-plan">
                <span>Plan defensivo</span>
                <p>{activeShotAnalysis.plan}</p>
              </div>
              <div className="player-mode-shot">
                <span>Modo jugador</span>
                <p>Negar zona dominante, contestar sin falta y comunicar si sube volumen en {activeShotSummary.topQuarter}.</p>
              </div>
            </aside>
          </section>
        </section>
      ) : null}

      {tab === "Cuartos" ? (
        <section className="module-panel">
          <div className="module-heading">
            <p className="eyebrow">Parciales</p>
            <h3>Puntos a favor, en contra y diferencial por cuarto</h3>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={quarterChart}>
              <CartesianGrid stroke="rgba(255,255,255,0.12)" />
              <XAxis dataKey="quarter" stroke="#cbd5c7" />
              <YAxis stroke="#cbd5c7" />
              <Tooltip contentStyle={{ background: "#11120f", border: "1px solid #3f453b", borderRadius: 8 }} />
              <Bar dataKey="Favor" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Contra" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Diferencial" fill="#eab308" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="quarter-decision-grid">
            {model.quarterModel.map((quarter) => (
              <article key={quarter.quarter}>
                <strong>{quarter.quarter} · {quarter.momentum}</strong>
                <p>{quarter.recommendation}</p>
                <small>Diferencial proyectado {quarter.differential}</small>
              </article>
            ))}
          </div>
          <SignalList title="Lectura por cuarto" signals={model.tacticalKeys.slice(-2)} />
        </section>
      ) : null}

      {tab === "Comparativo" ? (
        <section className="comparison-page">
          <section className="comparison-board">
            <article className="comparison-team-card own">
              <span>Equipo propio</span>
              <h3>{model.ownTeam.team.name}</h3>
              <div className="comparison-stat-lines">
                <p><b>Forma</b><strong>{roundOne(ownRecentComparison.points)}</strong><small>PTS/PJ · DIF {signedDelta(ownRecentComparison.differential)}</small></p>
                <p><b>Base</b><strong>{roundOne(ownSeasonComparison.points)}</strong><small>PTS/PJ · DIF {signedDelta(ownSeasonComparison.differential)}</small></p>
                <p><b>Soporte</b><strong>{roundOne(ownSeasonComparison.rebounds)}</strong><small>REB/PJ · {roundOne(ownSeasonComparison.assists)} AST/PJ</small></p>
              </div>
            </article>
            <article className="comparison-decision-card">
              <span>Tendencia vs base</span>
              <h3>{model.prediction.ownWinProbability}% victoria propia</h3>
              <p>{comparisonDecision}</p>
              <div className="prediction-bars">
                <div>
                  <span>{model.ownTeam.team.name}</span>
                  <strong>{model.prediction.ownWinProbability}%</strong>
                  <i style={{ width: `${model.prediction.ownWinProbability}%` }} />
                </div>
                <div>
                  <span>{model.rivalTeam.team.name}</span>
                  <strong>{model.prediction.rivalWinProbability}%</strong>
                  <i style={{ width: `${model.prediction.rivalWinProbability}%` }} />
                </div>
              </div>
              <small>Margen esperado {model.prediction.marginRange}. {model.prediction.trend}</small>
            </article>
            <article className="comparison-team-card rival">
              <span>Rival</span>
              <h3>{model.rivalTeam.team.name}</h3>
              <div className="comparison-stat-lines">
                <p><b>Forma</b><strong>{roundOne(rivalRecentComparison.points)}</strong><small>PTS/PJ · DIF {signedDelta(rivalRecentComparison.differential)}</small></p>
                <p><b>Base</b><strong>{roundOne(rivalSeasonComparison.points)}</strong><small>PTS/PJ · DIF {signedDelta(rivalSeasonComparison.differential)}</small></p>
                <p><b>Soporte</b><strong>{roundOne(rivalSeasonComparison.rebounds)}</strong><small>REB/PJ · {roundOne(rivalSeasonComparison.assists)} AST/PJ</small></p>
              </div>
            </article>
          </section>
          <section className="comparison-insight-grid">
            <SignalList title="Rival vs propio equipo" signals={model.comparison} />
            <section className="module-panel">
              <div className="module-heading">
                <p className="eyebrow">Decision del plan</p>
                <h3>Donde cargar el partido</h3>
              </div>
              <div className="key-list">
                {model.tacticalKeysCore.slice(0, 3).map((key) => (
                  <article key={key.title}>
                    <strong>{key.title}</strong>
                    <p>{key.action}</p>
                    <small>{key.trigger}</small>
                  </article>
                ))}
              </div>
            </section>
          </section>
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Validacion postpartido</p>
              <h3>{model.planValidation.headline}</h3>
            </div>
            <div className="validation-list">
              {model.planValidation.checks.map((check) => (
                <article className={check.status} key={check.label}>
                  <strong>{check.label}</strong>
                  <p>{check.projected} → {check.actual}</p>
                  <small>{check.decision}</small>
                  <EvidencePill evidence={check.evidence} confidence={check.confidence} />
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {tab === "Informes" ? (
        <section className="module-panel">
          <div className="module-heading">
            <p className="eyebrow">Descargables editables</p>
            <h3>Informes premium para staff</h3>
          </div>
          <div className="download-grid">
            {[
              {
                kind: "prepartido" as const,
                filename: "informe-prepartido-premium-liga-dos.pdf",
                title: "Informe prepartido premium",
                description: "Plan de partido, amenazas, ventajas, rotacion y checklist para cuerpo tecnico.",
                staffOnly: true
              },
              {
                kind: "tecnico" as const,
                filename: "reporte-tecnico-largo-liga-dos.pdf",
                title: "Reporte tecnico largo",
                description: "Version profunda con diagnostico, riesgos, video tags, trazabilidad y control de datos.",
                staffOnly: true
              },
              {
                kind: "postpartido" as const,
                filename: "informe-postpartido-premium-liga-dos.pdf",
                title: "Informe postpartido",
                description: "Lectura de validacion, objetivos de control y acciones para la semana.",
                staffOnly: true
              },
              {
                kind: "resumen" as const,
                filename: "informe-express-liga-dos.pdf",
                title: "Informe express",
                description: "Version corta para jugadores y staff, enfocada en 3-4 claves accionables.",
                staffOnly: false
              }
            ].map((report) => (
              <button
                className="download-tile"
                disabled={report.staffOnly && !canCreateReports}
                key={report.kind}
                onClick={() => downloadPdf(report.filename, buildEditableReport(model, report.kind))}
                type="button"
              >
                <strong>{report.title}</strong>
                <span>{report.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "Presentaciones" ? (
        <section className="module-panel">
          <div className="module-heading">
            <p className="eyebrow">Deck tactico</p>
            <h3>Presentacion automatica</h3>
          </div>
          <div className="presentation-map">
            {model.presentationSections.map((section, index) => (
              <article key={section}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{section}</strong>
              </article>
            ))}
          </div>
          <button className="primary-button" onClick={() => downloadPdf("presentacion-tactica-liga-dos.pdf", buildEditableReport(model, "presentacion"))} type="button">
            Descargar presentacion PDF
          </button>
        </section>
      ) : null}

      {tab === "Notas" ? (
        <section className="module-panel">
          <div className="module-heading">
            <p className="eyebrow">Privado por perfil</p>
            <h3>Notas de entrenador y asistente</h3>
          </div>
          <div className="note-form">
            <select value={noteForm.scope} onChange={(event) => setNoteForm({ ...noteForm, scope: event.target.value as NoteScope })}>
              <option value="rival">Rival</option>
              <option value="partido">Partido</option>
              <option value="jugador">Jugador</option>
              <option value="equipo">Equipo</option>
            </select>
            <input placeholder="Titulo" value={noteForm.title} onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })} />
            <textarea placeholder="Observacion privada" value={noteForm.body} onChange={(event) => setNoteForm({ ...noteForm, body: event.target.value })} />
            <button className="primary-button" onClick={addNote} type="button">Guardar nota</button>
          </div>
          <div className="note-list">
            {notes.map((note) => (
              <article key={note.id}>
                <span>{note.scope} · {new Date(note.createdAt).toLocaleDateString("es-CL")}</span>
                <strong>{note.title}</strong>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "Admin" && canAdmin ? (
        <section className="two-column">
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Ingestion</p>
              <h3>Links FEBACHILE / Genius Sports</h3>
            </div>
            <div className="official-sync-card">
              <div>
                <strong>Base oficial Liga DOS</strong>
                <p>Actualiza equipos, tabla por zonas, fixture, rosters y estadisticas de jugador desde las interfaces oficiales de Genius.</p>
              </div>
              <button className="primary-button" onClick={handleOfficialSync} type="button">Sincronizar oficial</button>
            </div>
            <p className="status-copy">{officialSyncStatus}</p>
            <textarea
              className="source-textarea"
              onChange={(event) => setUrls(event.target.value)}
              placeholder={"https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48159%2Fschedule\nhttps://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48159%2Fmatch%2F2809987%2Fsummary%3F\nhttps://fibalivestats.dcd.shared.geniussports.com/u/CLNB/2809987/"}
              value={urls}
            />
            <button className="primary-button" onClick={handleImport} type="button">Analizar, normalizar y guardar</button>
            <p className="status-copy">{ingestStatus}</p>
          </section>
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Trazabilidad</p>
              <h3>Fuente original vs ajustes manuales</h3>
            </div>
            <div className="trace-list">
              {sourceTrace.length === 0 ? <p>No hay links cargados en esta sesion.</p> : null}
              {sourceTrace.map((source) => (
                <article key={source.id}>
                  <strong>{source.sourceUrl}</strong>
                  <span>{source.loadedBy} · {new Date(source.loadedAt).toLocaleString("es-CL")} · {source.status}</span>
                  <p>Confirmado: {source.confirmedFields.join(", ")}</p>
                  <p>Inferido: {source.inferredFields.join(", ")}</p>
                  <p>Ajustes manuales: {source.manualCorrections.join(", ") || "sin ajustes"}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Arquitectura</p>
              <h3>Tablas relacionales listas</h3>
            </div>
            <div className="schema-tags">
              {databaseTables.map((table) => <span key={table}>{table}</span>)}
            </div>
          </section>
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Roles</p>
              <h3>Permisos actuales</h3>
            </div>
            <div className="role-grid">
              {Object.entries(roleCapabilities).map(([name, capabilities]) => (
                <article key={name}>
                  <strong>{name}</strong>
                  {capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
