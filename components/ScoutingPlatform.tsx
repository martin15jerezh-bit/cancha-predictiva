"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  applyBoxscoreImports,
  areSameTeam,
  CURRENT_COMPETITION,
  getAssistsPerGame,
  getPointDifferential,
  getPointsAgainstPerGame,
  getPointsForPerGame,
  getReboundsPerGame,
  LIGA_DOS_COMPETITION,
  parseNumber,
  seedData
} from "@/lib/data";
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
type ScoutingCompetitionKey = "Liga DOS 2026" | "Liga Chery Apertura 2026";
type PrivateNote = {
  id: string;
  scope: NoteScope;
  title: string;
  body: string;
  userRole: UserRole;
  createdAt: string;
};

const SCOUTING_COMPETITIONS: ScoutingCompetitionKey[] = [
  LIGA_DOS_COMPETITION as ScoutingCompetitionKey,
  CURRENT_COMPETITION as ScoutingCompetitionKey
];
const competitionDisplay: Record<ScoutingCompetitionKey, { label: string; shortLabel: string; kicker: string; sourceUrl: string; placeholderId: string }> = {
  "Liga DOS 2026": {
    label: "Liga DOS Chile",
    shortLabel: "Liga DOS",
    kicker: "Liga DOS Chile · Scouting privado",
    sourceUrl: "https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48159%2Fstandings",
    placeholderId: "48159"
  },
  "Liga Chery Apertura 2026": {
    label: "LNB Chile",
    shortLabel: "LNB Chile",
    kicker: "LNB Chile · Scouting privado",
    sourceUrl: "https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48076%2Fstandings",
    placeholderId: "48076"
  }
};

function competitionCopy(competition: CompetitionKey) {
  const key = SCOUTING_COMPETITIONS.includes(competition as ScoutingCompetitionKey)
    ? competition as ScoutingCompetitionKey
    : "Liga DOS 2026";
  return competitionDisplay[key];
}

function competitionFileSlug(competition: CompetitionKey) {
  return competitionCopy(competition)
    .shortLabel.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lnbZoneForTeamName(teamName: string) {
  const normalized = normalizedText(teamName);
  if (/osorno|animas|valdivia|puerto varas|puerto montt|ancud|castro/.test(normalized)) {
    return "Conferencia Sur";
  }
  if (/concepcion|puente alto|leones|boston|colo|catolica|talca/.test(normalized)) {
    return "Conferencia Centro";
  }
  return "LNB Chile";
}

function displayZoneForTeam(team: TeamRow) {
  const seeded = seedData.teams.find((item) => item.competition === team.competition && areSameTeam(item.name, team.name));
  if (seeded?.zone) {
    return seeded.zone;
  }
  if (team.competition === CURRENT_COMPETITION) {
    return lnbZoneForTeamName(team.name);
  }
  return team.zone;
}
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
          <b>{index + 1}</b>
          <i>{formatRotationName(player)}</i>
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
    <section className="module-panel signal-panel">
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

function buildQuarterPlan(
  quarter: MatchupScout["quarterModel"][number],
  attackQuarter?: string,
  riskQuarter?: string
) {
  const baseByQuarter: Record<string, { phase: string; objective: string; risk: string; decision: string; trigger: string }> = {
    "1C": {
      phase: "Inicio de control",
      objective: "Entrar con balance defensivo y tiro de alta calidad.",
      risk: "Regalar transicion o entrar temprano en bonus.",
      decision: "Cargar la primera ventaja sin acelerar de mas.",
      trigger: "Si el rival corre 2 posesiones seguidas, bajar ritmo y cerrar rebote."
    },
    "2C": {
      phase: "Banco y ajuste",
      objective: "Sostener margen mientras entra la segunda unidad.",
      risk: "Caida ofensiva por baja creacion o perdidas.",
      decision: "Usar segundo generador y mantener una referencia anotadora.",
      trigger: "Si el ataque queda dos posesiones sin ventaja, volver a base titular."
    },
    "3C": {
      phase: "Cuarto de quiebre",
      objective: "Subir agresividad despues del descanso.",
      risk: "Perder foco ante presion o cambios defensivos.",
      decision: "Atacar temprano antes de que el rival estabilice ayudas.",
      trigger: "Si aparece parcial positivo, extender defensa y correr tras rebote."
    },
    "4C": {
      phase: "Cierre",
      objective: "Controlar posesiones, faltas y seleccion de tiro.",
      risk: "Malos tiros tempranos o faltas que regalen libres.",
      decision: "Jugar con ventaja, reloj y emparejamientos claros.",
      trigger: "Si el parcial cae bajo -4, pedir control y buscar tiro de alto porcentaje."
    }
  };
  const base = baseByQuarter[quarter.quarter] ?? {
    phase: "Tramo clave",
    objective: "Sostener el plan sin perder calidad de decision.",
    risk: "Ceder ritmo por malas posesiones.",
    decision: quarter.recommendation,
    trigger: "Revisar tendencia y ajustar rotacion."
  };
  const isAttack = quarter.quarter === attackQuarter;
  const isRisk = quarter.quarter === riskQuarter;

  return {
    ...base,
    role: isAttack ? "Cuarto para atacar" : isRisk ? "Cuarto para resistir" : "Tramo de control",
    decision: `${base.decision} Lectura modelo: ${quarter.recommendation}.`,
    tone: isAttack ? "attack" : isRisk ? "risk" : quarter.quarter === "4C" ? "control" : "neutral"
  };
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

function replaceCompetitionDataset(current: DatasetMap, official: OfficialSyncPayload, competition: CompetitionKey): DatasetMap {
  const importedGames = current.games.filter((game) => game.competition === competition && isUploadedGame(game.gameId, game.notes));
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
      ...current.teams.filter((team) => team.competition !== competition),
      ...official.teams
    ],
    players: [
      ...current.players.filter((player) => player.competition !== competition),
      ...official.players
    ],
    games: [
      ...current.games.filter((game) => game.competition !== competition),
      ...mergedOfficialGames,
      ...preservedImportedGames
    ],
    playerGameStats: current.playerGameStats ?? [],
    shots: current.shots ?? []
  };
}

