import { NextResponse } from "next/server";
import { CURRENT_COMPETITION, areSameTeam, competitionLabels, seedData } from "@/lib/data";
import { BoxscoreImport, CompetitionKey, GameRow, PlayerGameStatRow, PlayerRow, ShotRow } from "@/lib/types";

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
      sReboundsOffensive?: number;
      sReboundsDefensive?: number;
      sAssists?: number;
      sSteals?: number;
      sTurnovers?: number;
      sFoulsPersonal?: number;
      sTwoPointersMade?: number;
      sTwoPointersAttempted?: number;
      sThreePointersMade?: number;
      sThreePointersAttempted?: number;
      sFreeThrowsMade?: number;
      sFreeThrowsAttempted?: number;
      starter?: number;
    }
  >;
  shot?: Array<{
    r?: number;
    x?: number;
    y?: number;
    p?: number;
    pno?: number;
    tno?: number;
    per?: number;
    actionType?: string;
    actionNumber?: number;
    subType?: string;
    player?: string;
    shirtNumber?: string;
  }>;
};

type FibaPayload = {
  tm?: Record<string, FibaTeam>;
};

type ImportTarget = {
  dataUrl: string;
  sourceUrl: string;
  gameDate?: string;
  gameTime?: string;
  phase?: string;
};

const competitionGeniusIds: Partial<Record<CompetitionKey, string>> = {
  "Liga DOS 2026": "48159",
  "Liga Chery Apertura 2026": "48076",
  "Liga Nacional Femenina 2026": "48641"
};

const boxscoreTeamAliases: Partial<Record<CompetitionKey, Record<string, string>>> = {
  "Liga Chery Apertura 2026": {
    "CD ESPANOL OSORNO": "Espanol de Osorno",
    "CD ESPAÑOL OSORNO": "Espanol de Osorno",
    "ESPANOL OSORNO": "Espanol de Osorno",
    "ESPAÑOL OSORNO": "Espanol de Osorno",
    "CD ESPANOL TALCA": "Espanol de Talca",
    "CD ESPAÑOL TALCA": "Espanol de Talca",
    "ESPANOL TALCA": "Espanol de Talca",
    "ESPAÑOL TALCA": "Espanol de Talca",
    "CD UNIV CONCEPCION": "Universidad de Concepcion",
    "CD UNIV. CONCEPCION": "Universidad de Concepcion",
    "CD UNIVERSIDAD DE CONCEPCION": "Universidad de Concepcion",
    "CD UNIV CATOLICA": "Universidad Catolica",
    "CD UNIV. CATOLICA": "Universidad Catolica",
    "CD UNIVERSIDAD CATOLICA": "Universidad Catolica",
    "CSD COLO COLO": "Colo-Colo",
    "CD COLO COLO": "Colo-Colo"
  },
  "Liga DOS 2026": {
    "ARABE VALPARAISO": "Arabe de Valparaiso",
    "CDS BASQUETBOL CONSTITUCION": "CDSB Constitucion",
    "CDS BASQUETBOL CONSTITUCIÓN": "CDSB Constitucion",
    "THE SHARKS": "CD Sharks",
    "UDE TEMUCO": "UDE Temuco"
  },
  "Liga Nacional Femenina 2026": {
    "AZUL Y ROJO": "Azul y Rojo",
    "CD GIMNASTICO": "Gimnastico Vina del Mar",
    "CD SERGIO CEPPI": "Sergio Ceppi",
    "CD UNIV CONCEPCION": "Universidad de Concepcion",
    "CD UNIV. CONCEPCION": "Universidad de Concepcion",
    "CD UNIVERSIDAD DE CONCEPCION": "Universidad de Concepcion",
    "COLEGIO LOS LEONES": "Colegio Los Leones",
    "MUN. PUENTE ALTO": "Municipal Puente Alto",
    "MUNICIPAL PUENTE ALTO": "Municipal Puente Alto",
    "SPORTIVA ITALIANA": "Sportiva Italiana",
    "STGO. MORNING QUILICURA": "Santiago Morning Quilicura",
    "SANTIAGO MORNING QUILICURA": "Santiago Morning Quilicura"
  }
};

