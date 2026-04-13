import {
  areSameTeam,
  getAssistsPerGame,
  getGamesByCompetition,
  getPointDifferential,
  getPointsAgainstPerGame,
  getPointsForPerGame,
  getReboundsPerGame,
  getWinPct,
  parseNumber
} from "@/lib/data";
import { CompetitionKey, DatasetMap, GameRow, PlayerRow, TeamRow } from "@/lib/types";

export type UserRole = "admin" | "entrenador" | "asistente" | "jugador";
export type EvidenceLevel = "dato confirmado" | "inferencia estadistica" | "conclusion tactica";

export type SourceTrace = {
  id: string;
  sourceUrl: string;
  loadedAt: string;
  loadedBy: string;
  status: "procesado" | "pendiente" | "observado";
  confirmedFields: string[];
  inferredFields: string[];
  manualCorrections: string[];
};

export type QualitySignal = {
  label: string;
  value: string;
  evidence: EvidenceLevel;
  confidence: number;
};

export type PlayerScout = {
  name: string;
  teamName: string;
  role: string;
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  pointsPerMinute: number;
  reboundsPerMinute: number;
  assistTurnoverRatio: number | null;
  shootingEfficiency: number | null;
  estimatedOffensiveVolume: number;
  recentImpactIndex: number;
  threatIndex: number;
  trend: string;
  evidence: EvidenceLevel;
};

export type RotationScout = {
  starters: string[];
  firstChanges: string[];
  coreRotation: string[];
  closers: string[];
  confidence: number;
  evidence: EvidenceLevel;
  rule: string;
};

export type QuarterScout = {
  quarter: string;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  evidence: EvidenceLevel;
  confidence: number;
};

export type TeamScout = {
  team: TeamRow;
  recentRecord: string;
  sampleRecord: string;
  localitySplit: string;
  offenseTrend: string;
  defenseTrend: string;
  strengths: QualitySignal[];
  weaknesses: QualitySignal[];
  alerts: QualitySignal[];
};

export type MatchupScout = {
  ownTeam: TeamScout;
  rivalTeam: TeamScout;
  ownPlayers: PlayerScout[];
  rivalPlayers: PlayerScout[];
  ownRotation: RotationScout;
  rivalRotation: RotationScout;
  quarterModel: QuarterScout[];
  tacticalKeys: QualitySignal[];
  comparison: QualitySignal[];
  reportSections: string[];
  presentationSections: string[];
  sourceTrace: SourceTrace[];
};

export type ScoutingFilters = {
  sampleSize: number;
  locality: "all" | "home" | "away";
};

export const roleCapabilities: Record<UserRole, string[]> = {
  admin: [
    "Cargar links FEBACHILE / Genius Sports",
    "Corregir datos manualmente",
    "Ver fuente, auditoria y panel de calidad",
    "Gestionar usuarios, equipos y permisos"
  ],
  entrenador: [
    "Ver analisis completo",
    "Generar informes y presentaciones",
    "Guardar notas privadas",
    "Revisar historial de rivales"
  ],
  asistente: [
    "Ver analisis completo",
    "Agregar observaciones",
    "Colaborar en informes",
    "Guardar notas por rival, partido, jugador y equipo"
  ],
  jugador: [
    "Ver informe recortado",
    "Revisar puntos clave del rival",
    "Ver jugadores destacados",
    "Acceder al plan resumido de partido"
  ]
};

export const databaseTables = [
  "users",
  "roles",
  "teams",
  "players",
  "games",
  "game_sources",
  "team_game_stats",
  "player_game_stats",
  "quarter_stats",
  "inferred_rotations",
  "reports",
  "presentations",
  "notes",
  "audit_logs",
  "profile_settings"
];