function migrateStoredDataset(current: DatasetMap): DatasetMap {
  const normalizedCurrent = applyBoxscoreImports(current, []);
  const hasOfficialSync = normalizedCurrent.teams.some((team) => team.competition === LIGA_DOS_COMPETITION && team.teamId.startsWith("GENIUS-"));

  if (hasOfficialSync) {
    return { ...normalizedCurrent, playerGameStats: normalizedCurrent.playerGameStats ?? [], shots: normalizedCurrent.shots ?? [] };
  }

  const seedLigaTeams = seedData.teams.filter((team) => team.competition === LIGA_DOS_COMPETITION);
  const seedLigaPlayers = seedData.players.filter((player) => player.competition === LIGA_DOS_COMPETITION);
  const seedLigaGames = seedData.games.filter((game) => game.competition === LIGA_DOS_COMPETITION);
  const importedGames = normalizedCurrent.games.filter((game) => game.competition === LIGA_DOS_COMPETITION && isUploadedGame(game.gameId, game.notes));
  const importedKeys = new Set(importedGames.map(fixtureKey));

  return {
    teams: [
      ...normalizedCurrent.teams.filter((team) => team.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaTeams
    ],
    players: [
      ...normalizedCurrent.players.filter((player) => player.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaPlayers
    ],
    games: [
      ...normalizedCurrent.games.filter((game) => game.competition !== LIGA_DOS_COMPETITION),
      ...seedLigaGames.filter((game) => !importedKeys.has(fixtureKey(game))),
      ...importedGames
    ],
    playerGameStats: normalizedCurrent.playerGameStats ?? [],
    shots: normalizedCurrent.shots ?? []
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

type PdfRgb = [number, number, number];

function hexToPdfRgb(hex: string): PdfRgb {
  const cleaned = hex.replace("#", "");
  const value = cleaned.length === 3
    ? cleaned.split("").map((char) => `${char}${char}`).join("")
    : cleaned.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  ];
}

function rgbCommand(color: PdfRgb) {
  return color.map((value) => value.toFixed(3)).join(" ");
}

function pdfText(value: string) {
  return normalizePdfText(value).replace(/\n/g, " ");
}

function addRect(commands: string[], x: number, y: number, width: number, height: number, fill: PdfRgb, stroke?: PdfRgb) {
  if (stroke) {
    commands.push(`${rgbCommand(fill)} rg ${rgbCommand(stroke)} RG ${x} ${y} ${width} ${height} re B`);
    return;
  }
  commands.push(`${rgbCommand(fill)} rg ${x} ${y} ${width} ${height} re f`);
}

function addShadowRect(commands: string[], x: number, y: number, width: number, height: number, fill: PdfRgb, stroke?: PdfRgb) {
  addRect(commands, x + 5, y - 5, width, height, [0.86, 0.88, 0.86]);
  addRect(commands, x + 2, y - 2, width, height, [0.91, 0.93, 0.91]);
  addRect(commands, x, y, width, height, fill, stroke);
}

function addCircle(commands: string[], x: number, y: number, radius: number, fill: PdfRgb, stroke?: PdfRgb, width = 1) {
  const c = radius * 0.5522847498;
  const strokeCommand = stroke ? `${rgbCommand(stroke)} RG ${width} w` : "";
  const operator = stroke ? "B" : "f";
  commands.push(
    `${rgbCommand(fill)} rg ${strokeCommand} ${x + radius} ${y} m ${x + radius} ${y + c} ${x + c} ${y + radius} ${x} ${y + radius} c ${x - c} ${y + radius} ${x - radius} ${y + c} ${x - radius} ${y} c ${x - radius} ${y - c} ${x - c} ${y - radius} ${x} ${y - radius} c ${x + c} ${y - radius} ${x + radius} ${y - c} ${x + radius} ${y} c ${operator}`
  );
}

function addText(
  commands: string[],
  text: string,
  x: number,
  y: number,
  size = 11,
  color: PdfRgb = [0.08, 0.09, 0.08],
  font = "F1"
) {
  commands.push(`${rgbCommand(color)} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`);
}

function pdfWrappedLines(text: string, width: number, size: number) {
  const maxChars = Math.max(14, Math.floor(width / (size * 0.52)));
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function addWrappedText(
  commands: string[],
  text: string,
  x: number,
  y: number,
  width: number,
  size = 11,
  color: PdfRgb = [0.22, 0.28, 0.25],
  font = "F1",
  lineHeight = size + 4,
  maxLines = 3
) {
  const lines = pdfWrappedLines(text, width, size);
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines && limited.length > 0) {
    const last = limited[limited.length - 1];
    limited[limited.length - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`;
  }
  limited.forEach((line, index) => addText(commands, line, x, y - index * lineHeight, size, color, font));
  return y - limited.length * lineHeight;
}

function addPill(commands: string[], text: string, x: number, y: number, fill: PdfRgb, color: PdfRgb, width = 120) {
  addRect(commands, x, y - 17, width, 22, fill, [0.86, 0.86, 0.82]);
  addText(commands, text, x + 10, y - 10, 8.5, color, "F2");
}

function addMetricCard(
  commands: string[],
  label: string,
  value: string,
  caption: string,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: PdfRgb
) {
  addShadowRect(commands, x, y - height, width, height, [1, 1, 1], [0.84, 0.87, 0.84]);
  addRect(commands, x, y - 5, width, 5, accent);
  addRect(commands, x, y - height, 5, height, accent);
  addText(commands, label.toUpperCase(), x + 12, y - 22, 8.5, accent, "F2");
  addWrappedText(commands, value, x + 16, y - 48, width - 30, 18, [0.06, 0.08, 0.07], "F2", 20, 2);
  addWrappedText(commands, caption, x + 12, y - height + 28, width - 24, 9.5, [0.36, 0.42, 0.39], "F1", 12, 2);
}

function addHeader(commands: string[], title: string, subtitle: string, pageNumber: string, primary: PdfRgb) {
  addRect(commands, 0, 0, 960, 540, [0.956, 0.972, 0.962]);
  addRect(commands, 0, 512, 960, 28, [0.055, 0.075, 0.062]);
  addRect(commands, 0, 512, 268, 28, primary);
  addRect(commands, 36, 468, 6, 40, primary);
  addText(commands, "DOS SCOUT PRO", 54, 496, 9, primary, "F2");
  addText(commands, title, 54, 470, 24, [0.06, 0.08, 0.07], "F2");
  addText(commands, subtitle, 56, 450, 10.5, [0.36, 0.42, 0.39], "F1");
  addRect(commands, 850, 486, 72, 22, [1, 1, 1], [0.82, 0.86, 0.82]);
  addText(commands, pageNumber, 868, 494, 9, primary, "F2");
}

function addBar(commands: string[], x: number, y: number, width: number, value: number, max: number, color: PdfRgb) {
  const safeMax = Math.max(max, 1);
  addRect(commands, x, y, width, 8, [0.9, 0.93, 0.91]);
  addRect(commands, x, y, Math.max(4, Math.min(width, (value / safeMax) * width)), 8, color);
}

function clampPdf(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addLine(commands: string[], x1: number, y1: number, x2: number, y2: number, color: PdfRgb, width = 1) {
  commands.push(`${rgbCommand(color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function addPolygon(commands: string[], points: Array<[number, number]>, fill: PdfRgb, stroke: PdfRgb, width = 1) {
  if (points.length < 3) {
    return;
  }
  const [first, ...rest] = points;
  commands.push(
    `${rgbCommand(fill)} rg ${rgbCommand(stroke)} RG ${width} w ${first[0]} ${first[1]} m ${rest
      .map(([x, y]) => `${x} ${y} l`)
      .join(" ")} h B`
  );
}

function addDot(commands: string[], x: number, y: number, size: number, fill: PdfRgb, stroke?: PdfRgb) {
  addCircle(commands, x, y, size / 2, fill, stroke, 1.2);
}

function addFooter(commands: string[], page: string, model: MatchupScout, primary: PdfRgb) {
  addLine(commands, 36, 30, 924, 30, [0.84, 0.86, 0.84], 0.8);
  addText(commands, "DOS Scout Pro · Dossier tactico", 38, 16, 8.5, [0.36, 0.42, 0.39], "F2");
  addText(commands, `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`, 340, 16, 8.5, [0.36, 0.42, 0.39], "F1");
  addText(commands, page, 882, 16, 8.5, primary, "F2");
}

function pairScores(ownValue: number, rivalValue: number, lowerIsBetter = false) {
  const safeOwn = Math.max(0, ownValue);
  const safeRival = Math.max(0, rivalValue);
  const total = safeOwn + safeRival;
  if (total <= 0) {
    return { own: 50, rival: 50 };
  }
  if (lowerIsBetter) {
    return {
      own: clampPdf((safeRival / total) * 100, 10, 90),
      rival: clampPdf((safeOwn / total) * 100, 10, 90)
    };
  }
  return {
    own: clampPdf((safeOwn / total) * 100, 10, 90),
    rival: clampPdf((safeRival / total) * 100, 10, 90)
  };
}

function addRadarChart(
  commands: string[],
  metrics: Array<{ label: string; own: number; rival: number }>,
  x: number,
  y: number,
  radius: number,
  primary: PdfRgb
) {
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const centerX = x + radius;
  const centerY = y + radius;
  const pointFor = (value: number, index: number, scale = 1): [number, number] => {
    const angle = -Math.PI / 2 + (index / metrics.length) * Math.PI * 2;
    const r = radius * scale * clampPdf(value, 0, 100) / 100;
    return [Number((centerX + Math.cos(angle) * r).toFixed(2)), Number((centerY + Math.sin(angle) * r).toFixed(2))];
  };

  [0.33, 0.66, 1].forEach((scale) => {
    const ring = metrics.map((metric, index) => pointFor(100, index, scale));
    addPolygon(commands, ring, [0.98, 0.99, 0.98], [0.82, 0.85, 0.82], 0.8);
  });

  metrics.forEach((metric, index) => {
    const edge = pointFor(100, index);
    addLine(commands, centerX, centerY, edge[0], edge[1], [0.82, 0.85, 0.82], 0.8);
    const labelPoint = pointFor(116, index);
    addWrappedText(commands, metric.label, labelPoint[0] - 34, labelPoint[1] + 5, 68, 8.5, [0.36, 0.42, 0.39], "F2", 10, 2);
  });

  addPolygon(commands, metrics.map((metric, index) => pointFor(metric.rival, index)), [1, 0.92, 0.94], red, 1.8);
  addPolygon(commands, metrics.map((metric, index) => pointFor(metric.own, index)), [0.88, 0.97, 0.94], primary, 2.2);
  addText(commands, "Propio", x + 8, y - 12, 9, primary, "F2");
  addText(commands, "Rival", x + 74, y - 12, 9, red, "F2");
}

function addComparisonRow(
  commands: string[],
  label: string,
  ownValue: number,
  rivalValue: number,
  x: number,
  y: number,
  width: number,
  primary: PdfRgb,
  lowerIsBetter = false
) {
  const scores = pairScores(ownValue, rivalValue, lowerIsBetter);
  addText(commands, label, x, y + 2, 9, [0.36, 0.42, 0.39], "F2");
  addText(commands, formatPdfNumber(ownValue), x + 110, y + 2, 9, [0.06, 0.08, 0.07], "F2");
  addText(commands, formatPdfNumber(rivalValue), x + width - 34, y + 2, 9, [0.06, 0.08, 0.07], "F2");
  addRect(commands, x + 160, y, width - 220, 8, [0.9, 0.92, 0.9]);
  addRect(commands, x + 160, y, (width - 220) * scores.own / 100, 8, primary);
  addRect(commands, x + 160 + (width - 220) * scores.own / 100, y, (width - 220) * scores.rival / 100, 8, [0.88, 0.11, 0.28]);
}

function addSectionKicker(commands: string[], title: string, x: number, y: number, color: PdfRgb) {
  addText(commands, title.toUpperCase(), x, y, 9, color, "F2");
  addLine(commands, x, y - 8, x + 110, y - 8, color, 2);
}

function addRotationList(commands: string[], title: string, players: string[], x: number, y: number, width: number, color: PdfRgb) {
  addShadowRect(commands, x, y - 86, width, 86, [1, 1, 1], [0.87, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, color);
  addText(commands, title, x + 12, y - 24, 10, color, "F2");
  const names = players.length ? players.slice(0, 6) : ["sin muestra suficiente"];
  names.forEach((player, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const chipX = x + 12 + col * ((width - 30) / 2);
    const chipY = y - 45 - row * 18;
    addRect(commands, chipX, chipY - 11, (width - 40) / 2, 14, [0.96, 0.98, 0.97], [0.88, 0.9, 0.88]);
    addWrappedText(commands, formatRotationName(player), chipX + 6, chipY - 5, (width - 52) / 2, 7.4, [0.06, 0.08, 0.07], "F2", 8, 1);
  });
}

function addShotCourt(commands: string[], shots: ShotRow[], x: number, y: number, width: number, height: number, primary: PdfRgb) {
  addShadowRect(commands, x, y, width, height, [0.96, 0.98, 0.97], [0.7, 0.74, 0.72]);
  addLine(commands, x + width / 2, y, x + width / 2, y + height, [0.7, 0.74, 0.72], 1);
  addRect(commands, x, y + height * 0.28, width * 0.19, height * 0.44, [0.96, 0.98, 0.97], [0.7, 0.74, 0.72]);
  addRect(commands, x + width * 0.81, y + height * 0.28, width * 0.19, height * 0.44, [0.96, 0.98, 0.97], [0.7, 0.74, 0.72]);
  addCircle(commands, x + width * 0.075, y + height * 0.5, 6, [0.96, 0.98, 0.97], [0.7, 0.74, 0.72]);
  addCircle(commands, x + width * 0.925, y + height * 0.5, 6, [0.96, 0.98, 0.97], [0.7, 0.74, 0.72]);
  shots.slice(0, 70).forEach((shot) => {
    const px = x + clampPdf(shot.x, 2, 98) / 100 * width;
    const py = y + clampPdf(shot.y, 2, 98) / 100 * height;
    addDot(commands, px, py, shot.made ? 7 : 6, shot.made ? primary : [0.88, 0.11, 0.28], [1, 1, 1]);
  });
}

function formatPdfNumber(value: number, suffix = "") {
  if (!Number.isFinite(value)) {
    return "s/d";
  }
  const rounded = Number(value.toFixed(1));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function signedPdfNumber(value: number, suffix = "") {
  if (!Number.isFinite(value)) {
    return "s/d";
  }
  return `${value > 0 ? "+" : ""}${formatPdfNumber(value, suffix)}`;
}

function confidencePdf(evidence: EvidenceLevel, confidence: number) {
  return `${evidence} - ${Math.round(confidence * 100)}%`;
}

function teamPrimaryColor(name: string) {
  const theme = teamThemeFor(name) as Record<string, string>;
  return hexToPdfRgb(theme["--team-primary"] ?? "#0f766e");
}

function addPlayerDossierCard(
  commands: string[],
  player: MatchupScout["rivalPlayers"][number],
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: PdfRgb
) {
  addShadowRect(commands, x, y - height, width, height, [1, 1, 1], [0.87, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, index === 0 ? [0.88, 0.11, 0.28] : accent);
  addCircle(commands, x + 23, y - 31, 15, index === 0 ? [1, 0.92, 0.94] : [0.9, 0.97, 0.94], [0.84, 0.86, 0.84]);
  addText(commands, `${index + 1}`, x + 16, y - 37, 15, index === 0 ? [0.88, 0.11, 0.28] : accent, "F2");
  addWrappedText(commands, player.name, x + 42, y - 20, width - 54, 14, [0.06, 0.08, 0.07], "F2", 16, 2);
  addText(commands, player.role, x + 42, y - 55, 9.5, [0.36, 0.42, 0.39], "F1");
  addText(commands, `MIN ${formatPdfNumber(player.minutes)}   PTS ${formatPdfNumber(player.points)}   REB ${formatPdfNumber(player.rebounds)}   AST ${formatPdfNumber(player.assists)}`, x + 12, y - 82, 9.5, [0.08, 0.09, 0.08], "F2");
  addWrappedText(commands, `Plan: ${player.defensiveKey}`, x + 12, y - 108, width - 24, 9.8, [0.22, 0.28, 0.25], "F1", 12, 3);
  addWrappedText(commands, `Gatillo: ${player.decisionTrigger}`, x + 12, y - height + 30, width - 24, 8.6, [0.36, 0.42, 0.39], "F1", 11, 2);
}

function addQuarterDossierCard(
  commands: string[],
  quarter: MatchupScout["quarterModel"][number],
  x: number,
  y: number,
  width: number,
  height: number,
  maxPoints: number,
  maxDiff: number,
  accent: PdfRgb,
  attackQuarter?: string,
  riskQuarter?: string
) {
  const plan = buildQuarterPlan(quarter, attackQuarter, riskQuarter);
  const toneColor: PdfRgb = plan.tone === "risk" ? [0.88, 0.11, 0.28] : plan.tone === "control" ? [0.96, 0.62, 0.04] : accent;
  addShadowRect(commands, x, y - height, width, height, [1, 1, 1], [0.87, 0.88, 0.86]);
  addRect(commands, x, y - 6, width, 6, toneColor);
  addText(commands, quarter.quarter, x + 14, y - 34, 22, toneColor, "F2");
  addWrappedText(commands, plan.role, x + 60, y - 22, width - 72, 10, [0.06, 0.08, 0.07], "F2", 12, 2);
  addText(commands, "Favor", x + 14, y - 66, 8, [0.36, 0.42, 0.39], "F2");
  addBar(commands, x + 58, y - 69, width - 100, quarter.pointsFor, maxPoints, accent);
  addText(commands, formatPdfNumber(quarter.pointsFor), x + width - 36, y - 72, 8.5, [0.06, 0.08, 0.07], "F2");
  addText(commands, "Contra", x + 14, y - 88, 8, [0.36, 0.42, 0.39], "F2");
  addBar(commands, x + 58, y - 91, width - 100, quarter.pointsAgainst, maxPoints, [0.98, 0.45, 0.16]);
  addText(commands, formatPdfNumber(quarter.pointsAgainst), x + width - 36, y - 94, 8.5, [0.06, 0.08, 0.07], "F2");
  addText(commands, "DIF", x + 14, y - 118, 8, [0.36, 0.42, 0.39], "F2");
  addBar(commands, x + 58, y - 121, width - 100, Math.abs(quarter.differential), maxDiff, toneColor);
  addText(commands, signedPdfNumber(quarter.differential), x + width - 42, y - 124, 8.5, toneColor, "F2");
  addWrappedText(commands, plan.decision, x + 14, y - 146, width - 28, 8.8, [0.22, 0.28, 0.25], "F1", 11, 4);
}

function addRecentGameRows(
  commands: string[],
  title: string,
  games: MatchupScout["ownTeam"]["recentGames"],
  x: number,
  y: number,
  width: number,
  accent: PdfRgb
) {
  addShadowRect(commands, x, y - 160, width, 160, [1, 1, 1], [0.86, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, accent);
  addText(commands, title, x + 16, y - 28, 11, accent, "F2");
  const rows = games.slice(0, 5);
  if (rows.length === 0) {
    addWrappedText(commands, "Sin partidos confirmados para este filtro. Revisa muestra o sincroniza links oficiales.", x + 16, y - 62, width - 32, 10, [0.36, 0.42, 0.39], "F1", 13, 3);
    return;
  }
  rows.forEach((game, index) => {
    const rowY = y - 58 - index * 22;
    const resultColor: PdfRgb = game.result === "G" ? [0.08, 0.58, 0.44] : [0.88, 0.11, 0.28];
    addRect(commands, x + 16, rowY - 10, 18, 16, game.result === "G" ? [0.86, 0.97, 0.93] : [1, 0.9, 0.92], [0.84, 0.86, 0.84]);
    addText(commands, game.result, x + 22, rowY - 5, 8, resultColor, "F2");
    addText(commands, game.score, x + 44, rowY - 5, 9.5, [0.06, 0.08, 0.07], "F2");
    addWrappedText(commands, `${game.venue === "Local" ? "vs" : "@"} ${game.opponent}`, x + 96, rowY - 2, width - 190, 8.8, [0.22, 0.28, 0.25], "F2", 10, 1);
    addText(commands, game.venue, x + width - 58, rowY - 5, 8.2, [0.36, 0.42, 0.39], "F1");
  });
}

function addThinStat(
  commands: string[],
  label: string,
  ownValue: string,
  rivalValue: string,
  x: number,
  y: number,
  width: number,
  primary: PdfRgb
) {
  addText(commands, label, x, y, 9, [0.36, 0.42, 0.39], "F2");
  addText(commands, ownValue, x + width * 0.45, y, 11, primary, "F2");
  addText(commands, rivalValue, x + width - 44, y, 11, [0.88, 0.11, 0.28], "F2");
  addLine(commands, x, y - 10, x + width, y - 10, [0.88, 0.9, 0.88], 0.7);
}

function addPlayerMatrixRow(
  commands: string[],
  player: MatchupScout["rivalPlayers"][number],
  index: number,
  x: number,
  y: number,
  width: number,
  accent: PdfRgb
) {
  addRect(commands, x, y - 35, width, 38, index % 2 === 0 ? [1, 1, 1] : [0.97, 0.98, 0.97], [0.88, 0.9, 0.88]);
  addCircle(commands, x + 18, y - 15, 10, index === 0 ? [1, 0.9, 0.92] : [0.9, 0.97, 0.94], [0.84, 0.86, 0.84]);
  addText(commands, String(index + 1), x + 14, y - 19, 9, index === 0 ? [0.88, 0.11, 0.28] : accent, "F2");
  addWrappedText(commands, player.name, x + 38, y - 8, 150, 9.2, [0.06, 0.08, 0.07], "F2", 10, 1);
  addText(commands, formatPdfNumber(player.minutes), x + 210, y - 18, 9, [0.06, 0.08, 0.07], "F2");
  addText(commands, formatPdfNumber(player.points), x + 270, y - 18, 9, [0.06, 0.08, 0.07], "F2");
  addText(commands, formatPdfNumber(player.rebounds), x + 330, y - 18, 9, [0.06, 0.08, 0.07], "F2");
  addText(commands, formatPdfNumber(player.assists), x + 390, y - 18, 9, [0.06, 0.08, 0.07], "F2");
  addWrappedText(commands, player.defensiveKey, x + 450, y - 8, width - 466, 8.4, [0.22, 0.28, 0.25], "F1", 10, 2);
}

function addThreeColumnInsight(
  commands: string[],
  title: string,
  value: string,
  body: string,
  x: number,
  y: number,
  width: number,
  accent: PdfRgb
) {
  addShadowRect(commands, x, y - 132, width, 132, [1, 1, 1], [0.86, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, accent);
  addText(commands, title.toUpperCase(), x + 14, y - 26, 8.5, accent, "F2");
  addWrappedText(commands, value, x + 14, y - 54, width - 28, 16, [0.06, 0.08, 0.07], "F2", 18, 2);
  addWrappedText(commands, body, x + 14, y - 96, width - 28, 9, [0.36, 0.42, 0.39], "F1", 12, 3);
}

function buildPdfDocument(pageStreams: string[]) {
  const objects: string[] = [];
  const pageRefs: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");

  pageStreams.forEach((stream, pageIndex) => {
    const pageObjectNumber = 3 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(pageObjectNumber);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
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

function buildTacticalDossierPdf(model: MatchupScout, shots: ShotRow[] = []) {
  const primary = teamPrimaryColor(model.ownTeam.team.name);
  const dark: PdfRgb = [0.055, 0.075, 0.062];
  const muted: PdfRgb = [0.36, 0.42, 0.39];
  const amber: PdfRgb = [0.96, 0.62, 0.04];
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const own = model.ownTeam.team;
  const rival = model.rivalTeam.team;
  const dossierLeague = competitionCopy(own.competition as CompetitionKey);
  const topThreat = model.rivalPlayers[0];
  const topOwn = model.ownPlayers[0];
  const bestQuarter = [...model.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const riskQuarter = [...model.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  const generatedAt = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const maxQuarterPoints = Math.max(...model.quarterModel.flatMap((quarter) => [quarter.pointsFor, quarter.pointsAgainst]), 1);
  const maxQuarterDiff = Math.max(...model.quarterModel.map((quarter) => Math.abs(quarter.differential)), 1);
  const topThreatShots = topThreat ? shots.filter((shot) => sameShotPlayer(shot.playerName, topThreat.name)) : [];
  const shotFocus = topThreatShots.length > 0 ? topThreatShots : shots;
  const shotFocusMade = shotFocus.filter((shot) => shot.made).length;
  const radarMetrics = [
    { label: "Ataque", ...pairScores(getPointsForPerGame(own), getPointsForPerGame(rival)) },
    { label: "Defensa", ...pairScores(getPointsAgainstPerGame(own), getPointsAgainstPerGame(rival), true) },
    { label: "Rebote", ...pairScores(getReboundsPerGame(own), getReboundsPerGame(rival)) },
    { label: "Creacion", ...pairScores(getAssistsPerGame(own), getAssistsPerGame(rival)) },
    { label: "Diferencial", own: clampPdf(50 + (getPointDifferential(own) - getPointDifferential(rival)) * 4, 10, 90), rival: clampPdf(50 + (getPointDifferential(rival) - getPointDifferential(own)) * 4, 10, 90) },
    { label: "Prediccion", own: model.prediction.ownWinProbability, rival: model.prediction.rivalWinProbability }
  ];
  const ownRecent = recentTeamMetrics(model.ownTeam);
  const rivalRecent = recentTeamMetrics(model.rivalTeam);
  const ownSeason = seasonTeamMetrics(own);
  const rivalSeason = seasonTeamMetrics(rival);
  const firstHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "1C" || quarter.quarter === "2C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const secondHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "3C" || quarter.quarter === "4C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const rivalNine = model.rivalPlayers.slice(0, 9);
  const ownSix = model.ownPlayers.slice(0, 6);
  const sourceCount = Math.max(model.sourceTrace.length, model.ownTeam.recentGames.length + model.rivalTeam.recentGames.length);
  const shotPct = shotFocus.length > 0 ? Math.round((shotFocusMade / shotFocus.length) * 100) : 0;
  const pages: string[] = [];

  const cover: string[] = [];
  addRect(cover, 0, 0, 960, 540, [0.94, 0.96, 0.95]);
  addRect(cover, 0, 0, 382, 540, dark);
  addRect(cover, 0, 0, 382, 14, primary);
  addRect(cover, 38, 72, 282, 2, primary);
  addText(cover, "DOS SCOUT PRO", 38, 493, 10, [0.96, 0.85, 0.25], "F2");
  addText(cover, "BRIEFING DE PARTIDO", 38, 462, 11, [0.78, 0.82, 0.78], "F2");
  addWrappedText(cover, `${own.name} vs ${rival.name}`, 38, 410, 285, 34, [1, 1, 1], "F2", 36, 3);
  addText(cover, `${dossierLeague.label} · generado ${generatedAt}`, 40, 284, 11, [0.78, 0.82, 0.78], "F1");
  addWrappedText(cover, model.rivalIdentity.summary, 40, 240, 285, 17, [1, 1, 1], "F2", 20, 4);
  addPill(cover, confidencePdf(model.rivalIdentity.evidence, model.rivalIdentity.confidence), 40, 138, [1, 0.96, 0.82], [0.5, 0.32, 0.02], 198);
  addText(cover, "No es un reporte de numeros. Es una hoja de decisiones para ganar tiempo de staff.", 40, 94, 10, [0.78, 0.82, 0.78], "F1");
  addMetricCard(cover, "Record propio", model.ownTeam.recentRecord, `${formatPdfNumber(getPointsForPerGame(own))} PF/PJ · DIF ${signedPdfNumber(getPointDifferential(own))}`, 430, 470, 150, 92, primary);
  addMetricCard(cover, "Record rival", model.rivalTeam.recentRecord, `${formatPdfNumber(getPointsForPerGame(rival))} PF/PJ · DIF ${signedPdfNumber(getPointDifferential(rival))}`, 596, 470, 150, 92, red);
  addMetricCard(cover, "Win prob.", `${model.prediction.ownWinProbability}%`, model.prediction.marginRange, 762, 470, 150, 92, amber);
  addMetricCard(cover, "Amenaza rival", topThreat?.name ?? "Sin muestra", topThreat ? `${topThreat.role} · ${formatPdfNumber(topThreat.points)} PTS/PJ` : "Pendiente de datos", 430, 342, 222, 112, red);
  addMetricCard(cover, "Ventaja propia", topOwn?.name ?? "Sin muestra", topOwn ? `${topOwn.role} · impacto ${formatPdfNumber(topOwn.recentImpactIndex)}` : "Pendiente de datos", 676, 342, 236, 112, primary);
  addMetricCard(cover, "Cuarto de quiebre", bestQuarter?.quarter ?? "s/d", bestQuarter ? `${signedPdfNumber(bestQuarter.differential)} · ${bestQuarter.recommendation}` : "Sin modelo suficiente", 430, 196, 222, 112, amber);
  addMetricCard(cover, "Base estadistica", `${formatPdfNumber(getReboundsPerGame(own))} vs ${formatPdfNumber(getReboundsPerGame(rival))}`, `REB/PJ · AST ${formatPdfNumber(getAssistsPerGame(own))} vs ${formatPdfNumber(getAssistsPerGame(rival))}`, 676, 196, 236, 112, primary);
  addFooter(cover, "01 / 15", model, primary);
  pages.push(cover.join("\n"));

  const quick: string[] = [];
  addHeader(quick, "Si solo tienes 30 segundos", "Lo que el entrenador debe recordar antes de entrar a cancha", "02 / 07", primary);
  addRect(quick, 42, 302, 876, 100, dark);
  addText(quick, "PLAN MADRE", 62, 370, 10, [0.96, 0.85, 0.25], "F2");
  addWrappedText(quick, model.decisionBrief[0]?.action ?? "Controlar ritmo, rebote y primera ventaja rival.", 62, 340, 540, 25, [1, 1, 1], "F2", 28, 2);
  addText(quick, `${model.prediction.ownWinProbability}% victoria propia`, 704, 356, 24, [1, 1, 1], "F2");
  addBar(quick, 706, 326, 160, model.prediction.ownWinProbability, 100, primary);
  addText(quick, `Margen esperado ${model.prediction.marginRange}`, 706, 304, 10, [0.78, 0.82, 0.78], "F1");
  model.decisionBrief.slice(0, 6).forEach((decision, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 42 + col * 292;
    const y = 260 - row * 104;
    const tone: PdfRgb = decision.tone === "risk" ? red : decision.tone === "advantage" ? primary : amber;
    addMetricCard(quick, decision.label, decision.value, decision.action, x, y, 268, 86, tone);
  });
  addFooter(quick, "02 / 15", model, primary);
  pages.push(quick.join("\n"));

  const radar: string[] = [];
  addHeader(radar, "Radar comparativo", "Forma reciente vs base de temporada para decidir donde cargar el partido", "03 / 07", primary);
  addRect(radar, 42, 66, 412, 350, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(radar, "Lectura visual", 66, 386, primary);
  addRadarChart(radar, radarMetrics, 116, 116, 132, primary);
  addRect(radar, 494, 66, 424, 350, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(radar, "Ventajas / riesgos", 520, 386, primary);
  addComparisonRow(radar, "PTS/PJ", getPointsForPerGame(own), getPointsForPerGame(rival), 520, 338, 360, primary);
  addComparisonRow(radar, "PC/PJ", getPointsAgainstPerGame(own), getPointsAgainstPerGame(rival), 520, 296, 360, primary, true);
  addComparisonRow(radar, "REB/PJ", getReboundsPerGame(own), getReboundsPerGame(rival), 520, 254, 360, primary);
  addComparisonRow(radar, "AST/PJ", getAssistsPerGame(own), getAssistsPerGame(rival), 520, 212, 360, primary);
  addComparisonRow(radar, "DIF", getPointDifferential(own), getPointDifferential(rival), 520, 170, 360, primary);
  addRect(radar, 520, 92, 360, 48, [1, 0.96, 0.9], [0.92, 0.82, 0.62]);
  addText(radar, "Decision", 534, 120, 9, [0.5, 0.32, 0.02], "F2");
  addWrappedText(radar, model.comparison[0]?.value ?? "Cargar el partido donde exista mayor margen colectivo.", 610, 122, 250, 9.5, [0.22, 0.28, 0.25], "F1", 12, 2);
  addFooter(radar, "03 / 15", model, primary);
  pages.push(radar.join("\n"));

  const identity: string[] = [];
  addHeader(identity, "Identidad rival y rotacion", "Como juega, de quien depende y con quien probablemente cierra", "04 / 07", primary);
  addRect(identity, 42, 270, 402, 146, dark);
  addText(identity, "IDENTIDAD RIVAL", 62, 386, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(identity, model.rivalIdentity.summary, 62, 354, 330, 22, [1, 1, 1], "F2", 25, 3);
  addText(identity, `Ritmo: ${model.rivalIdentity.rhythm}`, 62, 286, 10, [0.78, 0.82, 0.78], "F1");
  addMetricCard(identity, "Ofensiva", model.rivalIdentity.offensiveStyle, "Carga ofensiva y patron de ritmo", 472, 416, 204, 112, primary);
  addMetricCard(identity, "Defensa", model.rivalIdentity.defensiveStyle, model.rivalIdentity.clutchBehavior, 704, 416, 204, 112, red);
  addMetricCard(identity, "Dependencia", model.rivalIdentity.playerDependency, "Top 3 ofensivo y volumen de tiro", 472, 270, 204, 112, amber);
  addMetricCard(identity, "Clutch", model.rivalIdentity.clutchBehavior, "Revisar cierres con video", 704, 270, 204, 112, primary);
  addRotationList(identity, "Quinteto probable", model.rivalRotation.starters, 42, 194, 280, red);
  addRotationList(identity, "Primeros cambios", model.rivalRotation.firstChanges, 342, 194, 280, amber);
  addRotationList(identity, "Cierre bajo presion", model.rivalRotation.closers, 642, 194, 276, primary);
  addFooter(identity, "04 / 15", model, primary);
  pages.push(identity.join("\n"));

  const players: string[] = [];
  addHeader(players, "Plan defensivo por jugador", "Prioridad: amenaza principal, titulares y primeros cambios", "05 / 07", primary);
  model.rivalPlayers.slice(0, 6).forEach((player, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    addPlayerDossierCard(players, player, index, 42 + col * 300, 396 - row * 176, 276, 152, primary);
  });
  addRect(players, 42, 42, 876, 44, [1, 0.96, 0.9], [0.92, 0.82, 0.62]);
  addText(players, "Regla staff", 58, 66, 9, [0.5, 0.32, 0.02], "F2");
  addWrappedText(players, `Si ${topThreat?.name ?? "la amenaza principal"} supera su umbral, cambiar cobertura antes de que entre en ritmo. No esperar timeout para ajustar.`, 150, 67, 720, 9.5, [0.22, 0.28, 0.25], "F1", 12, 2);
  addFooter(players, "05 / 15", model, primary);
  pages.push(players.join("\n"));

  const shotPage: string[] = [];
  addHeader(shotPage, "Carta de tiro y zonas", "Solo se muestra como dato confirmado si existen tiros importados desde Estadisticas completas", "06 / 07", primary);
  addRect(shotPage, 42, 72, 520, 322, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(shotPage, "Mapa rival", 66, 364, primary);
  if (shots.length > 0) {
    addShotCourt(shotPage, shotFocus, 78, 112, 448, 214, primary);
    addText(shotPage, "Convertido", 78, 90, 8.5, primary, "F2");
    addText(shotPage, "Fallado", 158, 90, 8.5, red, "F2");
  } else {
    addRect(shotPage, 78, 112, 448, 214, [0.96, 0.98, 0.97], [0.78, 0.82, 0.79]);
    addWrappedText(shotPage, "Carta de tiro pendiente. Reimporta los links de Estadisticas completas para persistir coordenadas y zonas de lanzamiento.", 110, 230, 380, 17, [0.36, 0.42, 0.39], "F2", 20, 4);
  }
  addMetricCard(shotPage, "Jugador foco", topThreat?.name ?? "s/d", topThreat ? `${formatPdfNumber(topThreat.points)} PTS/PJ · ${formatPdfNumber(topThreat.minutes)} MIN/PJ` : "Sin muestra", 594, 394, 300, 96, red);
  addMetricCard(shotPage, "Tiros muestra", String(shotFocus.length), shots.length > 0 ? `${shotFocusMade}/${shotFocus.length} convertidos (${shotPct}%) en el foco visual` : "Sin coordenadas confirmadas", 594, 270, 300, 96, primary);
  addMetricCard(shotPage, "Plan", "Contestar y comunicar", topThreat ? topThreat.defensiveKey : "Validar con video antes de cerrar plan", 594, 146, 300, 96, amber);
  addFooter(shotPage, "06 / 15", model, primary);
  pages.push(shotPage.join("\n"));

  const quarters: string[] = [];
  addHeader(quarters, "Momentum por cuartos y cierre", "Plan operativo para charla tecnica y ajustes en vivo", "07 / 07", primary);
  model.quarterModel.forEach((quarter, index) => {
    addQuarterDossierCard(quarters, quarter, 42 + index * 223, 408, 204, 182, maxQuarterPoints, maxQuarterDiff, primary, bestQuarter?.quarter, riskQuarter?.quarter);
  });
  addText(quarters, "Claves del partido", 42, 186, 18, dark, "F2");
  model.tacticalKeysCore.slice(0, 3).forEach((key, index) => {
    const x = 42 + index * 292;
    addRect(quarters, x, 50, 266, 112, [1, 1, 1], [0.87, 0.88, 0.86]);
    addRect(quarters, x, 156, 266, 6, index === 0 ? primary : index === 1 ? amber : red);
    addText(quarters, `Clave ${index + 1}`, x + 14, 136, 9, index === 2 ? red : primary, "F2");
    addWrappedText(quarters, key.title, x + 14, 116, 238, 12, dark, "F2", 14, 2);
    addWrappedText(quarters, key.action, x + 14, 82, 238, 9.5, [0.22, 0.28, 0.25], "F1", 12, 3);
  });
  addText(quarters, `Atacar: ${bestQuarter?.quarter ?? "s/d"} · Resistir: ${riskQuarter?.quarter ?? "s/d"} · 1T ${signedPdfNumber(firstHalfDiff)} / 2T ${signedPdfNumber(secondHalfDiff)} · Validar con video.`, 42, 34, 9, muted, "F1");
  addFooter(quarters, "07 / 15", model, primary);
  pages.push(quarters.join("\n"));

  const formPage: string[] = [];
  addHeader(formPage, "Forma reciente", "Ultimos partidos para separar tendencia real de ruido de muestra", "08 / 15", primary);
  addRecentGameRows(formPage, `Ultimos juegos · ${own.name}`, model.ownTeam.recentGames, 42, 400, 410, primary);
  addRecentGameRows(formPage, `Ultimos juegos · ${rival.name}`, model.rivalTeam.recentGames, 508, 400, 410, red);
  addThreeColumnInsight(formPage, "Impulso propio", `${formatPdfNumber(ownRecent.points)} pts`, `Diferencial reciente ${signedPdfNumber(ownRecent.differential)}. Si esta cifra supera la base, sostener ritmo sin caer en tiros rapidos de baja calidad.`, 42, 190, 270, primary);
  addThreeColumnInsight(formPage, "Impulso rival", `${formatPdfNumber(rivalRecent.points)} pts`, `Diferencial reciente ${signedPdfNumber(rivalRecent.differential)}. Preparar primer ajuste si el rival anota temprano desde su primera ventaja.`, 344, 190, 270, red);
  addThreeColumnInsight(formPage, "Decision de muestra", `${model.ownTeam.sampleRecord} vs ${model.rivalTeam.sampleRecord}`, "Usar la muestra para el plan inicial, pero contrastar con base temporada antes de tomar riesgos defensivos extremos.", 646, 190, 272, amber);
  addFooter(formPage, "08 / 15", model, primary);
  pages.push(formPage.join("\n"));

  const basePage: string[] = [];
  addHeader(basePage, "Base temporada", "Respaldo estadistico para no sobrerreaccionar a un solo partido", "09 / 15", primary);
  addShadowRect(basePage, 42, 84, 876, 320, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(basePage, "Forma reciente vs base", 66, 372, primary);
  addText(basePage, own.name, 270, 372, 10, primary, "F2");
  addText(basePage, rival.name, 780, 372, 10, red, "F2");
  addThinStat(basePage, "PTS/PJ temporada", formatPdfNumber(ownSeason.points), formatPdfNumber(rivalSeason.points), 80, 326, 790, primary);
  addThinStat(basePage, "PTS/PJ muestra", formatPdfNumber(ownRecent.points), formatPdfNumber(rivalRecent.points), 80, 286, 790, primary);
  addThinStat(basePage, "REB/PJ temporada", formatPdfNumber(ownSeason.rebounds), formatPdfNumber(rivalSeason.rebounds), 80, 246, 790, primary);
  addThinStat(basePage, "AST/PJ temporada", formatPdfNumber(ownSeason.assists), formatPdfNumber(rivalSeason.assists), 80, 206, 790, primary);
  addThinStat(basePage, "DIF/PJ temporada", signedPdfNumber(ownSeason.differential), signedPdfNumber(rivalSeason.differential), 80, 166, 790, primary);
  addRect(basePage, 80, 102, 790, 38, [0.055, 0.075, 0.062], [0.055, 0.075, 0.062]);
  addText(basePage, "Lectura staff", 98, 124, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(basePage, ownRecent.points - ownSeason.points >= rivalRecent.points - rivalSeason.points ? "La forma propia esta por sobre la base. El plan puede comenzar agresivo, pero debe proteger seleccion de tiro y rebote." : "El rival llega con mejor impulso relativo. Conviene bajar posesiones faciles y forzar ejecuciones largas desde el inicio.", 190, 124, 620, 9.5, [1, 1, 1], "F1", 12, 2);
  addFooter(basePage, "09 / 15", model, primary);
  pages.push(basePage.join("\n"));

  const ownRotationPage: string[] = [];
  addHeader(ownRotationPage, "Rotacion propia", "Como cargar nuestra ventaja sin perder estabilidad de banca", "10 / 15", primary);
  addRect(ownRotationPage, 42, 300, 876, 110, dark);
  addText(ownRotationPage, "IDENTIDAD PROPIA", 62, 382, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(ownRotationPage, model.ownIdentity.summary, 62, 352, 540, 22, [1, 1, 1], "F2", 25, 3);
  addText(ownRotationPage, `Ritmo: ${model.ownIdentity.rhythm} · ${model.ownRotation.lineupStability}`, 644, 362, 10, [0.78, 0.82, 0.78], "F1");
  addRotationList(ownRotationPage, "Quinteto propio", model.ownRotation.starters, 42, 252, 280, primary);
  addRotationList(ownRotationPage, "Primeros cambios", model.ownRotation.firstChanges, 342, 252, 280, amber);
  addRotationList(ownRotationPage, "Cierre probable", model.ownRotation.closers, 642, 252, 276, primary);
  addThreeColumnInsight(ownRotationPage, "Banco", model.ownRotation.benchDependency, model.ownRotation.benchImpact, 42, 126, 270, primary);
  addThreeColumnInsight(ownRotationPage, "Presion", model.ownRotation.pressureClosers, "Mantener al menos una fuente estable de ventaja en cancha durante cierres largos.", 344, 126, 270, amber);
  addThreeColumnInsight(ownRotationPage, "Regla", `${Math.round(model.ownRotation.confidence * 100)}% confianza`, model.ownRotation.rule, 646, 126, 272, primary);
  addFooter(ownRotationPage, "10 / 15", model, primary);
  pages.push(ownRotationPage.join("\n"));

  const rivalRotationPage: string[] = [];
  addHeader(rivalRotationPage, "Rotacion rival ampliada", "Quien inicia, quien cambia el ritmo y quien probablemente cierra", "11 / 15", primary);
  addRect(rivalRotationPage, 42, 300, 876, 110, [1, 0.95, 0.94], [0.92, 0.76, 0.76]);
  addText(rivalRotationPage, "LECTURA DEFENSIVA", 62, 382, 9, red, "F2");
  addWrappedText(rivalRotationPage, `La prioridad es sacar de ritmo a ${topThreat?.name ?? "la primera amenaza"} y no regalar confianza a la segunda unidad.`, 62, 350, 560, 22, dark, "F2", 25, 3);
  addText(rivalRotationPage, `${model.rivalRotation.lineupStability} · ${model.rivalRotation.benchDependency}`, 650, 362, 10, muted, "F1");
  addRotationList(rivalRotationPage, "Quinteto rival", model.rivalRotation.starters, 42, 252, 280, red);
  addRotationList(rivalRotationPage, "Primeros cambios", model.rivalRotation.firstChanges, 342, 252, 280, amber);
  addRotationList(rivalRotationPage, "Cierre rival", model.rivalRotation.closers, 642, 252, 276, red);
  addThreeColumnInsight(rivalRotationPage, "Banco rival", model.rivalRotation.benchDependency, model.rivalRotation.benchImpact, 42, 126, 270, red);
  addThreeColumnInsight(rivalRotationPage, "Clutch", model.rivalRotation.pressureClosers, "No cambiar automatico si el rival busca aislar al scorer. Comunicar cobertura antes de cada bloqueo.", 344, 126, 270, amber);
  addThreeColumnInsight(rivalRotationPage, "Confianza", `${Math.round(model.rivalRotation.confidence * 100)}%`, model.rivalRotation.rule, 646, 126, 272, red);
  addFooter(rivalRotationPage, "11 / 15", model, primary);
  pages.push(rivalRotationPage.join("\n"));

  const rivalMatrix: string[] = [];
  addHeader(rivalMatrix, "Matriz defensiva de 9 jugadores", "Plan individual para amenaza principal, titulares y rotacion", "12 / 15", primary);
  addShadowRect(rivalMatrix, 42, 66, 876, 350, [1, 1, 1], [0.86, 0.88, 0.86]);
  addText(rivalMatrix, "Jugador", 80, 382, 9, muted, "F2");
  addText(rivalMatrix, "MIN", 252, 382, 9, muted, "F2");
  addText(rivalMatrix, "PTS", 312, 382, 9, muted, "F2");
  addText(rivalMatrix, "REB", 372, 382, 9, muted, "F2");
  addText(rivalMatrix, "AST", 432, 382, 9, muted, "F2");
  addText(rivalMatrix, "Plan defensivo", 492, 382, 9, muted, "F2");
  rivalNine.forEach((player, index) => {
    addPlayerMatrixRow(rivalMatrix, player, index, 66, 354 - index * 34, 820, primary);
  });
  addFooter(rivalMatrix, "12 / 15", model, primary);
  pages.push(rivalMatrix.join("\n"));

  const ownAdvantagePage: string[] = [];
  addHeader(ownAdvantagePage, "Ventajas propias para cargar", "Quien debe recibir ventajas, como y con que gatillo", "13 / 15", primary);
  ownSix.slice(0, 6).forEach((player, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 42 + col * 300;
    const y = 390 - row * 170;
    addPlayerDossierCard(ownAdvantagePage, player, index, x, y, 276, 146, primary);
  });
  addRect(ownAdvantagePage, 42, 46, 876, 50, [0.055, 0.075, 0.062], [0.055, 0.075, 0.062]);
  addText(ownAdvantagePage, "Regla ofensiva", 58, 70, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(ownAdvantagePage, `La primera presion debe venir desde ${topOwn?.name ?? "nuestro jugador de mayor impacto"}. Si el rival cambia matchup, repetir el emparejamiento debil en las siguientes dos posesiones.`, 160, 71, 690, 9.5, [1, 1, 1], "F1", 12, 2);
  addFooter(ownAdvantagePage, "13 / 15", model, primary);
  pages.push(ownAdvantagePage.join("\n"));

  const validationPage: string[] = [];
  addHeader(validationPage, "Validacion postpartido", "Lo proyectado vs lo real para vender aprendizaje, no solo prediccion", "14 / 15", primary);
  addRect(validationPage, 42, 346, 876, 64, model.planValidation.headline.toLowerCase().includes("fuera") ? [1, 0.94, 0.94] : [0.9, 0.97, 0.94], [0.86, 0.88, 0.86]);
  addText(validationPage, "VALIDACION DEL PLAN", 62, 384, 9, model.planValidation.headline.toLowerCase().includes("fuera") ? red : primary, "F2");
  addWrappedText(validationPage, model.planValidation.headline, 62, 360, 760, 18, dark, "F2", 22, 2);
  model.planValidation.checks.slice(0, 4).forEach((check, index) => {
    const y = 304 - index * 54;
    const statusColor: PdfRgb = check.status === "logrado" ? primary : check.status === "fallo" ? red : amber;
    addShadowRect(validationPage, 42, y - 34, 876, 42, [1, 1, 1], [0.88, 0.9, 0.88]);
    addText(validationPage, check.label, 62, y - 8, 9.5, dark, "F2");
    addText(validationPage, `${check.projected} -> ${check.actual}`, 252, y - 8, 9.5, muted, "F1");
    addText(validationPage, check.status.toUpperCase(), 520, y - 8, 9, statusColor, "F2");
    addWrappedText(validationPage, check.decision, 640, y - 4, 230, 8.5, [0.22, 0.28, 0.25], "F1", 10, 2);
  });
  addRect(validationPage, 42, 44, 876, 38, [1, 0.96, 0.9], [0.92, 0.82, 0.62]);
  addText(validationPage, "Trazabilidad", 60, 66, 9, [0.5, 0.32, 0.02], "F2");
  addText(validationPage, `${sourceCount} fuentes / registros considerados · dato confirmado, inferencia y conclusion tactica separados`, 150, 66, 9, [0.22, 0.28, 0.25], "F1");
  addFooter(validationPage, "14 / 15", model, primary);
  pages.push(validationPage.join("\n"));

  const benchPage: string[] = [];
  addRect(benchPage, 0, 0, 960, 540, dark);
  addRect(benchPage, 0, 0, 960, 18, primary);
  addText(benchPage, "HOJA FINAL DE EJECUCION", 46, 486, 11, [0.96, 0.85, 0.25], "F2");
  addWrappedText(benchPage, `${own.name} vs ${rival.name}`, 46, 444, 520, 34, [1, 1, 1], "F2", 38, 2);
  addText(benchPage, "Que debe quedar en la pizarra antes del salto inicial", 48, 386, 12, [0.78, 0.82, 0.78], "F1");
  [
    { title: "1. Primer ajuste", value: model.tacticalKeysCore[0]?.action ?? "Sacar de ritmo a la primera ventaja rival." },
    { title: "2. Ventaja propia", value: model.tacticalKeysCore[1]?.action ?? "Cargar nuestra primera fuente de ventaja." },
    { title: "3. Posesiones", value: model.tacticalKeysCore[2]?.action ?? "Controlar rebote y perdida antes de acelerar." },
    { title: "4. Cuarto de quiebre", value: `${bestQuarter?.quarter ?? "3C"}: ${bestQuarter?.recommendation ?? "subir agresividad despues del descanso."}` },
    { title: "5. Cierre", value: `${riskQuarter?.quarter ?? "4C"}: proteger ritmo, faltas y seleccion de tiro.` }
  ].forEach((item, index) => {
    const y = 330 - index * 52;
    addRect(benchPage, 46, y - 24, 600, 38, index === 0 ? [0.96, 0.85, 0.25] : [0.14, 0.17, 0.15], [0.28, 0.32, 0.28]);
    addText(benchPage, item.title, 64, y - 2, 10, index === 0 ? dark : [0.96, 0.85, 0.25], "F2");
    addWrappedText(benchPage, item.value, 208, y + 1, 402, 9.5, index === 0 ? dark : [1, 1, 1], "F1", 11, 2);
  });
  addRect(benchPage, 700, 96, 176, 270, [0.96, 0.85, 0.25], [0.96, 0.85, 0.25]);
  addText(benchPage, "WIN PROB", 724, 326, 10, dark, "F2");
  addText(benchPage, `${model.prediction.ownWinProbability}%`, 724, 270, 42, dark, "F2");
  addText(benchPage, "Margen", 724, 218, 10, dark, "F2");
  addWrappedText(benchPage, model.prediction.marginRange, 724, 194, 118, 15, dark, "F2", 18, 2);
  addText(benchPage, "Confianza", 724, 138, 10, dark, "F2");
  addText(benchPage, `${Math.round(model.prediction.confidence * 100)}%`, 724, 112, 22, dark, "F2");
  addText(benchPage, "DOS Scout Pro · decision first scouting", 46, 36, 9, [0.78, 0.82, 0.78], "F2");
  addText(benchPage, "15 / 15", 870, 36, 9, [0.96, 0.85, 0.25], "F2");
  pages.push(benchPage.join("\n"));

  return buildPdfDocument(pages);
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

function downloadPdfDocument(filename: string, pdf: string) {
  const blob = new Blob([pdf], { type: "application/pdf" });
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
  const [activeCompetition, setActiveCompetition] = useState<ScoutingCompetitionKey>(LIGA_DOS_COMPETITION as ScoutingCompetitionKey);
  const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
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

  const competition = activeCompetition as CompetitionKey;
  const leagueCopy = competitionCopy(competition);
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

  useEffect(() => {
    const competitionTeams = data.teams.filter((team) => team.competition === activeCompetition);
    if (competitionTeams.length === 0) {
      return;
    }
    const hasOwn = competitionTeams.some((team) => team.name === ownTeam);
    const nextOwn = hasOwn ? ownTeam : competitionTeams[0].name;
    const hasRival = competitionTeams.some((team) => team.name === rivalTeam);
    const nextRival =
      hasRival && rivalTeam !== nextOwn
        ? rivalTeam
        : competitionTeams.find((team) => team.name !== nextOwn)?.name ?? nextOwn;
    if (nextOwn !== ownTeam) {
      setOwnTeam(nextOwn);
    }
    if (nextRival !== rivalTeam) {
      setRivalTeam(nextRival);
    }
  }, [activeCompetition, data.teams, ownTeam, rivalTeam]);

  useEffect(() => {
    setSelectedShotPlayer("");
    setShotGameFilter("Todos");
    setUrls("");
    setOfficialSyncStatus(`Base oficial ${competitionCopy(activeCompetition).shortLabel} lista para sincronizar standings, equipos, rosters y fixture.`);
    setIngestStatus(`Listo para pegar links FEBACHILE / Genius Sports de ${competitionCopy(activeCompetition).shortLabel}.`);
    setShotImportStatus(`Carta de tiro lista para generar desde los partidos oficiales del rival en ${competitionCopy(activeCompetition).shortLabel}.`);
  }, [activeCompetition]);

  const handleImport = async () => {
    const parsedUrls = urls
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    if (parsedUrls.length === 0) {
      setIngestStatus("Pega al menos un link oficial antes de procesar.");
      return;
    }

    setIngestStatus(`Procesando tabla Genius, links de Estadisticas completas y boxscores de ${leagueCopy.shortLabel}...`);
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
          loadedBy: `Admin ${leagueCopy.shortLabel}`,
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
        payload.errors.length > 0 ? `Observaciones: ${payload.errors.join(" | ")}` : `Datos persistidos en la base local de ${leagueCopy.shortLabel}.`
      }`
    );
  };

  const handleShotAutoImport = async () => {
    if (!model) {
      setShotImportStatus("Falta seleccionar equipo propio y rival antes de capturar la carta de tiro.");
      return;
    }

    const rivalName = model.rivalTeam.team.name;
    const targetUrls = Array.from(new Set(rivalShotImportGames.map(dataUrlFromGame).filter((url): url is string => Boolean(url))));

    if (targetUrls.length === 0) {
      setShotImportStatus(`No encontre IDs oficiales en la muestra. Primero sincroniza ${leagueCopy.shortLabel} oficial o pega links de Estadisticas completas en Carga.`);
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
            loadedBy: `Admin ${leagueCopy.shortLabel}`,
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
    setOfficialSyncStatus(`Sincronizando ${leagueCopy.shortLabel}: equipos, standings, fixture, rosters y estadisticas por equipo desde Genius...`);

    try {
      const response = await fetch("/api/sync-liga-dos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competition })
      });
      const payload = (await response.json()) as OfficialSyncPayload;

      if (!response.ok || payload.error) {
        setOfficialSyncStatus(payload.error ?? "No se pudo completar la sincronizacion oficial.");
        return;
      }

      setData((current) => replaceCompetitionDataset(current, payload, competition));
      const now = payload.syncedAt ?? new Date().toISOString();
      setSourceTrace((current) => [
        {
          id: `${competition}-official-${now}`,
          sourceUrl: leagueCopy.sourceUrl,
          loadedAt: now,
          loadedBy: `Admin ${leagueCopy.shortLabel}`,
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
        `Sincronizacion oficial ${leagueCopy.shortLabel} completa: ${payload.teams.length} equipos, ${payload.players.length} jugadores y ${payload.games.length} partidos desde ${payload.sources.join(", ")}.`
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

  const handleCompetitionChange = (nextCompetition: ScoutingCompetitionKey) => {
    setActiveCompetition(nextCompetition);
    setLeagueMenuOpen(false);
  };

  if (!model) {
    return (
      <main className="premium-shell">
        <section className="module-panel">
          <p className="eyebrow">{leagueCopy.label}</p>
          <h1>Faltan equipos para construir el modelo de scouting.</h1>
          <button className="primary-button" onClick={handleOfficialSync} type="button">Sincronizar {leagueCopy.shortLabel}</button>
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
  const sortedQuarterModel = [...model.quarterModel].sort((quarterA, quarterB) => quarterB.differential - quarterA.differential);
  const quarterToAttack = sortedQuarterModel[0] ?? model.quarterModel[0];
  const quarterToResist = sortedQuarterModel[sortedQuarterModel.length - 1] ?? quarterToAttack;
  const closingQuarter = model.quarterModel.find((quarter) => quarter.quarter === "4C") ?? quarterToResist;
  const firstHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "1C" || quarter.quarter === "2C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const secondHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "3C" || quarter.quarter === "4C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const quarterPlanCards = model.quarterModel.map((quarter) => ({
    ...quarter,
    plan: buildQuarterPlan(quarter, quarterToAttack?.quarter, quarterToResist?.quarter)
  }));
  const quarterMaxPoints = Math.max(...quarterPlanCards.flatMap((quarter) => [quarter.pointsFor, quarter.pointsAgainst]), 1);
  const quarterMaxDiff = Math.max(...quarterPlanCards.map((quarter) => Math.abs(quarter.differential)), 1);
  const standings = [...teams].sort((teamA, teamB) => {
    const winsDelta = parseNumber(teamB.wins) - parseNumber(teamA.wins);
    if (winsDelta !== 0) {
      return winsDelta;
    }
    return getPointDifferential(teamB) - getPointDifferential(teamA);
  });
  const selectedZone = displayZoneForTeam(model.ownTeam.team) || displayZoneForTeam(model.rivalTeam.team);
  const zoneStandings = standings.filter((team) => displayZoneForTeam(team) === selectedZone);
  const groupedStandings = Array.from(new Set(standings.map((team) => displayZoneForTeam(team)).filter(Boolean))).map((zone) => ({
    zone,
    teams: standings.filter((team) => displayZoneForTeam(team) === zone)
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
  const rivalFinalGames = competitionGames
    .filter((game) => game.status === "Final" && (areSameTeam(game.homeTeam, model.rivalTeam.team.name) || areSameTeam(game.awayTeam, model.rivalTeam.team.name)))
    .slice(0, Math.max(scoutingFilters.sampleSize, 8));
  const rivalShotImportGames = rivalSampleGames.length > 0 ? rivalSampleGames : rivalFinalGames;
  const shotGameOptions = rivalShotImportGames
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
  const rivalSampleGameIds = new Set(rivalShotImportGames.map((game) => game.gameId));
  const rivalSampleMatchIds = new Set(rivalShotImportGames.map(matchIdFromGame).filter((matchId): matchId is string => Boolean(matchId)));
  const allRivalShots = (data.shots ?? []).filter((shot) => shot.competition === competition && areSameTeam(shot.teamName, model.rivalTeam.team.name));
  const sampleRivalShots = allRivalShots.filter((shot) => {
    const shotMatchId = matchIdFromShot(shot);
    const belongsToSample =
      rivalSampleGameIds.has(shot.gameId) || Boolean(shotMatchId && rivalSampleMatchIds.has(shotMatchId));
    return belongsToSample;
  });
  const rivalShots = sampleRivalShots.length > 0 ? sampleRivalShots : allRivalShots;
  const allRivalPlayerGameStats = (data.playerGameStats ?? []).filter((stat) => stat.competition === competition && areSameTeam(stat.teamName, model.rivalTeam.team.name));
  const sampleRivalPlayerGameStats = allRivalPlayerGameStats.filter((stat) => {
    const statMatchId = matchIdFromPlayerGameStat(stat);
    const belongsToSample =
      rivalSampleGameIds.has(stat.gameId) || Boolean(statMatchId && rivalSampleMatchIds.has(statMatchId));
    return belongsToSample;
  });
  const rivalPlayerGameStats = sampleRivalPlayerGameStats.length > 0 ? sampleRivalPlayerGameStats : allRivalPlayerGameStats;
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
  const activeShotGameCount = activeShotGameFilter === "Todos"
    ? Math.max(rivalShotImportGames.length, new Set(activeRivalShots.map((shot) => matchIdFromShot(shot) ?? shot.gameId)).size)
    : 1;
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
          <p className="eyebrow">{leagueCopy.kicker}</p>
          <div className="league-title">
            <h1>Scouting tactico</h1>
            <div className={`league-title-picker ${leagueMenuOpen ? "open" : ""}`}>
              <button
                aria-expanded={leagueMenuOpen}
                aria-haspopup="listbox"
                className="league-title-select"
                onClick={() => setLeagueMenuOpen((current) => !current)}
                type="button"
              >
                <small>Liga activa</small>
                <strong>{leagueCopy.shortLabel}</strong>
              </button>
              {leagueMenuOpen ? (
                <div className="league-menu" role="listbox">
                  {SCOUTING_COMPETITIONS.map((item) => {
                    const itemCopy = competitionCopy(item);
                    const selected = item === activeCompetition;
                    return (
                      <button
                        aria-selected={selected}
                        className={selected ? "selected" : ""}
                        key={item}
                        onClick={() => handleCompetitionChange(item)}
                        role="option"
                        type="button"
                      >
                        <span>{selected ? "Activo" : "Cambiar a"}</span>
                        <strong>{itemCopy.shortLabel}</strong>
                        <small>{itemCopy.label}</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
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
          <small>{leagueCopy.shortLabel}</small>
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
          Liga
          <select value={activeCompetition} onChange={(event) => setActiveCompetition(event.target.value as ScoutingCompetitionKey)}>
            {SCOUTING_COMPETITIONS.map((item) => (
              <option key={item} value={item}>
                {competitionCopy(item).shortLabel}
              </option>
            ))}
          </select>
        </label>
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
              <p className="eyebrow">Tabla {leagueCopy.shortLabel} · {selectedZone}</p>
              <h3>Como va la zona</h3>
            </div>
            <div className="standings-list">
              {zoneStandings.map((team, index) => (
                <article className="standing-row" key={team.teamId}>
                  <span>{index + 1}</span>
                  <strong>{team.name}</strong>
                  <small>{displayZoneForTeam(team)} · {team.gamesPlayed} PJ</small>
                  <b>{team.wins}-{team.losses}</b>
                  <em>{getPointDifferential(team).toFixed(1)}</em>
                </article>
              ))}
            </div>
            <p className="standings-note">La tabla se filtra por la zona del equipo propio seleccionado.</p>
          </section>
          <SignalList title="Alertas automaticas" signals={model.tacticalKeys.slice(0, isPlayerView ? 3 : 6)} />
          <section className="module-panel dashboard-quarter-panel">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Resumen por cuartos</p>
                <h3>Momentum y decisiones</h3>
              </div>
              <EvidencePill evidence={quarterToAttack?.evidence ?? "inferencia estadistica"} confidence={quarterToAttack?.confidence ?? 0.52} />
            </div>
            <div className="dashboard-quarter-layout">
              <div className="dashboard-quarter-chart">
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={quarterChart}>
                    <CartesianGrid stroke="rgba(22,31,27,0.08)" vertical={false} />
                    <XAxis dataKey="quarter" stroke="#64716b" tickLine={false} axisLine={false} />
                    <YAxis stroke="#64716b" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#11120f", border: "1px solid #3f453b", borderRadius: 8, color: "#ffffff" }} />
                    <Area type="monotone" dataKey="Favor" stroke="var(--team-primary, #0f766e)" fill="var(--team-soft, #dff7f1)" strokeWidth={3} />
                    <Area type="monotone" dataKey="Contra" stroke="#f97316" fill="#fff0df" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="dashboard-quarter-summary">
                <article className="quarter-mini-card attack">
                  <span>Atacar</span>
                  <strong>{quarterToAttack?.quarter ?? "s/d"}</strong>
                  <p>{quarterToAttack ? `${signedDelta(quarterToAttack.differential)} · ${quarterToAttack.recommendation}` : "Sin muestra suficiente."}</p>
                </article>
                <article className="quarter-mini-card risk">
                  <span>Resistir</span>
                  <strong>{quarterToResist?.quarter ?? "s/d"}</strong>
                  <p>{quarterToResist ? `${signedDelta(quarterToResist.differential)} · controlar ritmo y rebote` : "Sin muestra suficiente."}</p>
                </article>
                <article className="quarter-mini-card split">
                  <span>Mitades</span>
                  <strong>{signedDelta(firstHalfDiff)} / {signedDelta(secondHalfDiff)}</strong>
                  <p>1T vs 2T para saber si conviene acelerar o administrar despues del descanso.</p>
                </article>
                <article className="quarter-mini-card close">
                  <span>Cierre</span>
                  <strong>{closingQuarter ? `${closingQuarter.quarter} ${signedDelta(closingQuarter.differential)}` : "s/d"}</strong>
                  <p>{closingQuarter ? closingQuarter.recommendation : "Revisar muestra antes de definir plan de cierre."}</p>
                </article>
              </div>
            </div>
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
            <MetricTile label="Equipos oficiales" value={String(teams.length)} caption={`${leagueCopy.shortLabel} separada por zonas o fase`} />
            <MetricTile label="Jugadores en base" value={String(competitionPlayers.length)} caption="Rosters y estadisticas por equipo" />
            <MetricTile label="Partidos en base" value={String(competitionGames.length)} caption="Fixture, resultados e imports locales" />
            <MetricTile label="Boxscores subidos" value={String(uploadedGames.length)} caption="Listos para scouting de jugadores y rotacion" />
            <MetricTile label="Pendientes" value={String(pendingGames.length)} caption="Falta link de Estadisticas completas o data.json" />
          </div>
          {canAdmin ? (
            <div className="sync-strip">
              <button className="primary-button" onClick={handleOfficialSync} type="button">Sincronizar {leagueCopy.shortLabel} oficial</button>
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
              <h3>{leagueCopy.shortLabel} separada por grupos</h3>
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
                <p className="eyebrow">{displayZoneForTeam(team.team)}</p>
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
        <section className="two-column rotation-board">
          {[
            { label: "Propia", rotation: model.ownRotation },
            { label: "Rival", rotation: model.rivalRotation }
          ].map(({ label, rotation }) => (
            <section className={`module-panel rotation-panel ${label === "Propia" ? "own" : "rival"}`} key={label}>
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
                    disabled={isShotImporting || rivalShotImportGames.length === 0}
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
              <MetricTile label="Rival" value={model.rivalTeam.team.name} caption={displayZoneForTeam(model.rivalTeam.team)} />
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
                  Partidos oficiales disponibles de {model.rivalTeam.team.name}: {rivalShotImportGames.map((game) => `${game.homeTeam} ${game.homeScore}-${game.awayScore} ${game.awayTeam}`).join(" · ") || "sin partidos oficiales"}.
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
        <section className="quarter-page">
          <section className="module-panel quarter-momentum-panel">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Momentum tactico</p>
                <h3>Plan por cuarto</h3>
              </div>
              <EvidencePill evidence={quarterToAttack?.evidence ?? "inferencia estadistica"} confidence={quarterToAttack?.confidence ?? 0.52} />
            </div>

            <div className="quarter-command-strip">
              <article className="quarter-command-card attack">
                <span>Cuarto para atacar</span>
                <strong>{quarterToAttack?.quarter ?? "s/d"}</strong>
                <p>{quarterToAttack ? `${signedDelta(quarterToAttack.differential)} diferencial · ${quarterToAttack.recommendation}` : "Sin muestra suficiente."}</p>
              </article>
              <article className="quarter-command-card hold">
                <span>Cuarto para resistir</span>
                <strong>{quarterToResist?.quarter ?? "s/d"}</strong>
                <p>{quarterToResist ? `${signedDelta(quarterToResist.differential)} diferencial · proteger ritmo y faltas` : "Sin muestra suficiente."}</p>
              </article>
              <article className="quarter-command-card close">
                <span>Lectura 2do tiempo</span>
                <strong>{signedDelta(secondHalfDiff)}</strong>
                <p>1er tiempo {signedDelta(firstHalfDiff)} · cierre {closingQuarter ? `${closingQuarter.quarter} ${signedDelta(closingQuarter.differential)}` : "s/d"}</p>
              </article>
            </div>

            <div className="quarter-momentum-grid">
              <div className="quarter-micro-chart-grid">
                {quarterPlanCards.map((quarter) => (
                  <article className={`quarter-micro-chart ${quarter.plan.tone}`} key={`${quarter.quarter}-chart`}>
                    <div className="quarter-micro-head">
                      <span>{quarter.quarter}</span>
                      <div>
                        <strong>{quarter.plan.role}</strong>
                        <small>{quarter.momentum}</small>
                      </div>
                    </div>
                    <div className="quarter-bars">
                      <div className="quarter-bar-row own">
                        <span>Favor</span>
                        <i><b style={{ width: `${(quarter.pointsFor / quarterMaxPoints) * 100}%` }} /></i>
                        <strong>{roundOne(quarter.pointsFor)}</strong>
                      </div>
                      <div className="quarter-bar-row rival">
                        <span>Contra</span>
                        <i><b style={{ width: `${(quarter.pointsAgainst / quarterMaxPoints) * 100}%` }} /></i>
                        <strong>{roundOne(quarter.pointsAgainst)}</strong>
                      </div>
                    </div>
                    <div className="quarter-diff-meter">
                      <span>DIF</span>
                      <i>
                        <b
                          className={quarter.differential >= 0 ? "positive" : "negative"}
                          style={{ width: `${Math.min(50, (Math.abs(quarter.differential) / quarterMaxDiff) * 50)}%` }}
                        />
                      </i>
                      <strong>{signedDelta(quarter.differential)}</strong>
                    </div>
                    <p>{quarter.recommendation}</p>
                  </article>
                ))}
              </div>

              <article className="quarter-break-card">
                <span>Cuarto de quiebre</span>
                <strong>{quarterToAttack?.quarter ?? "s/d"}</strong>
                <p>
                  {quarterToAttack
                    ? `${quarterToAttack.momentum}. Atacar ese tramo con reglas claras: ${quarterToAttack.recommendation}.`
                    : "El modelo necesita mas datos para proyectar un tramo dominante."}
                </p>
                <div className="quarter-break-metrics">
                  <div>
                    <small>DIF</small>
                    <b>{quarterToAttack ? signedDelta(quarterToAttack.differential) : "s/d"}</b>
                  </div>
                  <div>
                    <small>FAVOR</small>
                    <b>{quarterToAttack ? roundOne(quarterToAttack.pointsFor) : "s/d"}</b>
                  </div>
                  <div>
                    <small>CONTRA</small>
                    <b>{quarterToAttack ? roundOne(quarterToAttack.pointsAgainst) : "s/d"}</b>
                  </div>
                </div>
                <EvidencePill evidence={quarterToAttack?.evidence ?? "inferencia estadistica"} confidence={quarterToAttack?.confidence ?? 0.52} />
              </article>
            </div>
          </section>

          <section className="module-panel quarter-plan-panel">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Plan operativo</p>
                <h3>Decisiones por cuarto</h3>
              </div>
              <small className="module-note">Lectura rapida para charla tecnica y ajustes en vivo.</small>
            </div>
            <div className="quarter-plan-grid">
              {quarterPlanCards.map((quarter) => (
                <article className={`quarter-plan-card ${quarter.plan.tone}`} key={quarter.quarter}>
                  <div className="quarter-plan-top">
                    <span>{quarter.quarter}</span>
                    <small>{quarter.plan.role}</small>
                  </div>
                  <strong>{quarter.plan.phase}</strong>
                  <p><b>Objetivo</b>{quarter.plan.objective}</p>
                  <p><b>Riesgo</b>{quarter.plan.risk}</p>
                  <p><b>Decision</b>{quarter.plan.decision}</p>
                  <div className="quarter-trigger">
                    <span>Gatillo en vivo</span>
                    <p>{quarter.plan.trigger}</p>
                  </div>
                  <small>Diferencial proyectado {signedDelta(quarter.differential)}</small>
                </article>
              ))}
            </div>
          </section>
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
          <section className="comparison-edge-strip">
            <article className={ownSeasonComparison.points >= rivalSeasonComparison.points ? "positive" : "risk"}>
              <span>Ataque base</span>
              <strong>{signedDelta(ownSeasonComparison.points - rivalSeasonComparison.points, " pts")}</strong>
              <p>{model.ownTeam.team.name} vs {model.rivalTeam.team.name}</p>
            </article>
            <article className={ownSeasonComparison.differential >= rivalSeasonComparison.differential ? "positive" : "risk"}>
              <span>Diferencial</span>
              <strong>{signedDelta(ownSeasonComparison.differential - rivalSeasonComparison.differential)}</strong>
              <p>Control de marcador y consistencia de muestra.</p>
            </article>
            <article className={ownSeasonComparison.rebounds >= rivalSeasonComparison.rebounds ? "positive" : "risk"}>
              <span>Rebote</span>
              <strong>{signedDelta(ownSeasonComparison.rebounds - rivalSeasonComparison.rebounds, " reb")}</strong>
              <p>Margen de posesiones disponibles.</p>
            </article>
            <article className={ownSeasonComparison.assists >= rivalSeasonComparison.assists ? "positive" : "risk"}>
              <span>Creacion</span>
              <strong>{signedDelta(ownSeasonComparison.assists - rivalSeasonComparison.assists, " ast")}</strong>
              <p>Fluidez ofensiva y calidad de ventaja.</p>
            </article>
          </section>
          <section className="comparison-insight-grid">
            <SignalList title="Rival vs propio equipo" signals={model.comparison} />
            <section className="module-panel plan-decision-panel">
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
          <section className="module-panel validation-panel">
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
                filename: `dossier-tactico-pro-${competitionFileSlug(competition)}.pdf`,
                title: "Dossier tactico pro",
                description: "Dossier visual de 15 diapositivas: decisiones, forma, base temporada, rotaciones, planes individuales, carta de tiro y validacion.",
                staffOnly: true
              },
              {
                kind: "tecnico" as const,
                filename: `reporte-tecnico-largo-${competitionFileSlug(competition)}.pdf`,
                title: "Reporte tecnico largo",
                description: "Version profunda con diagnostico, riesgos, video tags, trazabilidad y control de datos.",
                staffOnly: true
              },
              {
                kind: "postpartido" as const,
                filename: `informe-postpartido-premium-${competitionFileSlug(competition)}.pdf`,
                title: "Informe postpartido",
                description: "Lectura de validacion, objetivos de control y acciones para la semana.",
                staffOnly: true
              },
              {
                kind: "resumen" as const,
                filename: `informe-express-${competitionFileSlug(competition)}.pdf`,
                title: "Informe express",
                description: "Version corta para jugadores y staff, enfocada en 3-4 claves accionables.",
                staffOnly: false
              }
            ].map((report) => (
              <button
                className="download-tile"
                disabled={report.staffOnly && !canCreateReports}
                key={report.kind}
                onClick={() => {
                  if (report.kind === "prepartido") {
                    downloadPdfDocument(report.filename, buildTacticalDossierPdf(model, rivalShots));
                    return;
                  }
                  downloadPdf(report.filename, buildEditableReport(model, report.kind));
                }}
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
                <strong>Base oficial {leagueCopy.shortLabel}</strong>
                <p>Actualiza equipos, tabla por zonas o fase, fixture, rosters y estadisticas de jugador desde las interfaces oficiales de Genius.</p>
              </div>
              <button className="primary-button" onClick={handleOfficialSync} type="button">Sincronizar oficial</button>
            </div>
            <p className="status-copy">{officialSyncStatus}</p>
            <textarea
              className="source-textarea"
              onChange={(event) => setUrls(event.target.value)}
              placeholder={`https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F${leagueCopy.placeholderId}%2Fschedule\nhttps://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F${leagueCopy.placeholderId}%2Fmatch%2F2809987%2Fsummary%3F\nhttps://fibalivestats.dcd.shared.geniussports.com/u/CLNB/2809987/`}
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
