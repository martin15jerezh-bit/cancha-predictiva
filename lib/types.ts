export type DatasetKey = "teams" | "players" | "games";

export type CompetitionKey =
  | "Liga Chery Apertura 2026"
  | "Liga DOS 2026"
  | "Liga Nacional Femenina 2026";

export type TeamRow = {
  teamId: string;
  competition: string;
  zone: string;
  name: string;
  city: string;
  coach: string;
  gamesPlayed: string;
  wins: string;
  losses: string;
  pointsFor: string;
  pointsAgainst: string;
  reboundsPerGame: string;
  assistsPerGame: string;
};

export type PlayerRow = {
  playerId: string;
  competition: string;
  teamName: string;
  name: string;
  position: string;
  minutes: string;
  points: string;
  rebounds: string;
  assists: string;
  offensiveRebounds?: string;
  defensiveRebounds?: string;
  steals?: string;
  turnovers?: string;
  fouls?: string;
  twoMade?: string;
  twoAttempted?: string;
  threeMade?: string;
  threeAttempted?: string;
  freeThrowsMade?: string;
  freeThrowsAttempted?: string;
  starter?: string;
  games?: string;
};

export type GameRow = {
  gameId: string;
  competition: string;
  phase: string;
  week: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  status: string;
  notes: string;
};

export type DatasetMap = {
  teams: TeamRow[];
  players: PlayerRow[];
  games: GameRow[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type PredictionResult = {
  homeWinProbability: number;
  awayWinProbability: number;
  estimatedHomeScore: number;
  estimatedAwayScore: number;
  explanation: string[];
  strengthDelta: number;
};

export type BoxscoreImport = {
  sourceUrl: string;
  game: GameRow;
  players: PlayerRow[];
  teamStats: Array<{
    teamName: string;
    points: number;
    rebounds: number;
    assists: number;
  }>;
};