function extractMatchId(url: string) {
  const decoded = decodeURIComponent(url);
  const patterns = [
    /\/data\/(\d+)\/data\.json/,
    /\/data\/(\d+)/,
    /\/u\/[^/]+\/(\d+)/,
    /\/match\/(\d+)\/summary/,
    /match%2F(\d+)%2Fsummary/i,
    /extfix_(\d+)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern) ?? url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function extractWhUrl(url: string) {
  try {
    const parsed = new URL(url);
    const whUrl = parsed.searchParams.get("WHurl");
    return whUrl ? decodeURIComponent(whUrl) : null;
  } catch {
    return null;
  }
}

function buildHostedEmbedUrl(sourceUrl: string, competition: CompetitionKey) {
  const whUrl = extractWhUrl(sourceUrl);
  const competitionId = competitionGeniusIds[competition] ?? competitionGeniusIds["Liga DOS 2026"];
  const page = whUrl?.includes("/competition/")
    ? whUrl
    : `/competition/${competitionId}/schedule`;
  const normalizedPage = page.startsWith("/") ? page : `/${page}`;
  const separator = normalizedPage.includes("?") ? "&" : "?";

  return `https://hosted.dcd.shared.geniussports.com/embednf/FDBCH/es${normalizedPage}${separator}iurl=${encodeURIComponent(
    "https://clnb.web.geniussports.com/?p=9"
  )}&_cc=1&_lc=1&_nv=1&_mf=1`;
}

function decodeHtml(value: string) {
  return value
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseEmbedHtml(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { html?: string };
    return decodeHtml(parsed.html ?? payload);
  } catch {
    return decodeHtml(payload);
  }
}

function stripTags(value = "") {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGeniusDate(dateText: string) {
  const [day, rawMonth, year, time] = stripTags(dateText).split(/\s+/);
  const month = {
    "ene.": "01",
    "feb.": "02",
    "mar.": "03",
    "abr.": "04",
    "may.": "05",
    "jun.": "06",
    "jul.": "07",
    "ago.": "08",
    "sept.": "09",
    "oct.": "10",
    "nov.": "11",
    "dic.": "12"
  }[rawMonth as "ene." | "feb." | "mar." | "abr." | "may." | "jun." | "jul." | "ago." | "sept." | "oct." | "nov." | "dic."];

  return {
    gameDate: year && month && day ? `${year}-${month}-${day.padStart(2, "0")}` : undefined,
    gameTime: time
  };
}

function phaseFromSourceUrl(sourceUrl: string) {
  const whUrl = extractWhUrl(sourceUrl);
  const phaseName = whUrl?.match(/phaseName=([^&]+)/)?.[1];
  return phaseName ? decodeURIComponent(phaseName).replace(/\+/g, " ") : undefined;
}

function extractMatchTargetsFromHtml(html: string, sourceUrl: string) {
  const decoded = parseEmbedHtml(html);
  const sourcePhase = phaseFromSourceUrl(sourceUrl);
  const parts = decoded.split(/<div class="match-wrap/).slice(1);

  if (parts.length > 0) {
    return parts
      .map((part): ImportTarget | null => {
        const block = `<div class="match-wrap${part}`;
        const matchId = block.match(/id = "extfix_(\d+)"/)?.[1] ?? block.match(/\/match\/(\d+)\/summary/)?.[1];
        const dateText = block.match(/<div class="match-time"><h6>Fecha \/ Hora: <\/h6><span>([^<]+)/)?.[1] ?? "";
        if (!matchId) {
          return null;
        }
        return {
          dataUrl: `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json`,
          sourceUrl,
          phase: sourcePhase,
          ...parseGeniusDate(dateText)
        };
      })
      .filter((target): target is ImportTarget => Boolean(target));
  }

  const patterns = [/\/match\/(\d+)\/summary/g, /match%2F(\d+)%2Fsummary/gi];
  const ids = new Set<string>();

  patterns.forEach((pattern) => {
    for (const match of decoded.matchAll(pattern)) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }
  });

  return Array.from(ids).map((matchId) => ({
    dataUrl: `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json`,
    sourceUrl,
    phase: sourcePhase
  }));
}

function extractSingleMatchMeta(html: string, sourceUrl: string): Partial<ImportTarget> {
  const decoded = parseEmbedHtml(html);
  const dateText =
    decoded.match(/<div class="match-time"><h6>Fecha \/ Hora: <\/h6><span>([^<]+)/)?.[1] ??
    decoded.match(/Fecha \/ Hora:\s*<\/h6>\s*<span>([^<]+)/)?.[1] ??
    "";

  return {
    phase: phaseFromSourceUrl(sourceUrl),
    ...parseGeniusDate(dateText)
  };
}

async function fetchMatchMeta(sourceUrl: string, competition: CompetitionKey): Promise<Partial<ImportTarget>> {
  if (!sourceUrl.includes("clnb.web.geniussports.com") && !sourceUrl.includes("hosted.dcd.shared.geniussports.com")) {
    return {};
  }

  try {
    const response = await fetch(buildHostedEmbedUrl(sourceUrl, competition), {
      cache: "no-store",
      headers: { "user-agent": "DOS Scout Pro/0.1" }
    });
    if (!response.ok) {
      return {};
    }
    return extractSingleMatchMeta(await response.text(), sourceUrl);
  } catch {
    return {};
  }
}

async function resolveImportUrls(url: string, competition: CompetitionKey) {
  const directMatchId = extractMatchId(url);
  if (directMatchId) {
    return [{
      dataUrl: `https://fibalivestats.dcd.shared.geniussports.com/data/${directMatchId}/data.json`,
      sourceUrl: url,
      ...(await fetchMatchMeta(url, competition))
    }];
  }

  if (!url.includes("clnb.web.geniussports.com") && !url.includes("hosted.dcd.shared.geniussports.com")) {
    return [{ dataUrl: url, sourceUrl: url }];
  }

  const response = await fetch(buildHostedEmbedUrl(url, competition), {
    cache: "no-store",
    headers: { "user-agent": "DOS Scout Pro/0.1" }
  });

  if (!response.ok) {
    throw new Error(`Genius/FEBACHILE respondio ${response.status} al leer la tabla: ${url}`);
  }

  const html = await response.text();
  const matchTargets = extractMatchTargetsFromHtml(html, url);
  if (matchTargets.length === 0) {
    throw new Error(`No encontre links de Estadisticas completas en: ${url}`);
  }

  return matchTargets;
}

function normalizeFibaUrl(url: string) {
  const matchId = extractMatchId(url);
  return matchId ? `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json` : null;
}

function aliasKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function findTeamName(fibaName: string, competition: CompetitionKey) {
  const normalizedKey = aliasKey(fibaName);
  const alias = boxscoreTeamAliases[competition]?.[normalizedKey];
  if (alias) {
    return alias;
  }
  return seedData.teams.find((team) => team.competition === competition && areSameTeam(team.name, fibaName))?.name
    ?? seedData.teams.find((team) => areSameTeam(team.name, fibaName))?.name
    ?? fibaName;
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
      assists: String(player.sAssists ?? 0),
      offensiveRebounds: String(player.sReboundsOffensive ?? 0),
      defensiveRebounds: String(player.sReboundsDefensive ?? 0),
      steals: String(player.sSteals ?? 0),
      turnovers: String(player.sTurnovers ?? 0),
      fouls: String(player.sFoulsPersonal ?? 0),
      twoMade: String(player.sTwoPointersMade ?? 0),
      twoAttempted: String(player.sTwoPointersAttempted ?? 0),
      threeMade: String(player.sThreePointersMade ?? 0),
      threeAttempted: String(player.sThreePointersAttempted ?? 0),
      freeThrowsMade: String(player.sFreeThrowsMade ?? 0),
      freeThrowsAttempted: String(player.sFreeThrowsAttempted ?? 0),
      starter: player.starter ? "si" : "no",
      games: "1"
    }));
}

