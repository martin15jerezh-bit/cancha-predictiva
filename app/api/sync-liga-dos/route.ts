import { NextResponse } from "next/server";
import { areSameTeam, competitionLabels, CURRENT_COMPETITION, LIGA_DOS_COMPETITION, LNF_COMPETITION, seedData } from "@/lib/data";
import { CompetitionKey, GameRow, PlayerRow, TeamRow } from "@/lib/types";

const IURL = "https://clnb.web.geniussports.com/?p=9";

type CompetitionSyncConfig = {
  competition: CompetitionKey;
  competitionId: string;
  label: string;
  defaultZone: string;
  phases: string[];
  aliases: Record<string, string>;
};

type OfficialTeam = {
  id: string;
  name: string;
  canonicalName: string;
  logoUrl: string;
};

type StandingInfo = {
  zone: string;
  gamesPlayed: string;
  wins: string;
  losses: string;
  pointsFor: string;
  pointsAgainst: string;
};

type PlayerInfo = {
  personId: string;
  name: string;
  position: string;
  shirtNumber: string;
  minutes?: string;
  points?: string;
  offensiveRebounds?: string;
  defensiveRebounds?: string;
  rebounds?: string;
  assists?: string;
  steals?: string;
  turnovers?: string;
  fouls?: string;
  twoMade?: string;
  twoAttempted?: string;
  threeMade?: string;
  threeAttempted?: string;
  freeThrowsMade?: string;
  freeThrowsAttempted?: string;
  games?: string;
};

const ligaDosAliases: Record<string, string> = {
  "ARABE VALPARAISO": "Arabe de Valparaiso",
  "CD ALEMAN DE CONCEPCION": "Aleman de Concepcion",
  "CD HRVATSKI SOKOL": "Hrvatski Sokol",
  "CD ILLAPEL BASQUETBOL": "Illapel Basquetbol",
  "CD MUNICIPAL CHILLAN": "Municipal Chillan",
  "CDS BASQUETBOL CONSTITUCIÓN": "CDSB Constitucion",
  "CDSB CONSTITUCION": "CDSB Constitucion",
  "ESCOLAR ALEMAN PV": "Escolar Aleman Puerto Varas",
  "LICEO DE CURICO": "Liceo Curico",
  "SAN LUIS QUILLOTA": "San Luis Basquet",
  "THE SHARKS": "CD Sharks",
  "UDE TEMUCO": "UDE Temuco"
};

const lnbAliases: Record<string, string> = {
  "CD UNIV. CONCEPCION": "Universidad de Concepcion",
  "CD UNIVERSIDAD DE CONCEPCION": "Universidad de Concepcion",
  "CD UNIV. CATOLICA": "Universidad Catolica",
  "CD UNIVERSIDAD CATOLICA": "Universidad Catolica",
  "CD ESPANOL OSORNO": "Espanol de Osorno",
  "CD ESPAÑOL OSORNO": "Espanol de Osorno",
  "CD ESPANOL TALCA": "Espanol de Talca",
  "CD ESPAÑOL TALCA": "Espanol de Talca",
  "CSD COLO COLO": "Colo-Colo",
  "CD COLO COLO": "Colo-Colo"
};

const lnfAliases: Record<string, string> = {
  "AZUL Y ROJO": "Azul y Rojo",
  "CD GIMNASTICO": "Gimnastico Vina del Mar",
  "CD SERGIO CEPPI": "Sergio Ceppi",
  "CD UNIV. CONCEPCION": "Universidad de Concepcion",
  "CD UNIVERSIDAD DE CONCEPCION": "Universidad de Concepcion",
  "COLEGIO LOS LEONES": "Colegio Los Leones",
  "MUN. PUENTE ALTO": "Municipal Puente Alto",
  "MUNICIPAL PUENTE ALTO": "Municipal Puente Alto",
  "SPORTIVA ITALIANA": "Sportiva Italiana",
  "STGO. MORNING QUILICURA": "Santiago Morning Quilicura",
  "SANTIAGO MORNING QUILICURA": "Santiago Morning Quilicura"
};

