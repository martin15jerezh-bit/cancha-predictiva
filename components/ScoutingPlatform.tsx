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
  LNF_COMPETITION,
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
type ScoutingCompetitionKey = "Liga DOS 2026" | "Liga Chery Apertura 2026" | "Liga Nacional Femenina 2026";
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
  CURRENT_COMPETITION as ScoutingCompetitionKey,
  LNF_COMPETITION as ScoutingCompetitionKey
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
  },
  "Liga Nacional Femenina 2026": {
    label: "Liga Nacional Femenina",
    shortLabel: "LNF Chile",
    kicker: "LNF Chile · Scouting privado",
    sourceUrl: "https://clnb.web.geniussports.com/?p=9&WHurl=%2Fcompetition%2F48641%2Fstandings",
    placeholderId: "48641"
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
type TacticalPlayerCard = ShotPlayerCard & { player: MatchupScout["rivalPlayers"][number] };

function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function personNameTokens(value: string, includeInitials = false) {
  return normalizePersonName(value)
    .split(" ")
    .filter((token) => (includeInitials ? token.length > 0 : token.length > 1));
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
  const normalizedGivenTokens = personNameTokens(givenPart, true);

  if (hasComma) {
    return {
      givenInitial: normalizedGivenTokens[0]?.[0] ?? "",
      surnameTokens: normalizedSurnameTokens,
      tokens: [...normalizedSurnameTokens, ...normalizedGivenTokens]
    };
  }

  const tokens = personNameTokens(value, true);
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

function personGivenTokens(value: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const [surnamePart, givenPart = ""] = cleaned.split(",").map((part) => part.trim());
  if (cleaned.includes(",")) {
    return personNameTokens(givenPart, true);
  }

  const tokens = personNameTokens(surnamePart, true);
  if (tokens[0]?.length === 1) {
    return [tokens[0]];
  }
  return tokens.length >= 3 ? [tokens[0]] : [];
}

function givenNamesCompatible(firstName: string, secondName: string) {
  const firstGiven = personGivenTokens(firstName)[0] ?? "";
  const secondGiven = personGivenTokens(secondName)[0] ?? "";
  if (!firstGiven || !secondGiven) {
    return true;
  }
  if (firstGiven.length === 1 || secondGiven.length === 1) {
    return firstGiven[0] === secondGiven[0];
  }
  return firstGiven === secondGiven;
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
  if (player === shot) {
    return true;
  }
  if (!givenNamesCompatible(playerName, shotName)) {
    return false;
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

function playerIdentityKey(value: string) {
  const identity = personIdentity(value);
  const given = personGivenTokens(value)[0] ?? identity.givenInitial;
  const surnames = identity.surnameTokens.filter((token) => token.length > 2).join("|");
  return `${given || "?"}|${surnames || normalizePersonName(value)}`;
}

function normalizeJerseyNumber(value?: string) {
  return String(value ?? "").trim().replace(/^0+/, "") || String(value ?? "").trim();
}

function sameShotPlayerInRoster(
  playerName: string,
  shotName: string,
  rosterPlayers: MatchupScout["rivalPlayers"]
) {
  if (!sameShotPlayer(playerName, shotName)) {
    return false;
  }

  const normalizedPlayer = normalizePersonName(playerName);
  const normalizedShot = normalizePersonName(shotName);
  const exactRosterMatches = rosterPlayers.filter((player) => normalizePersonName(player.name) === normalizedShot).length;
  if (normalizedPlayer && normalizedPlayer === normalizedShot && exactRosterMatches > 0) {
    return true;
  }

  const candidateKeys = new Set(
    rosterPlayers
      .filter((player) => sameShotPlayer(player.name, shotName))
      .map((player) => playerIdentityKey(player.name))
  );

  return candidateKeys.size <= 1;
}

function sameShotRowForPlayer(
  player: MatchupScout["rivalPlayers"][number] | undefined,
  playerName: string,
  shot: ShotRow,
  rosterPlayers: MatchupScout["rivalPlayers"]
) {
  const playerNumber = normalizeJerseyNumber(player?.shirtNumber);
  const shotNumber = normalizeJerseyNumber(shot.shirtNumber);
  if (playerNumber && shotNumber && playerNumber === shotNumber) {
    return true;
  }
  return sameShotPlayerInRoster(playerName, shot.playerName, rosterPlayers);
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
  const zoneBreakdown = ["pintura", "media distancia", "triple frontal/45", "esquina", "costado izquierdo", "costado derecho"]
    .map((zone) => {
      const zoneShots = shots.filter((shot) => shotZone(shot) === zone);
      const zoneMade = zoneShots.filter((shot) => shot.made).length;
      return {
        zone,
        attempts: zoneShots.length,
        made: zoneMade,
        efficiency: zoneShots.length === 0 ? 0 : zoneMade / zoneShots.length
      };
    });
  const avoidedZones = zoneBreakdown
    .filter((zone) => zone.attempts === 0)
    .map((zone) => zone.zone);
  const mostEfficientZone = [...zoneBreakdown]
    .filter((zone) => zone.attempts >= Math.max(2, Math.round(attempts * 0.12)))
    .sort((zoneA, zoneB) => zoneB.efficiency - zoneA.efficiency)[0];
  const leastEfficientZone = [...zoneBreakdown]
    .filter((zone) => zone.attempts >= Math.max(2, Math.round(attempts * 0.12)))
    .sort((zoneA, zoneB) => zoneA.efficiency - zoneB.efficiency)[0];

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
    topQuarterAttempts: topQuarter?.[1] ?? 0,
    zoneBreakdown,
    avoidedZones,
    mostEfficientZone,
    leastEfficientZone
  };
}

function buildShotAnalysis(playerName: string, shots: ShotRow[], player?: MatchupScout["rivalPlayers"][number]) {
  const summary = shotSummary(shots);
  if (summary.attempts === 0) {
    return {
      headline: "Sin carta de tiro confirmada para este jugador en la muestra.",
      bullets: [
        "Reimporta el link de Estadisticas completas para capturar la pestana Carta de tiro.",
        "Cuando existan coordenadas, el sistema mostrara zonas, cuartos y plan defensivo."
      ],
      profile: player?.playerType ?? "Perfil pendiente",
      style: "Lectura pendiente de coordenadas.",
      decisions: ["Usar estadistica tradicional y video hasta tener carta confirmada."],
      strengths: [player?.strength ?? "Sin fortaleza espacial confirmada."],
      weaknesses: [player?.weakness ?? "Sin debilidad espacial confirmada."],
      defensiveInstructions: ["Defender segun rol, negar ritmo temprano y validar con video."],
      attackInstructions: ["Atacarlo segun matchup fisico mientras se confirma tendencia."],
      plan: "Plan provisorio: defender segun scouting estadistico y validar con video."
    };
  }

  const pressure =
    summary.secondHalfAttempts > summary.firstHalfAttempts
      ? "aumenta volumen en segunda mitad"
      : summary.firstHalfAttempts > summary.secondHalfAttempts
        ? "carga mas tiros en primera mitad"
        : "reparte volumen entre mitades";
  const threeRate = summary.threeAttempts / Math.max(summary.attempts, 1);
  const paintRate = summary.zoneBreakdown.find((zone) => zone.zone === "pintura")?.attempts ?? 0;
  const midRate = summary.zoneBreakdown.find((zone) => zone.zone === "media distancia")?.attempts ?? 0;
  const cornerAttempts = summary.zoneBreakdown.find((zone) => zone.zone === "esquina")?.attempts ?? 0;
  const topZoneEfficiency = summary.zoneBreakdown.find((zone) => zone.zone === summary.topZone)?.efficiency ?? 0;
  const profile =
    threeRate >= 0.55 && cornerAttempts <= Math.max(1, summary.attempts * 0.12)
      ? "Tirador de volumen frontal / creador de triple"
      : threeRate >= 0.5
        ? "Tirador spot-up de alto volumen"
        : paintRate >= summary.attempts * 0.45
          ? "Slasher / finalizador de pintura"
          : midRate >= summary.attempts * 0.32
            ? "Scorer de media distancia"
            : player?.playerType ?? "Rol mixto";
  const style =
    topZoneEfficiency >= 0.55 && summary.topZoneCount >= summary.attempts * 0.35
      ? `agresivo cuando toca ${summary.topZone}; castiga si llega comodo a su zona`
      : topZoneEfficiency < 0.42 && summary.topZoneCount >= summary.attempts * 0.35
        ? `volumen por sobre eficiencia; acepta tiros discutibles en ${summary.topZone}`
        : `lectura mixta; busca ${summary.topZone}, pero no depende de una sola zona`;
  const decisions = [
    summary.topZone === "pintura"
      ? "Primera lectura: poner presion al aro. Si gana hombro, termina o fuerza ayuda."
      : summary.topZone === "triple frontal/45"
        ? "Primera lectura: levantarse en 45/frontal si el defensor pasa por abajo o llega tarde."
        : summary.topZone === "esquina"
          ? "Primera lectura: esperar descarga. Castiga rotacion larga y cierre sin balance."
          : "Primera lectura: buscar tiro de ritmo en zona media antes de llegar a la pintura.",
    pressure === "aumenta volumen en segunda mitad"
      ? "Sube decisiones de tiro despues del descanso. No dejarlo entrar limpio al 3C."
      : pressure === "carga mas tiros en primera mitad"
        ? "Intenta marcar tono temprano. Primeras dos defensas tienen que ser fisicas."
        : "No concentra todo en un tramo: hay que sostener regla defensiva todo el partido.",
    summary.avoidedZones.length > 0
      ? `Evita ${summary.avoidedZones.slice(0, 2).join(" y ")}. Podemos vivir con que decida desde ahi.`
      : `Usa varias zonas. La prioridad es quitar ${summary.topZone}, no perseguir todo.`
  ];
  const strengths = [
    topZoneEfficiency >= 0.5
      ? `castiga ${summary.topZone} con ${Math.round(topZoneEfficiency * 100)}% si recibe con ventaja`
      : `toma volumen en ${summary.topZone}; aunque no sea elite, le da ritmo al equipo`,
    summary.threeAttempts >= summary.attempts * 0.45
      ? `amenaza exterior real: ${summary.threeMade}/${summary.threeAttempts} en triples`
      : `amenaza cercana/media: obliga a proteger la primera linea`,
    summary.topQuarter !== "s/d"
      ? `mayor volumen en ${summary.topQuarter}; preparar ajuste antes de ese tramo`
      : "volumen todavia bajo para fijar cuarto de carga"
  ];
  const weaknesses = [
    summary.leastEfficientZone
      ? `baja eficiencia en ${summary.leastEfficientZone.zone}: ${Math.round(summary.leastEfficientZone.efficiency * 100)}%`
      : `poca muestra en zonas secundarias: sacarlo de ${summary.topZone}`,
    summary.avoidedZones.length > 0
      ? `evita ${summary.avoidedZones.slice(0, 2).join(" y ")}; orientar la defensa hacia esa lectura`
      : "si no le quitamos la primera ventaja, puede elegir demasiado",
    threeRate >= 0.45 && paintRate <= summary.attempts * 0.18
      ? "no vive del contacto: subir fisico y obligarlo a terminar adentro"
      : "si llega a su zona fuerte, el problema no es el tiro: es la ventaja previa"
  ];
  const defensiveInstructions = [
    summary.topZone === "triple frontal/45"
      ? "Pasar por arriba en bloqueos. No conceder pull-up frontal ni 45 comodo."
      : summary.topZone === "esquina"
        ? "No hundir desde su esquina. Cierre corto, mano alta y sin salto largo."
        : summary.topZone === "pintura"
          ? "Cerrar primera linea. Ayuda corta lista y cuerpo antes del aro."
          : "Orientarlo fuera de su zona de ritmo. Contestar sin falta.",
    summary.avoidedZones.length > 0
      ? `Forzarlo hacia ${summary.avoidedZones[0]}. Vivir con ese tiro hasta que lo meta dos veces.`
      : `Quitar ${summary.topZone}. El resto se ajusta con comunicacion.`,
    player && player.assists >= 4
      ? "Si atrae ayuda, rotacion temprana al pase. No regalar esquina por mirar la pelota."
      : "Si fuerza tiro contestado, no ayudar de mas. Terminar con bloqueo de rebote."
  ];
  const attackInstructions = [
    player && player.minutes >= 28 ? "Atacarlo para cargarlo de faltas: juega muchos minutos." : "Probarlo en defensa con acciones consecutivas.",
    player && player.rebounds < 4 ? "Cargar su espalda en rebote ofensivo." : "Sacarlo lejos del aro para reducir impacto en tablero."
  ];
  const plan = defensiveInstructions.join(" ");

  return {
    headline: `${playerName}: ${profile.toLowerCase()}. ${summary.topZoneCount}/${summary.attempts} tiros en ${summary.topZone}; ${pressure}.`,
    bullets: [
      `Volumen: ${summary.attempts} tiros en la muestra, ${summary.efficiency} de acierto.`,
      `Mayor carga por cuarto: ${summary.topQuarter} con ${summary.topQuarterAttempts} tiros.`,
      `Tendencia espacial: ${summary.topSide}; triples ${summary.threeMade}/${summary.threeAttempts}.`,
      `Lectura: ${style}.`
    ],
    profile,
    style,
    decisions,
    strengths,
    weaknesses,
    defensiveInstructions,
    attackInstructions,
    plan
  };
}

function shotPlanText(playerName: string, shots: ShotRow[], player?: MatchupScout["rivalPlayers"][number]) {
  const analysis = buildShotAnalysis(playerName, shots, player);
  const summary = shotSummary(shots);
  return [
    `Carta de tiro - ${playerName}`,
    "",
    `Tiros registrados: ${summary.attempts}`,
    `Acierto: ${summary.efficiency}`,
    `Zona dominante: ${summary.topZone}`,
    `Cuarto de mayor volumen: ${summary.topQuarter}`,
    `Perfil: ${analysis.profile}`,
    "",
    "Lectura staff",
    analysis.headline,
    ...analysis.bullets.map((item) => `- ${item}`),
    "",
    "Decisiones tipicas",
    ...analysis.decisions.map((item) => `- ${item}`),
    "",
    "Fortalezas reales",
    ...analysis.strengths.map((item) => `- ${item}`),
    "",
    "Debilidades explotables",
    ...analysis.weaknesses.map((item) => `- ${item}`),
    "",
    "Plan defensivo",
    ...analysis.defensiveInstructions.map((item) => `- ${item}`),
    "",
    "Como atacarlo",
    ...analysis.attackInstructions.map((item) => `- ${item}`),
    "- Comunicar la regla en una frase simple al jugador asignado.",
    "- Validar con video si el rival cambia volumen entre primera y segunda mitad."
  ].join("\n");
}

function buildShotReportSection(model: MatchupScout, shots: ShotRow[]) {
  const playerBlocks = model.rivalPlayers.slice(0, 6).map((player, index) => {
    const playerShots = shots.filter((shot) => sameShotRowForPlayer(player, player.name, shot, model.rivalPlayers));
    const analysis = buildShotAnalysis(player.name, playerShots, player);
    return [
      `${index + 1}. ${player.name}`,
      `- Perfil: ${analysis.profile}.`,
      `- Lectura: ${analysis.headline}`,
      `- Decision tipica: ${analysis.decisions[0]}`,
      `- Fortaleza real: ${analysis.strengths[0]}`,
      `- Debilidad explotable: ${analysis.weaknesses[0]}`,
      `- Regla defensiva: ${analysis.defensiveInstructions[0]}`
    ].join("\n");
  });

  return [
    "",
    "## LECTURA DE JUGADORES DESDE CARTA DE TIRO",
    shots.length > 0
      ? `Base confirmada: ${shots.length} tiros importados desde Carta de tiro Genius/FIBA.`
      : "Base pendiente: no hay coordenadas confirmadas en esta muestra. Importar Estadisticas completas antes de cerrar el plan.",
    "La lectura separa dato confirmado, inferencia y decision tactica. Usar como guia de staff y validar con video.",
    "",
    ...playerBlocks
  ].join("\n\n");
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

function PlayerSummaryCard({
  card,
  sectionTitle,
  onOpen
}: {
  card: TacticalPlayerCard;
  sectionTitle: string;
  onOpen: () => void;
}) {
  const summary = shotSummary(card.shots);
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  const stats = [
    ["MIN/PJ", card.player.minutes],
    ["PTS/PJ", card.player.points],
    ["REB/PJ", card.player.rebounds],
    ["AST/PJ", card.player.assists]
  ];

  return (
    <button className={`player-summary-card ${sectionTitle === "Amenaza principal" ? "featured" : ""}`} onClick={onOpen} type="button">
      <header>
        <span>{card.tag}</span>
        <strong>{card.name}</strong>
        <small>{card.player.role}</small>
      </header>
      <div className="player-summary-tags">
        <em>{analysis.profile}</em>
        <em>{summary.attempts > 0 ? `${summary.attempts} tiros · ${summary.efficiency}` : "sin carta confirmada"}</em>
      </div>
      <div className="player-summary-stats">
        {stats.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <b>{value}</b>
          </span>
        ))}
      </div>
      <p>{analysis.decisions[0] ?? card.player.defensiveKey}</p>
      <i>Ver lectura tactica</i>
    </button>
  );
}

function PlayerTacticalHeader({
  card,
  index,
  total,
  onClose,
  onPrevious,
  onNext
}: {
  card: TacticalPlayerCard;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <header className="player-sheet-header">
      <div>
        <p className="eyebrow">Ficha tactica individual</p>
        <h3 id="player-sheet-title">{card.name}</h3>
        <div className="player-sheet-tags">
          <span>{card.role}</span>
          <span>Prioridad {card.rank} del plan</span>
          <span>{analysis.profile}</span>
        </div>
        <p>{analysis.headline}</p>
      </div>
      <div className="player-sheet-controls">
        <button onClick={onPrevious} type="button" aria-label="Jugador anterior">Anterior</button>
        <strong>{index + 1}/{total}</strong>
        <button onClick={onNext} type="button" aria-label="Jugador siguiente">Siguiente</button>
        <button className="sheet-close" onClick={onClose} type="button" aria-label="Cerrar ficha">x</button>
      </div>
    </header>
  );
}

function PlayerShotChartSummary({ card, contextLabel }: { card: TacticalPlayerCard; contextLabel: string }) {
  const summary = shotSummary(card.shots);
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <section className="player-sheet-block shot-block">
      <div className="player-sheet-block-heading">
        <span>Shot chart ultimo partido</span>
        <strong>{summary.attempts} tiros · {summary.efficiency}</strong>
      </div>
      <p className="shot-context-line">{contextLabel}</p>
      <div className="player-shot-summary-layout">
        <div className="shot-chart-mini">
          <ShotCourt shots={card.shots} />
        </div>
        <div className="shot-readout">
          <p>{analysis.style}</p>
          <div>
            <span>Zona preferida</span>
            <strong>{summary.topZone}</strong>
          </div>
          <div>
            <span>Mayor volumen</span>
            <strong>{summary.topQuarter}</strong>
          </div>
          <div>
            <span>Tendencia espacial</span>
            <strong>{summary.topSide}</strong>
          </div>
          <small>{summary.avoidedZones.length > 0 ? `Evita ${summary.avoidedZones.slice(0, 2).join(" y ")}.` : "Usa varias zonas: quitar primera ventaja antes que perseguir todo."}</small>
        </div>
      </div>
    </section>
  );
}

function PlayerDecisionProfile({ card }: { card: TacticalPlayerCard }) {
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <section className="player-sheet-grid">
      <article className="player-sheet-block">
        <div className="player-sheet-block-heading">
          <span>Perfil de juego</span>
          <strong>{analysis.profile}</strong>
        </div>
        <p>{analysis.style}</p>
        <div className="player-profile-stats">
          <span><small>MIN/PJ</small><b>{card.player.minutes}</b></span>
          <span><small>PTS/PJ</small><b>{card.player.points}</b></span>
          <span><small>REB/PJ</small><b>{card.player.rebounds}</b></span>
          <span><small>AST/PJ</small><b>{card.player.assists}</b></span>
        </div>
      </article>
      <article className="player-sheet-block">
        <div className="player-sheet-block-heading">
          <span>Decisiones tipicas</span>
        </div>
        <ul>
          {analysis.decisions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function PlayerStrengthsWeaknesses({ card }: { card: TacticalPlayerCard }) {
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <section className="player-sheet-grid">
      <article className="player-sheet-block strength">
        <div className="player-sheet-block-heading">
          <span>Fortalezas reales</span>
        </div>
        <ul>
          {analysis.strengths.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
      <article className="player-sheet-block weakness">
        <div className="player-sheet-block-heading">
          <span>Debilidades explotables</span>
        </div>
        <ul>
          {analysis.weaknesses.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function PlayerDefensivePlan({ card }: { card: TacticalPlayerCard }) {
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <article className="player-sheet-block plan defense">
      <div className="player-sheet-block-heading">
        <span>Plan defensivo</span>
        <strong>Regla de staff</strong>
      </div>
      <ul>
        {analysis.defensiveInstructions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function PlayerAttackPlan({ card }: { card: TacticalPlayerCard }) {
  const analysis = buildShotAnalysis(card.name, card.shots, card.player);
  return (
    <article className="player-sheet-block plan attack">
      <div className="player-sheet-block-heading">
        <span>Como atacarlo</span>
        <strong>Uso ofensivo propio</strong>
      </div>
      <ul>
        {analysis.attackInstructions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function PlayerTacticalSheet({
  card,
  players,
  games,
  onClose,
  onSelect,
  onOpenFull
}: {
  card: TacticalPlayerCard;
  players: TacticalPlayerCard[];
  games: GameRow[];
  onClose: () => void;
  onSelect: (name: string) => void;
  onOpenFull: () => void;
}) {
  const index = Math.max(0, players.findIndex((player) => sameShotPlayer(player.name, card.name)));
  const previous = players[(index - 1 + players.length) % players.length] ?? card;
  const next = players[(index + 1) % players.length] ?? card;
  const latest = latestShotGameForPlayer(card.shots, games);
  const latestCard: TacticalPlayerCard = { ...card, shots: latest.shots };

  return (
    <div className="player-sheet-layer" role="presentation">
      <button className="player-sheet-backdrop" onClick={onClose} type="button" aria-label="Cerrar ficha tactica" />
      <aside aria-modal="true" className="player-sheet" role="dialog" aria-labelledby="player-sheet-title">
        <PlayerTacticalHeader
          card={latestCard}
          index={index}
          total={players.length}
          onClose={onClose}
          onPrevious={() => onSelect(previous.name)}
          onNext={() => onSelect(next.name)}
        />
        <div className="player-sheet-body">
          <PlayerShotChartSummary card={latestCard} contextLabel={latest.label} />
          <PlayerDecisionProfile card={latestCard} />
          <PlayerStrengthsWeaknesses card={latestCard} />
          <section className="player-sheet-grid">
            <PlayerDefensivePlan card={latestCard} />
            <PlayerAttackPlan card={latestCard} />
          </section>
          <button className="primary-button player-full-button" onClick={onOpenFull} type="button">
            Ver analisis completo
          </button>
        </div>
      </aside>
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
  return game.gameId?.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ?? game.notes?.match(/(?:FIBA|Genius)\s+(\d+)/)?.[1];
}

function matchIdFromShot(shot: ShotRow) {
  return (
    shot.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ??
    shot.sourceUrl.match(/\/data\/(\d+)/)?.[1] ??
    shot.sourceUrl.match(/\/u\/[^/]+\/(\d+)/)?.[1]
  );
}

function latestShotGameForPlayer(shots: ShotRow[], games: GameRow[]) {
  if (shots.length === 0) {
    return { shots: [] as ShotRow[], label: "Sin tiros confirmados en el ultimo partido disponible." };
  }

  for (const game of games) {
    const gameMatchId = matchIdFromGame(game);
    const gameShots = shots.filter((shot) => {
      const shotMatchId = matchIdFromShot(shot);
      return shot.gameId === game.gameId || Boolean(gameMatchId && shotMatchId === gameMatchId);
    });

    if (gameShots.length > 0) {
      const score = game.homeScore && game.awayScore ? `${game.homeScore}-${game.awayScore}` : "sin marcador";
      return {
        shots: gameShots,
        label: `${game.date} · ${game.homeTeam} ${score} ${game.awayTeam}`
      };
    }
  }

  const fallbackGameIds = [...new Set(shots.map((shot) => matchIdFromShot(shot) ?? shot.gameId))].sort();
  const latestGameId = fallbackGameIds[fallbackGameIds.length - 1];
  const fallbackShots = latestGameId
    ? shots.filter((shot) => (matchIdFromShot(shot) ?? shot.gameId) === latestGameId)
    : shots;

  return {
    shots: fallbackShots,
    label: latestGameId ? `Ultimo partido importado · ${latestGameId}` : "Ultimo partido importado"
  };
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

function hasImportedGameDetail(game: GameRow, data: DatasetMap) {
  if (isUploadedGame(game.gameId, game.notes)) {
    return true;
  }

  const gameMatchId = matchIdFromGame(game);
  const hasShots = (data.shots ?? []).some((shot) => {
    const shotMatchId = matchIdFromShot(shot);
    return shot.gameId === game.gameId || Boolean(gameMatchId && shotMatchId === gameMatchId);
  });
  const hasPlayerStats = (data.playerGameStats ?? []).some((stat) => {
    const statMatchId = matchIdFromPlayerGameStat(stat);
    return stat.gameId === game.gameId || Boolean(gameMatchId && statMatchId === gameMatchId);
  });

  return hasShots || hasPlayerStats;
}

function hasOfficialGameResult(game: GameRow) {
  return game.status === "Final" && Boolean(game.homeScore) && Boolean(game.awayScore);
}

function gameLoadStatus(game: GameRow, data: DatasetMap) {
  if (hasImportedGameDetail(game, data)) {
    return { label: "Completo", tone: "uploaded", caption: "Boxscore y carta disponibles" };
  }
  if (hasOfficialGameResult(game)) {
    return { label: "Resultado", tone: "official", caption: "Marcador oficial sincronizado" };
  }
  return { label: "Pendiente", tone: "pending", caption: "Falta marcador o data.json" };
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
  const importedGames = current.games.filter((game) => game.competition === competition && hasImportedGameDetail(game, current));
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
    if (game.gameId.startsWith("GENIUS-")) {
      return false;
    }
    return !officialKeys.has(fixtureKey(game)) && (!matchId || !officialMatchIds.has(matchId));
  });

  return applyBoxscoreImports({
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
  }, []);
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
  const importedGames = normalizedCurrent.games.filter((game) => game.competition === LIGA_DOS_COMPETITION && hasImportedGameDetail(game, normalizedCurrent));
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
  const compact = height < 82;
  const valueSize = compact ? 14 : 18;
  const valueLineHeight = compact ? 16 : 20;
  const valueMaxLines = compact ? 1 : 2;
  const captionSize = compact ? 8.6 : 9.5;
  const captionLineHeight = compact ? 10.5 : 12;
  const captionMaxLines = compact ? 1 : 2;
  addText(commands, label.toUpperCase(), x + 12, y - 22, 8.5, accent, "F2");
  addWrappedText(commands, value, x + 16, compact ? y - 40 : y - 48, width - 30, valueSize, [0.06, 0.08, 0.07], "F2", valueLineHeight, valueMaxLines);
  addWrappedText(commands, caption, x + 12, compact ? y - height + 18 : y - height + 28, width - 24, captionSize, [0.36, 0.42, 0.39], "F1", captionLineHeight, captionMaxLines);
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
  addLine(commands, 36, 24, 924, 24, [0.84, 0.86, 0.84], 0.8);
  addText(commands, "DOS Scout Pro · Dossier tactico", 38, 10, 8, [0.36, 0.42, 0.39], "F2");
  addText(commands, `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`, 340, 10, 8, [0.36, 0.42, 0.39], "F1");
  addText(commands, page, 884, 10, 8, primary, "F2");
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

function addSingleRadarChart(
  commands: string[],
  metrics: Array<{ label: string; value: number }>,
  x: number,
  y: number,
  radius: number,
  color: PdfRgb,
  label: string
) {
  const centerX = x + radius;
  const centerY = y + radius;
  const pointFor = (value: number, index: number, scale = 1): [number, number] => {
    const angle = -Math.PI / 2 + (index / metrics.length) * Math.PI * 2;
    const r = radius * scale * clampPdf(value, 0, 100) / 100;
    return [Number((centerX + Math.cos(angle) * r).toFixed(2)), Number((centerY + Math.sin(angle) * r).toFixed(2))];
  };

  [0.33, 0.66, 1].forEach((scale) => {
    const ring = metrics.map((_, index) => pointFor(100, index, scale));
    addPolygon(commands, ring, [0.98, 0.99, 0.98], [0.84, 0.87, 0.84], 0.8);
  });

  metrics.forEach((metric, index) => {
    const edge = pointFor(100, index);
    addLine(commands, centerX, centerY, edge[0], edge[1], [0.84, 0.87, 0.84], 0.8);
    const labelPoint = pointFor(118, index);
    addWrappedText(commands, metric.label, labelPoint[0] - 34, labelPoint[1] + 5, 68, 8.2, [0.36, 0.42, 0.39], "F2", 9.5, 2);
  });

  addPolygon(commands, metrics.map((metric, index) => pointFor(metric.value, index)), [0.88, 0.97, 0.94], color, 2.2);
  addText(commands, label, x + 8, y - 12, 9, color, "F2");
}

function addMomentumLineChart(
  commands: string[],
  quarters: MatchupScout["quarterModel"],
  x: number,
  y: number,
  width: number,
  height: number,
  primary: PdfRgb
) {
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const amber: PdfRgb = [0.96, 0.62, 0.04];
  const maxValue = Math.max(...quarters.flatMap((quarter) => [quarter.pointsFor, quarter.pointsAgainst]), 1);
  const chartBottom = y + height - 26;
  const chartTop = y + 18;
  const chartHeight = chartBottom - chartTop;
  const stepX = quarters.length > 1 ? width / (quarters.length - 1) : width;
  const pointFor = (value: number, index: number) => ({
    x: x + index * stepX,
    y: chartBottom - (value / maxValue) * chartHeight
  });

  [0, 0.5, 1].forEach((ratio) => {
    const guideY = chartBottom - chartHeight * ratio;
    addLine(commands, x, guideY, x + width, guideY, [0.9, 0.92, 0.9], 0.8);
    addText(commands, formatPdfNumber(maxValue * ratio), x - 22, guideY - 2, 7.5, [0.42, 0.47, 0.44], "F1");
  });

  const ownPoints = quarters.map((quarter, index) => pointFor(quarter.pointsFor, index));
  const rivalPoints = quarters.map((quarter, index) => pointFor(quarter.pointsAgainst, index));
  const bestQuarter = [...quarters].sort((a, b) => b.differential - a.differential)[0]?.quarter;
  const riskQuarter = [...quarters].sort((a, b) => a.differential - b.differential)[0]?.quarter;

  ownPoints.forEach((point, index) => {
    if (index === 0) {
      return;
    }
    const previous = ownPoints[index - 1];
    addLine(commands, previous.x, previous.y, point.x, point.y, primary, 2.2);
  });

  rivalPoints.forEach((point, index) => {
    if (index === 0) {
      return;
    }
    const previous = rivalPoints[index - 1];
    addLine(commands, previous.x, previous.y, point.x, point.y, red, 2.2);
  });

  ownPoints.forEach((point, index) => {
    const quarter = quarters[index];
    const markerColor = quarter.quarter === bestQuarter ? amber : primary;
    addDot(commands, point.x, point.y, quarter.quarter === bestQuarter ? 10 : 8, markerColor, [1, 1, 1]);
    addText(commands, quarter.quarter, point.x - 8, chartBottom + 18, 8.5, [0.36, 0.42, 0.39], "F2");
  });

  rivalPoints.forEach((point, index) => {
    const quarter = quarters[index];
    const markerColor = quarter.quarter === riskQuarter ? amber : red;
    addDot(commands, point.x, point.y, quarter.quarter === riskQuarter ? 10 : 8, markerColor, [1, 1, 1]);
  });

  addText(commands, "Propio", x + width - 110, y + 16, 8.5, primary, "F2");
  addText(commands, "Rival", x + width - 56, y + 16, 8.5, red, "F2");
}

function zoneInference(zone: string, side: string, threeRate: number) {
  if (zone === "triple frontal/45" && side === "eje central") {
    return "La concentracion en frontal/45 con eje central sugiere ventaja creada desde pick central, drag o mano a mano arriba.";
  }
  if (zone === "esquina") {
    return "La carga en esquina sugiere ofensiva que busca colapso, extra-pass y castigo a rotaciones largas.";
  }
  if (zone === "pintura") {
    return "La pintura domina la muestra: hay lectura de primera ventaja, corte fuerte o pick para atacar el aro antes del segundo pase.";
  }
  if (threeRate >= 0.45) {
    return "El volumen exterior indica que vale negar recepcion limpia y cerrar balance antes de ayudar desde el lado fuerte.";
  }
  return "La distribucion no depende de una sola zona: el plan debe quitar la primera ventaja y obligar a la segunda decision.";
}

function buildTeamShotLoadAnalysis(shots: ShotRow[], players: MatchupScout["rivalPlayers"]) {
  const summary = shotSummary(shots);
  const playerLoads = players
    .map((player) => {
      const playerShots = shots.filter((shot) => sameShotRowForPlayer(player, player.name, shot, players));
      return {
        player,
        attempts: playerShots.length,
        efficiency: shotSummary(playerShots).efficiency,
        shots: playerShots
      };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((entryA, entryB) => entryB.attempts - entryA.attempts);
  const topThree = playerLoads.slice(0, 3);
  const topThreeAttempts = topThree.reduce((total, entry) => total + entry.attempts, 0);
  const restAttempts = Math.max(0, shots.length - topThreeAttempts);
  const threeRate = summary.threeAttempts / Math.max(summary.attempts, 1);
  const topNames = topThree.map((entry) => `${entry.player.name} (${entry.attempts})`);
  return {
    summary,
    playerLoads,
    topThree,
    topThreeAttempts,
    restAttempts,
    shareTopThree: shots.length > 0 ? Math.round((topThreeAttempts / shots.length) * 100) : 0,
    zoneNarrative: zoneInference(summary.topZone, summary.topSide, threeRate),
    topNames
  };
}

function addPlayerShotMiniCard(
  commands: string[],
  focus: {
    player: MatchupScout["rivalPlayers"][number];
    shots: ShotRow[];
    label: string;
    summary: ReturnType<typeof shotSummary>;
    analysis: ReturnType<typeof buildShotAnalysis>;
  },
  x: number,
  y: number,
  width: number,
  height: number,
  accent: PdfRgb
) {
  addShadowRect(commands, x, y - height, width, height, [1, 1, 1], [0.87, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, accent);
  addText(commands, focus.player.name, x + 14, y - 24, 12.5, [0.06, 0.08, 0.07], "F2");
  addText(commands, `${focus.player.role} · ${formatPdfNumber(focus.player.minutes)} MIN/PJ · ${formatPdfNumber(focus.player.points)} PTS/PJ`, x + 14, y - 42, 8.4, [0.36, 0.42, 0.39], "F1");
  addRect(commands, x + 14, y - 164, 168, 100, [0.96, 0.98, 0.97], [0.82, 0.85, 0.82]);
  if (focus.shots.length > 0) {
    addShotCourt(commands, focus.shots, x + 22, y - 156, 152, 84, accent);
  } else {
    addWrappedText(commands, "Sin carta confirmada en el ultimo partido.", x + 30, y - 102, 138, 10, [0.36, 0.42, 0.39], "F2", 12, 3);
  }
  addMetricCard(commands, "Ultimo partido", focus.label, `${focus.summary.attempts} tiros · ${focus.summary.efficiency}`, x + 198, y - 64, width - 212, 70, accent);
  addInsightListCard(commands, "Lectura tactica", [focus.analysis.decisions[0], focus.analysis.strengths[0], focus.analysis.defensiveInstructions[0]], x + 198, y - 144, width - 212, 120, accent);
}

type PlayerDefenseFocus = {
  player: MatchupScout["rivalPlayers"][number];
  shots: ShotRow[];
  label: string;
  summary: ReturnType<typeof shotSummary>;
  analysis: ReturnType<typeof buildShotAnalysis>;
  rank: number;
  tag: string;
  source: "titular" | "banca";
};

function buildPlayerDefenseFocus(model: MatchupScout, shots: ShotRow[] = [], shotGames: GameRow[] = []) {
  const mainThreat = model.rivalPlayers[0]?.name;
  const starters = model.rivalRotation.starters.filter((name) => !mainThreat || !sameShotPlayer(name, mainThreat)).slice(0, 4);
  const bench = model.rivalRotation.firstChanges
    .filter((name) => !mainThreat || !sameShotPlayer(name, mainThreat))
    .filter((name) => !starters.some((starter) => sameShotPlayer(starter, name)))
    .slice(0, 2);
  const names = uniqueNames([mainThreat, ...starters, ...bench, ...model.rivalPlayers.slice(0, 12).map((player) => player.name)]).slice(0, 7);

  return names
    .map((name, index) => {
      const player = model.rivalPlayers.find((item) => sameShotPlayer(item.name, name));
      if (!player) {
        return null;
      }
      const playerShots = shots.filter((shot) => sameShotRowForPlayer(player, name, shot, model.rivalPlayers));
      const latest = latestShotGameForPlayer(playerShots, shotGames);
      const isMainThreat = Boolean(mainThreat && sameShotPlayer(name, mainThreat));
      const benchIndex = bench.findIndex((item) => sameShotPlayer(item, name));
      return {
        player,
        shots: latest.shots,
        label: latest.label,
        summary: shotSummary(latest.shots),
        analysis: buildShotAnalysis(player.name, latest.shots, player),
        rank: index + 1,
        tag: isMainThreat ? "Amenaza principal" : benchIndex === 0 ? "1er cambio" : benchIndex === 1 ? "2do cambio" : "Titular relevante",
        source: benchIndex >= 0 ? "banca" : "titular"
      } satisfies PlayerDefenseFocus;
    })
    .filter((item): item is PlayerDefenseFocus => Boolean(item));
}

function quarterVolumeCounts(shots: ShotRow[]) {
  return [1, 2, 3, 4].map((period) => ({
    label: `${period}C`,
    attempts: shots.filter((shot) => shot.period === period).length
  }));
}

function addQuarterVolumeStrip(
  commands: string[],
  shots: ShotRow[],
  x: number,
  y: number,
  width: number,
  accent: PdfRgb
) {
  const counts = quarterVolumeCounts(shots);
  const maxAttempts = Math.max(...counts.map((item) => item.attempts), 1);
  counts.forEach((item, index) => {
    const colX = x + index * (width / 4);
    addText(commands, item.label, colX + 6, y + 14, 7.8, [0.36, 0.42, 0.39], "F2");
    addRect(commands, colX + 4, y, width / 4 - 12, 8, [0.9, 0.93, 0.91]);
    addRect(commands, colX + 4, y, Math.max(4, ((width / 4 - 12) * item.attempts) / maxAttempts), 8, accent);
    addText(commands, `${item.attempts}`, colX + width / 4 - 18, y + 14, 7.8, [0.08, 0.09, 0.08], "F2");
  });
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
  const nameBottom = addWrappedText(commands, player.name, x + 42, y - 20, width - 54, 14, [0.06, 0.08, 0.07], "F2", 16, 2);
  addText(commands, player.role, x + 42, nameBottom - 6, 9.5, [0.36, 0.42, 0.39], "F1");
  addText(commands, `MIN ${formatPdfNumber(player.minutes)}   PTS ${formatPdfNumber(player.points)}   REB ${formatPdfNumber(player.rebounds)}   AST ${formatPdfNumber(player.assists)}`, x + 12, nameBottom - 28, 9.3, [0.08, 0.09, 0.08], "F2");
  addWrappedText(commands, `Plan: ${player.defensiveKey}`, x + 12, y - height + 48, width - 24, 9.4, [0.22, 0.28, 0.25], "F1", 11, 2);
  addWrappedText(commands, `Gatillo: ${player.decisionTrigger}`, x + 12, y - height + 24, width - 24, 8.4, [0.36, 0.42, 0.39], "F1", 10, 1);
}

function addInsightListCard(
  commands: string[],
  title: string,
  items: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  accent: PdfRgb,
  footer?: string
) {
  addShadowRect(commands, x, y - height, width, height, [1, 1, 1], [0.87, 0.88, 0.86]);
  addRect(commands, x, y - 5, width, 5, accent);
  addText(commands, title.toUpperCase(), x + 12, y - 22, 8.5, accent, "F2");
  const footerReserve = footer ? 28 : 0;
  const availableHeight = Math.max(24, height - 52 - footerReserve);
  const maxVisibleRows = Math.max(1, Math.min(3, Math.floor(availableHeight / 34)));
  items.slice(0, maxVisibleRows).forEach((item, index) => {
    const rowY = y - 48 - index * 34;
    addRect(commands, x + 12, rowY - 16, width - 24, 24, [0.985, 0.989, 0.985], [0.9, 0.92, 0.9]);
    addRect(commands, x + 12, rowY - 16, 4, 24, accent);
    addWrappedText(commands, item, x + 24, rowY - 2, width - 40, 9.2, [0.22, 0.28, 0.25], "F1", 11, 2);
  });
  if (footer) {
    addWrappedText(commands, footer, x + 12, y - height + 28, width - 24, 8.5, [0.36, 0.42, 0.39], "F1", 10, 2);
  }
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

export function buildTacticalDossierPdf(model: MatchupScout, shots: ShotRow[] = [], shotGames: GameRow[] = []) {
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
  const radarMetrics = [
    { label: "Ataque", ...pairScores(getPointsForPerGame(own), getPointsForPerGame(rival)) },
    { label: "Defensa", ...pairScores(getPointsAgainstPerGame(own), getPointsAgainstPerGame(rival), true) },
    { label: "Rebote", ...pairScores(getReboundsPerGame(own), getReboundsPerGame(rival)) },
    { label: "Creacion", ...pairScores(getAssistsPerGame(own), getAssistsPerGame(rival)) },
    { label: "Diferencial", own: clampPdf(50 + (getPointDifferential(own) - getPointDifferential(rival)) * 4, 10, 90), rival: clampPdf(50 + (getPointDifferential(rival) - getPointDifferential(own)) * 4, 10, 90) },
    { label: "Prediccion", own: model.prediction.ownWinProbability, rival: model.prediction.rivalWinProbability }
  ];
  const ownRadarMetrics = radarMetrics.map((metric) => ({ label: metric.label, value: metric.own }));
  const rivalRadarMetrics = radarMetrics.map((metric) => ({ label: metric.label, value: metric.rival }));
  const ownRecent = recentTeamMetrics(model.ownTeam);
  const rivalRecent = recentTeamMetrics(model.rivalTeam);
  const ownSeason = seasonTeamMetrics(own);
  const rivalSeason = seasonTeamMetrics(rival);
  const latestRivalGames = [...shotGames].sort((gameA, gameB) => gameB.date.localeCompare(gameA.date));
  const firstHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "1C" || quarter.quarter === "2C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const secondHalfDiff = model.quarterModel
    .filter((quarter) => quarter.quarter === "3C" || quarter.quarter === "4C")
    .reduce((total, quarter) => total + quarter.differential, 0);
  const sourceCount = Math.max(model.sourceTrace.length, model.ownTeam.recentGames.length + model.rivalTeam.recentGames.length);
  const featuredShotPlayers = model.rivalPlayers.slice(0, 4).map((player) => {
    const playerShots = shots.filter((shot) => sameShotRowForPlayer(player, player.name, shot, model.rivalPlayers));
    const latest = latestShotGameForPlayer(playerShots, latestRivalGames);
    return {
      player,
      shots: latest.shots,
      label: latest.label,
      summary: shotSummary(latest.shots),
      analysis: buildShotAnalysis(player.name, latest.shots, player)
    };
  });
  const shotPages = featuredShotPlayers.slice(0, 3);
  const totalPages = 12;
  const pages: string[] = [];

  const cover: string[] = [];
  addRect(cover, 0, 0, 960, 540, [0.94, 0.96, 0.95]);
  addRect(cover, 0, 0, 382, 540, dark);
  addRect(cover, 0, 0, 382, 14, primary);
  addRect(cover, 38, 72, 282, 2, primary);
  addText(cover, "DOS SCOUT PRO", 38, 493, 10, [0.96, 0.85, 0.25], "F2");
  addText(cover, "DOSSIER TACTICO", 38, 462, 11, [0.78, 0.82, 0.78], "F2");
  addWrappedText(cover, `${own.name} vs ${rival.name}`, 38, 410, 285, 34, [1, 1, 1], "F2", 36, 3);
  addText(cover, `${dossierLeague.label} · generado ${generatedAt}`, 40, 284, 11, [0.78, 0.82, 0.78], "F1");
  addWrappedText(cover, model.rivalIdentity.summary, 40, 240, 285, 17, [1, 1, 1], "F2", 20, 4);
  addPill(cover, confidencePdf(model.rivalIdentity.evidence, model.rivalIdentity.confidence), 40, 138, [1, 0.96, 0.82], [0.5, 0.32, 0.02], 198);
  addText(cover, "Documento curado desde la plataforma: menos ruido, mas decisiones accionables de staff.", 40, 94, 10, [0.78, 0.82, 0.78], "F1");
  addMetricCard(cover, "Record propio", model.ownTeam.recentRecord, `${formatPdfNumber(getPointsForPerGame(own))} PF/PJ · DIF ${signedPdfNumber(getPointDifferential(own))}`, 430, 470, 150, 92, primary);
  addMetricCard(cover, "Record rival", model.rivalTeam.recentRecord, `${formatPdfNumber(getPointsForPerGame(rival))} PF/PJ · DIF ${signedPdfNumber(getPointDifferential(rival))}`, 596, 470, 150, 92, red);
  addMetricCard(cover, "Win prob.", `${model.prediction.ownWinProbability}%`, model.prediction.marginRange, 762, 470, 150, 92, amber);
  addMetricCard(cover, "Amenaza rival", topThreat?.name ?? "Sin muestra", topThreat ? `${topThreat.role} · ${formatPdfNumber(topThreat.points)} PTS/PJ` : "Pendiente de datos", 430, 342, 222, 112, red);
  addMetricCard(cover, "Ventaja propia", topOwn?.name ?? "Sin muestra", topOwn ? `${topOwn.role} · impacto ${formatPdfNumber(topOwn.recentImpactIndex)}` : "Pendiente de datos", 676, 342, 236, 112, primary);
  addMetricCard(cover, "Cuarto de quiebre", bestQuarter?.quarter ?? "s/d", bestQuarter ? `${signedPdfNumber(bestQuarter.differential)} · ${bestQuarter.recommendation}` : "Sin modelo suficiente", 430, 196, 222, 112, amber);
  addMetricCard(cover, "Base estadistica", `${formatPdfNumber(getReboundsPerGame(own))} vs ${formatPdfNumber(getReboundsPerGame(rival))}`, `REB/PJ · AST ${formatPdfNumber(getAssistsPerGame(own))} vs ${formatPdfNumber(getAssistsPerGame(rival))}`, 676, 196, 236, 112, primary);
  addFooter(cover, `01 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(cover.join("\n"));

  const quick: string[] = [];
  addHeader(quick, "Si solo tienes 30 segundos", "Lo que el entrenador debe recordar antes de entrar a cancha", `02 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(quick, 42, 302, 876, 100, dark);
  addText(quick, "PLAN MADRE", 62, 370, 10, [0.96, 0.85, 0.25], "F2");
  addWrappedText(quick, model.decisionBrief[0]?.action ?? "Controlar ritmo, rebote y primera ventaja rival.", 62, 340, 540, 25, [1, 1, 1], "F2", 28, 2);
  addText(quick, `${model.prediction.ownWinProbability}% victoria propia`, 704, 356, 24, [1, 1, 1], "F2");
  addBar(quick, 706, 326, 160, model.prediction.ownWinProbability, 100, primary);
  addText(quick, `Margen esperado ${model.prediction.marginRange}`, 706, 304, 10, [0.78, 0.82, 0.78], "F1");
  model.decisionBrief.slice(0, 4).forEach((decision, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 42 + col * 438;
    const y = 252 - row * 112;
    const tone: PdfRgb = decision.tone === "risk" ? red : decision.tone === "advantage" ? primary : amber;
    addMetricCard(quick, decision.label, decision.value, decision.action, x, y, 416, 94, tone);
  });
  addFooter(quick, `02 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(quick.join("\n"));

  const identity: string[] = [];
  addHeader(identity, "Identidad rival", "Como juega, de que depende y desde donde hay que sacarlo", `03 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(identity, 42, 270, 402, 146, dark);
  addText(identity, "IDENTIDAD RIVAL", 62, 386, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(identity, model.rivalIdentity.summary, 62, 354, 330, 22, [1, 1, 1], "F2", 25, 3);
  addText(identity, `Ritmo: ${model.rivalIdentity.rhythm}`, 62, 286, 10, [0.78, 0.82, 0.78], "F1");
  addMetricCard(identity, "Ofensiva", model.rivalIdentity.offensiveStyle, "Carga ofensiva y patron de ritmo", 472, 416, 204, 112, primary);
  addMetricCard(identity, "Defensa", model.rivalIdentity.defensiveStyle, model.rivalIdentity.clutchBehavior, 704, 416, 204, 112, red);
  addMetricCard(identity, "Dependencia", model.rivalIdentity.playerDependency, "Top 3 ofensivo y volumen de tiro", 472, 270, 204, 112, amber);
  addMetricCard(identity, "Clutch", model.rivalIdentity.clutchBehavior, "Revisar cierres con video", 704, 270, 204, 112, primary);
  addInsightListCard(identity, "Como bajarlo", [
    model.comparison[1]?.value ?? "Quitar primera ventaja y bajar ritmo.",
    model.tacticalKeysCore[0]?.action ?? "Subir fisico sobre la primera amenaza.",
    model.rivalIdentity.clutchBehavior
  ], 42, 194, 280, 108, red, "Lectura de staff para el primer timeout.");
  addInsightListCard(identity, "Donde depende", [
    model.rivalIdentity.playerDependency,
    topThreat ? `${topThreat.name} · ${formatPdfNumber(topThreat.points)} PTS/PJ · ${formatPdfNumber(topThreat.minutes)} MIN/PJ` : "Sin amenaza principal confirmada.",
    model.rivalIdentity.offensiveStyle
  ], 342, 194, 280, 108, amber, "Cargar ayudas segun top 3 ofensivo.");
  addInsightListCard(identity, "Que no regalar", [
    model.rivalIdentity.defensiveStyle,
    model.comparison[2]?.value ?? "No perder rebote ni balance defensivo.",
    model.decisionBrief[1]?.action ?? "Sacar de ritmo sus primeras dos posesiones."
  ], 642, 194, 276, 108, primary, "Si entra comodo al ritmo, sube su produccion.");
  addFooter(identity, `03 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(identity.join("\n"));

  const players: string[] = [];
  addHeader(players, "Jugadores clave", "Amenaza principal, titulares de carga y primer ajuste de banca", `04 / ${String(totalPages).padStart(2, "0")}`, primary);
  model.rivalPlayers.slice(0, 4).forEach((player, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    addPlayerDossierCard(players, player, index, 42 + col * 438, 396 - row * 154, 416, 132, primary);
  });
  addInsightListCard(players, "Regla staff", [
    `Si ${topThreat?.name ?? "la amenaza principal"} supera su umbral, cambiar cobertura antes de que entre en ritmo.`,
    model.tacticalKeysCore[0]?.trigger ?? "No esperar timeout para ajustar la primera ventaja.",
    model.comparison[0]?.value ?? "Cargar el partido donde exista mayor margen colectivo."
  ], 42, 86, 876, 88, amber);
  addFooter(players, `04 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(players.join("\n"));

  shotPages.forEach((focus, index) => {
    const shotPage: string[] = [];
    const shotPageNumber = 5 + index;
    addHeader(
      shotPage,
      "Lectura rival desde ultima carta de tiro",
      `${focus.player.name} · ${focus.player.role} · ${focus.label}`,
      `${String(shotPageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`,
      primary
    );
    addRect(shotPage, 42, 180, 470, 206, [1, 1, 1], [0.86, 0.88, 0.86]);
    addSectionKicker(shotPage, index === 0 ? "Amenaza 1" : index === 1 ? "Amenaza 2" : "Amenaza 3", 66, 364, index === 0 ? red : primary);
    if (focus.shots.length > 0) {
      addShotCourt(shotPage, focus.shots, 76, 214, 394, 132, primary);
      addText(shotPage, "Convertido", 76, 190, 8.5, primary, "F2");
      addText(shotPage, "Fallado", 156, 190, 8.5, red, "F2");
    } else {
      addRect(shotPage, 76, 214, 394, 132, [0.96, 0.98, 0.97], [0.78, 0.82, 0.79]);
      addWrappedText(shotPage, "Sin carta de tiro confirmada en el ultimo partido. Reimporta Estadisticas completas para sostener la lectura espacial.", 108, 286, 328, 15, [0.36, 0.42, 0.39], "F2", 18, 3);
    }
    addMetricCard(shotPage, "Jugador foco", focus.player.name, `${formatPdfNumber(focus.player.minutes)} MIN/PJ · ${formatPdfNumber(focus.player.points)} PTS/PJ`, 544, 334, 350, 70, index === 0 ? red : primary);
    addMetricCard(shotPage, "Perfil", focus.analysis.profile, focus.analysis.style, 544, 252, 350, 70, primary);
    addMetricCard(
      shotPage,
      "Ultimo partido",
      `${focus.summary.attempts} tiros · ${focus.summary.efficiency}`,
      focus.summary.attempts > 0
        ? `${focus.summary.topZone} · ${focus.summary.topQuarter} · ${focus.summary.threeMade}/${focus.summary.threeAttempts} en triples`
        : "Sin coordenadas confirmadas para este foco",
      544,
      170,
      350,
      70,
      amber
    );
    addInsightListCard(
      shotPage,
      "Plan defensivo",
      focus.analysis.defensiveInstructions,
      42,
      168,
      852,
      58,
      amber,
      "Regla simple para staff: comunicar esta consigna antes de la primera cobertura."
    );
    addInsightListCard(shotPage, "Decisiones tipicas", focus.analysis.decisions, 42, 98, 274, 42, primary);
    addInsightListCard(shotPage, "Fortalezas reales", focus.analysis.strengths, 330, 98, 274, 42, primary);
    addInsightListCard(shotPage, "Debilidades explotables", focus.analysis.weaknesses, 618, 98, 276, 42, red);
    addFooter(shotPage, `${String(shotPageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, model, primary);
    pages.push(shotPage.join("\n"));
  });

  const rotationPage: string[] = [];
  addHeader(rotationPage, "Rotacion rival", "Quien inicia, quien cambia el ritmo y quien probablemente cierra", `08 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(rotationPage, 42, 300, 876, 110, [1, 0.95, 0.94], [0.92, 0.76, 0.76]);
  addText(rotationPage, "LECTURA DEFENSIVA", 62, 382, 9, red, "F2");
  addWrappedText(rotationPage, `La prioridad es sacar de ritmo a ${topThreat?.name ?? "la primera amenaza"} y no regalar confianza a la segunda unidad.`, 62, 350, 560, 22, dark, "F2", 25, 3);
  addText(rotationPage, `${model.rivalRotation.lineupStability} · ${model.rivalRotation.benchDependency}`, 650, 362, 10, muted, "F1");
  addRotationList(rotationPage, "Quinteto rival", model.rivalRotation.starters, 42, 252, 280, red);
  addRotationList(rotationPage, "Primeros cambios", model.rivalRotation.firstChanges, 342, 252, 280, amber);
  addRotationList(rotationPage, "Cierre rival", model.rivalRotation.closers, 642, 252, 276, red);
  addThreeColumnInsight(rotationPage, "Banco rival", model.rivalRotation.benchDependency, model.rivalRotation.benchImpact, 42, 126, 270, red);
  addThreeColumnInsight(rotationPage, "Clutch", model.rivalRotation.pressureClosers, "No cambiar automatico si el rival busca aislar al scorer. Comunicar cobertura antes de cada bloqueo.", 344, 126, 270, amber);
  addThreeColumnInsight(rotationPage, "Confianza", `${Math.round(model.rivalRotation.confidence * 100)}%`, model.rivalRotation.rule, 646, 126, 272, red);
  addFooter(rotationPage, `08 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(rotationPage.join("\n"));

  const quarterPage: string[] = [];
  addHeader(quarterPage, "Cuartos y momentum", "Donde atacar, donde resistir y como sostener el cierre", `09 / ${String(totalPages).padStart(2, "0")}`, primary);
  model.quarterModel.forEach((quarter, index) => {
    addQuarterDossierCard(quarterPage, quarter, 42 + index * 223, 408, 204, 182, maxQuarterPoints, maxQuarterDiff, primary, bestQuarter?.quarter, riskQuarter?.quarter);
  });
  addText(quarterPage, "Claves del partido", 42, 186, 18, dark, "F2");
  model.tacticalKeysCore.slice(0, 3).forEach((key, index) => {
    const x = 42 + index * 292;
    addRect(quarterPage, x, 50, 266, 112, [1, 1, 1], [0.87, 0.88, 0.86]);
    addRect(quarterPage, x, 156, 266, 6, index === 0 ? primary : index === 1 ? amber : red);
    addText(quarterPage, `Clave ${index + 1}`, x + 14, 136, 9, index === 2 ? red : primary, "F2");
    addWrappedText(quarterPage, key.title, x + 14, 116, 238, 12, dark, "F2", 14, 2);
    addWrappedText(quarterPage, key.action, x + 14, 82, 238, 9.5, [0.22, 0.28, 0.25], "F1", 12, 3);
  });
  addText(quarterPage, `Atacar: ${bestQuarter?.quarter ?? "s/d"} · Resistir: ${riskQuarter?.quarter ?? "s/d"} · 1T ${signedPdfNumber(firstHalfDiff)} / 2T ${signedPdfNumber(secondHalfDiff)} · Validar con video.`, 42, 34, 9, muted, "F1");
  addFooter(quarterPage, `09 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(quarterPage.join("\n"));

  const comparisonPage: string[] = [];
  addHeader(comparisonPage, "Comparativo y base", "Forma reciente vs base de temporada para decidir donde cargar el partido", `10 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(comparisonPage, 42, 154, 412, 262, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(comparisonPage, "Radar propio", 66, 386, primary);
  addSingleRadarChart(comparisonPage, ownRadarMetrics, 112, 196, 98, primary, own.name);
  addRect(comparisonPage, 506, 154, 412, 262, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(comparisonPage, "Radar rival", 530, 386, red);
  addSingleRadarChart(comparisonPage, rivalRadarMetrics, 576, 196, 98, red, rival.name);
  addRect(comparisonPage, 42, 72, 412, 66, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(comparisonPage, "Forma propia", 66, 116, primary);
  addWrappedText(comparisonPage, `Muestra ${model.ownTeam.sampleRecord}. Base ${formatPdfNumber(ownSeason.points)} PTS/PJ · diferencial ${signedPdfNumber(ownSeason.differential)}.`, 66, 90, 360, 10.2, [0.22, 0.28, 0.25], "F1", 12, 2);
  addRect(comparisonPage, 506, 72, 412, 66, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(comparisonPage, "Forma rival", 530, 116, red);
  addWrappedText(comparisonPage, `Muestra ${model.rivalTeam.sampleRecord}. Base ${formatPdfNumber(rivalSeason.points)} PTS/PJ · diferencial ${signedPdfNumber(rivalSeason.differential)}.`, 530, 90, 360, 10.2, [0.22, 0.28, 0.25], "F1", 12, 2);
  addRect(comparisonPage, 42, 14, 420, 42, [1, 0.96, 0.9], [0.92, 0.82, 0.62]);
  addText(comparisonPage, "Decision", 60, 38, 9, [0.5, 0.32, 0.02], "F2");
  addWrappedText(comparisonPage, model.comparison[0]?.value ?? "Cargar el partido donde exista mayor margen colectivo.", 132, 40, 302, 9.4, [0.22, 0.28, 0.25], "F1", 11, 2);
  addRect(comparisonPage, 506, 14, 412, 42, [1, 1, 1], [0.86, 0.88, 0.86]);
  addText(comparisonPage, "Lectura staff", 530, 38, 9, amber, "F2");
  addWrappedText(comparisonPage, ownRecent.points - ownSeason.points >= rivalRecent.points - rivalSeason.points ? "La forma propia esta por sobre la base: abrir agresivo, pero proteger seleccion de tiro y rebote." : "El rival llega con mejor impulso relativo: bajar posesiones faciles y forzar ejecuciones largas desde el inicio.", 620, 40, 268, 9.2, [0.22, 0.28, 0.25], "F1", 11, 2);
  addFooter(comparisonPage, `10 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(comparisonPage.join("\n"));

  const planPage: string[] = [];
  addHeader(planPage, "Plan final de staff", "Lo que debe quedar claro antes del salto inicial", `11 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(planPage, 42, 316, 876, 96, dark);
  addText(planPage, "PLAN DEL PARTIDO", 62, 382, 9, [0.96, 0.85, 0.25], "F2");
  addWrappedText(planPage, model.decisionBrief[0]?.action ?? "Controlar ritmo, rebote y primera ventaja rival.", 62, 350, 500, 20, [1, 1, 1], "F2", 22, 3);
  addText(planPage, `${model.prediction.ownWinProbability}% victoria propia`, 696, 358, 22, [1, 1, 1], "F2");
  addBar(planPage, 696, 332, 156, model.prediction.ownWinProbability, 100, primary);
  addText(planPage, `Margen esperado ${model.prediction.marginRange}`, 696, 312, 9.5, [0.78, 0.82, 0.78], "F1");
  [
    { title: "1. Primer ajuste", value: model.tacticalKeysCore[0]?.action ?? "Sacar de ritmo a la primera ventaja rival." },
    { title: "2. Ventaja propia", value: model.tacticalKeysCore[1]?.action ?? "Cargar nuestra primera fuente de ventaja." },
    { title: "3. Posesiones", value: model.tacticalKeysCore[2]?.action ?? "Controlar rebote y perdida antes de acelerar." },
    { title: "4. Cuarto de quiebre / cierre", value: `${bestQuarter?.quarter ?? "3C"}: ${bestQuarter?.recommendation ?? "subir agresividad despues del descanso."} · ${riskQuarter?.quarter ?? "4C"}: proteger ritmo y seleccion de tiro.` }
  ].forEach((item, index) => {
    const x = 42 + (index % 2) * 438;
    const y = 250 - Math.floor(index / 2) * 58;
    addRect(planPage, x, y - 22, 418, 38, index === 0 ? [1, 0.96, 0.9] : [1, 1, 1], [0.87, 0.88, 0.86]);
    addText(planPage, item.title, x + 16, y - 1, 9.1, index === 0 ? [0.5, 0.32, 0.02] : primary, "F2");
    addWrappedText(planPage, item.value, x + 140, y + 1, 258, 8.8, [0.22, 0.28, 0.25], "F1", 10.5, 2);
  });
  addInsightListCard(planPage, "Ventaja propia a cargar", [
    topOwn ? `${topOwn.name} · ${topOwn.role} · impacto ${formatPdfNumber(topOwn.recentImpactIndex)}` : "Sin ventaja propia confirmada.",
    "Emparejarlo con el defensor mas vulnerable despues del primer cambio rival.",
    "Si el rival cambia matchup, repetir la busqueda en las siguientes dos posesiones."
  ], 42, 136, 420, 64, primary);
  addInsightListCard(planPage, "Regla simple para jugadores", [
    `Quitar primera ventaja de ${topThreat?.name ?? "la amenaza principal"}.`,
    "No regalar rebote ofensivo ni balance temprano.",
    `En ${bestQuarter?.quarter ?? "3C"} subir agresividad sin romper seleccion de tiro.`
  ], 498, 136, 420, 64, amber);
  addFooter(planPage, `11 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(planPage.join("\n"));

  const validationPage: string[] = [];
  addHeader(validationPage, "Validacion y trazabilidad", "Lo proyectado vs lo real para vender aprendizaje, no solo prediccion", `12 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(validationPage, 42, 346, 876, 64, model.planValidation.headline.toLowerCase().includes("fuera") ? [1, 0.94, 0.94] : [0.9, 0.97, 0.94], [0.86, 0.88, 0.86]);
  addText(validationPage, "VALIDACION DEL PLAN", 62, 384, 9, model.planValidation.headline.toLowerCase().includes("fuera") ? red : primary, "F2");
  addWrappedText(validationPage, model.planValidation.headline, 62, 360, 760, 18, dark, "F2", 22, 2);
  model.planValidation.checks.slice(0, 3).forEach((check, index) => {
    const y = 302 - index * 64;
    const statusColor: PdfRgb = check.status === "logrado" ? primary : check.status === "fallo" ? red : amber;
    addShadowRect(validationPage, 42, y - 42, 876, 50, [1, 1, 1], [0.88, 0.9, 0.88]);
    addText(validationPage, check.label, 62, y - 10, 9.5, dark, "F2");
    addText(validationPage, `${check.projected} -> ${check.actual}`, 252, y - 10, 9.5, muted, "F1");
    addText(validationPage, check.status.toUpperCase(), 520, y - 10, 9, statusColor, "F2");
    addWrappedText(validationPage, check.decision, 640, y - 6, 230, 8.4, [0.22, 0.28, 0.25], "F1", 10, 2);
  });
  addInsightListCard(validationPage, "Trazabilidad", [
    `${sourceCount} fuentes / registros considerados en el dossier.`,
    "Dato confirmado, inferencia y conclusion tactica separados en cada decision.",
    "Usar este documento como base de staff y validar con video si cambia disponibilidad."
  ], 42, 86, 876, 84, amber);
  addFooter(validationPage, `12 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(validationPage.join("\n"));

  return buildPdfDocument(pages);
}

export function buildTechnicalLongPdf(model: MatchupScout, shots: ShotRow[] = [], shotGames: GameRow[] = []) {
  const primary = teamPrimaryColor(model.ownTeam.team.name);
  const dark: PdfRgb = [0.055, 0.075, 0.062];
  const amber: PdfRgb = [0.96, 0.62, 0.04];
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const own = model.ownTeam.team;
  const rival = model.rivalTeam.team;
  const league = competitionCopy(own.competition as CompetitionKey);
  const latestRivalGames = shotGames;
  const topThreat = model.rivalPlayers[0];
  const bestQuarter = [...model.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const riskQuarter = [...model.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  const featuredShotPlayers = model.rivalPlayers.slice(0, 4).map((player) => {
    const playerShots = shots.filter((shot) => sameShotRowForPlayer(player, player.name, shot, model.rivalPlayers));
    const latest = latestShotGameForPlayer(playerShots, latestRivalGames);
    return {
      player,
      shots: latest.shots,
      label: latest.label,
      summary: shotSummary(latest.shots),
      analysis: buildShotAnalysis(player.name, latest.shots, player)
    };
  });
  const shotFocus = featuredShotPlayers.slice(0, 3);
  const loadAnalysis = buildTeamShotLoadAnalysis(shots, model.rivalPlayers);
  const ownRadarMetrics = [
    { label: "Ataque", value: pairScores(getPointsForPerGame(own), getPointsForPerGame(rival)).own },
    { label: "Defensa", value: pairScores(getPointsAgainstPerGame(own), getPointsAgainstPerGame(rival), true).own },
    { label: "Rebote", value: pairScores(getReboundsPerGame(own), getReboundsPerGame(rival)).own },
    { label: "Creacion", value: pairScores(getAssistsPerGame(own), getAssistsPerGame(rival)).own },
    { label: "Diferencial", value: clampPdf(50 + (getPointDifferential(own) - getPointDifferential(rival)) * 4, 10, 90) },
    { label: "Prediccion", value: model.prediction.ownWinProbability }
  ];
  const rivalRadarMetrics = [
    { label: "Ataque", value: pairScores(getPointsForPerGame(own), getPointsForPerGame(rival)).rival },
    { label: "Defensa", value: pairScores(getPointsAgainstPerGame(own), getPointsAgainstPerGame(rival), true).rival },
    { label: "Rebote", value: pairScores(getReboundsPerGame(own), getReboundsPerGame(rival)).rival },
    { label: "Creacion", value: pairScores(getAssistsPerGame(own), getAssistsPerGame(rival)).rival },
    { label: "Diferencial", value: clampPdf(50 + (getPointDifferential(rival) - getPointDifferential(own)) * 4, 10, 90) },
    { label: "Prediccion", value: model.prediction.rivalWinProbability }
  ];
  const totalPages = 8;
  const pages: string[] = [];

  const cover: string[] = [];
  addRect(cover, 0, 0, 960, 540, [0.95, 0.97, 0.96]);
  addRect(cover, 0, 0, 960, 18, primary);
  addRect(cover, 0, 410, 960, 130, dark);
  addText(cover, "REPORTE TECNICO LARGO", 52, 482, 24, [1, 1, 1], "F2");
  addWrappedText(cover, `${own.name} vs ${rival.name}`, 52, 446, 520, 28, [1, 1, 1], "F2", 30, 2);
  addText(cover, `${league.label} · lectura profunda para staff · ${new Date().toLocaleDateString("es-CL")}`, 54, 418, 10.5, [0.78, 0.82, 0.78], "F1");
  addMetricCard(cover, "Ventaja principal", model.decisionBrief[0]?.value ?? "s/d", model.decisionBrief[0]?.action ?? "sin decision automatica", 54, 354, 250, 94, primary);
  addMetricCard(cover, "Riesgo principal", model.decisionBrief[1]?.value ?? "s/d", model.decisionBrief[1]?.action ?? "sin riesgo detectado", 324, 354, 250, 94, red);
  addMetricCard(cover, "Cuarto clave", bestQuarter?.quarter ?? "s/d", bestQuarter?.recommendation ?? "sin tramo de quiebre", 594, 354, 146, 94, amber);
  addMetricCard(cover, "Prediccion", `${model.prediction.ownWinProbability}%`, model.prediction.marginRange, 758, 354, 150, 94, primary);
  addInsightListCard(
    cover,
    "Tres focos del documento",
    [
      `${topThreat?.name ?? "Amenaza principal"} y su ultima carta de tiro disponible.`,
      `Momentum por cuartos con pico en ${bestQuarter?.quarter ?? "s/d"} y riesgo en ${riskQuarter?.quarter ?? "s/d"}.`,
      `${loadAnalysis.shareTopThree}% del volumen rival cae en su top 3 ofensivo.`
    ],
    54,
    206,
    854,
    118,
    primary,
    "Documento largo: combina lectura visual, staff plan y respaldo estadistico sin sobrecargar la toma de decision."
  );
  addFooter(cover, `01 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(cover.join("\n"));

  const radarPage: string[] = [];
  addHeader(radarPage, "Diagnostico visual", "Radares separados para evitar ruido y dejar clara la identidad de cada lado", `02 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(radarPage, 42, 84, 408, 332, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(radarPage, "Radar propio", 66, 386, primary);
  addSingleRadarChart(radarPage, ownRadarMetrics, 98, 132, 112, primary, own.name);
  addRect(radarPage, 510, 84, 408, 332, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(radarPage, "Radar rival", 534, 386, red);
  addSingleRadarChart(radarPage, rivalRadarMetrics, 566, 132, 112, red, rival.name);
  addInsightListCard(
    radarPage,
    "Lectura comparativa",
    [
      `Propio: ${model.comparison[0]?.value ?? "sin señal dominante"}.`,
      `Rival: ${model.rivalIdentity.summary}.`,
      `Prediccion: ${model.prediction.ownWinProbability}% propia · margen ${model.prediction.marginRange}.`
    ],
    42,
    72,
    876,
    84,
    amber
  );
  addFooter(radarPage, `02 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(radarPage.join("\n"));

  const quarterPage: string[] = [];
  addHeader(quarterPage, "Momentum por cuartos", "Linea de puntos a favor y en contra con picos visibles para decidir el plan", `03 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(quarterPage, 42, 170, 876, 246, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(quarterPage, "Tendencia de anotacion", 66, 386, primary);
  addMomentumLineChart(quarterPage, model.quarterModel, 96, 214, 770, 150, primary);
  addRect(quarterPage, 674, 330, 198, 56, [1, 0.97, 0.9], [0.92, 0.84, 0.68]);
  addText(quarterPage, "Pico de momentum", 688, 364, 8.5, [0.5, 0.32, 0.02], "F2");
  addWrappedText(quarterPage, `${bestQuarter?.quarter ?? "s/d"} · ${bestQuarter?.recommendation ?? "sin lectura"}`, 688, 340, 166, 10.2, dark, "F2", 12, 2);
  addRect(quarterPage, 674, 266, 198, 56, [1, 0.94, 0.94], [0.92, 0.76, 0.76]);
  addText(quarterPage, "Cuarto a resistir", 688, 300, 8.5, red, "F2");
  addWrappedText(quarterPage, `${riskQuarter?.quarter ?? "s/d"} · ${riskQuarter?.recommendation ?? "sin lectura"}`, 688, 276, 166, 10.2, dark, "F2", 12, 2);
  model.quarterModel.forEach((quarter, index) => {
    addMetricCard(
      quarterPage,
      quarter.quarter,
      `${formatPdfNumber(quarter.pointsFor)} / ${formatPdfNumber(quarter.pointsAgainst)}`,
      `${signedPdfNumber(quarter.differential)} · ${quarter.recommendation}`,
      42 + index * 220,
      142,
      200,
      80,
      quarter.quarter === bestQuarter?.quarter ? amber : quarter.quarter === riskQuarter?.quarter ? red : primary
    );
  });
  addFooter(quarterPage, `03 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(quarterPage.join("\n"));

  shotFocus.forEach((focus, index) => {
    const shotPage: string[] = [];
    const pageNumber = 4 + index;
    addHeader(
      shotPage,
      "Jugador clave · ultima carta de tiro",
      `${focus.player.name} · ${focus.player.role} · ${focus.label}`,
      `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`,
      primary
    );
    addPlayerShotMiniCard(shotPage, focus, 42, 394, 876, 206, index === 0 ? red : primary);
    addInsightListCard(shotPage, "Decisiones tipicas", focus.analysis.decisions, 42, 164, 270, 128, primary);
    addInsightListCard(shotPage, "Fortalezas reales", focus.analysis.strengths, 330, 164, 270, 128, primary);
    addInsightListCard(shotPage, "Debilidades explotables", focus.analysis.weaknesses, 618, 164, 300, 128, red);
    addInsightListCard(shotPage, "Plan defensivo", focus.analysis.defensiveInstructions, 42, 74, 420, 86, amber);
    addInsightListCard(shotPage, "Como atacarlo", focus.analysis.attackInstructions, 482, 74, 436, 86, primary);
    addFooter(shotPage, `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, model, primary);
    pages.push(shotPage.join("\n"));
  });

  const loadPage: string[] = [];
  addHeader(loadPage, "Carga ofensiva y zonas del rival", "Top 3 vs resto y correlacion tactica desde todas las cartas de tiro disponibles", `07 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(loadPage, 42, 248, 420, 168, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(loadPage, "Carga ofensiva", 66, 386, primary);
  addText(loadPage, "Top 3", 72, 324, 10, primary, "F2");
  addBar(loadPage, 126, 317, 292, loadAnalysis.topThreeAttempts, Math.max(loadAnalysis.topThreeAttempts + loadAnalysis.restAttempts, 1), primary);
  addText(loadPage, `${loadAnalysis.topThreeAttempts} tiros · ${loadAnalysis.shareTopThree}%`, 312, 324, 9, dark, "F2");
  addText(loadPage, "Resto", 72, 286, 10, red, "F2");
  addBar(loadPage, 126, 279, 292, loadAnalysis.restAttempts, Math.max(loadAnalysis.topThreeAttempts + loadAnalysis.restAttempts, 1), red);
  addText(loadPage, `${loadAnalysis.restAttempts} tiros`, 312, 286, 9, dark, "F2");
  addInsightListCard(
    loadPage,
    "Top 3 ofensivo",
    loadAnalysis.topNames.length > 0 ? loadAnalysis.topNames : ["Sin tiros confirmados en la muestra"],
    66,
    218,
    372,
    100,
    primary,
    "Si el volumen esta muy concentrado, vale cambiar cobertura antes que repartir ayudas tarde."
  );
  addRect(loadPage, 490, 248, 428, 168, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(loadPage, "Mapa de zonas", 516, 386, red);
  addMetricCard(loadPage, "Zona dominante", loadAnalysis.summary.topZone, `${loadAnalysis.summary.topZoneCount}/${loadAnalysis.summary.attempts} tiros`, 516, 342, 180, 84, red);
  addMetricCard(loadPage, "Lado dominante", loadAnalysis.summary.topSide, `${loadAnalysis.summary.topQuarter} como cuarto de mayor volumen`, 712, 342, 180, 84, amber);
  addInsightListCard(
    loadPage,
    "Correlacion tactica",
    [
      loadAnalysis.zoneNarrative,
      loadAnalysis.summary.avoidedZones.length > 0 ? `Evitan ${loadAnalysis.summary.avoidedZones.slice(0, 2).join(" y ")}: orientar ayudas hacia esa lectura.` : "No evitan una sola zona: la clave es cortar la ventaja anterior al tiro.",
      loadAnalysis.summary.mostEfficientZone ? `Su mejor eficiencia aparece en ${loadAnalysis.summary.mostEfficientZone.zone}. No regalar esa recepcion.` : "Muestra todavia corta para fijar una zona elite."
    ],
    516,
    218,
    376,
    100,
    amber
  );
  addThreeColumnInsight(loadPage, "Identidad rival", model.rivalIdentity.rhythm, model.rivalIdentity.offensiveStyle, 42, 72, 270, primary);
  addThreeColumnInsight(loadPage, "Dependencia", model.rivalIdentity.playerDependency, loadAnalysis.shareTopThree >= 55 ? "El top 3 explica la mayor parte del volumen: ajustar primero ahi." : "La carga esta mas repartida: priorizar estructura colectiva antes que obsesionarse con un nombre.", 344, 72, 270, red);
  addThreeColumnInsight(loadPage, "Clave staff", `${bestQuarter?.quarter ?? "s/d"} / ${riskQuarter?.quarter ?? "s/d"}`, `Atacar ${bestQuarter?.quarter ?? "s/d"} y proteger ${riskQuarter?.quarter ?? "s/d"} mientras se niega ${loadAnalysis.summary.topZone}.`, 646, 72, 272, amber);
  addFooter(loadPage, `07 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(loadPage.join("\n"));

  const closePage: string[] = [];
  addHeader(closePage, "Rotacion, comparativo y plan final", "Cierre profundo para staff con foco en quintetos y decisiones finales", `08 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRotationList(closePage, "Quinteto rival", model.rivalRotation.starters, 42, 396, 280, red);
  addRotationList(closePage, "Primeros cambios", model.rivalRotation.firstChanges, 342, 396, 280, amber);
  addRotationList(closePage, "Cierre rival", model.rivalRotation.closers, 642, 396, 276, red);
  addInsightListCard(
    closePage,
    "Comparativo final",
    [
      model.comparison[0]?.value ?? "Sin señal comparativa",
      model.comparison[1]?.value ?? "Sin segunda señal comparativa",
      `Prediccion propia ${model.prediction.ownWinProbability}% · margen ${model.prediction.marginRange}`
    ],
    42,
    206,
    420,
    114,
    primary
  );
  addInsightListCard(
    closePage,
    "Plan final de staff",
    [
      model.tacticalKeysCore[0]?.action ?? "Quitar primera ventaja rival.",
      model.tacticalKeysCore[1]?.action ?? "Cargar nuestra ventaja principal.",
      model.tacticalKeysCore[2]?.action ?? "Controlar rebote y margen de posesiones."
    ],
    482,
    206,
    436,
    114,
    amber
  );
  addInsightListCard(
    closePage,
    "Trazabilidad",
    [
      `${Math.max(model.sourceTrace.length, shotGames.length)} fuentes / juegos usados en este documento.`,
      "La ultima carta de tiro por jugador pesa mas que la acumulada para evitar ruido.",
      "Separar dato confirmado, inferencia y conclusion tactica antes de bajar a video."
    ],
    42,
    74,
    876,
    98,
    red
  );
  addFooter(closePage, `08 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(closePage.join("\n"));

  return buildPdfDocument(pages);
}

export function buildPlayerDefenseReportPdf(model: MatchupScout, shots: ShotRow[] = [], shotGames: GameRow[] = []) {
  const primary = teamPrimaryColor(model.ownTeam.team.name);
  const dark: PdfRgb = [0.055, 0.075, 0.062];
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const amber: PdfRgb = [0.96, 0.62, 0.04];
  const own = model.ownTeam.team;
  const rival = model.rivalTeam.team;
  const focusPlayers = buildPlayerDefenseFocus(model, shots, shotGames);
  const totalPages = 1 + focusPlayers.length;
  const pages: string[] = [];

  const cover: string[] = [];
  addRect(cover, 0, 0, 960, 540, [0.95, 0.97, 0.96]);
  addRect(cover, 0, 394, 960, 146, dark);
  addRect(cover, 0, 0, 960, 16, primary);
  addText(cover, "PLAN DEFENSIVO POR JUGADOR", 52, 484, 24, [1, 1, 1], "F2");
  addWrappedText(cover, `${own.name} vs ${rival.name}`, 52, 448, 500, 28, [1, 1, 1], "F2", 30, 2);
  addText(cover, "Documento simple para jugador y staff: quien es, que busca y que no podemos darle.", 54, 418, 10.2, [0.78, 0.82, 0.78], "F1");
  addMetricCard(cover, "Amenaza 1", focusPlayers[0]?.player.name ?? "s/d", focusPlayers[0]?.tag ?? "sin foco", 54, 350, 248, 88, red);
  addMetricCard(cover, "Titulares de apoyo", `${focusPlayers.filter((item) => item.source === "titular").length} focos`, "Otros jugadores estructurales que sostienen al rival", 322, 350, 248, 88, primary);
  addMetricCard(cover, "Banca clave", `${focusPlayers.filter((item) => item.source === "banca").length} cambios`, "Los dos nombres que pueden cambiar ritmo entrando desde banco", 590, 350, 318, 88, amber);
  addInsightListCard(
    cover,
    "Orden de prioridad defensiva",
    focusPlayers.map((item) => `${item.rank}. ${item.player.name} · ${item.tag} · ${item.player.role}`),
    54,
    228,
    854,
    170,
    primary,
    "Lectura pensada para que el jugador entienda rapido: quien manda, quien acompaña y quien entra desde la banca."
  );
  addInsightListCard(
    cover,
    "Regla del documento",
    [
      "No sobrecargar con estadistica: una idea clara por jugador.",
      "Ultima carta de tiro por foco para que la lectura sea facil de entender.",
      "Siempre responder dos cosas: que no darle y que queremos que haga."
    ],
    54,
    70,
    854,
    92,
    amber
  );
  addFooter(cover, `01 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(cover.join("\n"));

  focusPlayers.forEach((focus, index) => {
    const page: string[] = [];
    const pageNumber = index + 2;
    const accent = focus.rank === 1 ? red : focus.source === "banca" ? amber : primary;
    addHeader(
      page,
      `${focus.tag} · Prioridad ${focus.rank}`,
      `${focus.player.name} · ${focus.player.role} · ${focus.label}`,
      `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`,
      primary
    );
    addRect(page, 42, 284, 876, 132, [1, 1, 1], [0.86, 0.88, 0.86]);
    addText(page, focus.player.name, 62, 378, 22, [0.06, 0.08, 0.07], "F2");
    addText(page, `${focus.tag} · ${focus.player.playerType} · ${formatPdfNumber(focus.player.minutes)} MIN/PJ · ${formatPdfNumber(focus.player.points)} PTS/PJ`, 64, 350, 10, [0.36, 0.42, 0.39], "F1");
    addWrappedText(page, focus.analysis.headline, 64, 320, 520, 13, dark, "F2", 15, 3);
    addMetricCard(page, "No darle", focus.summary.topZone, focus.summary.attempts > 0 ? `Mayor carga en ${focus.summary.topQuarter} · ${focus.summary.efficiency}` : "sin carta confirmada", 622, 384, 140, 94, accent);
    addMetricCard(page, "Queremos que haga", focus.summary.avoidedZones[0] ?? "tiro menos comodo", focus.summary.avoidedZones.length > 0 ? `orientarlo hacia ${focus.summary.avoidedZones[0]}` : "obligarlo a segunda decision", 778, 384, 140, 94, amber);
    addRect(page, 42, 94, 276, 160, [1, 1, 1], [0.86, 0.88, 0.86]);
    addSectionKicker(page, "Ultima carta de tiro", 62, 226, accent);
    if (focus.shots.length > 0) {
      addShotCourt(page, focus.shots, 64, 118, 232, 112, accent);
      addText(page, "Convertido", 66, 104, 8, accent, "F2");
      addText(page, "Fallado", 136, 104, 8, red, "F2");
    } else {
      addWrappedText(page, "Sin carta confirmada en el ultimo partido. Mantener regla simple y validar con video.", 70, 180, 220, 11, [0.36, 0.42, 0.39], "F2", 14, 4);
    }
    addRect(page, 332, 94, 274, 160, [1, 1, 1], [0.86, 0.88, 0.86]);
    addSectionKicker(page, "Como juega", 352, 226, primary);
    addInsightListCard(page, "Lectura rapida", [focus.analysis.decisions[0], focus.analysis.strengths[0], focus.analysis.decisions[2]], 350, 212, 238, 106, primary);
    addText(page, "Volumen por cuartos", 350, 104, 8.5, [0.36, 0.42, 0.39], "F2");
    addQuarterVolumeStrip(page, focus.shots, 350, 82, 230, accent);
    addRect(page, 620, 94, 298, 160, [1, 1, 1], [0.86, 0.88, 0.86]);
    addSectionKicker(page, "Regla defensiva", 642, 226, amber);
    addInsightListCard(page, "Que hacer", [focus.analysis.defensiveInstructions[0], focus.analysis.defensiveInstructions[1], focus.analysis.defensiveInstructions[2]], 640, 212, 258, 106, amber);
    addInsightListCard(page, "Como atacarlo", [focus.analysis.attackInstructions[0], focus.analysis.attackInstructions[1], focus.analysis.weaknesses[0]], 42, 76, 420, 78, primary);
    addInsightListCard(page, "Mensaje corto para jugador", [
      focus.analysis.decisions[0].replace("Primera lectura: ", ""),
      `No le des ${focus.summary.topZone === "sin zona dominante" ? "ritmo" : focus.summary.topZone}.`,
      `Hazlo jugar hacia ${focus.summary.avoidedZones[0] ?? "su tiro menos comodo"}.`
    ], 482, 76, 436, 78, accent);
    addFooter(page, `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, model, primary);
    pages.push(page.join("\n"));
  });

  return buildPdfDocument(pages);
}

export function buildExpressReportPdf(model: MatchupScout, shots: ShotRow[] = [], shotGames: GameRow[] = []) {
  const primary = teamPrimaryColor(model.ownTeam.team.name);
  const dark: PdfRgb = [0.055, 0.075, 0.062];
  const red: PdfRgb = [0.88, 0.11, 0.28];
  const amber: PdfRgb = [0.96, 0.62, 0.04];
  const own = model.ownTeam.team;
  const rival = model.rivalTeam.team;
  const topThreat = model.rivalPlayers[0];
  const bestQuarter = [...model.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const riskQuarter = [...model.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  const threatShots = topThreat
    ? latestShotGameForPlayer(
        shots.filter((shot) => sameShotRowForPlayer(topThreat, topThreat.name, shot, model.rivalPlayers)),
        shotGames
      )
    : { shots: [] as ShotRow[], label: "Sin carta confirmada." };
  const threatSummary = shotSummary(threatShots.shots);
  const threatAnalysis = buildShotAnalysis(topThreat?.name ?? "Amenaza principal", threatShots.shots, topThreat);
  const quickKeys = model.tacticalKeysCore.slice(0, 4);
  const quarterLine = `${bestQuarter?.quarter ?? "s/d"} para atacar · ${riskQuarter?.quarter ?? "s/d"} para resistir`;
  const totalPages = 2;
  const pages: string[] = [];

  const pageOne: string[] = [];
  addRect(pageOne, 0, 0, 960, 540, [0.955, 0.972, 0.962]);
  addRect(pageOne, 0, 0, 960, 16, primary);
  addRect(pageOne, 0, 404, 960, 136, dark);
  addText(pageOne, "BRIEF DE PARTIDO", 52, 484, 24, [1, 1, 1], "F2");
  addWrappedText(pageOne, `${own.name} vs ${rival.name}`, 52, 448, 520, 28, [1, 1, 1], "F2", 30, 2);
  addText(pageOne, "Lectura rapida para staff y jugadores. Si lo lees en un minuto, ya sabes que hacer.", 54, 420, 10.2, [0.78, 0.82, 0.78], "F1");
  addMetricCard(pageOne, "Ventaja", model.decisionBrief[0]?.value ?? "s/d", model.decisionBrief[0]?.action ?? "sin ventaja detectada", 54, 352, 250, 88, primary);
  addMetricCard(pageOne, "Riesgo", model.decisionBrief[1]?.value ?? "s/d", model.decisionBrief[1]?.action ?? "sin riesgo detectado", 324, 352, 250, 88, red);
  addMetricCard(pageOne, "Foco rival", topThreat?.name ?? "s/d", topThreat ? `${topThreat.role} · ${formatPdfNumber(topThreat.points)} PTS/PJ` : "sin amenaza confirmada", 594, 352, 150, 88, red);
  addMetricCard(pageOne, "Prediccion", `${model.prediction.ownWinProbability}%`, model.prediction.marginRange, 760, 352, 148, 88, amber);
  addRect(pageOne, 54, 232, 854, 94, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(pageOne, "Si solo tienes 30 segundos", 76, 296, primary);
  addWrappedText(pageOne, model.decisionBrief[0]?.action ?? "Controlar ritmo, rebote y primera ventaja rival.", 76, 266, 510, 18, dark, "F2", 21, 2);
  addText(pageOne, quarterLine, 650, 274, 10, [0.36, 0.42, 0.39], "F2");
  addWrappedText(pageOne, `Regla simple: ${quickKeys[0]?.action ?? "quitar primera ventaja rival"} · ${quickKeys[1]?.action ?? "cargar nuestra ventaja"}.`, 650, 248, 220, 9.5, [0.22, 0.28, 0.25], "F1", 12, 3);
  quickKeys.forEach((key, index) => {
    const x = 54 + (index % 2) * 428;
    const y = 194 - Math.floor(index / 2) * 64;
    addRect(pageOne, x, y - 22, 410, 42, [1, 1, 1], [0.87, 0.88, 0.86]);
    addText(pageOne, `Clave ${index + 1}`, x + 14, y - 1, 8.8, index === 0 ? primary : index === 1 ? red : amber, "F2");
    addWrappedText(pageOne, key.action, x + 92, y + 2, 304, 9.2, [0.22, 0.28, 0.25], "F1", 11, 2);
  });
  addFooter(pageOne, `01 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(pageOne.join("\n"));

  const pageTwo: string[] = [];
  addHeader(pageTwo, "Refuerzo visual", "Mini comparacion, amenaza principal y regla final para el equipo", `02 / ${String(totalPages).padStart(2, "0")}`, primary);
  addRect(pageTwo, 42, 238, 324, 178, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(pageTwo, "Mini comparacion", 66, 386, primary);
  addComparisonRow(pageTwo, "PTS/PJ", getPointsForPerGame(own), getPointsForPerGame(rival), 68, 336, 268, primary);
  addComparisonRow(pageTwo, "REB/PJ", getReboundsPerGame(own), getReboundsPerGame(rival), 68, 294, 268, primary);
  addComparisonRow(pageTwo, "DIF", getPointDifferential(own), getPointDifferential(rival), 68, 252, 268, primary);
  addWrappedText(pageTwo, `Ventaja simple: ${model.comparison[0]?.value ?? "partido parejo"}.`, 68, 210, 250, 9.2, [0.22, 0.28, 0.25], "F1", 11, 2);

  addRect(pageTwo, 388, 238, 530, 178, [1, 1, 1], [0.86, 0.88, 0.86]);
  addSectionKicker(pageTwo, "Amenaza principal", 412, 386, red);
  addText(pageTwo, topThreat?.name ?? "Sin amenaza", 412, 358, 16, dark, "F2");
  addText(pageTwo, topThreat ? `${topThreat.role} · ${formatPdfNumber(topThreat.minutes)} MIN/PJ` : "sin muestra", 414, 338, 9.4, [0.36, 0.42, 0.39], "F1");
  addRect(pageTwo, 412, 256, 188, 70, [0.96, 0.98, 0.97], [0.82, 0.85, 0.82]);
  if (threatShots.shots.length > 0) {
    addShotCourt(pageTwo, threatShots.shots, 420, 264, 172, 54, red);
  } else {
    addWrappedText(pageTwo, "Sin carta confirmada.", 444, 292, 110, 9.2, [0.36, 0.42, 0.39], "F2", 11, 2);
  }
  addInsightListCard(
    pageTwo,
    "Lectura rapida",
    [
      threatAnalysis.decisions[0],
      `No darle ${threatSummary.topZone === "sin zona dominante" ? "ritmo" : threatSummary.topZone}.`,
      `Queremos que juegue hacia ${threatSummary.avoidedZones[0] ?? "su tiro menos comodo"}.`
    ],
    618,
    332,
    276,
    110,
    red
  );

  addInsightListCard(
    pageTwo,
    "Badges del partido",
    [
      `Ventaja · ${model.decisionBrief[0]?.value ?? "s/d"}`,
      `Riesgo · ${model.decisionBrief[1]?.value ?? "s/d"}`,
      `Foco rival · ${topThreat?.name ?? "s/d"}`
    ],
    42,
    76,
    324,
    86,
    amber
  );
  addInsightListCard(
    pageTwo,
    "Regla final para el equipo",
    [
      quickKeys[0]?.action ?? "Quitar primera ventaja rival.",
      quickKeys[1]?.action ?? "Cargar nuestra mejor ventaja.",
      `${bestQuarter?.quarter ?? "s/d"} para atacar · ${riskQuarter?.quarter ?? "s/d"} para resistir.`
    ],
    388,
    76,
    530,
    86,
    primary
  );
  addFooter(pageTwo, `02 / ${String(totalPages).padStart(2, "0")}`, model, primary);
  pages.push(pageTwo.join("\n"));

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

function ensureDatasetMap(value: unknown): DatasetMap {
  const candidate = value && typeof value === "object" ? (value as Partial<DatasetMap>) : {};
  return {
    teams: Array.isArray(candidate.teams) ? candidate.teams : seedData.teams,
    players: Array.isArray(candidate.players) ? candidate.players : seedData.players,
    games: Array.isArray(candidate.games) ? candidate.games : seedData.games,
    playerGameStats: Array.isArray(candidate.playerGameStats) ? candidate.playerGameStats : [],
    shots: Array.isArray(candidate.shots) ? candidate.shots : []
  };
}

function ensureSourceTrace(value: unknown): SourceTrace[] {
  return Array.isArray(value) ? value : [];
}

function ensureNotes(value: unknown): PrivateNote[] {
  return Array.isArray(value) ? value : [];
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
  const [selectedTacticalPlayer, setSelectedTacticalPlayer] = useState("");
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
      try {
        const storedDataset = ensureDatasetMap(loadJson(STORAGE_KEY, seedData));
        setData(migrateStoredDataset(storedDataset));
      } catch {
        setData(seedData);
      }
      setSourceTrace(ensureSourceTrace(loadJson(TRACE_KEY, [])));
      setNotes(ensureNotes(loadJson("dos-premium-notes-v1", [])));
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
    setSelectedTacticalPlayer("");
    setShotGameFilter("Todos");
    setUrls("");
    setOfficialSyncStatus(`Base oficial ${competitionCopy(activeCompetition).shortLabel} lista para sincronizar standings, equipos, rosters y fixture.`);
    setIngestStatus(`Listo para pegar links FEBACHILE / Genius Sports de ${competitionCopy(activeCompetition).shortLabel}.`);
    setShotImportStatus(`Carta de tiro lista para generar desde los partidos oficiales del rival en ${competitionCopy(activeCompetition).shortLabel}.`);
  }, [activeCompetition]);

  useEffect(() => {
    if (!selectedTacticalPlayer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTacticalPlayer("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTacticalPlayer]);

  useEffect(() => {
    if (tab !== "Jugadores") {
      setSelectedTacticalPlayer("");
    }
  }, [tab]);

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
  const completeGames = competitionGames.filter((game) => gameLoadStatus(game, data).label === "Completo");
  const officialResultGames = competitionGames.filter((game) => gameLoadStatus(game, data).label === "Resultado");
  const pendingGames = competitionGames.filter((game) => gameLoadStatus(game, data).label === "Pendiente");
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
  const rivalPlayerForName = (name: string) =>
    model.rivalPlayers.find((player) => normalizePersonName(player.name) === normalizePersonName(name)) ??
    model.rivalPlayers.find((player) => sameShotPlayerInRoster(player.name, name, model.rivalPlayers));
  const rivalShotBelongsToPlayer = (
    name: string,
    shot: ShotRow,
    player = rivalPlayerForName(name)
  ) => sameShotRowForPlayer(player, name, shot, model.rivalPlayers);
  const rivalShotCountForName = (name: string) => rivalShots.filter((shot) => rivalShotBelongsToPlayer(name, shot)).length;
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
    .filter((name) => {
      const exactRosterMatches = model.rivalPlayers.filter((player) => normalizePersonName(player.name) === normalizePersonName(name)).length;
      const compatibleRosterMatches = model.rivalPlayers.filter((player) => sameShotPlayer(player.name, name)).length;
      return exactRosterMatches > 0 || compatibleRosterMatches <= 1;
    })
    .sort((nameA, nameB) => {
      const shotsA = rivalShotCountForName(nameA);
      const shotsB = rivalShotCountForName(nameB);
      return shotsB - shotsA;
    })
    .slice(0, 12);
  const shotPlayerNames = uniqueNames([...rotationCandidates, ...confirmedShotPlayerNames]).slice(0, 9);
  const shotPlayerCards: ShotPlayerCard[] = shotPlayerNames.map((name, index) => {
    const player = rivalPlayerForName(name);
    const playerShots = rivalShots.filter((shot) => rivalShotBelongsToPlayer(name, shot, player));
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
  const activeShotAnalysis = buildShotAnalysis(activeShotPlayer?.name ?? "Jugador rival", activeGamePlayerShots, activeShotPlayer?.player);
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
    cards: section.cards
      .map((card) => {
        const player = card.player ?? model.rivalPlayers.find((item) => sameShotPlayer(item.name, card.name));
        return player ? { ...card, player } : null;
      })
      .filter((card): card is TacticalPlayerCard => Boolean(card))
  })).filter((section) => section.cards.length > 0);
  const tacticalPlayerCards = playerScoutingSections.flatMap((section) => section.cards);
  const selectedTacticalCard = tacticalPlayerCards.find((card) => sameShotPlayer(card.name, selectedTacticalPlayer));
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
              <h3>Estado de partidos</h3>
            </div>
            <EvidencePill evidence="dato confirmado" confidence={(completeGames.length + officialResultGames.length) / Math.max(competitionGames.length, 1)} />
          </div>
          <div className="load-summary">
            <MetricTile label="Equipos oficiales" value={String(teams.length)} caption={`${leagueCopy.shortLabel} separada por zonas o fase`} />
            <MetricTile label="Jugadores en base" value={String(competitionPlayers.length)} caption="Rosters y estadisticas por equipo" />
            <MetricTile label="Partidos en base" value={String(competitionGames.length)} caption="Fixture, resultados e imports locales" />
            <MetricTile label="Detalle completo" value={String(completeGames.length)} caption="Boxscore, jugadores y carta de tiro" />
            <MetricTile label="Resultado oficial" value={String(officialResultGames.length)} caption="Marcador sincronizado; alimenta dashboard y equipos" />
            <MetricTile label="Pendientes reales" value={String(pendingGames.length)} caption="Falta marcador o data.json" />
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
                  const status = gameLoadStatus(game, data);
                  return (
                    <tr key={game.gameId}>
                      <td>
                        <span className={`upload-status ${status.tone}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>{game.date}</td>
                      <td>{game.homeTeam} vs {game.awayTeam}</td>
                      <td>{game.homeScore && game.awayScore ? `${game.homeScore}-${game.awayScore}` : "Sin marcador"}</td>
                      <td>{game.phase}</td>
                      <td>{game.notes} · {status.caption}</td>
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
        <>
          <section className="module-panel player-hub-panel">
            <div className="module-heading player-hub-heading">
              <div>
                <p className="eyebrow">Scouting individual</p>
                <h3>Jugadores de impacto rival</h3>
                <p className="heading-copy">Lectura rapida en cards. El detalle tactico vive en la ficha lateral para preparar matchups sin ruido.</p>
              </div>
              <span>{tacticalPlayerCards.length} jugadores priorizados</span>
            </div>
            <div className="player-scout-sections">
              {playerScoutingSections.map((section) => (
                <section className="player-scout-section" key={section.title}>
                  <div className="player-section-heading">
                    <span>{section.title}</span>
                    <small>{section.caption}</small>
                  </div>
                  <div className="player-scout-card-grid">
                    {section.cards.map((card) => (
                      <PlayerSummaryCard
                        card={card}
                        key={card.name}
                        onOpen={() => setSelectedTacticalPlayer(card.name)}
                        sectionTitle={section.title}
                      />
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
          {selectedTacticalCard ? (
            <PlayerTacticalSheet
              card={selectedTacticalCard}
              games={rivalShotImportGames}
              players={tacticalPlayerCards}
              onClose={() => setSelectedTacticalPlayer("")}
              onSelect={setSelectedTacticalPlayer}
              onOpenFull={() => {
                setSelectedShotPlayer(selectedTacticalCard.name);
                setTab("Carta de tiro");
                setSelectedTacticalPlayer("");
              }}
            />
          ) : null}
        </>
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
                    onClick={() => downloadPdf(`plan-defensivo-${activeShotPlayer?.name ?? "jugador"}.pdf`, shotPlanText(activeShotPlayer?.name ?? "Jugador rival", activeGamePlayerShots, activeShotPlayer?.player))}
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
              <section className="shot-tactical-board" aria-label="Lectura tactica desde carta de tiro">
                <article className="shot-tactical-column profile">
                  <span>Perfil de juego</span>
                  <strong>{activeShotAnalysis.profile}</strong>
                  <p>{activeShotAnalysis.style}</p>
                  {activeShotAnalysis.bullets.slice(0, 3).map((item) => (
                    <small key={item}>{item}</small>
                  ))}
                </article>
                <article className="shot-tactical-column">
                  <span>Decisiones tipicas</span>
                  {activeShotAnalysis.decisions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="shot-tactical-column strength">
                  <span>Fortalezas reales</span>
                  {activeShotAnalysis.strengths.slice(0, 3).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="shot-tactical-column weakness">
                  <span>Debilidades explotables</span>
                  {activeShotAnalysis.weaknesses.slice(0, 3).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="shot-tactical-column defense">
                  <span>Plan defensivo</span>
                  {activeShotAnalysis.defensiveInstructions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="shot-tactical-column attack">
                  <span>Como atacarlo</span>
                  {activeShotAnalysis.attackInstructions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
              </section>
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
                <h3>Lectura rapida</h3>
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
              <div className="shot-analysis-list">
                <h4>Lectura central</h4>
                {activeShotAnalysis.bullets.slice(0, 3).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
              <div className="defense-plan">
                <span>Regla principal</span>
                <p>{activeShotAnalysis.defensiveInstructions[0] ?? `Negar zona dominante, contestar sin falta y comunicar si sube volumen en ${activeShotSummary.topQuarter}.`}</p>
              </div>
              <div className="player-mode-shot">
                <span>Modo jugador</span>
                <p>{activeShotAnalysis.defensiveInstructions[0] ?? `Negar zona dominante, contestar sin falta y comunicar si sube volumen en ${activeShotSummary.topQuarter}.`}</p>
              </div>
              <div className="shot-trend-card side-trend">
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
                description: "Dossier visual de 12 paginas: decisiones, identidad rival, jugadores clave, ultima carta de tiro, rotacion, cuartos, comparativo y validacion.",
                staffOnly: true
              },
              {
                kind: "tecnico" as const,
                filename: `reporte-tecnico-largo-${competitionFileSlug(competition)}.pdf`,
                title: "Reporte tecnico largo",
                description: "Version profunda con radares separados, momentum por cuartos, 3 ultimas cartas clave, carga ofensiva rival y plan final de staff.",
                staffOnly: true
              },
              {
                kind: "jugadores" as const,
                filename: `plan-defensivo-por-jugador-${competitionFileSlug(competition)}.pdf`,
                title: "Plan defensivo por jugador",
                description: "7 focos reales: amenaza principal, otros 4 relevantes y 2 cambios de banca con ultima carta de tiro y regla simple.",
                staffOnly: false
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
                description: "Brief de 2 paginas para leer en un minuto: ventaja, riesgo, foco rival, cuartos y regla simple del partido.",
                staffOnly: false
              }
            ].map((report) => (
              <button
                className="download-tile"
                disabled={report.staffOnly && !canCreateReports}
                key={report.kind}
                onClick={() => {
                  if (report.kind === "prepartido") {
                    downloadPdfDocument(report.filename, buildTacticalDossierPdf(model, rivalShots, rivalShotImportGames));
                    return;
                  }
                  if (report.kind === "tecnico") {
                    downloadPdfDocument(report.filename, buildTechnicalLongPdf(model, rivalShots, rivalShotImportGames));
                    return;
                  }
                  if (report.kind === "jugadores") {
                    downloadPdfDocument(report.filename, buildPlayerDefenseReportPdf(model, rivalShots, rivalShotImportGames));
                    return;
                  }
                  if (report.kind === "resumen") {
                    downloadPdfDocument(report.filename, buildExpressReportPdf(model, rivalShots, rivalShotImportGames));
                    return;
                  }
                  downloadPdf(report.filename, `${buildEditableReport(model, report.kind)}\n${buildShotReportSection(model, rivalShots)}`);
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
          <button className="primary-button" onClick={() => downloadPdf(`presentacion-tactica-${competitionFileSlug(competition)}.pdf`, `${buildEditableReport(model, "presentacion")}\n${buildShotReportSection(model, rivalShots)}`)} type="button">
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
