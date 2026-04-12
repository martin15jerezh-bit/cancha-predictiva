"use client";

import { buildPrediction, getGamesByCompetition } from "@/lib/data";
import { DatasetMap } from "@/lib/types";

type PredictionHistoryProps = {
  data: DatasetMap;
  competition: string;
};

export function PredictionHistory({ data, competition }: PredictionHistoryProps) {
  const teams = data.teams.filter((team) => team.competition === competition);
  const rows = getGamesByCompetition(data.games, competition)
    .filter((game) => game.status === "Final" && game.homeScore !== "" && game.awayScore !== "")
    .map((game) => {
      const home = teams.find((team) => team.name === game.homeTeam);
      const away = teams.find((team) => team.name === game.awayTeam);
      if (!home || !away) {
        return null;
      }

      const prediction = buildPrediction(home, away);
      const predictedWinner =
        prediction.homeWinProbability >= prediction.awayWinProbability ? game.homeTeam : game.awayTeam;
      const actualWinner = Number(game.homeScore) > Number(game.awayScore) ? game.homeTeam : game.awayTeam;
      const scoreError =
        Math.abs(prediction.estimatedHomeScore - Number(game.homeScore)) +
        Math.abs(prediction.estimatedAwayScore - Number(game.awayScore));

      return {
        game,
        predictedWinner,
        actualWinner,
        scoreError,
        correct: predictedWinner === actualWinner,
        predictedScore: `${prediction.estimatedHomeScore}-${prediction.estimatedAwayScore}`
      };
    })
    .filter(Boolean);

  const correct = rows.filter((row) => row?.correct).length;
  const total = rows.length;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
  const averageScoreError =
    total === 0 ? 0 : rows.reduce((sum, row) => sum + (row?.scoreError ?? 0), 0) / total;

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Historial del modelo</p>
          <h2>Predicho vs real</h2>
        </div>
        <div className="probability-pill">
          Acierto: {accuracy}% · Error marcador: {averageScoreError.toFixed(1)}
        </div>
      </div>
      <div className="history-summary">
        <div>
          <strong>{correct}/{total}</strong>
          <span>ganadores correctos</span>
        </div>
        <div>
          <strong>{averageScoreError.toFixed(1)}</strong>
          <span>error promedio combinado</span>
        </div>
        <div>
          <strong>{total}</strong>
          <span>partidos auditados</span>
        </div>
      </div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Partido</th>
              <th>Prediccion</th>
              <th>Real</th>
              <th>Ganador predicho</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row ? (
                <tr key={row.game.gameId}>
                  <td>
                    {row.game.date} · {row.game.homeTeam} vs {row.game.awayTeam}
                  </td>
                  <td>{row.predictedScore}</td>
                  <td>
                    {row.game.homeScore}-{row.game.awayScore}
                  </td>
                  <td>{row.predictedWinner}</td>
                  <td>
                    <span className={`audit-pill ${row.correct ? "hit" : "miss"}`}>
                      {row.correct ? "Bien" : "Mal"}
                    </span>
                  </td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