const syncConfigs: Record<string, CompetitionSyncConfig> = {
  [LIGA_DOS_COMPETITION]: {
    competition: LIGA_DOS_COMPETITION,
    competitionId: "48159",
    label: "Liga DOS",
    defaultZone: "Liga DOS",
    phases: ["Zona A", "Zona B", "Zona C", "Zona D"],
    aliases: ligaDosAliases
  },
  [CURRENT_COMPETITION]: {
    competition: CURRENT_COMPETITION,
    competitionId: "48076",
    label: "LNB Chile",
    defaultZone: "LNB Chile",
    phases: ["Conferencia Centro", "Conferencia Sur"],
    aliases: lnbAliases
  },
  [LNF_COMPETITION]: {
    competition: LNF_COMPETITION,
    competitionId: "48641",
    label: "LNF Chile",
    defaultZone: "Fase Regular",
    phases: [""],
    aliases: lnfAliases
  }
};

function getSyncConfig(value?: CompetitionKey) {
  const competition = competitionLabels.includes(value ?? LIGA_DOS_COMPETITION)
    ? value ?? LIGA_DOS_COMPETITION
    : LIGA_DOS_COMPETITION;
  return syncConfigs[competition] ?? syncConfigs[LIGA_DOS_COMPETITION];
}

function decodeHtml(value: string) {
  return value
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(value = "") {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonicalTeamName(officialName: string, config: CompetitionSyncConfig) {
  const normalized = officialName.trim().toUpperCase();
  const existing = seedData.teams.find((team) => team.competition === config.competition && areSameTeam(team.name, officialName));
  return config.aliases[normalized] ?? existing?.name ?? officialName
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferredLnbZone(teamName: string) {
  const normalized = slugify(teamName);
  if (/(osorno|animas|valdivia|puerto-varas|puerto-montt|ancud|castro)/.test(normalized)) {
    return "Conferencia Sur";
  }
  if (/(concepcion|puente-alto|leones|boston|colo-colo|catolica|talca)/.test(normalized)) {
    return "Conferencia Centro";
  }
  return "LNB Chile";
}

function resolvedTeamZone(config: CompetitionSyncConfig, teamName: string, standing?: StandingInfo, existing?: TeamRow) {
  if (config.competition === CURRENT_COMPETITION) {
    return existing?.zone ?? inferredLnbZone(teamName);
  }
  return standing?.zone ?? existing?.zone ?? config.defaultZone;
}

async function fetchEmbed(page: string, config: CompetitionSyncConfig) {
  const separator = page.includes("?") ? "&" : "?";
  const embedBase = `https://hosted.dcd.shared.geniussports.com/embednf/FDBCH/es/competition/${config.competitionId}`;
  const url = `${embedBase}${page}${separator}iurl=${encodeURIComponent(IURL)}&_cc=1&_lc=1&_nv=1&_mf=1`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "DOS Scout Pro/0.2" }
  });

  if (!response.ok) {
    throw new Error(`Genius respondio ${response.status} para ${page}`);
  }

  const payload = (await response.json()) as { html?: string };
  return decodeHtml(payload.html ?? "");
}

async function fetchEmbedOptional(page: string, config: CompetitionSyncConfig) {
  try {
    return await fetchEmbed(page, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404")) {
      return "";
    }
    throw error;
  }
}

function getCells(row: string) {
  return [...row.matchAll(/<td[\s\S]*?<\/td>/g)].map((cell) => stripTags(cell[0]));
}

function parseOfficialTeams(html: string, config: CompetitionSyncConfig): OfficialTeam[] {
  return [...html.matchAll(/<div class="team-link">([\s\S]*?)<\/div>/g)]
    .map((match) => {
      const block = match[1];
      const id = block.match(/team%2F(\d+)/)?.[1];
      const logoUrl = block.match(/<img src = "([^"]+)"/)?.[1] ?? "";
      const name = block.match(/alt="([^"]+)"/)?.[1] ?? stripTags(block.match(/<\/a>\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "");
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name: stripTags(name),
        canonicalName: canonicalTeamName(stripTags(name), config),
        logoUrl
      };
    })
    .filter((team): team is OfficialTeam => Boolean(team));
}