function toPlayerGameStatRows({
  teamName,
  team,
  competition,
  gameId,
  sourceUrl
}: {
  teamName: string;
  team: FibaTeam;
  competition: CompetitionKey;
  gameId: string;
  sourceUrl: string;
}): PlayerGameStatRow[] {
  return toPlayerRows(teamName, team, competition).map((player) => ({
    ...player,
    statId: `${gameId}-${slugify(teamName)}-${slugify(player.name)}`,
    gameId,
    sourceUrl
  }));
}

function toShotRows({
  teamName,
  team,
  competition,
  gameId,
  sourceUrl
}: {
  teamName: string;
  team: FibaTeam;
  competition: CompetitionKey;
  gameId: string;
  sourceUrl: string;
}): ShotRow[] {
  return (team.shot ?? [])
    .filter((shot) => typeof shot.x === "number" && typeof shot.y === "number" && Boolean(shot.player))
    .map((shot, index) => ({
      shotId: `${gameId}-${teamName}-${shot.actionNumber ?? index}-${shot.player ?? "jugador"}`,
      gameId,
      competition,
      teamName,
      playerName: shot.player ?? "Jugador sin nombre",
      shirtNumber: String(shot.shirtNumber ?? ""),
      period: Number(shot.per ?? 0),
      actionType: shot.actionType ?? "",
      subType: shot.subType ?? "",
      made: Number(shot.r ?? 0) === 1,
      x: Number(shot.x),
      y: Number(shot.y),
      sourceUrl
    }));
}

