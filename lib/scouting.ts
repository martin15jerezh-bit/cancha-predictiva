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

export type DecisionInsight = {
  label: string;
  value: string;
  action: string;
  evidence: EvidenceLevel;
  confidence: number;
  tone: "advantage" | "risk" | "neutral";
};

export type TacticalKey = {
  title: string;
  action: string;
  why: string;
  trigger: string;
  evidence: EvidenceLevel;
  confidence: number;
};

export type TeamIdentity = {
  summary: string;
  rhythm: string;
  offensiveStyle: string;
  defensiveStyle: string;
  playerDependency: string;
  clutchBehavior: string;
  evidence: EvidenceLevel;
  confidence: number;
};

export type PredictionModel = {
  ownWinProbability: number;
  rivalWinProbability: number;
  expectedMargin: number;
  marginRange: string;
  trend: string;
  confidence: number;
  evidence: EvidenceLevel;
};

export type PlanValidationCheck = {
  label: string;
  projected: string;
  actual: string;
  status: "logrado" | "fallo" | "pendiente";
  decision: string;
  evidence: EvidenceLevel;
  confidence: number;
};

export type PlanValidation = {
  headline: string;
  checks: PlanValidationCheck[];
};

export type PlayerScout = {
  name: string;
  teamName: string;
  role: string;
  playerType: string;
  strength: string;
  weakness: string;
  defensiveKey: string;
  decisionTrigger: string;
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
  lineupStability: string;
  benchDependency: string;
  benchImpact: string;
  pressureClosers: string;
  confidence: number;
  evidence: EvidenceLevel;
  rule: string;
};

