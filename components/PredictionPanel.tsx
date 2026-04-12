"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  buildPrediction,
  getAssistsPerGame,
  getGamesByCompetition,
  getPointDifferential,
  getPointsAgainstPerGame,
  getPointsForPerGame,
  getReboundsPerGame,
  getTeamRecentForm,
  getWinPct
} from "@/lib/data";
import { DatasetMap } from "@/lib/types";

type PredictionPanelProps = {
  data: DatasetMap;
  competition: string;
  homeTeam: string;
  awayTeam: string;
};

function AnalysisCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="analysis-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

export function PredictionPanel({ data, competition, homeTeam, awayTeam }: PredictionPanelProps) {
  const competitionTeams = data.teams.filter((team) => team.competition === competition);
  const home = competitionTeams.find((team) => team.name === homeTeam);
  const away = competitionTeams.find((team) => team.name === awayTeam);

  if (!home || !away) {
    return (
      <section className="panel">
        <p className="eyebrow">Prediccion</p>
        <h3>Modelo inicial</h3>
        <p className="muted">Selecciona dos equipos validos dentro de la misma competencia.</p>
      </section>
    );
  }

  const result = buildPrediction(home, away);
  const competitionGames = getGamesByCompetition(data.games, competition);
  const homeForm = getTeamRecentForm(competitionGames, home.name);
  const awayForm = getTeamRecentForm(competitionGames, away.name);

  const analysisData = [
    {
      metric: "PF",
      [home.name]: Number(getPointsForPerGame(home).toFixed(1)),
      [away.name]: Number(getPointsForPerGame(away).toFixed(1))
    },
    {
      metric: "PC",
      [home.name]: Number(getPointsAgainstPerGame(home).toFixed(1)),
      [away.name]: Number(getPointsAgainstPerGame(away).toFixed(1))
    },
    {
      metric: "REB",
      [home.name]: Number(getReboundsPerGame(home).toFixed(1)),
      [away.name]: Number(getReboundsPerGame(away).toFixed(1))
    },
    {
      metric: "AST",
      [home.name]: Number(getAssistsPerGame(home).toFixed(1)),
      [away.name]: Number(getAssistsPerGame(away).toFixed(1))
    },
    {
      metric: "DIF",
      [home.name]: Number(getPointDifferential(home).toFixed(1)),
      [away.name]: Number(getPointDifferential(away).toFixed(1))
    }
  ];

  const verdict =
    result.homeWinProbability >= 65
      ? `${home.name} llega como favorito claro.`
      : result.homeWinProbability <= 35
        ? `${away.name} llega con ventaja estadistica.`
        : "Se proyecta un partido parejo con margen corto.";

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Prediccion inicial</p>
          <h2>
            {homeTeam} vs {awayTeam}
          </h2>
        </div>
        <div className="probability-pill">
          {home.name}: {result.homeWinProbability}% | {away.name}: {result.awayWinProbability}%
        </div>
      </div>

      <div className="prediction-grid">
        <div className="prediction-card home">
          <span>Local</span>
          <strong>{result.estimatedHomeScore}</strong>
          <small>{home.name}</small>
        </div>
        <div className="prediction-card away">
          <span>Visita</span>
          <strong>{result.estimatedAwayScore}</strong>
          <small>{away.name}</small>
        </div>
      </div>

      <div className="analysis-grid">
        <AnalysisCard
          label={`${home.name} · forma reciente`}
          value={homeForm.record}
          caption={`Ultimos 3: ${homeForm.averageFor.toFixed(1)} PF / ${homeForm.averageAgainst.toFixed(1)} PC`}
        />
        <AnalysisCard
          label={`${away.name} · forma reciente`}
          value={awayForm.record}
          caption={`Ultimos 3: ${awayForm.averageFor.toFixed(1)} PF / ${awayForm.averageAgainst.toFixed(1)} PC`}
        />
        <AnalysisCard
          label="Win rate"
          value={`${(getWinPct(home) * 100).toFixed(0)}% vs ${(getWinPct(away) * 100).toFixed(0)}%`}
          caption="Lectura de tabla actual"
        />
        <AnalysisCard
          label="Diferencial"
          value={`${getPointDifferential(home).toFixed(1)} vs ${getPointDifferential(away).toFixed(1)}`}
          caption="Puntos anotados menos recibidos"
        />
      </div>

      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analysisData}>
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
            <Bar dataKey={home.name} fill="#38bdf8" radius={[10, 10, 0, 0]} />
            <Bar dataKey={away.name} fill="#f59e0b" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="logic-box">
        <p>
          <strong>{verdict}</strong> Diferencia de fuerza: <strong>{result.strengthDelta}</strong>
        </p>
        <ul>
          {result.explanation.map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li>
            La forma reciente usa los ultimos 3 partidos finales cargados para detectar ritmo ofensivo y defensivo.
          </li>
          <li>
            Rebotes y asistencias ya entran en el comparativo y en el modelo; si luego subimos cifras mas precisas, la estimacion mejora sin rehacer la interfaz.
          </li>
        </ul>
      </div>
    </section>
  );
}