function minutesToNumber(value: string) {
  if (!value.includes(":")) {
    return parseNumber(value);
  }

  const [minutes, seconds] = value.split(":").map(Number);
  return (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? seconds / 60 : 0);
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function filterGamesByLocality(games: GameRow[], teamName: string, locality: ScoutingFilters["locality"]) {
  if (locality === "home") {
    return games.filter((game) => areSameTeam(game.homeTeam, teamName));
  }
  if (locality === "away") {
    return games.filter((game) => areSameTeam(game.awayTeam, teamName));
  }
  return games;
}

function finalGamesForTeam(games: GameRow[], teamName: string, filters: ScoutingFilters) {
  return games
    .filter((game) => game.status === "Final" && (areSameTeam(game.homeTeam, teamName) || areSameTeam(game.awayTeam, teamName)))
    .filter((game) => filterGamesByLocality([game], teamName, filters.locality).length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, filters.sampleSize);
}

function getFilteredTeamForm(games: GameRow[], teamName: string, filters: ScoutingFilters) {
  const recentGames = finalGamesForTeam(games, teamName, filters);
  const wins = recentGames.filter((game) => {
    const homeWon = parseNumber(game.homeScore) > parseNumber(game.awayScore);
    return areSameTeam(game.homeTeam, teamName) ? homeWon : !homeWon;
  }).length;
  const averageFor =
    recentGames.length === 0
      ? 0
      : recentGames.reduce((sum, game) => {
          return sum + (areSameTeam(game.homeTeam, teamName) ? parseNumber(game.homeScore) : parseNumber(game.awayScore));
        }, 0) / recentGames.length;
  const averageAgainst =
    recentGames.length === 0
      ? 0
      : recentGames.reduce((sum, game) => {
          return sum + (areSameTeam(game.homeTeam, teamName) ? parseNumber(game.awayScore) : parseNumber(game.homeScore));
        }, 0) / recentGames.length;

  return {
    record: `${wins}-${Math.max(recentGames.length - wins, 0)}`,
    averageFor,
    averageAgainst,
    games: recentGames
  };
}

function averageMargin(games: GameRow[], teamName: string) {
  if (games.length === 0) {
    return 0;
  }

  return games.reduce((sum, game) => {
    const own = areSameTeam(game.homeTeam, teamName) ? parseNumber(game.homeScore) : parseNumber(game.awayScore);
    const opp = areSameTeam(game.homeTeam, teamName) ? parseNumber(game.awayScore) : parseNumber(game.homeScore);
    return sum + own - opp;
  }, 0) / games.length;
}

function buildPlayerScout(player: PlayerRow, team: TeamRow): PlayerScout {
  const fallbackGames = player.playerId.startsWith("GENIUS-") ? parseNumber(team.gamesPlayed) : 1;
  const games = Math.max(parseNumber(player.games) || fallbackGames || 1, 1);
  const totalMinutes = minutesToNumber(player.minutes);
  const totalPoints = parseNumber(player.points);
  const totalRebounds = parseNumber(player.rebounds);
  const totalAssists = parseNumber(player.assists);
  const totalTurnovers = parseNumber(player.turnovers);
  const totalSteals = parseNumber(player.steals);
  const totalFouls = parseNumber(player.fouls);
  const twoMade = parseNumber(player.twoMade);
  const twoAttempted = parseNumber(player.twoAttempted);
  const threeMade = parseNumber(player.threeMade);
  const threeAttempted = parseNumber(player.threeAttempted);
  const freeThrowsMade = parseNumber(player.freeThrowsMade);
  const freeThrowsAttempted = parseNumber(player.freeThrowsAttempted);
  const minutes = totalMinutes / games;
  const points = totalPoints / games;
  const rebounds = totalRebounds / games;
  const assists = totalAssists / games;
  const turnovers = totalTurnovers / games;
  const steals = totalSteals / games;
  const fouls = totalFouls / games;
  const totalAttempts = twoAttempted + threeAttempted + freeThrowsAttempted * 0.44;
  const weightedMakes = twoMade * 2 + threeMade * 3 + freeThrowsMade;
  const pointsPerMinute = totalMinutes === 0 ? 0 : totalPoints / totalMinutes;
  const reboundsPerMinute = totalMinutes === 0 ? 0 : totalRebounds / totalMinutes;
  const estimatedOffensiveVolume = points + assists * 2.1 + rebounds * 0.35 + steals * 0.8 - turnovers * 0.9;
  const recentImpactIndex = estimatedOffensiveVolume + minutes * 0.25 + getWinPct(team) * 8 - fouls * 0.3;
  const threatIndex = points * 1.2 + rebounds * 0.7 + assists * 1.4 + steals * 1.1 + minutes * 0.18 - turnovers * 0.5;
  const role =
    minutes >= 28
      ? "Eje de rotacion"
      : points >= 14 || assists >= 5
        ? "Generador / foco ofensivo"
        : rebounds >= 8
          ? "Impacto de posesion"
          : minutes >= 18
            ? "Rotacion principal"
            : "Rol situacional";

  return {
    name: player.name,
    teamName: player.teamName,
    role,
    games,
    minutes: round(minutes),
    points: round(points),
    rebounds: round(rebounds),
    assists: round(assists),
    pointsPerMinute: round(pointsPerMinute, 2),
    reboundsPerMinute: round(reboundsPerMinute, 2),
    assistTurnoverRatio: totalTurnovers === 0 ? (totalAssists > 0 ? totalAssists : null) : round(totalAssists / totalTurnovers, 2),
    shootingEfficiency: totalAttempts === 0 ? null : round(weightedMakes / (totalAttempts * 2), 2),
    estimatedOffensiveVolume: round(estimatedOffensiveVolume),
    recentImpactIndex: round(recentImpactIndex),
    threatIndex: round(threatIndex),
    trend: recentImpactIndex >= 24 ? "Alza / prioridad de plan" : recentImpactIndex >= 14 ? "Estable" : "Seguimiento",
    evidence: "inferencia estadistica"
  };
}

function buildTeamScout(team: TeamRow, games: GameRow[], filters: ScoutingFilters): TeamScout {
  const form = getFilteredTeamForm(games, team.name, filters);
  const recent = form.games;
  const homeGames = recent.filter((game) => areSameTeam(game.homeTeam, team.name)).length;
  const awayGames = recent.length - homeGames;
  const pointDiff = getPointDifferential(team);
  const defense = getPointsAgainstPerGame(team);
  const rebounds = getReboundsPerGame(team);
  const assists = getAssistsPerGame(team);

  return {
    team,
    recentRecord: `${team.wins}-${team.losses}`,
    sampleRecord: recent.length > 0 ? form.record : "sin muestra",
    localitySplit: `${team.gamesPlayed} PJ tabla | muestra ${form.record}: ${homeGames} local / ${awayGames} visita`,
    offenseTrend:
      form.averageFor >= 82
        ? "Ritmo anotador alto"
        : form.averageFor >= 72
          ? "Produccion media-controlada"
          : "Ataque de baja eficiencia reciente",
    defenseTrend:
      form.averageAgainst > 0 && form.averageAgainst <= 70
        ? "Defensa sostiene el margen"
        : form.averageAgainst <= 80
          ? "Defensa competitiva"
          : "Riesgo defensivo por volumen recibido",
    strengths: [
      {
        label: "Diferencial",
        value: `${round(pointDiff)} por partido`,
        evidence: "dato confirmado",
        confidence: 0.94
      },
      {
        label: "Generacion colectiva",
        value: `${round(assists)} asistencias por partido`,
        evidence: assists > 0 ? "dato confirmado" : "inferencia estadistica",
        confidence: assists > 0 ? 0.88 : 0.48
      },
      {
        label: "Control de tablero",
        value: `${round(rebounds)} rebotes por partido`,
        evidence: rebounds > 0 ? "dato confirmado" : "inferencia estadistica",
        confidence: rebounds > 0 ? 0.86 : 0.45
      }
    ],
    weaknesses: [
      {
        label: "Puntos permitidos",
        value: `${round(defense)} por partido`,
        evidence: "dato confirmado",
        confidence: 0.92
      },
      {
        label: "Margen reciente",
        value: `${round(averageMargin(recent, team.name))} en ultimos ${recent.length || 0}`,
        evidence: "dato confirmado",
        confidence: recent.length >= 3 ? 0.86 : 0.62
      }
    ],
    alerts: [
      {
        label: pointDiff >= 6 ? "Ventana de ventaja" : "Partido de margen fino",
        value: pointDiff >= 6 ? "Atacar temprano para ampliar diferencia" : "Reducir perdidas no registradas y cerrar rebote",
        evidence: "conclusion tactica",
        confidence: 0.7
      }
    ]
  };
}

function buildRotation(players: PlayerScout[]): RotationScout {
  const ordered = [...players].sort((a, b) => b.minutes - a.minutes || b.recentImpactIndex - a.recentImpactIndex);
  const confidence = ordered.length >= 8 ? 0.72 : ordered.length >= 5 ? 0.58 : 0.38;

  return {
    starters: ordered.slice(0, 5).map((player) => player.name),
    firstChanges: ordered.slice(5, 7).map((player) => player.name),
    coreRotation: ordered.slice(0, 9).map((player) => player.name),
    closers: [...ordered].sort((a, b) => b.recentImpactIndex - a.recentImpactIndex).slice(0, 5).map((player) => player.name),
    confidence,
    evidence: "inferencia estadistica",
    rule: "Ultimos registros disponibles, minutos, consistencia de aparicion e indice de impacto reciente."
  };
}

function buildQuarterModel(own: TeamRow, rival: TeamRow): QuarterScout[] {
  const ownFor = getPointsForPerGame(own);
  const rivalFor = getPointsForPerGame(rival);
  const ownAgainst = getPointsAgainstPerGame(own);
  const rivalAgainst = getPointsAgainstPerGame(rival);
  const ownExpected = (ownFor + rivalAgainst) / 2;
  const rivalExpected = (rivalFor + ownAgainst) / 2;
  const profile = [
    ["1C", 0.26, 0.25],
    ["2C", 0.23, 0.24],
    ["3C", 0.27, 0.26],
    ["4C", 0.24, 0.25]
  ] as const;

  return profile.map(([quarter, ownWeight, rivalWeight]) => {
    const pointsFor = round(ownExpected * ownWeight);
    const pointsAgainst = round(rivalExpected * rivalWeight);
    return {
      quarter,
      pointsFor,
      pointsAgainst,
      differential: round(pointsFor - pointsAgainst),
      evidence: "inferencia estadistica",
      confidence: 0.52
    };
  });
}

function buildComparison(ownTeam: TeamScout, rivalTeam: TeamScout, ownPlayers: PlayerScout[], rivalPlayers: PlayerScout[]): QualitySignal[] {
  const own = ownTeam.team;
  const rival = rivalTeam.team;
  const topRival = rivalPlayers[0];
  const topOwn = ownPlayers[0];

  return [
    {
      label: "Donde somos mejores",
      value: getPointDifferential(own) >= getPointDifferential(rival) ? "Diferencial competitivo y control de marcador" : "Ventaja puntual: revisar emparejamientos individuales",
      evidence: "conclusion tactica",
      confidence: 0.68
    },
    {
      label: "Donde somos peores",
      value: getPointsAgainstPerGame(own) > getPointsAgainstPerGame(rival) ? "Puntos permitidos; prioridad a balance defensivo" : "Ataque medio; buscar tiros tempranos de alta calidad",
      evidence: "conclusion tactica",
      confidence: 0.66
    },
    {
      label: "Mayor amenaza rival",
      value: topRival ? `${topRival.name} (${topRival.role}, amenaza ${topRival.threatIndex})` : "Sin muestra de jugadores suficiente",
      evidence: topRival ? "inferencia estadistica" : "conclusion tactica",
      confidence: topRival ? 0.72 : 0.35
    },
    {
      label: "Ventaja propia",
      value: topOwn ? `${topOwn.name} como punto de presion inicial` : "Sin muestra de jugadores suficiente",
      evidence: topOwn ? "inferencia estadistica" : "conclusion tactica",
      confidence: topOwn ? 0.7 : 0.35
    }
  ];
}

export function buildScoutingModel(
  data: DatasetMap,
  competition: CompetitionKey,
  ownTeamName: string,
  rivalTeamName: string,
  sourceTrace: SourceTrace[],
  filters: ScoutingFilters = { sampleSize: 5, locality: "all" }
): MatchupScout | null {
  const teams = data.teams.filter((team) => team.competition === competition);
  const games = getGamesByCompetition(data.games, competition);
  const own = teams.find((team) => areSameTeam(team.name, ownTeamName)) ?? teams[0];
  const rival = teams.find((team) => areSameTeam(team.name, rivalTeamName)) ?? teams.find((team) => !areSameTeam(team.name, own?.name ?? "")) ?? teams[0];

  if (!own || !rival) {
    return null;
  }

  const ownTeam = buildTeamScout(own, games, filters);
  const rivalTeam = buildTeamScout(rival, games, filters);
  const ownPlayers = data.players
    .filter((player) => player.competition === competition && areSameTeam(player.teamName, own.name))
    .map((player) => buildPlayerScout(player, own))
    .sort((a, b) => b.threatIndex - a.threatIndex);
  const rivalPlayers = data.players
    .filter((player) => player.competition === competition && areSameTeam(player.teamName, rival.name))
    .map((player) => buildPlayerScout(player, rival))
    .sort((a, b) => b.threatIndex - a.threatIndex);
  const quarterModel = buildQuarterModel(own, rival);
  const bestQuarter = [...quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const holdQuarter = [...quarterModel].sort((a, b) => a.differential - b.differential)[0];
  const comparison = buildComparison(ownTeam, rivalTeam, ownPlayers, rivalPlayers);

  return {
    ownTeam,
    rivalTeam,
    ownPlayers,
    rivalPlayers,
    ownRotation: buildRotation(ownPlayers),
    rivalRotation: buildRotation(rivalPlayers),
    quarterModel,
    comparison,
    tacticalKeys: [
      ...comparison,
      {
        label: "Cuarto para atacar",
        value: `${bestQuarter.quarter}: diferencial proyectado ${bestQuarter.differential}`,
        evidence: "inferencia estadistica",
        confidence: bestQuarter.confidence
      },
      {
        label: "Cuarto para resistir",
        value: `${holdQuarter.quarter}: controlar ritmo y faltas`,
        evidence: "inferencia estadistica",
        confidence: holdQuarter.confidence
      }
    ],
    reportSections: ["Prepartido", "Postpartido", "Reporte tecnico largo", "Resumen ejecutivo"],
    presentationSections: [
      "Portada",
      "Introduccion",
      "Resumen ejecutivo",
      "Analisis rival",
      "Analisis propio",
      "Comparacion",
      "Lideres",
      "Rotacion",
      "Analisis por cuartos",
      "Claves del partido",
      "Conclusion final"
    ],
    sourceTrace
  };
}

type ReportKind = "prepartido" | "postpartido" | "presentacion" | "resumen" | "tecnico";

function formatNumber(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function confidenceLabel(confidence: number) {
  return `${(confidence * 100).toFixed(0)}%`;
}

function signalLine(signal: QualitySignal) {
  return `- ${signal.label}: ${signal.value} | ${signal.evidence}, confianza ${confidenceLabel(signal.confidence)}`;
}

function playerLine(player: PlayerScout, index: number) {
  return `${index + 1}. ${player.name} | ${player.role} | PJ ${formatNumber(player.games, 0)} | ${player.minutes} MIN/PJ | ${player.points} PTS/PJ | ${player.rebounds} REB/PJ | ${player.assists} AST/PJ | AST/PER ${player.assistTurnoverRatio ?? "s/d"} | amenaza ${player.threatIndex}`;
}

function teamSnapshot(label: string, scout: TeamScout) {
  const team = scout.team;
  return [
    `### ${label}: ${team.name}`,
    `- Record tabla: ${scout.recentRecord} en ${team.gamesPlayed} PJ.`,
    `- Puntos: ${formatNumber(getPointsForPerGame(team))} PF/PJ | ${formatNumber(getPointsAgainstPerGame(team))} PC/PJ | diferencial ${formatNumber(getPointDifferential(team))}.`,
    `- Estructura colectiva: ${formatNumber(getReboundsPerGame(team))} REB/PJ | ${formatNumber(getAssistsPerGame(team))} AST/PJ.`,
    `- Forma de muestra: ${scout.sampleRecord} | ${scout.localitySplit}.`
  ];
}

function rotationBlock(label: string, rotation: RotationScout) {
  return [
    `### ${label}`,
    `- Quinteto inicial probable: ${rotation.starters.join(", ") || "sin muestra suficiente"}.`,
    `- Primeros cambios: ${rotation.firstChanges.join(", ") || "sin muestra suficiente"}.`,
    `- Rotacion 8-9: ${rotation.coreRotation.join(", ") || "sin muestra suficiente"}.`,
    `- Cierre probable: ${rotation.closers.join(", ") || "sin muestra suficiente"}.`,
    `- Metodo: ${rotation.rule} Confianza ${confidenceLabel(rotation.confidence)}.`
  ];
}

function quarterBlock(model: MatchupScout) {
  const best = [...model.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const risk = [...model.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  return [
    "## Plan por cuartos",
    ...model.quarterModel.map((quarter) => `- ${quarter.quarter}: ${quarter.pointsFor}-${quarter.pointsAgainst}, diferencial ${quarter.differential} | ${quarter.evidence}, confianza ${confidenceLabel(quarter.confidence)}.`),
    `- Ventana para atacar: ${best.quarter}. Subir calidad de tiro temprano si el partido confirma ese ritmo.`,
    `- Tramo para resistir: ${risk.quarter}. Priorizar balance, faltas y rebote defensivo.`
  ];
}

function reliabilityBlock(model: MatchupScout) {
  return [
    "## Trazabilidad y confiabilidad",
    "- Dato confirmado: viene desde dataset oficial sincronizado o boxscore FIBA importado.",
    "- Inferencia estadistica: se calcula desde minutos, aparicion, volumen e impacto reciente.",
    "- Conclusion tactica: lectura automatica para uso del cuerpo tecnico; debe validarse con video y scouting presencial.",
    ...(model.sourceTrace.length > 0
      ? model.sourceTrace.slice(0, 8).map((source) => `- Fuente: ${source.sourceUrl} | ${source.status} | ${source.loadedAt} | ajustes: ${source.manualCorrections.join(", ") || "sin ajustes"}`)
      : ["- Fuente: base local del MVP; sincronizar Genius antes de entregar version final al staff."])
  ];
}

function matchupBrief(model: MatchupScout) {
  return [
    "## Resumen ejecutivo",
    ...model.comparison.slice(0, 4).map(signalLine),
    `- Amenaza principal rival: ${model.rivalPlayers[0] ? `${model.rivalPlayers[0].name}, ${model.rivalPlayers[0].points} PTS/PJ, ${model.rivalPlayers[0].rebounds} REB/PJ, amenaza ${model.rivalPlayers[0].threatIndex}` : "sin muestra suficiente"}.`,
    `- Ventaja propia primaria: ${model.ownPlayers[0] ? `${model.ownPlayers[0].name}, ${model.ownPlayers[0].points} PTS/PJ, impacto ${model.ownPlayers[0].recentImpactIndex}` : "sin muestra suficiente"}.`
  ];
}

function planBlock(model: MatchupScout) {
  const rivalThreat = model.rivalPlayers[0];
  const ownAdvantage = model.ownPlayers[0];
  return [
    "## Plan de partido",
    `- Prioridad defensiva: ${rivalThreat ? `negar comodidad inicial a ${rivalThreat.name}; forzar tiros de baja eficiencia y reducir asistencias tempranas.` : "validar amenaza rival con video antes de cerrar plan."}`,
    `- Prioridad ofensiva: ${ownAdvantage ? `abrir el partido involucrando a ${ownAdvantage.name} para fijar ayudas y castigar ventajas.` : "construir tiros desde spacing y cortes, sin acelerar perdidas."}`,
    "- Control de posesion: asegurar primer rebote defensivo antes de correr; si el rival carga tablero, cerrar con 5 jugadores.",
    "- Disciplina: evitar bonus temprano en el cuarto de mayor riesgo y cambiar cobertura antes de conceder racha de 6 puntos.",
    "- Banco: preparar los dos primeros cambios segun la rotacion inferida y mirar si el rival baja tamano o manejo."
  ];
}

function buildPregameReport(model: MatchupScout) {
  return [
    "# Informe prepartido premium",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    `Generado: ${new Date().toLocaleString("es-CL")}`,
    "",
    ...matchupBrief(model),
    "",
    "## Snapshot competitivo",
    ...teamSnapshot("Equipo propio", model.ownTeam),
    "",
    ...teamSnapshot("Rival", model.rivalTeam),
    "",
    "## Jugadores a controlar",
    ...model.rivalPlayers.slice(0, 8).map(playerLine),
    "",
    "## Ventajas propias disponibles",
    ...model.ownPlayers.slice(0, 6).map(playerLine),
    "",
    ...rotationBlock("Rotacion rival probable", model.rivalRotation),
    "",
    ...planBlock(model),
    "",
    ...quarterBlock(model),
    "",
    "## Checklist para staff",
    "- Primeros 5 minutos: confirmar matchups, ritmo, balance y rebote.",
    "- Minuto de control: si el rival entra en racha, cortar con accion de alto porcentaje y ajuste defensivo simple.",
    "- Cierre: proteger a los cinco de mayor impacto y atacar el matchup con peor contencion lateral.",
    "",
    ...reliabilityBlock(model)
  ].join("\n");
}

function buildTechnicalReport(model: MatchupScout) {
  return [
    "# Reporte tecnico largo",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    `Generado: ${new Date().toLocaleString("es-CL")}`,
    "",
    ...matchupBrief(model),
    "",
    "## Diagnostico propio",
    ...teamSnapshot("Equipo propio", model.ownTeam),
    ...model.ownTeam.strengths.map(signalLine),
    ...model.ownTeam.weaknesses.map(signalLine),
    "",
    "## Diagnostico rival",
    ...teamSnapshot("Rival", model.rivalTeam),
    ...model.rivalTeam.strengths.map(signalLine),
    ...model.rivalTeam.weaknesses.map(signalLine),
    "",
    "## Lideres rivales por amenaza",
    ...model.rivalPlayers.slice(0, 10).map(playerLine),
    "",
    "## Lideres propios por impacto",
    ...model.ownPlayers.slice(0, 10).map(playerLine),
    "",
    ...rotationBlock("Rotacion propia probable", model.ownRotation),
    "",
    ...rotationBlock("Rotacion rival probable", model.rivalRotation),
    "",
    ...planBlock(model),
    "",
    ...quarterBlock(model),
    "",
    "## Riesgos tacticos",
    "- Si el rival domina el rebote ofensivo: cerrar con lineup de mayor tablero y negar tiros de esquina en segunda oportunidad.",
    "- Si el rival aumenta presion sobre el balon: usar reversos cortos, receptor de seguridad y primer pase al centro.",
    "- Si nuestro ataque cae bajo eficiencia: jugar a paint touch, extra pass y tiro liberado antes de tomar pull-up contestado.",
    "- Si hay problemas de faltas: cambiar matchup primario y proteger al defensor clave con ayudas tempranas.",
    "",
    "## Recomendaciones de video",
    "- Recortar posesiones de los 3 jugadores rivales con mayor amenaza.",
    "- Revisar cierres de cuarto y primeros cambios.",
    "- Marcar clips de rebote ofensivo rival, transicion defensiva y situaciones de bonus.",
    "",
    ...reliabilityBlock(model)
  ].join("\n");
}

function buildPostgameReport(model: MatchupScout) {
  return [
    "# Informe postpartido premium",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    `Generado: ${new Date().toLocaleString("es-CL")}`,
    "",
    "## Lectura postpartido",
    "- Este informe usa la base cargada para ordenar aprendizajes y validar el plan. Si el boxscore del partido ya fue importado, las lineas de jugador y equipo se actualizan con datos confirmados.",
    ...model.tacticalKeys.map(signalLine),
    "",
    "## Control de objetivos",
    "- Objetivo 1: comparar puntos permitidos contra el promedio rival y el diferencial esperado.",
    "- Objetivo 2: revisar si la amenaza principal rival quedo bajo su produccion por partido.",
    "- Objetivo 3: medir rebote, perdidas y ritmo del primer pase despues de rebote defensivo.",
    "- Objetivo 4: validar si el cierre tuvo a los cinco de mayor impacto disponible.",
    "",
    "## Jugadores que deben revisarse en video",
    ...[...model.rivalPlayers, ...model.ownPlayers]
      .sort((a, b) => b.recentImpactIndex - a.recentImpactIndex)
      .slice(0, 10)
      .map(playerLine),
    "",
    ...quarterBlock(model),
    "",
    "## Acciones para la semana",
    "- Actualizar notas privadas por rival y jugador.",
    "- Cargar el boxscore FIBA final si aun figura pendiente.",
    "- Marcar clips de las 8 posesiones que cambiaron el momentum.",
    "- Ajustar reglas de rotacion con lo observado en cierres y primeros cambios.",
    "",
    ...reliabilityBlock(model)
  ].join("\n");
}

function buildExecutiveSummary(model: MatchupScout) {
  return [
    "# Resumen ejecutivo",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    "",
    "## Mensaje central",
    ...model.comparison.slice(0, 4).map(signalLine),
    "",
    "## Tres focos para jugadores",
    `- Controlar a ${model.rivalPlayers[0]?.name ?? "la principal amenaza rival"} sin regalar faltas tempranas.`,
    "- Cerrar rebote defensivo antes de correr.",
    `- Atacar el ${[...model.quarterModel].sort((a, b) => b.differential - a.differential)[0].quarter} con decision y tiro de alta calidad.`,
    "",
    "## Amenazas",
    ...model.rivalPlayers.slice(0, 4).map(playerLine),
    "",
    "## Rotacion rival resumida",
    `- Titulares probables: ${model.rivalRotation.starters.join(", ") || "sin muestra suficiente"}.`,
    `- Cierre probable: ${model.rivalRotation.closers.join(", ") || "sin muestra suficiente"}.`,
    `- Confianza: ${confidenceLabel(model.rivalRotation.confidence)}.`
  ].join("\n");
}

function buildPresentation(model: MatchupScout) {
  const rivalThreats = model.rivalPlayers.slice(0, 4).map((player) => `- ${player.name}: ${player.points} PTS/PJ, ${player.rebounds} REB/PJ, amenaza ${player.threatIndex}`);
  return [
    "# Slide 01 | Portada",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    "",
    "# Slide 02 | Resumen ejecutivo",
    ...model.comparison.slice(0, 3).map(signalLine),
    "",
    "# Slide 03 | Identidad rival",
    ...teamSnapshot("Rival", model.rivalTeam),
    "",
    "# Slide 04 | Nuestra ventaja",
    ...teamSnapshot("Equipo propio", model.ownTeam),
    "",
    "# Slide 05 | Amenazas rivales",
    ...rivalThreats,
    "",
    "# Slide 06 | Rotacion rival",
    ...rotationBlock("Rotacion probable", model.rivalRotation),
    "",
    "# Slide 07 | Plan defensivo",
    ...planBlock(model).slice(1, 4),
    "",
    "# Slide 08 | Plan ofensivo",
    ...planBlock(model).slice(4),
    "",
    "# Slide 09 | Cuartos",
    ...quarterBlock(model).slice(1),
    "",
    "# Slide 10 | Claves finales",
    "- Cuidar el balon.",
    "- Ganar el rebote del cuarto critico.",
    "- Llegar al cierre con matchups definidos.",
    "- Ajustar desde evidencia: dato confirmado, inferencia y conclusion tactica."
  ].join("\n");
}

export function buildEditableReport(model: MatchupScout, kind: ReportKind) {
  if (kind === "presentacion") {
    return buildPresentation(model);
  }
  if (kind === "postpartido") {
    return buildPostgameReport(model);
  }
  if (kind === "resumen") {
    return buildExecutiveSummary(model);
  }
  if (kind === "tecnico") {
    return buildTechnicalReport(model);
  }
  return buildPregameReport(model);
}
