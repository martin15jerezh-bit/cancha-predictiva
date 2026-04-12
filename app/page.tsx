"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { DataUploader } from "@/components/DataUploader";
import { EditableTable } from "@/components/EditableTable";
import { BoxscoreImporter } from "@/components/BoxscoreImporter";
import { LeagueInterfaces } from "@/components/LeagueInterfaces";
import { PredictionHistory } from "@/components/PredictionHistory";
import { PredictionPanel } from "@/components/PredictionPanel";
import {
  CURRENT_COMPETITION,
  competitionLabels,
  datasetLabels,
  gameColumns,
  playerColumns,
  seedData,
  teamColumns
} from "@/lib/data";
import { CompetitionKey, DatasetMap, GameRow, PlayerRow, TeamRow } from "@/lib/types";

const STORAGE_KEY = "lnb-predictor-data-v7-renovated-leagues";

type PersistedState =
  | DatasetMap
  | {
      data: DatasetMap;
      competition?: CompetitionKey;
      homeTeam?: string;
      awayTeam?: string;
    };

function isDatasetMap(value: unknown): value is DatasetMap {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as DatasetMap).teams) &&
    Array.isArray((value as DatasetMap).players) &&
    Array.isArray((value as DatasetMap).games)
  );
}

function isCompetitionKey(value: unknown): value is CompetitionKey {
  return typeof value === "string" && competitionLabels.includes(value as CompetitionKey);
}

function resolvePersistedState(parsed: PersistedState) {
  if (isDatasetMap(parsed)) {
    return {
      data: parsed,
      competition: CURRENT_COMPETITION,
      homeTeam: undefined,
      awayTeam: undefined
    };
  }

  return {
    data: parsed.data,
    competition: isCompetitionKey(parsed.competition) ? parsed.competition : CURRENT_COMPETITION,
    homeTeam: parsed.homeTeam,
    awayTeam: parsed.awayTeam
  };
}

function getDefaultTeams(data: DatasetMap, competition: CompetitionKey) {
  const filtered = data.teams.filter((team) => team.competition === competition);
  return {
    home: filtered[0]?.name ?? "",
    away: filtered[1]?.name ?? filtered[0]?.name ?? ""
  };
}

