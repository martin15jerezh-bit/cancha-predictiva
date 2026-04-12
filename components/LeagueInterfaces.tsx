"use client";

import { competitionLabels } from "@/lib/data";
import { CompetitionKey, DatasetMap } from "@/lib/types";

type LeagueInterfacesProps = {
  data: DatasetMap;
  activeCompetition: CompetitionKey;
  onSelectCompetition: (competition: CompetitionKey) => void;
};

const leagueDescriptions: Record<CompetitionKey, string> = {
  "Liga Chery Apertura 2026": "Primera division: ritmo alto, arenas grandes, tabla por conferencias y seguimiento de predicciones.",
  "Liga DOS 2026": "Ascenso: mapa largo de norte a sur, zonas regionales, clubes emergentes y scouting de boxscores.",
  "Liga Nacional Femenina 2026": "LNF: identidad propia, calendario compacto, foco en desarrollo, rendimiento y proyeccion."
};

const leagueTone: Record<CompetitionKey, string> = {
  "Liga Chery Apertura 2026": "tone-chery",
  "Liga DOS 2026": "tone-dos",
  "Liga Nacional Femenina 2026": "tone-femenina"
};

const leagueIcons: Record<CompetitionKey, string> = {
  "Liga Chery Apertura 2026": "🏆",
  "Liga DOS 2026": "🚌",
  "Liga Nacional Femenina 2026": "💜"
};

const leagueKickers: Record<CompetitionKey, string> = {
  "Liga Chery Apertura 2026": "Prime court",
  "Liga DOS 2026": "Ruta del ascenso",
  "Liga Nacional Femenina 2026": "LNF club house"
};

export function LeagueInterfaces({
  data,
  activeCompetition,
  onSelectCompetition
}: LeagueInterfacesProps) {
  return (
    <section className="league-grid">
      {competitionLabels.map((competition) => {
        const teams = data.teams.filter((team) => team.competition === competition).length;
        const games = data.games.filter((game) => game.competition === competition).length;
        const players = data.players.filter((player) => player.competition === competition).length;

        return (
          <button
            className={`league-card ${leagueTone[competition]} ${activeCompetition === competition ? "active" : ""}`}
            key={competition}
            onClick={() => onSelectCompetition(competition)}
            type="button"
          >
            <div className="league-icon" aria-hidden="true">
              {leagueIcons[competition]}
            </div>
            <p className="eyebrow">{leagueKickers[competition]}</p>
            <h3>{competition}</h3>
            <p>{leagueDescriptions[competition]}</p>
            <div className="league-metrics">
              <span>{teams} equipos</span>
              <span>{games} partidos</span>
              <span>{players} jugadores</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
