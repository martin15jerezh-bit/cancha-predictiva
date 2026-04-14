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
import { applyBoxscoreImports, getPointDifferential, LIGA_DOS_COMPETITION, parseNumber, seedData } from "@/lib/data";
import { BoxscoreImport, CompetitionKey, DatasetMap, GameRow, PlayerRow, TeamRow } from "@/lib/types";
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
  "Carga",
  "Jugadores",
  "Rotacion",
  "Cuartos",
  "Comparativo",
  "Informes",
  "Presentaciones",
  "Notas",
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

function isUploadedGame(gameId: string, notes: string) {
  return notes.toLowerCase().includes("importado desde fiba");
}

function fixtureKey(game: GameRow) {
  return `${game.date}-${game.homeTeam.toLowerCase()}-${game.awayTeam.toLowerCase()}`;
}

function matchIdFromGame(game: GameRow) {
  return game.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ?? game.notes.match(/(?:FIBA|Genius)\s+(\d+)/)?.[1];
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
    ]
  };
}

function migrateStoredDataset(current: DatasetMap): DatasetMap {
  const hasOfficialSync = current.teams.some((team) => team.competition === LIGA_DOS_COMPETITION && team.teamId.startsWith("GENIUS-"));

  if (hasOfficialSync) {
    return current;
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
    ]
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
  const [urls, setUrls] = useState("");
  const [ingestStatus, setIngestStatus] = useState("Listo para pegar links FEBACHILE / Genius Sports.");
  const [officialSyncStatus, setOfficialSyncStatus] = useState("Base oficial lista para sincronizar standings, equipos, rosters y fixture.");
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
          confirmedFields: ["equipos", "marcador", "jugadores", "minutos", "puntos", "rebotes", "asistencias"],
          inferredFields: ["rol estimado", "rotacion probable", "cuartos proyectados", "amenaza rival"],
          manualCorrections: []
        })),
        ...current
      ]);
    }

    setIngestStatus(
      `Procesados ${payload.imports.length} links. ${
        payload.errors.length > 0 ? `Observaciones: ${payload.errors.join(" | ")}` : "Datos persistidos en la base local del MVP."
      }`
    );
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
  const ownTop = model.ownPlayers[0]?.name ?? "Sin muestra";
  const rivalTop = model.rivalPlayers[0]?.name ?? "Sin muestra";

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
          <MetricTile label="Equipo propio" value={model.ownTeam.recentRecord} caption={`${model.ownTeam.team.gamesPlayed} PJ tabla · muestra ${model.ownTeam.sampleRecord}`} />
          <MetricTile label="Rival" value={model.rivalTeam.recentRecord} caption={`${model.rivalTeam.team.gamesPlayed} PJ tabla · muestra ${model.rivalTeam.sampleRecord}`} />
          <MetricTile label="Amenaza rival" value={rivalTop} caption="Indice combinado de puntos, tablero, asistencias y minutos" />
          <MetricTile label="Ventaja propia" value={ownTop} caption="Prioridad para cargar el plan ofensivo" />
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
        <section className="two-column">
          <SignalList title="Rival vs propio equipo" signals={model.comparison} />
          <section className="module-panel">
            <div className="module-heading">
              <p className="eyebrow">Prediccion</p>
              <h3>{model.prediction.ownWinProbability}% victoria propia</h3>
            </div>
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
            <p className="status-copy">Margen esperado {model.prediction.marginRange}. {model.prediction.trend}</p>
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