export type QuarterScout = {
  quarter: string;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  momentum: string;
  recommendation: string;
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
  decisionBrief: DecisionInsight[];
  tacticalKeysCore: TacticalKey[];
  rivalIdentity: TeamIdentity;
  ownIdentity: TeamIdentity;
  prediction: PredictionModel;
  planValidation: PlanValidation;
  playerModeBrief: string[];
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percent(value: number) {
  return `${Math.round(value)}%`;
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
  const shootingEfficiency = totalAttempts === 0 ? null : round(weightedMakes / (totalAttempts * 2), 2);
  const playerType =
    points >= 18
      ? "Scorer dominante"
      : assists >= 5
        ? "Generador primario"
        : rebounds >= 8
          ? "Reboteador / posesiones"
          : shootingEfficiency !== null && shootingEfficiency >= 0.62
            ? "Finalizador eficiente"
            : minutes >= 22
              ? "Conector de rotacion"
              : "Energia situacional";
  const strength =
    playerType === "Scorer dominante"
      ? `volumen alto: ${round(points)} PTS/PJ`
      : playerType === "Generador primario"
        ? `creacion: ${round(assists)} AST/PJ`
        : playerType === "Reboteador / posesiones"
          ? `posesiones extra: ${round(rebounds)} REB/PJ`
          : shootingEfficiency !== null && shootingEfficiency >= 0.58
            ? `eficiencia de tiro ${shootingEfficiency}`
            : `sostiene ${round(minutes)} MIN/PJ`;
  const weakness =
    shootingEfficiency !== null && shootingEfficiency < 0.48
      ? "baja eficiencia si se fuerza tiro contestado"
      : totalTurnovers > 0 && totalAssists / Math.max(totalTurnovers, 1) < 1
        ? "toma decisiones vulnerable bajo presion"
        : rebounds < 3 && minutes >= 20
          ? "poco impacto en tablero para sus minutos"
          : points < 7 && minutes >= 18
            ? "bajo volumen anotador si se le niega ritmo"
            : "obligarlo a ejecutar fuera de su primera lectura";
  const defensiveKey =
    playerType === "Scorer dominante"
      ? "sacar el balon de sus manos antes de que entre en ritmo"
      : playerType === "Generador primario"
        ? "negar eje central y forzar pase lateral temprano"
        : playerType === "Reboteador / posesiones"
          ? "bloqueo de rebote fisico; no mirar la pelota"
          : shootingEfficiency !== null && shootingEfficiency >= 0.62
            ? "no conceder catch and finish limpio"
            : "hacerlo decidir con contacto y reloj bajo";
  const decisionTrigger =
    points >= 14
      ? `si supera ${Math.ceil(points + 4)} puntos, cambiar cobertura o enviar ayuda temprana`
      : assists >= 5
        ? `si llega a ${Math.ceil(assists + 2)} asistencias, negar recepcion central`
        : rebounds >= 8
          ? `si captura ${Math.ceil(rebounds + 3)} rebotes, cerrar con lineup de mas tablero`
          : `si supera ${Math.ceil(minutes + 4)} minutos de impacto, ajustar matchup secundario`;
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
    playerType,
    strength,
    weakness,
    defensiveKey,
    decisionTrigger,
    games,
    minutes: round(minutes),
    points: round(points),
    rebounds: round(rebounds),
    assists: round(assists),
    pointsPerMinute: round(pointsPerMinute, 2),
    reboundsPerMinute: round(reboundsPerMinute, 2),
    assistTurnoverRatio: totalTurnovers === 0 ? (totalAssists > 0 ? totalAssists : null) : round(totalAssists / totalTurnovers, 2),
    shootingEfficiency,
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
  const starterMinutes = ordered.slice(0, 5).reduce((sum, player) => sum + player.minutes, 0);
  const benchMinutes = ordered.slice(5, 9).reduce((sum, player) => sum + player.minutes, 0);
  const totalRotationMinutes = Math.max(starterMinutes + benchMinutes, 1);
  const benchShare = benchMinutes / totalRotationMinutes;
  const lineupStability =
    ordered.length >= 8 && ordered[4]?.minutes - (ordered[5]?.minutes ?? 0) >= 4
      ? "Alta: top 5 claramente separado por minutos"
      : ordered.length >= 7
        ? "Media: quinteto probable con banca cercana"
        : "Baja: muestra insuficiente o rotacion abierta";
  const benchDependency =
    benchShare >= 0.34
      ? "Alta: la banca sostiene una parte relevante del volumen"
      : benchShare >= 0.24
        ? "Media: banca funcional para cambiar ritmo"
        : "Baja: alta carga sobre titulares";
  const benchImpactPlayers = ordered.slice(5, 9).filter((player) => player.recentImpactIndex >= 12);
  const benchImpact =
    benchImpactPlayers.length >= 2
      ? `Banco con impacto: ${benchImpactPlayers.slice(0, 2).map((player) => player.name).join(", ")}`
      : benchImpactPlayers[0]
        ? `Banco condicionado a ${benchImpactPlayers[0].name}`
        : "Banco de bajo impacto estadistico";
  const pressureClosers = [...ordered]
    .sort((a, b) => b.recentImpactIndex - a.recentImpactIndex || b.minutes - a.minutes)
    .slice(0, 5)
    .map((player) => player.name)
    .join(", ");

  return {
    starters: ordered.slice(0, 5).map((player) => player.name),
    firstChanges: ordered.slice(5, 7).map((player) => player.name),
    coreRotation: ordered.slice(0, 9).map((player) => player.name),
    closers: [...ordered].sort((a, b) => b.recentImpactIndex - a.recentImpactIndex).slice(0, 5).map((player) => player.name),
    lineupStability,
    benchDependency,
    benchImpact,
    pressureClosers: pressureClosers || "sin muestra suficiente",
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
      momentum:
        pointsFor - pointsAgainst >= 2
          ? "dominio proyectado"
          : pointsFor - pointsAgainst <= -2
            ? "riesgo de caida"
            : "tramo neutro",
      recommendation:
        pointsFor - pointsAgainst >= 2
          ? "subir agresividad ofensiva y buscar parcial"
          : pointsFor - pointsAgainst <= -2
            ? "bajar ritmo, proteger rebote y evitar bonus"
            : "administrar faltas y sostener calidad de tiro",
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

function buildTeamIdentity(teamScout: TeamScout, players: PlayerScout[], rotation: RotationScout): TeamIdentity {
  const team = teamScout.team;
  const pointsFor = getPointsForPerGame(team);
  const pointsAgainst = getPointsAgainstPerGame(team);
  const topScorer = players[0];
  const topThreePoints = players.slice(0, 3).reduce((sum, player) => sum + player.points, 0);
  const dependency = pointsFor > 0 ? topThreePoints / pointsFor : 0;
  const rhythm = pointsFor >= 82 ? "Ritmo alto" : pointsFor <= 70 ? "Ritmo bajo / controlado" : "Ritmo medio";
  const offensiveStyle =
    topScorer?.assists >= 5
      ? "ofensiva iniciada por generador principal"
      : topScorer?.points >= 18
        ? "ofensiva dependiente de scorer de volumen"
        : getAssistsPerGame(team) >= 15
          ? "ofensiva colectiva con buena circulacion"
          : "ofensiva de baja asistencia, mas posesiones individuales";
  const defensiveStyle =
    pointsAgainst <= 70
      ? "defensa compacta que sostiene margen"
      : pointsAgainst >= 82
        ? "defensa vulnerable a parciales largos"
        : "defensa competitiva, sensible al rebote y balance";
  const playerDependency =
    dependency >= 0.58
      ? "alta dependencia del top 3 ofensivo"
      : dependency >= 0.44
        ? "dependencia media de sus lideres"
        : "produccion relativamente distribuida";
  const clutchBehavior =
    getPointDifferential(team) >= 6
      ? "cierres favorables si llega con control de ritmo"
      : getPointDifferential(team) <= -6
        ? "sufre si el partido entra en posesiones de presion"
        : "clutch de margen fino; el cierre depende de ejecucion y faltas";

  return {
    summary: `Equipo ${rhythm.toLowerCase()} con ${offensiveStyle}; ${playerDependency}.`,
    rhythm,
    offensiveStyle,
    defensiveStyle,
    playerDependency,
    clutchBehavior: `${clutchBehavior}. ${rotation.pressureClosers}`,
    evidence: "inferencia estadistica",
    confidence: players.length >= 8 ? 0.72 : 0.55
  };
}

function buildPrediction(ownTeam: TeamScout, rivalTeam: TeamScout): PredictionModel {
  const own = ownTeam.team;
  const rival = rivalTeam.team;
  const ownExpected = (getPointsForPerGame(own) + getPointsAgainstPerGame(rival)) / 2;
  const rivalExpected = (getPointsForPerGame(rival) + getPointsAgainstPerGame(own)) / 2;
  const expectedMargin = round(ownExpected - rivalExpected);
  const winDelta = (getWinPct(own) - getWinPct(rival)) * 18;
  const marginDelta = (getPointDifferential(own) - getPointDifferential(rival)) * 1.8;
  const ownWinProbability = round(clamp(50 + winDelta + marginDelta, 18, 82), 0);
  const rivalWinProbability = 100 - ownWinProbability;
  const confidence = clamp(0.52 + Math.min(parseNumber(own.gamesPlayed), parseNumber(rival.gamesPlayed), 5) * 0.035, 0.52, 0.74);

  return {
    ownWinProbability,
    rivalWinProbability,
    expectedMargin,
    marginRange: `${round(expectedMargin - 6)} a ${round(expectedMargin + 6)} pts`,
    trend:
      ownWinProbability >= 58
        ? "tendencia favorable si se controla el primer rebote"
        : ownWinProbability <= 42
          ? "tendencia de riesgo; requiere ganar margen de posesiones"
          : "partido de posesiones cortas y cierre ajustado",
    confidence,
    evidence: "inferencia estadistica"
  };
}

function buildDecisionBrief(modelLike: {
  ownTeam: TeamScout;
  rivalTeam: TeamScout;
  ownPlayers: PlayerScout[];
  rivalPlayers: PlayerScout[];
  quarterModel: QuarterScout[];
  prediction: PredictionModel;
}): DecisionInsight[] {
  const own = modelLike.ownTeam.team;
  const rival = modelLike.rivalTeam.team;
  const topOwn = modelLike.ownPlayers[0];
  const topRival = modelLike.rivalPlayers[0];
  const bestQuarter = [...modelLike.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const riskQuarter = [...modelLike.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  const differentialGap = round(getPointDifferential(own) - getPointDifferential(rival));

  return [
    {
      label: "Ventaja principal",
      value: differentialGap >= 0 ? `+${differentialGap} diferencial vs rival` : `${differentialGap} diferencial vs rival`,
      action: differentialGap >= 0 ? "acelerar el inicio para transformar ventaja en parcial" : "jugar posesiones largas y reducir perdidas",
      evidence: "dato confirmado",
      confidence: 0.86,
      tone: differentialGap >= 0 ? "advantage" : "risk"
    },
    {
      label: "Riesgo principal",
      value: topRival ? `${topRival.name}: ${topRival.points} PTS/PJ` : "sin muestra individual",
      action: topRival ? topRival.defensiveKey : "validar amenaza con video antes de cerrar plan",
      evidence: topRival ? "inferencia estadistica" : "conclusion tactica",
      confidence: topRival ? 0.72 : 0.35,
      tone: "risk"
    },
    {
      label: "Matchup clave",
      value: topOwn && topRival ? `${topOwn.name} vs ${topRival.name}` : "matchup por definir",
      action: topOwn ? `cargar ventajas desde ${topOwn.name} y obligar ayudas tempranas` : "priorizar lectura de primeros 5 minutos",
      evidence: "conclusion tactica",
      confidence: topOwn && topRival ? 0.68 : 0.4,
      tone: "neutral"
    },
    {
      label: "Cuarto a atacar",
      value: `${bestQuarter.quarter}: ${bestQuarter.differential >= 0 ? "+" : ""}${bestQuarter.differential}`,
      action: bestQuarter.recommendation,
      evidence: bestQuarter.evidence,
      confidence: bestQuarter.confidence,
      tone: bestQuarter.differential >= 0 ? "advantage" : "neutral"
    },
    {
      label: "Cuarto a sobrevivir",
      value: `${riskQuarter.quarter}: ${riskQuarter.differential}`,
      action: riskQuarter.recommendation,
      evidence: riskQuarter.evidence,
      confidence: riskQuarter.confidence,
      tone: riskQuarter.differential < 0 ? "risk" : "neutral"
    },
    {
      label: "Prediccion",
      value: `${modelLike.prediction.ownWinProbability}% victoria | margen ${modelLike.prediction.marginRange}`,
      action: modelLike.prediction.trend,
      evidence: modelLike.prediction.evidence,
      confidence: modelLike.prediction.confidence,
      tone: modelLike.prediction.ownWinProbability >= 55 ? "advantage" : modelLike.prediction.ownWinProbability <= 45 ? "risk" : "neutral"
    }
  ];
}

function buildCoreKeys(
  ownTeam: TeamScout,
  rivalTeam: TeamScout,
  ownPlayers: PlayerScout[],
  rivalPlayers: PlayerScout[],
  quarterModel: QuarterScout[]
): TacticalKey[] {
  const topRival = rivalPlayers[0];
  const topOwn = ownPlayers[0];
  const bestQuarter = [...quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const reboundingRisk = getReboundsPerGame(rivalTeam.team) - getReboundsPerGame(ownTeam.team);

  return [
    {
      title: "Clave 1 | Cortar la primera ventaja rival",
      action: topRival ? topRival.defensiveKey : "negar ventaja central y obligar al rival a jugar segunda opcion",
      why: topRival ? `${topRival.name} concentra ${topRival.points} PTS/PJ y amenaza ${topRival.threatIndex}.` : "La muestra individual aun no es suficiente.",
      trigger: topRival ? topRival.decisionTrigger : "si el rival encadena 2 posesiones limpias, cambiar cobertura",
      evidence: topRival ? "inferencia estadistica" : "conclusion tactica",
      confidence: topRival ? 0.72 : 0.42
    },
    {
      title: "Clave 2 | Atacar nuestra ventaja primaria",
      action: topOwn ? `usar a ${topOwn.name} como primera fuente de ventaja y castigar ayudas` : "generar paint touch antes del primer tiro exterior",
      why: topOwn ? `${topOwn.name} lidera impacto propio con ${topOwn.points} PTS/PJ y ${topOwn.recentImpactIndex} de impacto.` : "Sin muestra individual suficiente.",
      trigger: "si el rival cambia matchup, buscar el emparejamiento debil en los siguientes 2 ataques",
      evidence: topOwn ? "inferencia estadistica" : "conclusion tactica",
      confidence: topOwn ? 0.7 : 0.4
    },
    {
      title: "Clave 3 | Controlar margen de posesiones",
      action: reboundingRisk > 2 ? "cerrar rebote con cinco y correr solo con posesion limpia" : "subir ritmo despues de rebote defensivo asegurado",
      why: `Diferencia de rebote estimada: ${round(reboundingRisk)} REB/PJ para el rival.`,
      trigger: "si concedemos 2 rebotes ofensivos en un cuarto, entra lineup de mayor tablero",
      evidence: getReboundsPerGame(rivalTeam.team) > 0 ? "dato confirmado" : "inferencia estadistica",
      confidence: 0.74
    },
    {
      title: `Clave 4 | Ganar el ${bestQuarter.quarter}`,
      action: bestQuarter.recommendation,
      why: `El modelo proyecta diferencial ${bestQuarter.differential} en ese cuarto.`,
      trigger: "si el parcial cae bajo -4, bajar ritmo y buscar tiro de alto porcentaje",
      evidence: bestQuarter.evidence,
      confidence: bestQuarter.confidence
    }
  ];
}

function findLatestHeadToHead(games: GameRow[], ownName: string, rivalName: string) {
  return games
    .filter((game) => {
      const teamsMatch =
        (areSameTeam(game.homeTeam, ownName) && areSameTeam(game.awayTeam, rivalName)) ||
        (areSameTeam(game.homeTeam, rivalName) && areSameTeam(game.awayTeam, ownName));
      return teamsMatch && game.status === "Final";
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function buildPlanValidation(
  games: GameRow[],
  ownTeam: TeamScout,
  rivalTeam: TeamScout,
  rivalPlayers: PlayerScout[],
  quarterModel: QuarterScout[],
  prediction: PredictionModel
): PlanValidation {
  const latest = findLatestHeadToHead(games, ownTeam.team.name, rivalTeam.team.name);
  const projectedQuarter = [...quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const topRival = rivalPlayers[0];

  if (!latest) {
    return {
      headline: "Validacion pendiente: no hay partido final importado entre estos equipos.",
      checks: [
        {
          label: "Margen proyectado",
          projected: `${prediction.expectedMargin} pts (${prediction.marginRange})`,
          actual: "pendiente de resultado final",
          status: "pendiente",
          decision: "cargar boxscore al terminar el partido para cerrar aprendizaje",
          evidence: "inferencia estadistica",
          confidence: prediction.confidence
        },
        {
          label: "Control de amenaza",
          projected: topRival ? `${topRival.name} bajo ${Math.ceil(topRival.points + 2)} pts` : "sin amenaza identificada",
          actual: "pendiente de boxscore jugador",
          status: "pendiente",
          decision: "validar si la cobertura redujo volumen o solo eficiencia",
          evidence: "inferencia estadistica",
          confidence: topRival ? 0.62 : 0.35
        },
        {
          label: `Cuarto clave ${projectedQuarter.quarter}`,
          projected: `diferencial ${projectedQuarter.differential}`,
          actual: "pendiente de parciales oficiales",
          status: "pendiente",
          decision: "agregar quarter_stats para evaluacion automatica fina",
          evidence: "inferencia estadistica",
          confidence: projectedQuarter.confidence
        }
      ]
    };
  }

  const ownWasHome = areSameTeam(latest.homeTeam, ownTeam.team.name);
  const actualOwn = parseNumber(ownWasHome ? latest.homeScore : latest.awayScore);
  const actualRival = parseNumber(ownWasHome ? latest.awayScore : latest.homeScore);
  const actualMargin = actualOwn - actualRival;
  const marginHit = Math.abs(actualMargin - prediction.expectedMargin) <= 6;

  return {
    headline: marginHit ? "Plan dentro del rango proyectado." : "Plan fuera del rango: revisar ejecucion y supuestos.",
    checks: [
      {
        label: "Margen de partido",
        projected: `${prediction.expectedMargin} pts (${prediction.marginRange})`,
        actual: `${actualMargin} pts | marcador ${actualOwn}-${actualRival}`,
        status: marginHit ? "logrado" : "fallo",
        decision: marginHit ? "mantener supuestos principales" : "revisar control de ritmo, perdidas y rebote",
        evidence: "dato confirmado",
        confidence: 0.86
      },
      {
        label: "Control de amenaza",
        projected: topRival ? `${topRival.name} bajo ${Math.ceil(topRival.points + 2)} pts` : "sin amenaza identificada",
        actual: "requiere boxscore individual del partido",
        status: "pendiente",
        decision: "importar Estadisticas completas para cerrar control individual",
        evidence: "inferencia estadistica",
        confidence: topRival ? 0.62 : 0.35
      },
      {
        label: `Cuarto clave ${projectedQuarter.quarter}`,
        projected: `diferencial ${projectedQuarter.differential}`,
        actual: "sin quarter_stats confirmados",
        status: "pendiente",
        decision: "guardar parciales por cuarto desde boxscore o carga manual",
        evidence: "inferencia estadistica",
        confidence: projectedQuarter.confidence
      }
    ]
  };
}

function buildPlayerModeBrief(modelLike: {
  rivalIdentity: TeamIdentity;
  rivalPlayers: PlayerScout[];
  tacticalKeysCore: TacticalKey[];
  prediction: PredictionModel;
}) {
  const topRival = modelLike.rivalPlayers[0];
  return [
    `Quienes son: ${modelLike.rivalIdentity.summary}`,
    `Quien manda: ${topRival ? `${topRival.name} (${topRival.playerType})` : "sin lider claro en muestra"}`,
    `Que hacen bien: ${modelLike.rivalIdentity.offensiveStyle}`,
    `Que hacen mal: ${topRival ? topRival.weakness : "dependen de ejecucion y ritmo"}`,
    `Que debemos hacer: ${modelLike.tacticalKeysCore[0]?.action ?? "negar primera ventaja y cerrar rebote"}`,
    `Tendencia: ${modelLike.prediction.ownWinProbability}% victoria propia, confianza ${percent(modelLike.prediction.confidence * 100)}`
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
  const ownRotation = buildRotation(ownPlayers);
  const rivalRotation = buildRotation(rivalPlayers);
  const ownIdentity = buildTeamIdentity(ownTeam, ownPlayers, ownRotation);
  const rivalIdentity = buildTeamIdentity(rivalTeam, rivalPlayers, rivalRotation);
  const prediction = buildPrediction(ownTeam, rivalTeam);
  const tacticalKeysCore = buildCoreKeys(ownTeam, rivalTeam, ownPlayers, rivalPlayers, quarterModel);
  const decisionBrief = buildDecisionBrief({ ownTeam, rivalTeam, ownPlayers, rivalPlayers, quarterModel, prediction });
  const planValidation = buildPlanValidation(games, ownTeam, rivalTeam, rivalPlayers, quarterModel, prediction);
  const playerModeBrief = buildPlayerModeBrief({ rivalIdentity, rivalPlayers, tacticalKeysCore, prediction });

  return {
    ownTeam,
    rivalTeam,
    ownPlayers,
    rivalPlayers,
    ownRotation,
    rivalRotation,
    quarterModel,
    decisionBrief,
    tacticalKeysCore,
    rivalIdentity,
    ownIdentity,
    prediction,
    planValidation,
    playerModeBrief,
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
    reportSections: ["Informe premium", "Informe express", "Postpartido", "Reporte tecnico largo", "Presentacion"],
    presentationSections: [
      "Idea central",
      "30 segundos",
      "Identidad rival",
      "Prediccion",
      "Amenazas",
      "Rotacion",
      "Clave 1",
      "Clave 2",
      "Cuartos",
      "Cierre"
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

function decisionLine(decision: DecisionInsight) {
  return `- ${decision.label}: ${decision.value}. Decision: ${decision.action}. [${decision.evidence}, ${confidenceLabel(decision.confidence)}]`;
}

function barLine(label: string, value: number, max = 100) {
  const filled = clamp(Math.round((value / max) * 12), 0, 12);
  return `${label}: ${"#".repeat(filled)}${"-".repeat(12 - filled)} ${round(value, 0)}/${max}`;
}

function playerLine(player: PlayerScout, index: number) {
  return `${index + 1}. ${player.name} | ${player.role} | PJ ${formatNumber(player.games, 0)} | ${player.minutes} MIN/PJ | ${player.points} PTS/PJ | ${player.rebounds} REB/PJ | ${player.assists} AST/PJ | AST/PER ${player.assistTurnoverRatio ?? "s/d"} | amenaza ${player.threatIndex}`;
}

function playerProfileBlock(player: PlayerScout, index: number) {
  return [
    `${index + 1}. ${player.name}`,
    `- Tipo: ${player.playerType}. Rol real: ${player.role}.`,
    `- Fortaleza: ${player.strength}.`,
    `- Debilidad explotable: ${player.weakness}.`,
    `- Clave defensiva: ${player.defensiveKey}.`,
    `- Regla de decision: ${player.decisionTrigger}.`
  ];
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

function identityBlock(label: string, identity: TeamIdentity) {
  return [
    `## Identidad ${label}`,
    `- Frase staff: ${identity.summary}`,
    `- Ritmo: ${identity.rhythm}.`,
    `- Estilo ofensivo: ${identity.offensiveStyle}.`,
    `- Estilo defensivo: ${identity.defensiveStyle}.`,
    `- Dependencia de jugadores: ${identity.playerDependency}.`,
    `- Clutch: ${identity.clutchBehavior}.`,
    `- Lectura: ${identity.evidence}, confianza ${confidenceLabel(identity.confidence)}.`
  ];
}

function rotationBlock(label: string, rotation: RotationScout) {
  return [
    `### ${label}`,
    `- Quinteto inicial probable: ${rotation.starters.join(", ") || "sin muestra suficiente"}.`,
    `- Primeros cambios: ${rotation.firstChanges.join(", ") || "sin muestra suficiente"}.`,
    `- Rotacion 8-9: ${rotation.coreRotation.join(", ") || "sin muestra suficiente"}.`,
    `- Cierre probable: ${rotation.closers.join(", ") || "sin muestra suficiente"}.`,
    `- Estabilidad de quinteto: ${rotation.lineupStability}.`,
    `- Dependencia de banca: ${rotation.benchDependency}.`,
    `- Impacto del banco: ${rotation.benchImpact}.`,
    `- Cierre bajo presion: ${rotation.pressureClosers}.`,
    `- Metodo: ${rotation.rule} Confianza ${confidenceLabel(rotation.confidence)}.`
  ];
}

function quarterBlock(model: MatchupScout) {
  const best = [...model.quarterModel].sort((a, b) => b.differential - a.differential)[0];
  const risk = [...model.quarterModel].sort((a, b) => a.differential - b.differential)[0];
  return [
    "## Momentum por cuartos",
    ...model.quarterModel.map((quarter) => `- ${quarter.quarter}: ${barLine("momento", quarter.differential + 12, 24)} | ${quarter.momentum}. Recomendacion: ${quarter.recommendation}.`),
    `- Ventana para atacar: ${best.quarter}. Subir calidad de tiro temprano si el partido confirma ese ritmo.`,
    `- Tramo para resistir: ${risk.quarter}. Priorizar balance, faltas y rebote defensivo.`
  ];
}

function quickReadBlock(model: MatchupScout) {
  return [
    "## SI SOLO TIENES 30 SEGUNDOS",
    ...model.decisionBrief.slice(0, 6).map(decisionLine)
  ];
}

function tacticalKeysBlock(model: MatchupScout) {
  return [
    "## CLAVES DEL PARTIDO",
    ...model.tacticalKeysCore.flatMap((key, index) => [
      `CLAVE ${index + 1}: ${key.title}`,
      `- Accion concreta: ${key.action}.`,
      `- Por que: ${key.why}`,
      `- Gatillo en vivo: ${key.trigger}.`,
      `- Base: ${key.evidence}, confianza ${confidenceLabel(key.confidence)}.`
    ])
  ];
}

function predictionBlock(model: MatchupScout) {
  return [
    "## Prediccion del partido",
    `- Probabilidad ${model.ownTeam.team.name}: ${model.prediction.ownWinProbability}%.`,
    `- Probabilidad ${model.rivalTeam.team.name}: ${model.prediction.rivalWinProbability}%.`,
    `- Rango esperado de diferencia: ${model.prediction.marginRange}.`,
    `- Tendencia: ${model.prediction.trend}.`,
    `- Nivel de confianza: ${confidenceLabel(model.prediction.confidence)} (${model.prediction.evidence}).`
  ];
}

function planValidationBlock(model: MatchupScout) {
  return [
    "## VALIDACION DEL PLAN",
    `- Estado: ${model.planValidation.headline}`,
    ...model.planValidation.checks.map((check) => `- ${check.label}: proyectado ${check.projected} -> real ${check.actual} -> ${check.status}. Decision: ${check.decision}. [${check.evidence}, ${confidenceLabel(check.confidence)}]`)
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

function buildPregameReport(model: MatchupScout) {
  return [
    "# Informe prepartido premium",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    `Generado: ${new Date().toLocaleString("es-CL")}`,
    "",
    ...quickReadBlock(model),
    "",
    ...predictionBlock(model),
    "",
    "## Snapshot competitivo",
    ...teamSnapshot("Equipo propio", model.ownTeam),
    "",
    ...teamSnapshot("Rival", model.rivalTeam),
    "",
    ...identityBlock("del rival", model.rivalIdentity),
    "",
    "## Perfil de jugadores rivales",
    ...model.rivalPlayers.slice(0, 6).flatMap(playerProfileBlock),
    "",
    "## Ventajas propias disponibles",
    ...model.ownPlayers.slice(0, 6).map(playerLine),
    "",
    ...rotationBlock("Rotacion rival probable", model.rivalRotation),
    "",
    ...tacticalKeysBlock(model),
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
    ...quickReadBlock(model),
    "",
    ...predictionBlock(model),
    "",
    "## Diagnostico propio",
    ...teamSnapshot("Equipo propio", model.ownTeam),
    ...identityBlock("propia", model.ownIdentity),
    ...model.ownTeam.strengths.map(signalLine),
    ...model.ownTeam.weaknesses.map(signalLine),
    "",
    "## Diagnostico rival",
    ...teamSnapshot("Rival", model.rivalTeam),
    ...identityBlock("del rival", model.rivalIdentity),
    ...model.rivalTeam.strengths.map(signalLine),
    ...model.rivalTeam.weaknesses.map(signalLine),
    "",
    "## Perfiles rivales por amenaza",
    ...model.rivalPlayers.slice(0, 10).flatMap(playerProfileBlock),
    "",
    "## Lideres propios por impacto",
    ...model.ownPlayers.slice(0, 10).map(playerLine),
    "",
    ...rotationBlock("Rotacion propia probable", model.ownRotation),
    "",
    ...rotationBlock("Rotacion rival probable", model.rivalRotation),
    "",
    ...tacticalKeysBlock(model),
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
    ...quickReadBlock(model),
    "",
    ...planValidationBlock(model),
    "",
    "## Lectura postpartido",
    "- Este informe usa la base cargada para ordenar aprendizajes y validar el plan. Si el boxscore del partido ya fue importado, las lineas de jugador y equipo se actualizan con datos confirmados.",
    ...model.tacticalKeysCore.map((key) => `- ${key.title}: ${key.action}. ${key.why}`),
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
    "# Informe express",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    "",
    ...quickReadBlock(model),
    "",
    ...predictionBlock(model),
    "",
    "## Modo jugador",
    ...model.playerModeBrief.map((item) => `- ${item}.`),
    "",
    "## Tres focos en cancha",
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
  const topDecision = model.decisionBrief[0];
  const rivalThreats = model.rivalPlayers.slice(0, 3).map((player) => `- ${player.name}: ${player.playerType}; ${player.defensiveKey}`);
  return [
    "# Slide 01 | Idea central",
    `${model.ownTeam.team.name} vs ${model.rivalTeam.team.name}`,
    topDecision ? `- ${topDecision.label}: ${topDecision.value}.` : "- Partido de margen fino.",
    "",
    "# Slide 02 | 30 segundos",
    ...model.decisionBrief.slice(0, 3).map((decision) => `- ${decision.label}: ${decision.action}`),
    "",
    "# Slide 03 | Identidad rival",
    `- ${model.rivalIdentity.summary}`,
    `- ${model.rivalIdentity.defensiveStyle}`,
    `- ${model.rivalIdentity.clutchBehavior}`,
    "",
    "# Slide 04 | Prediccion",
    `- ${model.prediction.ownWinProbability}% victoria propia.`,
    `- Margen esperado: ${model.prediction.marginRange}.`,
    `- ${model.prediction.trend}.`,
    "",
    "# Slide 05 | Amenazas rivales",
    ...rivalThreats,
    "",
    "# Slide 06 | Rotacion rival",
    `- Titulares: ${model.rivalRotation.starters.join(", ") || "sin muestra"}.`,
    `- Cierre: ${model.rivalRotation.pressureClosers}.`,
    `- Banco: ${model.rivalRotation.benchImpact}.`,
    "",
    "# Slide 07 | Clave 1",
    `- ${model.tacticalKeysCore[0]?.action ?? "negar primera ventaja"}.`,
    `- ${model.tacticalKeysCore[0]?.why ?? "evitar ritmo rival"}.`,
    `- Gatillo: ${model.tacticalKeysCore[0]?.trigger ?? "cambiar cobertura si hay racha"}.`,
    "",
    "# Slide 08 | Clave 2",
    `- ${model.tacticalKeysCore[1]?.action ?? "atacar nuestra ventaja"}.`,
    `- ${model.tacticalKeysCore[1]?.why ?? "crear tiros de alta calidad"}.`,
    `- Gatillo: ${model.tacticalKeysCore[1]?.trigger ?? "buscar matchup debil"}.`,
    "",
    "# Slide 09 | Cuartos",
    ...model.quarterModel.map((quarter) => `- ${quarter.quarter}: ${quarter.momentum}; ${quarter.recommendation}`),
    "",
    "# Slide 10 | Cierre",
    "- Cuidar el balon y el primer rebote.",
    "- Ejecutar gatillos sin esperar timeout.",
    "- Validar el plan con boxscore postpartido."
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