function parseStandings(html: string, zone: string) {
  const rows = [...html.matchAll(/<tr class="standings_team_[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  return rows.map((row) => {
    const id = row.match(/team%2F(\d+)/)?.[1];
    const name = stripTags(row.match(/team-name-full">([^<]+)/)?.[1] ?? "");
    const values = [...row.matchAll(/class="STANDINGS_(played|won|lost|scoredFor|scoredAgainst)">(-?\d+)/g)].reduce(
      (acc, match) => ({ ...acc, [match[1]]: match[2] }),
      {} as Record<string, string>
    );
    if (!id || !name) {
      return null;
    }
    return {
      id,
      name,
      info: {
        zone,
        gamesPlayed: values.played ?? "0",
        wins: values.won ?? "0",
        losses: values.lost ?? "0",
        pointsFor: values.scoredFor ?? "0",
        pointsAgainst: values.scoredAgainst ?? "0"
      }
    };
  });
}

function parseTeamTotals(html: string, config: CompetitionSyncConfig) {
  const totals = new Map<string, { reboundsPerGame: string; assistsPerGame: string }>();
  const rows = [...html.matchAll(/<tr>\s*<td class="team-name">[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  rows.forEach((row) => {
    const teamName = stripTags(row.match(/<td class="team-name">([\s\S]*?)<\/td>/)?.[1] ?? "");
    const cells = getCells(row).slice(1);
    const rebounds = Number(cells[15] ?? 0);
    const assists = Number(cells[18] ?? 0);
    const games = Number(cells[20] ?? 0);
    if (teamName && games > 0) {
      totals.set(canonicalTeamName(teamName, config), {
        reboundsPerGame: (rebounds / games).toFixed(1),
        assistsPerGame: (assists / games).toFixed(1)
      });
    }
  });
  return totals;
}

function parseRoster(html: string) {
  const rows = [...html.matchAll(/<tr>[\s\S]*?person%2F\d+[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  return rows.map((row) => {
    const personId = row.match(/person%2F(\d+)/)?.[1];
    const cells = getCells(row);
    const name = stripTags(row.match(/person%2F\d+%3F">([^<]+)/)?.[1] ?? row.match(/alt="([^"]+)"/)?.[1] ?? "");
    if (!personId || !name) {
      return null;
    }
    return {
      personId,
      name,
      shirtNumber: cells[0] === " " ? "" : cells[0],
      position: cells[2] ?? ""
    };
  }).filter((player): player is PlayerInfo => Boolean(player));
}

function parseTeamPlayerStats(html: string) {
  const stats = new Map<string, PlayerInfo>();
  const totalsTable = html.split("<h4>Averages</h4>")[0] ?? html;
  const rows = [...totalsTable.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)]
    .map((match) => match[0])
    .filter((row) => row.includes("person%2F"));
  rows.forEach((row) => {
    const personId = row.match(/person%2F(\d+)/)?.[1];
    const name = stripTags(row.match(/person%2F\d+%3F">([^<]+)/)?.[1] ?? "");
    const cells = getCells(row);
    if (!personId || !name) {
      return;
    }
    stats.set(personId, {
      personId,
      name,
      shirtNumber: "",
      position: "",
      minutes: cells[1] ?? "0:00",
      fouls: cells[2] ?? "0",
      threeAttempted: cells[3] ?? "0",
      threeMade: cells[4] ?? "0",
      twoAttempted: cells[6] ?? "0",
      twoMade: cells[7] ?? "0",
      freeThrowsAttempted: cells[9] ?? "0",
      freeThrowsMade: cells[10] ?? "0",
      points: cells[12] ?? "0",
      offensiveRebounds: cells[13] ?? "0",
      defensiveRebounds: cells[14] ?? "0",
      rebounds: cells[15] ?? "0",
      steals: cells[16] ?? "0",
      assists: cells[18] ?? "0",
      turnovers: cells[19] ?? "0",
      games: cells[20] ?? "0"
    });
  });
  return stats;
}

function parseSchedule(html: string, zone: string, config: CompetitionSyncConfig): GameRow[] {
  const parts = html.split(/<div class="match-wrap/).slice(1);
  return parts.map((part) => {
    const block = `<div class="match-wrap${part}`;
    const matchId = block.match(/id = "extfix_(\d+)"/)?.[1] ?? `official-${slugify(zone)}-${Math.random()}`;
    const dateText = stripTags(block.match(/<div class="match-time"><h6>Fecha \/ Hora: <\/h6><span>([^<]+)/)?.[1] ?? "");
    const [day, rawMonth, year, time] = dateText.split(/\s+/);
    const month = { "mar.": "03", "abr.": "04", "may.": "05", "jun.": "06" }[rawMonth as "mar." | "abr." | "may." | "jun."] ?? "01";
    const date = year && day ? `${year}-${month}-${day.padStart(2, "0")}` : new Date().toISOString().slice(0, 10);
    const teamNames = [...block.matchAll(/team-name-full">([^<]+)/g)].map((match) => canonicalTeamName(stripTags(match[1]), config));
    const scores = [...block.matchAll(/<div class="fake-cell">([^<]*)<\/div>/g)].map((match) => stripTags(match[1]));
    const isFinal = block.includes("complete matchStatus") || block.includes("> Final <");
    return {
      gameId: `GENIUS-${matchId}`,
      competition: config.competition,
      phase: zone,
      week: "Oficial",
      date,
      homeTeam: teamNames[0] ?? "Local",
      awayTeam: teamNames[1] ?? "Visita",
      homeScore: scores[0] ?? "",
      awayScore: scores[1] ?? "",
      status: isFinal ? "Final" : "Proximo",
      notes: `Oficial Genius ${matchId}${time ? ` · ${time}` : ""}`
    };
  }).filter((game) => game.homeTeam !== "Local" && game.awayTeam !== "Visita");
}

function scheduleKey(game: GameRow) {
  const matchId = game.gameId.match(/GENIUS-(\d+)/)?.[1];
  return matchId ? `match-${matchId}` : `${game.date}-${slugify(game.homeTeam)}-${slugify(game.awayTeam)}`;
}

function uniqueSchedules(games: GameRow[]) {
  const byGame = new Map<string, GameRow>();
  games.forEach((game) => {
    const key = scheduleKey(game);
    if (!byGame.has(key)) {
      byGame.set(key, game);
    }
  });
  return Array.from(byGame.values());
}

function mergeRosterAndStats(roster: PlayerInfo[], stats: Map<string, PlayerInfo>) {
  const players = new Map<string, PlayerInfo>();
  roster.forEach((player) => players.set(player.personId, { ...player, ...stats.get(player.personId) }));
  stats.forEach((player, personId) => {
    if (!players.has(personId)) {
      players.set(personId, player);
    }
  });
  return Array.from(players.values());
}

function phasePage(path: "standings" | "schedule", phase: string) {
  if (!phase) {
    return `/${path}`;
  }
  return `/${path}?phaseName=${phase.replace(/\s+/g, "+")}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { competition?: CompetitionKey };
    const config = getSyncConfig(body.competition);
    const phases = config.phases.length > 0 ? config.phases : [""];
    const [teamsHtml, teamTotalsHtml, ...phasePages] = await Promise.all([
      fetchEmbedOptional("/teams", config),
      fetchEmbed("/statistics/team", config),
      ...phases.flatMap((phase) => [
        fetchEmbed(phasePage("standings", phase), config),
        fetchEmbed(phasePage("schedule", phase), config)
      ])
    ]);

    const officialTeamsFromStandings = new Map<string, OfficialTeam>();
    const standings = new Map<string, StandingInfo>();
    const schedules: GameRow[] = [];

    phases.forEach((phase, index) => {
      const zone = phase || config.defaultZone;
      const standingsHtml = phasePages[index * 2];
      const scheduleHtml = phasePages[index * 2 + 1];
      parseStandings(standingsHtml, zone).forEach((row) => {
        if (row?.id) {
          standings.set(row.id, row.info);
          if (!officialTeamsFromStandings.has(row.id)) {
            officialTeamsFromStandings.set(row.id, {
              id: row.id,
              name: row.name,
              canonicalName: canonicalTeamName(row.name, config),
              logoUrl: ""
            });
          }
        }
      });
      schedules.push(...parseSchedule(scheduleHtml, zone, config));
    });

    const parsedTeams = parseOfficialTeams(teamsHtml, config);
    const officialTeams = parsedTeams.length > 0 ? parsedTeams : Array.from(officialTeamsFromStandings.values());

    const teamTotals = parseTeamTotals(teamTotalsHtml, config);
    const rosterPages = await Promise.all(
      officialTeams.flatMap((team) => [
        fetchEmbed(`/team/${team.id}/roster`, config),
        fetchEmbed(`/team/${team.id}/statistics`, config)
      ])
    );

    const teams: TeamRow[] = officialTeams.map((team) => {
      const standing = standings.get(team.id);
      const existing = seedData.teams.find((row) => row.competition === config.competition && areSameTeam(row.name, team.canonicalName));
      const totals = teamTotals.get(team.canonicalName);
      return {
        teamId: `GENIUS-${team.id}`,
        competition: config.competition,
        zone: resolvedTeamZone(config, team.canonicalName, standing, existing),
        name: team.canonicalName,
        city: existing?.city ?? "",
        coach: existing?.coach ?? "",
        gamesPlayed: standing?.gamesPlayed ?? existing?.gamesPlayed ?? "0",
        wins: standing?.wins ?? existing?.wins ?? "0",
        losses: standing?.losses ?? existing?.losses ?? "0",
        pointsFor: standing?.pointsFor ?? existing?.pointsFor ?? "0",
        pointsAgainst: standing?.pointsAgainst ?? existing?.pointsAgainst ?? "0",
        reboundsPerGame: totals?.reboundsPerGame ?? existing?.reboundsPerGame ?? "0",
        assistsPerGame: totals?.assistsPerGame ?? existing?.assistsPerGame ?? "0"
      };
    });

    const players: PlayerRow[] = officialTeams.flatMap((team, index) => {
      const rosterHtml = rosterPages[index * 2];
      const statsHtml = rosterPages[index * 2 + 1];
      return mergeRosterAndStats(parseRoster(rosterHtml), parseTeamPlayerStats(statsHtml)).map((player) => ({
        playerId: `GENIUS-${player.personId}`,
        competition: config.competition,
        teamName: team.canonicalName,
        name: player.name,
        position: player.position,
        minutes: player.minutes ?? "0:00",
        points: player.points ?? "0",
        rebounds: player.rebounds ?? "0",
        assists: player.assists ?? "0",
        offensiveRebounds: player.offensiveRebounds ?? "0",
        defensiveRebounds: player.defensiveRebounds ?? "0",
        steals: player.steals ?? "0",
        turnovers: player.turnovers ?? "0",
        fouls: player.fouls ?? "0",
        twoMade: player.twoMade ?? "0",
        twoAttempted: player.twoAttempted ?? "0",
        threeMade: player.threeMade ?? "0",
        threeAttempted: player.threeAttempted ?? "0",
        freeThrowsMade: player.freeThrowsMade ?? "0",
        freeThrowsAttempted: player.freeThrowsAttempted ?? "0",
        starter: "",
        games: player.games ?? "1"
      }));
    });

    return NextResponse.json({
      teams,
      players,
      games: uniqueSchedules(schedules),
      syncedAt: new Date().toISOString(),
      competition: config.competition,
      competitionId: config.competitionId,
      sources: ["teams", "standings", "schedule", "statistics/team", "team/{id}/roster", "team/{id}/statistics"]
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo sincronizar la competencia desde Genius." },
      { status: 502 }
    );
  }
}