async function importBoxscore(target: ImportTarget, competition: CompetitionKey): Promise<BoxscoreImport> {
  const dataUrl = normalizeFibaUrl(target.dataUrl);
  const matchId = extractMatchId(target.dataUrl);

  if (!dataUrl || !matchId) {
    throw new Error(`No pude detectar el ID de partido en: ${target.sourceUrl}`);
  }

  const response = await fetch(dataUrl, {
    cache: "no-store",
    headers: { "user-agent": "Cancha Predictiva LNB/0.1" }
  });

  if (!response.ok) {
    throw new Error(`FIBA respondio ${response.status} para ${target.sourceUrl}`);
  }

  const payload = (await response.json()) as FibaPayload;
  const teamOne = payload.tm?.["1"];
  const teamTwo = payload.tm?.["2"];

  if (!teamOne || !teamTwo) {
    throw new Error(`El boxscore no contiene dos equipos: ${target.sourceUrl}`);
  }

  const homeTeam = findTeamName(teamOne.name ?? teamOne.shortName ?? "Local", competition);
  const awayTeam = findTeamName(teamTwo.name ?? teamTwo.shortName ?? "Visita", competition);

  const game: GameRow = {
    gameId: `FIBA-${matchId}`,
    competition,
    phase: target.phase ?? seedData.teams.find((team) => team.competition === competition && team.name === homeTeam)?.zone ?? "Importado desde FIBA",
    week: "Importado",
    date: target.gameDate ?? new Date().toISOString().slice(0, 10),
    homeTeam,
    awayTeam,
    homeScore: String(teamOne.score ?? teamOne.tot_sPoints ?? 0),
    awayScore: String(teamTwo.score ?? teamTwo.tot_sPoints ?? 0),
    status: "Final",
    notes: `Importado desde FIBA ${matchId}${target.gameTime ? ` · ${target.gameTime}` : ""}`
  };
  const shots = [
    ...toShotRows({ teamName: homeTeam, team: teamOne, competition, gameId: game.gameId, sourceUrl: target.sourceUrl }),
    ...toShotRows({ teamName: awayTeam, team: teamTwo, competition, gameId: game.gameId, sourceUrl: target.sourceUrl })
  ];
  const players = [...toPlayerRows(homeTeam, teamOne, competition), ...toPlayerRows(awayTeam, teamTwo, competition)];
  const playerGameStats = [
    ...toPlayerGameStatRows({ teamName: homeTeam, team: teamOne, competition, gameId: game.gameId, sourceUrl: target.sourceUrl }),
    ...toPlayerGameStatRows({ teamName: awayTeam, team: teamTwo, competition, gameId: game.gameId, sourceUrl: target.sourceUrl })
  ];

  return {
    sourceUrl: target.sourceUrl,
    game,
    players,
    playerGameStats,
    shots,
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

  const resolvedUrls = await Promise.allSettled(urls.map((url) => resolveImportUrls(url, competition)));
  const importUrls = Array.from(
    resolvedUrls
      .filter((result): result is PromiseFulfilledResult<ImportTarget[]> => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .reduce((targets, target) => targets.set(target.dataUrl, target), new Map<string, ImportTarget>())
      .values()
  );
  const resolveErrors = resolvedUrls
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "Error leyendo tabla Genius."));

  const results = await Promise.allSettled(
    importUrls.map((target) => importBoxscore(target, competition))
  );
  const imports = results
    .filter((result): result is PromiseFulfilledResult<BoxscoreImport> => result.status === "fulfilled")
    .map((result) => result.value);
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "Error importando boxscore."));

  return NextResponse.json({ imports, errors: [...resolveErrors, ...errors] });
}
