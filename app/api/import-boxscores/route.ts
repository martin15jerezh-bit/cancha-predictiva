import { NextResponse } from "next/server";
import { CURRENT_COMPETITION, areSameTeam, competitionLabels, seedData } from "@/lib/data";
import { BoxscoreImport, CompetitionKey, GameRow, PlayerRow } from "@/lib/types";

type FibaTeam = {
  name?: string;
  shortName?: string;
  score?: number | string;
  tot_sReboundsTotal?: number;
  tot_sAssists?: number;
  tot_sPoints?: number;
  pl?: Record<
    string,
    {
      name?: string;
      scoreboardName?: string;
      playingPosition?: string;
      sMinutes?: string;
      sPoints?: number;
      sReboundsTotal?: number;
      sAssists?: number;
    }
  >;
};

type FibaPayload = {
  tm?: Record<string, FibaTeam>;
};

function extractMatchId(url: string) {
  const patterns = [/\/data\/(\d+)\/data\.json/, /\/data\/(\d+)/, /\/u\/[^/]+\/(\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function normalizeFibaUrl(url: string) {
  const matchId = extractMatchId(url);
  return matchId ? `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json` : null;
}

function findTeamName(fibaName: string) {
  return seedData.teams.find((team) => areSameTeam(team.name, fibaName))?.name ?? fibaName;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toPlayerRows(teamName: string, team: FibaTeam, competition: CompetitionKey): PlayerRow[] {
  return Object.values(team.pl ?? {})
    .map((player, index) => ({
      playerId: `${slugify(teamName)}-${slugify(player.name ?? player.scoreboardName ?? `jugador-${index + 1}`)}`,
      competition,
      teamName,
      name: player.name ?? player.scoreboardName ?? `Jugador ${index + 1}`,
      position: player.playingPosition ?? "",
      minutes: String(player.sMinutes ?? "0:00"),
      points: String(player.sPoints ?? 0),
      rebounds: String(player.sReboundsTotal ?? 0),
      assists: String(player.sAssists ?? 0)
    }));
}

async function importBoxscore(url: string, competition: CompetitionKey): Promise<BoxscoreImport> {
  const dataUrl = normalizeFibaUrl(url);
  const matchId = extractMatchId(url);

  if (!dataUrl || !matchId) {
    throw new Error(`No pude detectar el ID de partido en: ${url}`);
  }

  const response = await fetch(dataUrl, {
    cache: "no-store",
    headers: { "user-agent": "Cancha Predictiva LNB/0.1" }
  });

  if (!response.ok) {
    throw new Error(`FIBA respondio ${response.status} para ${url}`);
  }

  const payload = (await response.json()) as FibaPayload;
  const teamOne = payload.tm?.["1"];
  const teamTwo = payload.tm?.["2"];

  if (!teamOne || !teamTwo) {
    throw new Error(`El boxscore no contiene dos equipos: ${url}`);
  }

  const homeTeam = findTeamName(teamOne.name ?? teamOne.shortName ?? "Local");
  const awayTeam = findTeamName(teamTwo.name ?? teamTwo.shortName ?? "Visita");

  const game: GameRow = {
    gameId: `FIBA-${matchId}`,
    competition,
    phase: seedData.teams.find((team) => team.name === homeTeam)?.zone ?? "Importado desde FIBA",
    week: "Importado",
    date: new Date().toISOString().slice(0, 10),
    homeTeam,
    awayTeam,
    homeScore: String(teamOne.score ?? teamOne.tot_sPoints ?? 0),
    awayScore: String(teamTwo.score ?? teamTwo.tot_sPoints ?? 0),
    status: "Final",
    notes: `Importado desde FIBA ${matchId}`
  };

  return {
    sourceUrl: url,
    game,
    players: [...toPlayerRows(homeTeam, teamOne, competition), ...toPlayerRows(awayTeam, teamTwo, competition)],
    teamStats: [
      {
        teamName: homeTeam,
        points: Number(teamOne.score ?? teamOne.tot_sPoints ?? 0),
        rebounds: Number(teamOne.tot_sReboundsTotal ?? 0),
        assists: Number(teamOne.tot_sAssists ?? 0)
      },
      {
        teamName: awayTeam,
        points: Number(teamTwo.score ?? teamTwo.tot_sPoints ?? 0),
        rebounds: Number(teamTwo.tot_sReboundsTotal ?? 0),
        assists: Number(teamTwo.tot_sAssists ?? 0)
      }
    ]
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { urls?: string[]; competition?: CompetitionKey };
  const urls = Array.from(new Set((body.urls ?? []).map((url) => url.trim()).filter(Boolean)));
  const competition = competitionLabels.includes(body.competition ?? CURRENT_COMPETITION)
    ? (body.competition ?? CURRENT_COMPETITION)
    : CURRENT_COMPETITION;

  if (urls.length === 0) {
    return NextResponse.json({ imports: [], errors: ["Pega al menos un link de boxscore FIBA."] }, { status: 400 });
  }

  const results = await Promise.allSettled(urls.map((url) => importBoxscore(url, competition)));
  const imports = results
    .filter((result): result is PromiseFulfilledResult<BoxscoreImport> => result.status === "fulfilled")
    .map((result) => result.value);
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "Error importando boxscore."));

  return NextResponse.json({ imports, errors });
}
