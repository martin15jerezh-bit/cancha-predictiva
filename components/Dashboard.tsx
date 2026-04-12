"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CompetitionKey, DatasetMap, GameRow, TeamRow } from "@/lib/types";
import {
  competitionLabels,
  getAssistsPerGame,
  getGamesByCompetition,
  getPointDifferential,
  getPointsAgainstPerGame,
  getPointsForPerGame,
  getReboundsPerGame,
  getWinPct
} from "@/lib/data";

type DashboardProps = {
  data: DatasetMap;
  competition: CompetitionKey;
  homeTeam: string;
  awayTeam: string;
  onCompetitionChange: (value: CompetitionKey) => void;
  onHomeTeamChange: (value: string) => void;
  onAwayTeamChange: (value: string) => void;
  onSelectMatchup: (game: GameRow) => void;
};

function StatCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="stat-card">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{caption}</span>
    </div>
  );
}

function teamOption(team: TeamRow) {
  return (
    <option key={team.teamId} value={team.name}>
      {team.name}
    </option>
  );
}

export function Dashboard({
  data,
  competition,
  homeTeam,
  awayTeam,
  onCompetitionChange,
  onHomeTeamChange,
  onAwayTeamChange,
  onSelectMatchup
}: DashboardProps) {
  const [zoneSelection, setZoneSelection] = useState({ competition, zone: "Todas" });
  const selectedZone = zoneSelection.competition === competition ? zoneSelection.zone : "Todas";
  const setSelectedZone = (zone: string) => setZoneSelection({ competition, zone });
  const competitionTeams = data.teams.filter((team) => team.competition === competition);
  const zones = Array.from(new Set(competitionTeams.map((team) => team.zone).filter(Boolean))).sort();
  const zoneTeams =
    selectedZone === "Todas"
      ? competitionTeams
      : competitionTeams.filter((team) => team.zone === selectedZone);
  const home = competitionTeams.find((team) => team.name === homeTeam) ?? competitionTeams[0];
  const away =
    competitionTeams.find((team) => team.name === awayTeam) ?? competitionTeams[1] ?? competitionTeams[0];
  const competitionGames = getGamesByCompetition(data.games, competition);
  const zoneGames =
    selectedZone === "Todas"
      ? competitionGames
      : competitionGames.filter((game) => game.phase === selectedZone);

  const comparisonData =
    home && away
      ? [
          {
            metric: "Puntos a favor",
            [home.name]: Number(getPointsForPerGame(home).toFixed(1)),
            [away.name]: Number(getPointsForPerGame(away).toFixed(1))
          },
          {
            metric: "Puntos en contra",
            [home.name]: Number(getPointsAgainstPerGame(home).toFixed(1)),
            [away.name]: Number(getPointsAgainstPerGame(away).toFixed(1))
          },
          {
            metric: "Diferencial",
            [home.name]: Number(getPointDifferential(home).toFixed(1)),
            [away.name]: Number(getPointDifferential(away).toFixed(1))
          },
          {
            metric: "Rebotes",
            [home.name]: Number(getReboundsPerGame(home).toFixed(1)),
            [away.name]: Number(getReboundsPerGame(away).toFixed(1))
          },
          {
            metric: "Asistencias",
            [home.name]: Number(getAssistsPerGame(home).toFixed(1)),
            [away.name]: Number(getAssistsPerGame(away).toFixed(1))
          }
        ]
      : [];

  const loadedWeeks = Array.from(new Set(zoneGames.map((game) => game.week))).sort((a, b) => Number(a) - Number(b));
  const standings = [...competitionTeams].sort((teamA, teamB) => {
    const winsDelta = Number(teamB.wins) - Number(teamA.wins);
    if (winsDelta !== 0) {
      return winsDelta;
    }

    return getPointDifferential(teamB) - getPointDifferential(teamA);
  });
  const groupedStandings = zones.map((zone) => ({
    zone,
    teams: standings.filter((team) => team.zone === zone)
  }));
  const visibleStandings = selectedZone === "Todas" ? standings : standings.filter((team) => team.zone === selectedZone);
  const visibleRecentResults = [...zoneGames]
    .filter((game) => game.status === "Final")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const visibleUpcomingGames = [...zoneGames]
    .filter((game) => game.status !== "Final")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  return (
    <section className="dashboard-grid">
      <div className="panel panel-large">
        <div className="section-header">
          <div>
            <p className="eyebrow">Dashboard real</p>
            <h2>Comparacion por competencia</h2>
          </div>
          <div className="selector-row selector-row-wide">
            <select
              value={competition}
              onChange={(event) => onCompetitionChange(event.target.value as CompetitionKey)}
            >
              {competitionLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
            <select value={homeTeam} onChange={(event) => onHomeTeamChange(event.target.value)}>
              {(zoneTeams.length > 0 ? zoneTeams : competitionTeams).map(teamOption)}
            </select>
            <select value={awayTeam} onChange={(event) => onAwayTeamChange(event.target.value)}>
              {(zoneTeams.length > 0 ? zoneTeams : competitionTeams).map(teamOption)}
            </select>
          </div>
        </div>

        <div className="zone-strip">
          <button
            className={`zone-chip ${selectedZone === "Todas" ? "active" : ""}`}
            onClick={() => setSelectedZone("Todas")}
            type="button"
          >
            Todas las zonas
          </button>
          {zones.map((zone) => (
            <button
              className={`zone-chip ${selectedZone === zone ? "active" : ""}`}
              key={zone}
              onClick={() => setSelectedZone(zone)}
              type="button"
            >
              {zone}
            </button>
          ))}
        </div>

        {home && away ? (
          <>
            <div className="stats-grid">
              <StatCard
                label={home.name}
                value={`${Number(home.wins)}-${Number(home.losses)}`}
                caption={`${home.zone} | PF ${getPointsForPerGame(home).toFixed(1)}`}
              />
              <StatCard
                label={away.name}
                value={`${Number(away.wins)}-${Number(away.losses)}`}
                caption={`${away.zone} | PF ${getPointsForPerGame(away).toFixed(1)}`}
              />
              <StatCard
                label="Semanas visibles"
                value={loadedWeeks.length === 0 ? "Sin datos" : loadedWeeks.join(", ")}
                caption={`${zoneGames.length} partidos en ${selectedZone}`}
              />
              <StatCard
                label="Plantillas"
                value={`${data.players.length} filas`}
                caption="Extranjeros y nombres base verificados"
              />
            </div>

            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                  <XAxis dataKey="metric" stroke="#9fb0d1" />
                  <YAxis stroke="#9fb0d1" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "#09111f"
                    }}
                  />
                  <Legend />
                  <Bar dataKey={home.name} fill="#38bdf8" radius={[10, 10, 0, 0]} />
                  <Bar dataKey={away.name} fill="#f59e0b" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="muted">Aun no hay suficientes equipos en esta competencia. Importa links FIBA para comenzar.</p>
        )}
      </div>

      <div className="panel">
        <p className="eyebrow">Tabla por grupos</p>
        <h3>{selectedZone === "Todas" ? "Zonas y standings" : selectedZone}</h3>
        {selectedZone === "Todas" && groupedStandings.length > 1 ? (
          <div className="zone-standings">
            {groupedStandings.map((group) => (
              <div className="zone-card" key={group.zone}>
                <div className="zone-card-header">
                  <strong>{group.zone}</strong>
                  <span>{group.teams.length} equipos</span>
                </div>
                {group.teams.map((team, index) => (
                  <div className="zone-row" key={team.teamId}>
                    <span>{index + 1}. {team.name}</span>
                    <strong>{team.wins}-{team.losses}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="table-shell">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Zona</th>
                  <th>Ciudad</th>
                  <th>Win%</th>
                </tr>
              </thead>
              <tbody>
                {visibleStandings.map((team) => (
                  <tr key={team.teamId}>
                    <td>{team.name}</td>
                    <td>{team.zone}</td>
                    <td>{team.city || "Sin dato"}</td>
                    <td>{(getWinPct(team) * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <p className="eyebrow">Calendario actual</p>
        <h3>Ultimos resultados y proximos</h3>
        <div className="schedule-list">
          {visibleRecentResults.map((game) => (
            <div className="schedule-item" key={game.gameId}>
              <div>
                <strong>
                  S{game.week} · {game.homeTeam} vs {game.awayTeam}
                </strong>
                <span>{game.date} · {game.notes}</span>
              </div>
              <div className="status-pill final">
                {game.homeScore}-{game.awayScore}
              </div>
            </div>
          ))}
          {visibleUpcomingGames.map((game) => (
            <button
              className={`schedule-item schedule-button ${
                game.homeTeam === homeTeam && game.awayTeam === awayTeam ? "selected" : ""
              }`}
              key={game.gameId}
              onClick={() => onSelectMatchup(game)}
              type="button"
            >
              <div>
                <strong>
                  S{game.week} · {game.homeTeam} vs {game.awayTeam}
                </strong>
                <span>{game.date} · {game.phase}</span>
              </div>
              <div className="status-pill programado">Proximo</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