export default function HomePage() {
  const [data, setData] = useState<DatasetMap>(seedData);
  const [competition, setCompetition] = useState<CompetitionKey>(CURRENT_COMPETITION);
  const defaults = getDefaultTeams(seedData, CURRENT_COMPETITION);
  const [homeTeam, setHomeTeam] = useState(defaults.home);
  const [awayTeam, setAwayTeam] = useState(defaults.away);
  const [updateStatus, setUpdateStatus] = useState("Listo para sincronizar con Genius.");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setIsHydrated(true);
      return;
    }

    try {
      const persisted = resolvePersistedState(JSON.parse(stored) as PersistedState);
      const teams = getDefaultTeams(persisted.data, persisted.competition);
      setData(persisted.data);
      setCompetition(persisted.competition);
      setHomeTeam(persisted.homeTeam || teams.home);
      setAwayTeam(persisted.awayTeam || teams.away);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data,
        competition,
        homeTeam,
        awayTeam
      })
    );
  }, [awayTeam, competition, data, homeTeam, isHydrated]);

  const replaceCompetitionRows = <T extends { competition: string }>(
    currentRows: T[],
    nextRows: T[]
  ) => [
    ...currentRows.filter((row) => row.competition !== competition),
    ...nextRows.map((row) => ({ ...row, competition }))
  ];

  const updateActiveTeams = (teams: TeamRow[]) => {
    setData((current) => ({ ...current, teams: replaceCompetitionRows(current.teams, teams) }));
  };

  const updateActivePlayers = (players: PlayerRow[]) => {
    setData((current) => ({ ...current, players: replaceCompetitionRows(current.players, players) }));
  };

  const updateActiveGames = (games: GameRow[]) => {
    setData((current) => ({ ...current, games: replaceCompetitionRows(current.games, games) }));
  };

  const handleCompetitionChange = (value: CompetitionKey) => {
    setCompetition(value);
    const teams = getDefaultTeams(data, value);
    setHomeTeam(teams.home);
    setAwayTeam(teams.away);
  };

  const handleSelectMatchup = (game: GameRow) => {
    setCompetition(game.competition as CompetitionKey);
    setHomeTeam(game.homeTeam);
    setAwayTeam(game.awayTeam);
  };

  const handleGeniusUpdate = async () => {
    setUpdateStatus("Consultando fuentes y actualizando datos...");

    try {
      const response = await fetch("/api/update-from-genius", { method: "POST" });
      if (!response.ok) {
        throw new Error("La API interna no pudo actualizar los datos.");
      }

      const payload = (await response.json()) as { data: DatasetMap; updatedAt: string };
      const teams = getDefaultTeams(payload.data, CURRENT_COMPETITION);
      setData(payload.data);
      setCompetition(CURRENT_COMPETITION);
      setHomeTeam(teams.home);
      setAwayTeam(teams.away);
      setUpdateStatus(`Datos actualizados: ${new Date(payload.updatedAt).toLocaleString("es-CL")}.`);
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : "No se pudo actualizar desde Genius.");
    }
  };

  const handleClearActiveCompetition = () => {
    setData((current) => ({
      teams: current.teams.filter((team) => team.competition !== competition),
      players: current.players.filter((player) => player.competition !== competition),
      games: current.games.filter((game) => game.competition !== competition)
    }));
    setHomeTeam("");
    setAwayTeam("");
    setUpdateStatus(`Se limpio ${competition}.`);
  };

  const handleRestoreOfficialData = () => {
    const teams = getDefaultTeams(seedData, CURRENT_COMPETITION);
    setData(seedData);
    setCompetition(CURRENT_COMPETITION);
    setHomeTeam(teams.home);
    setAwayTeam(teams.away);
    setUpdateStatus("Base oficial restaurada y imports locales descartados.");
  };

  const activeTeams = data.teams.filter((team) => team.competition === competition);
  const activePlayers = data.players.filter((player) => player.competition === competition);
  const activeGames = data.games.filter((game) => game.competition === competition);
  const pageTone =
    competition === "Liga Chery Apertura 2026"
      ? "theme-chery"
      : competition === "Liga DOS 2026"
        ? "theme-dos"
        : "theme-femenina";

  return (
    <main className={`page-shell ${pageTone}`}>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Cancha Predictiva LNB</p>
          <h1>Datos reales de la Liga Chery Apertura 2026 cargados sobre un MVP escalable</h1>
          <p className="hero-text">
            La app ahora viene precargada con los 14 equipos actuales, tabla por conferencias,
            resultados cerrados hasta el 5 de abril de 2026 y partidos programados desde el 8 de
            abril de 2026 en adelante. Mantiene carga CSV, edicion manual y una prediccion base
            lista para evolucionar.
          </p>
        </div>
        <div className="hero-card">
          <span className="chip">Liga Chery 2026</span>
          <span className="chip">14 equipos actuales</span>
          <span className="chip">Resultados + proximos</span>
          <span className="chip">Genius / FIBA / fuentes verificadas</span>
          <button className="sync-button" onClick={handleGeniusUpdate} type="button">
            Actualizar desde Genius
          </button>
          <p className="sync-status">{updateStatus}</p>
        </div>
      </section>

      <LeagueInterfaces
        activeCompetition={competition}
        data={data}
        onSelectCompetition={handleCompetitionChange}
      />

      <section
        className={`panel league-tools ${
          competition === "Liga Chery Apertura 2026"
            ? "tone-chery"
            : competition === "Liga DOS 2026"
              ? "tone-dos"
              : "tone-femenina"
        }`}
      >
        <div>
          <p className="eyebrow">Gestion de datos</p>
          <h2>{competition}</h2>
          <p className="muted">
            Esta es la liga activa. Los CSV, links FIBA, predicciones e historial se trabajan en
            este contexto para evitar mezclar Liga Chery, Liga DOS y LNF.
          </p>
        </div>
        <div className="tool-actions">
          <button className="danger-button big-action" onClick={handleClearActiveCompetition} type="button">
            Limpiar liga actual
          </button>
          <button className="ghost-button big-action" onClick={handleRestoreOfficialData} type="button">
            Restaurar base oficial
          </button>
        </div>
      </section>

      <section className="panel source-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Procedencia</p>
            <h2>Que se cargo y que falta</h2>
          </div>
        </div>
        <div className="source-grid">
          <div className="source-item">
            <strong>Verificado y cargado</strong>
            <p>
              Equipos 2026, conferencias, entrenadores visibles, tabla actualizada y resultados
              finales hasta el 11 de abril de 2026 segun la informacion visible en Genius/captura.
            </p>
          </div>
          <div className="source-item">
            <strong>Fuente base</strong>
            <p>
              Genius FEBA Chile, fixture/posiciones de la Apertura 2026 y enlaces de FIBA Live Stats
              referenciados por esas páginas. Use tambien una compilacion indexada que cita esas
              fuentes para validar rapidamente el calendario actual.
            </p>
          </div>
          <div className="source-item">
            <strong>Pendiente siguiente iteracion</strong>
            <p>
              Boxscores completos por partido, estadisticas finas de rebotes/asistencias y planteles
              completos mas alla de la nomina extranjera/base verificada.
            </p>
          </div>
        </div>
      </section>

      <section className="uploader-grid">
        <DataUploader<TeamRow> dataset="teams" onLoad={updateActiveTeams} />
        <DataUploader<PlayerRow> dataset="players" onLoad={updateActivePlayers} />
        <DataUploader<GameRow> dataset="games" onLoad={updateActiveGames} />
      </section>

      <BoxscoreImporter competition={competition} data={data} onDataChange={setData} />

      <Dashboard
        data={data}
        competition={competition}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        onCompetitionChange={handleCompetitionChange}
        onHomeTeamChange={setHomeTeam}
        onAwayTeamChange={setAwayTeam}
        onSelectMatchup={handleSelectMatchup}
      />

      <PredictionPanel
        data={data}
        competition={competition}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />

      <PredictionHistory data={data} competition={competition} />

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Edicion de datasets</p>
            <h2>Panel de mantenimiento y carga adicional</h2>
          </div>
          <p className="muted">
            Competencias detectadas: {competitionLabels.join(" / ")} | {Object.values(datasetLabels).join(" / ")}
          </p>
        </div>

        <div className="editor-grid">
          <EditableTable<TeamRow>
            title={`Equipos · ${competition}`}
            rows={activeTeams}
            columns={teamColumns}
            onChange={updateActiveTeams}
          />
          <EditableTable<PlayerRow>
            title={`Jugadores · ${competition}`}
            rows={activePlayers}
            columns={playerColumns}
            onChange={updateActivePlayers}
          />
          <EditableTable<GameRow>
            title={`Partidos · ${competition}`}
            rows={activeGames}
            columns={gameColumns}
            onChange={updateActiveGames}
          />
        </div>
      </section>
    </main>
  );
}
