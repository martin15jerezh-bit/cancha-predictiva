import { BoxscoreImport, CompetitionKey, DatasetMap, GameRow, PlayerGameStatRow, PlayerRow, PredictionResult, ShotRow, TeamRow } from "@/lib/types";

export const CURRENT_COMPETITION: CompetitionKey = "Liga Chery Apertura 2026";
export const LIGA_DOS_COMPETITION: CompetitionKey = "Liga DOS 2026";
export const LNF_COMPETITION: CompetitionKey = "Liga Nacional Femenina 2026";

export const teamColumns: Array<keyof TeamRow> = [
  "teamId",
  "competition",
  "zone",
  "name",
  "city",
  "coach",
  "gamesPlayed",
  "wins",
  "losses",
  "pointsFor",
  "pointsAgainst",
  "reboundsPerGame",
  "assistsPerGame"
];

export const playerColumns: Array<keyof PlayerRow> = [
  "playerId",
  "competition",
  "teamName",
  "name",
  "position",
  "minutes",
  "points",
  "rebounds",
  "assists"
];

export const gameColumns: Array<keyof GameRow> = [
  "gameId",
  "competition",
  "phase",
  "week",
  "date",
  "homeTeam",
  "awayTeam",
  "homeScore",
  "awayScore",
  "status",
  "notes"
];

export const requiredColumns = {
  teams: teamColumns,
  players: playerColumns,
  games: gameColumns
};

export const datasetLabels = {
  teams: "Equipos",
  players: "Jugadores",
  games: "Partidos"
} as const;

export const competitionLabels: CompetitionKey[] = [
  CURRENT_COMPETITION,
  LIGA_DOS_COMPETITION,
  LNF_COMPETITION
];

const teamSeeds: TeamRow[] = [
  {
    teamId: "LCA26-UDEC",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Universidad de Concepcion",
    city: "Concepcion",
    coach: "Santiago Gomez",
    gamesPlayed: "6",
    wins: "6",
    losses: "0",
    pointsFor: "560",
    pointsAgainst: "408",
    reboundsPerGame: "37.5",
    assistsPerGame: "18.8"
  },
  {
    teamId: "LCA26-MPA",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Municipal Puente Alto",
    city: "Puente Alto",
    coach: "Alvaro Chacon",
    gamesPlayed: "5",
    wins: "3",
    losses: "2",
    pointsFor: "430",
    pointsAgainst: "414",
    reboundsPerGame: "35.1",
    assistsPerGame: "16.4"
  },
  {
    teamId: "LCA26-LEO",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Colegio Los Leones",
    city: "Quilpue",
    coach: "Guillermo Frutos",
    gamesPlayed: "5",
    wins: "3",
    losses: "2",
    pointsFor: "403",
    pointsAgainst: "398",
    reboundsPerGame: "36.6",
    assistsPerGame: "17.2"
  },
  {
    teamId: "LCA26-BC",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Boston College",
    city: "Santiago",
    coach: "Benjamin Gasc",
    gamesPlayed: "6",
    wins: "3",
    losses: "3",
    pointsFor: "497",
    pointsAgainst: "556",
    reboundsPerGame: "32.8",
    assistsPerGame: "15.7"
  },
  {
    teamId: "LCA26-COL",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Colo-Colo",
    city: "Santiago",
    coach: "Ernesto Menchaca",
    gamesPlayed: "6",
    wins: "2",
    losses: "4",
    pointsFor: "464",
    pointsAgainst: "486",
    reboundsPerGame: "33.4",
    assistsPerGame: "14.9"
  },
  {
    teamId: "LCA26-UC",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Universidad Catolica",
    city: "Santiago",
    coach: "Bernardo Murphy",
    gamesPlayed: "5",
    wins: "2",
    losses: "3",
    pointsFor: "392",
    pointsAgainst: "429",
    reboundsPerGame: "31.7",
    assistsPerGame: "14.2"
  },
  {
    teamId: "LCA26-ET",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Centro",
    name: "Espanol de Talca",
    city: "Talca",
    coach: "Hector Vera Alfaro",
    gamesPlayed: "5",
    wins: "0",
    losses: "5",
    pointsFor: "346",
    pointsAgainst: "401",
    reboundsPerGame: "30.4",
    assistsPerGame: "13.6"
  },
  {
    teamId: "LCA26-ANI",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "CD Las Animas",
    city: "Valdivia",
    coach: "Carlos Zuniga",
    gamesPlayed: "5",
    wins: "5",
    losses: "0",
    pointsFor: "440",
    pointsAgainst: "357",
    reboundsPerGame: "38.3",
    assistsPerGame: "18.1"
  },
  {
    teamId: "LCA26-OSO",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "Espanol de Osorno",
    city: "Osorno",
    coach: "Rodrigo Munoz",
    gamesPlayed: "5",
    wins: "3",
    losses: "2",
    pointsFor: "397",
    pointsAgainst: "356",
    reboundsPerGame: "36.7",
    assistsPerGame: "16.8"
  },
  {
    teamId: "LCA26-PMB",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "Puerto Montt Basquet",
    city: "Puerto Montt",
    coach: "Gaston Fernandez",
    gamesPlayed: "5",
    wins: "3",
    losses: "2",
    pointsFor: "401",
    pointsAgainst: "401",
    reboundsPerGame: "34.6",
    assistsPerGame: "15.5"
  },
  {
    teamId: "LCA26-VDV",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "CD Valdivia",
    city: "Valdivia",
    coach: "Cipriano Nunez",
    gamesPlayed: "5",
    wins: "2",
    losses: "3",
    pointsFor: "370",
    pointsAgainst: "392",
    reboundsPerGame: "35.3",
    assistsPerGame: "15.1"
  },
  {
    teamId: "LCA26-PVB",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "Puerto Varas Basket",
    city: "Puerto Varas",
    coach: "Damian Gamarra",
    gamesPlayed: "5",
    wins: "3",
    losses: "2",
    pointsFor: "432",
    pointsAgainst: "411",
    reboundsPerGame: "35.8",
    assistsPerGame: "17.4"
  },
  {
    teamId: "LCA26-ABA",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "ABA Ancud",
    city: "Ancud",
    coach: "Jorge Luis Alvarez",
    gamesPlayed: "6",
    wins: "1",
    losses: "5",
    pointsFor: "460",
    pointsAgainst: "514",
    reboundsPerGame: "33.1",
    assistsPerGame: "14.8"
  },
  {
    teamId: "LCA26-CAS",
    competition: CURRENT_COMPETITION,
    zone: "Conferencia Sur",
    name: "Deportes Castro",
    city: "Castro",
    coach: "Cristobal Jara Sarrat",
    gamesPlayed: "5",
    wins: "1",
    losses: "4",
    pointsFor: "384",
    pointsAgainst: "453",
    reboundsPerGame: "31.9",
    assistsPerGame: "13.7"
  }
];

const ligaDosTeamSeeds: TeamRow[] = [
  ["LDOS-SPO", "Zona A", "Sportiva Italiana", "Valparaiso", "3", "3", "0", "251", "212"],
  ["LDOS-ILL", "Zona A", "Illapel Basquetbol", "Illapel", "3", "2", "1", "243", "215"],
  ["LDOS-HUM", "Zona A", "CD Humboldt", "Vina del Mar", "3", "2", "1", "192", "202"],
  ["LDOS-ARA", "Zona A", "Arabe de Valparaiso", "Valparaiso", "3", "1", "2", "214", "230"],
  ["LDOS-QUI", "Zona A", "Quilpue Basquetbol", "Quilpue", "3", "1", "2", "203", "186"],
  ["LDOS-SHA", "Zona A", "CD Sharks", "La Serena", "3", "0", "3", "204", "262"],
  ["LDOS-STA", "Zona B", "Stadio Italiano", "Las Condes", "3", "2", "1", "230", "207"],
  ["LDOS-LML", "Zona B", "Luis Matte Larrain", "Puente Alto", "3", "2", "1", "244", "223"],
  ["LDOS-SAN", "Zona B", "San Luis Basquet", "Quillota", "3", "2", "1", "244", "225"],
  ["LDOS-HRV", "Zona B", "Hrvatski Sokol", "Antofagasta", "3", "2", "1", "229", "221"],
  ["LDOS-CEP", "Zona B", "Sergio Ceppi", "La Cisterna", "3", "1", "2", "238", "227"],
  ["LDOS-APR", "Zona B", "Arturo Prat", "San Felipe", "3", "0", "3", "190", "272"],
  ["LDOS-ALE", "Zona C", "Aleman de Concepcion", "San Pedro de la Paz", "3", "3", "0", "278", "214"],
  ["LDOS-TRU", "Zona C", "Truenos de Talca", "Talca", "3", "3", "0", "218", "159"],
  ["LDOS-CON", "Zona C", "CDSB Constitucion", "Constitucion", "3", "2", "1", "269", "244"],
  ["LDOS-VIL", "Zona C", "Villa Alemana Basquet", "Villa Alemana", "3", "1", "2", "162", "206"],
  ["LDOS-LIC", "Zona C", "Liceo Curico", "Curico", "3", "0", "3", "233", "266"],
  ["LDOS-MCH", "Zona C", "Municipal Chillan", "Chillan", "3", "0", "3", "159", "230"],
  ["LDOS-UDE", "Zona D", "UDE Temuco", "Temuco", "3", "3", "0", "246", "207"],
  ["LDOS-OMG", "Zona D", "CD Omega", "Concepcion", "3", "1", "2", "213", "243"],
  ["LDOS-EAP", "Zona D", "Escolar Aleman Puerto Varas", "Puerto Varas", "2", "1", "1", "154", "138"],
  ["LDOS-HUA", "Zona D", "CD Huachipato", "Talcahuano", "2", "1", "1", "150", "150"],
  ["LDOS-LAU", "Zona D", "CDB La Union", "La Union", "2", "0", "2", "140", "165"]
].map(([teamId, zone, name, city, gamesPlayed, wins, losses, pointsFor, pointsAgainst]) => ({
  teamId,
  competition: LIGA_DOS_COMPETITION,
  zone,
  name,
  city,
  coach: "",
  gamesPlayed,
  wins,
  losses,
  pointsFor,
  pointsAgainst,
  reboundsPerGame: "0",
  assistsPerGame: "0"
}));

const lnfTeamSeeds: TeamRow[] = [
  ["LNF-AZR", "Fase Regular", "Azul y Rojo", "Santiago", "1", "1", "0", "78", "67"],
  ["LNF-CEP", "Fase Regular", "Sergio Ceppi", "La Cisterna", "1", "0", "1", "67", "78"],
  ["LNF-SPO", "Fase Regular", "Sportiva Italiana", "Valparaiso", "0", "0", "0", "0", "0"],
  ["LNF-MPA", "Fase Regular", "Municipal Puente Alto", "Puente Alto", "0", "0", "0", "0", "0"],
  ["LNF-LEO", "Fase Regular", "Colegio Los Leones", "Quilpue", "0", "0", "0", "0", "0"],
  ["LNF-GIM", "Fase Regular", "Gimnastico Vina del Mar", "Vina del Mar", "0", "0", "0", "0", "0"],
  ["LNF-SMQ", "Fase Regular", "Santiago Morning Quilicura", "Quilicura", "0", "0", "0", "0", "0"],
  ["LNF-UDEC", "Fase Regular", "Universidad de Concepcion", "Concepcion", "0", "0", "0", "0", "0"]
].map(([teamId, zone, name, city, gamesPlayed, wins, losses, pointsFor, pointsAgainst]) => ({
  teamId,
  competition: LNF_COMPETITION,
  zone,
  name,
  city,
  coach: "",
  gamesPlayed,
  wins,
  losses,
  pointsFor,
  pointsAgainst,
  reboundsPerGame: "0",
  assistsPerGame: "0"
}));

const playerSeeds: PlayerRow[] = [
  ["ABA Ancud", "Bryce Beamer"], ["ABA Ancud", "Victor Andrade"], ["ABA Ancud", "Darwin Blanco"],
  ["Boston College", "Adam Afifi"], ["Boston College", "Andre Ball"], ["Boston College", "Bradlee Haskell"],
  ["Deportes Castro", "Me'Kell Burries"], ["Deportes Castro", "Justin Sylver"],
  ["Colegio Los Leones", "Blake Marquardt"], ["Colegio Los Leones", "Jason Murphy"], ["Colegio Los Leones", "Vincent Mayes"],
  ["Colo-Colo", "Cristian Solis"], ["Colo-Colo", "Jevon Brown"],
  ["Espanol de Osorno", "Jahsean Corbett"], ["Espanol de Osorno", "Ja'Heim Hudson"],
  ["Espanol de Talca", "Alejo Montes"], ["Espanol de Talca", "Andres Millan"], ["Espanol de Talca", "Juan Lozano"],
  ["CD Las Animas", "Ahmir Langlais"], ["CD Las Animas", "Raekwon Horton"],
  ["Municipal Puente Alto", "Rakim Brown"], ["Municipal Puente Alto", "Alex Manica"],
  ["Puerto Montt Basquet", "Keaton Hervey"], ["Puerto Montt Basquet", "Yasmany Fundora"], ["Puerto Montt Basquet", "David Chaves"],
  ["Puerto Varas Basket", "Joshua Morris"], ["Puerto Varas Basket", "Jonathan Ocasio"], ["Puerto Varas Basket", "Bakir Cleveland"],
  ["Universidad Catolica", "Abdoulaye Thiam"], ["Universidad Catolica", "Kyle Frelow"],
  ["Universidad de Concepcion", "Stephen Maxwell"], ["Universidad de Concepcion", "Jerry Evans"], ["Universidad de Concepcion", "Juan Duran"],
  ["CD Valdivia", "Tristan Harper"], ["CD Valdivia", "Zondrick Garrett"], ["CD Valdivia", "Owen Liss"], ["CD Valdivia", "Keith Hoffman"]
].map(([teamName, name], index) => ({
  playerId: `P${index + 1}`,
  competition: CURRENT_COMPETITION,
  teamName,
  name,
  position: "EXT/Plantel",
  minutes: "0",
  points: "0",
  rebounds: "0",
  assists: "0"
}));

const boxscorePlayerSeeds: PlayerRow[] = [
  ["Liga DOS 2026", "Illapel Basquetbol", "S. Chialva Balut", "F", "25:39", "9", "7", "1"],
  ["Liga DOS 2026", "Illapel Basquetbol", "M. Sepulveda Soto", "SG", "27:49", "7", "4", "2"],
  ["Liga DOS 2026", "Illapel Basquetbol", "E. Sepulveda Soto", "SF", "29:50", "7", "6", "1"],
  ["Liga DOS 2026", "Illapel Basquetbol", "M. Flores Cortes", "F", "20:24", "0", "2", "2"],
  ["Liga DOS 2026", "Illapel Basquetbol", "J. Toledo Gonzalez", "F", "14:21", "6", "6", "0"],
  ["Liga DOS 2026", "Illapel Basquetbol", "M. Barrientos Navarrete", "F", "28:48", "4", "3", "1"],
  ["Liga DOS 2026", "Illapel Basquetbol", "M. Brito Cortes", "F", "10:24", "0", "0", "0"],
  ["Liga DOS 2026", "Illapel Basquetbol", "L. Moreno Montano", "F", "28:43", "29", "6", "1"],
  ["Liga DOS 2026", "Illapel Basquetbol", "I. Saavedra Briceno", "F", "10:34", "1", "1", "0"],
  ["Liga DOS 2026", "Illapel Basquetbol", "A. Briones Lobos", "F", "0:00", "0", "0", "0"],
  ["Liga DOS 2026", "Illapel Basquetbol", "L. Bravo Cortes", "F", "0:00", "0", "0", "0"],
  ["Liga DOS 2026", "Illapel Basquetbol", "J. Tenorio Palacios", "F", "3:29", "0", "0", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "M. Herrera Alvarez", "F", "13:54", "3", "0", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "M. Morales Ordenes", "F", "21:09", "6", "1", "1"],
  ["Liga DOS 2026", "Sportiva Italiana", "B. Aguilera Vergara", "F", "27:35", "6", "9", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "H. Lourdener", "F", "4:43", "0", "0", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "L. Musrri Pardo", "F", "22:43", "14", "5", "3"],
  ["Liga DOS 2026", "Sportiva Italiana", "D. Wallace", "F", "32:33", "19", "6", "1"],
  ["Liga DOS 2026", "Sportiva Italiana", "P. Donoso Romero", "F", "11:49", "2", "2", "1"],
  ["Liga DOS 2026", "Sportiva Italiana", "M. La Rivera Herrera", "F", "26:21", "21", "8", "1"],
  ["Liga DOS 2026", "Sportiva Italiana", "J. Bayard Toledo", "F", "3:39", "0", "1", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "I. Duran Rojas", "F", "4:56", "0", "0", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "M. Vera Gonzalez", "F", "1:36", "0", "0", "0"],
  ["Liga DOS 2026", "Sportiva Italiana", "U. Riano Pansecchi", "F", "29:03", "8", "2", "0"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "P. Ballero Cepeda", "", "7:44", "2", "0", "1"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "N. Faguas", "", "2:11", "0", "0", "0"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "V. Olmos", "", "25:43", "16", "2", "2"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "P. Perez Vallejos", "", "5:32", "3", "2", "1"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "B. Guilarte", "", "27:12", "9", "8", "3"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "P. Moya", "", "16:34", "0", "3", "1"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "P. Henriquez Pino", "", "27:05", "12", "1", "1"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "P. Carrasco", "", "33:05", "14", "3", "6"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "M. De La Fuente", "", "0:00", "0", "0", "0"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "C. Garcia", "", "21:22", "7", "9", "0"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "M. Fester", "", "1:36", "0", "1", "0"],
  ["Liga Nacional Femenina 2026", "Sergio Ceppi", "C. Vargas", "", "31:56", "4", "8", "3"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "J. Novion", "", "36:26", "17", "10", "10"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "P. Matinez", "", "23:58", "13", "3", "1"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "M. Martinez", "", "0:00", "0", "0", "0"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "I. Curkovic", "", "6:29", "2", "2", "2"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "A. Galaz", "", "0:00", "0", "0", "0"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "E. Delgado", "", "35:00", "23", "5", "2"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "T. Gomez", "", "26:26", "1", "4", "3"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "F. Serrano", "", "7:21", "0", "1", "0"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "D. Troncoso", "", "28:03", "10", "7", "1"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "A. Rebolledo", "", "5:30", "0", "2", "0"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "V. Castaneda", "", "30:47", "12", "11", "0"],
  ["Liga Nacional Femenina 2026", "Azul y Rojo", "M. Baeza", "", "0:00", "0", "0", "0"]
].map(([competition, teamName, name, position, minutes, points, rebounds, assists], index) => ({
  playerId: `BOX-${index + 1}`,
  competition,
  teamName,
  name,
  position,
  minutes,
  points,
  rebounds,
  assists
}));

const gameSeeds: Omit<GameRow, "gameId">[] = [
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-25",
    homeTeam: "Universidad de Concepcion",
    awayTeam: "Universidad Catolica",
    homeScore: "105",
    awayScore: "72",
    status: "Final",
    notes: "MVP: Stephen Maxwell (30)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-25",
    homeTeam: "Colo-Colo",
    awayTeam: "Municipal Puente Alto",
    homeScore: "83",
    awayScore: "91",
    status: "Final",
    notes: "MVP: Rakim Brown (29)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-26",
    homeTeam: "Colegio Los Leones",
    awayTeam: "Boston College",
    homeScore: "93",
    awayScore: "77",
    status: "Final",
    notes: "MVP: Jason Murphy (34)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-27",
    homeTeam: "Municipal Puente Alto",
    awayTeam: "Espanol de Talca",
    homeScore: "90",
    awayScore: "76",
    status: "Final",
    notes: "MVP: Rakim Brown (27)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-28",
    homeTeam: "Universidad Catolica",
    awayTeam: "Colegio Los Leones",
    homeScore: "64",
    awayScore: "81",
    status: "Final",
    notes: "MVP: Jason Murphy (27)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-29",
    homeTeam: "Espanol de Talca",
    awayTeam: "Colo-Colo",
    homeScore: "66",
    awayScore: "74",
    status: "Final",
    notes: "MVP: Cristian Solis (19)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "1",
    date: "2026-03-29",
    homeTeam: "Universidad de Concepcion",
    awayTeam: "Boston College",
    homeScore: "113",
    awayScore: "62",
    status: "Final",
    notes: "MVP: Stephen Maxwell (31)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-01",
    homeTeam: "Colo-Colo",
    awayTeam: "Colegio Los Leones",
    homeScore: "85",
    awayScore: "88",
    status: "Final",
    notes: "MVP: Jason Murphy (19)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-02",
    homeTeam: "Boston College",
    awayTeam: "Universidad Catolica",
    homeScore: "99",
    awayScore: "97",
    status: "Final",
    notes: "MVP: Bradlee Haskell (35)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-03",
    homeTeam: "Colegio Los Leones",
    awayTeam: "Municipal Puente Alto",
    homeScore: "68",
    awayScore: "77",
    status: "Final",
    notes: "MVP: Renato Munoz (19)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-04",
    homeTeam: "Espanol de Talca",
    awayTeam: "Boston College",
    homeScore: "66",
    awayScore: "71",
    status: "Final",
    notes: "MVP: Bradlee Haskell (31)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-04",
    homeTeam: "Colo-Colo",
    awayTeam: "Universidad de Concepcion",
    homeScore: "60",
    awayScore: "74",
    status: "Final",
    notes: "MVP: Jerry Evans (21)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-05",
    homeTeam: "Universidad Catolica",
    awayTeam: "Espanol de Talca",
    homeScore: "81",
    awayScore: "74",
    status: "Final",
    notes: "MVP: Lucas Marquez (21)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "2",
    date: "2026-04-05",
    homeTeam: "Municipal Puente Alto",
    awayTeam: "Universidad de Concepcion",
    homeScore: "77",
    awayScore: "88",
    status: "Final",
    notes: "MVP: Stephen Maxwell (24)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-25",
    homeTeam: "Puerto Montt Basquet",
    awayTeam: "Puerto Varas Basket",
    homeScore: "102",
    awayScore: "91",
    status: "Final",
    notes: "MVP: Keaton Hervey (40)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-27",
    homeTeam: "CD Las Animas",
    awayTeam: "Puerto Montt Basquet",
    homeScore: "89",
    awayScore: "72",
    status: "Final",
    notes: "MVP: Ahmir Langlais (32)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-28",
    homeTeam: "Deportes Castro",
    awayTeam: "CD Valdivia",
    homeScore: "76",
    awayScore: "81",
    status: "Final",
    notes: "MVP: Erik Carrasco (20)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-28",
    homeTeam: "ABA Ancud",
    awayTeam: "Espanol de Osorno",
    homeScore: "70",
    awayScore: "84",
    status: "Final",
    notes: "MVP: Jahsean Corbett (29)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-29",
    homeTeam: "Deportes Castro",
    awayTeam: "Espanol de Osorno",
    homeScore: "65",
    awayScore: "82",
    status: "Final",
    notes: "MVP: Ja'Heim Hudson (21)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-29",
    homeTeam: "ABA Ancud",
    awayTeam: "CD Valdivia",
    homeScore: "90",
    awayScore: "80",
    status: "Final",
    notes: "MVP: Bryce Beamer (23)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "1",
    date: "2026-03-30",
    homeTeam: "Puerto Varas Basket",
    awayTeam: "CD Las Animas",
    homeScore: "68",
    awayScore: "75",
    status: "Final",
    notes: "MVP: Ahmir Langlais (32)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-01",
    homeTeam: "CD Valdivia",
    awayTeam: "Puerto Montt Basquet",
    homeScore: "70",
    awayScore: "64",
    status: "Final",
    notes: "MVP: Zondrick Garrett II (20)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-03",
    homeTeam: "Espanol de Osorno",
    awayTeam: "CD Valdivia",
    homeScore: "78",
    awayScore: "63",
    status: "Final",
    notes: "MVP: Jahsean Corbett (34)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-04",
    homeTeam: "CD Las Animas",
    awayTeam: "Deportes Castro",
    homeScore: "104",
    awayScore: "67",
    status: "Final",
    notes: "MVP: Sebastian Suarez (25)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-04",
    homeTeam: "Puerto Varas Basket",
    awayTeam: "ABA Ancud",
    homeScore: "86",
    awayScore: "69",
    status: "Final",
    notes: "MVP: Bakir Cleveland (39)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-05",
    homeTeam: "Puerto Montt Basquet",
    awayTeam: "Espanol de Osorno",
    homeScore: "77",
    awayScore: "75",
    status: "Final",
    notes: "MVP: Keaton Hervey (26)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-05",
    homeTeam: "Puerto Varas Basket",
    awayTeam: "Deportes Castro",
    homeScore: "103",
    awayScore: "89",
    status: "Final",
    notes: "MVP: Jonathan Ocasio (27)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "2",
    date: "2026-04-05",
    homeTeam: "CD Las Animas",
    awayTeam: "ABA Ancud",
    homeScore: "91",
    awayScore: "72",
    status: "Final",
    notes: "MVP: Raekwon Horton (30)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-09",
    homeTeam: "Boston College",
    awayTeam: "Municipal Puente Alto",
    homeScore: "99",
    awayScore: "95",
    status: "Final",
    notes: "MVP: Adam Afifi (39)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-09",
    homeTeam: "Universidad de Concepcion",
    awayTeam: "Colegio Los Leones",
    homeScore: "95",
    awayScore: "73",
    status: "Final",
    notes: "MVP: Stephen Maxwell (28)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-10",
    homeTeam: "Universidad Catolica",
    awayTeam: "Colo-Colo",
    homeScore: "78",
    awayScore: "70",
    status: "Final",
    notes: "MVP: Sebastian Navarrete (26)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-10",
    homeTeam: "Espanol de Talca",
    awayTeam: "Universidad de Concepcion",
    homeScore: "64",
    awayScore: "85",
    status: "Final",
    notes: "MVP: Stephen Maxwell (30)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-11",
    homeTeam: "Colo-Colo",
    awayTeam: "Boston College",
    homeScore: "92",
    awayScore: "89",
    status: "Final",
    notes: "Resultado actualizado desde captura Genius"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-12",
    homeTeam: "Colegio Los Leones",
    awayTeam: "Espanol de Talca",
    homeScore: "",
    awayScore: "",
    status: "Proximo",
    notes: "Programado"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Centro",
    week: "3",
    date: "2026-04-12",
    homeTeam: "Municipal Puente Alto",
    awayTeam: "Universidad Catolica",
    homeScore: "",
    awayScore: "",
    status: "Proximo",
    notes: "Programado"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-08",
    homeTeam: "ABA Ancud",
    awayTeam: "Puerto Montt Basquet",
    homeScore: "76",
    awayScore: "86",
    status: "Final",
    notes: "MVP: David Chaves (27)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-10",
    homeTeam: "Deportes Castro",
    awayTeam: "ABA Ancud",
    homeScore: "87",
    awayScore: "83",
    status: "Final",
    notes: "MVP: Mekell Burries (19)"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-11",
    homeTeam: "Espanol de Osorno",
    awayTeam: "CD Las Animas",
    homeScore: "78",
    awayScore: "81",
    status: "Final",
    notes: "Resultado actualizado desde captura Genius"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-11",
    homeTeam: "CD Valdivia",
    awayTeam: "Puerto Varas Basket",
    homeScore: "76",
    awayScore: "84",
    status: "Final",
    notes: "Resultado actualizado desde captura Genius"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-12",
    homeTeam: "Puerto Varas Basket",
    awayTeam: "Espanol de Osorno",
    homeScore: "",
    awayScore: "",
    status: "Proximo",
    notes: "Programado"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-12",
    homeTeam: "Puerto Montt Basquet",
    awayTeam: "Deportes Castro",
    homeScore: "",
    awayScore: "",
    status: "Proximo",
    notes: "Programado"
  },
  {
    competition: CURRENT_COMPETITION,
    phase: "Conferencia Sur",
    week: "3",
    date: "2026-04-12",
    homeTeam: "CD Las Animas",
    awayTeam: "CD Valdivia",
    homeScore: "",
    awayScore: "",
    status: "Proximo",
    notes: "Programado"
  }
];

export const seedData: DatasetMap = {
  teams: [...teamSeeds, ...ligaDosTeamSeeds, ...lnfTeamSeeds],
  players: [...playerSeeds, ...boxscorePlayerSeeds],
  playerGameStats: [],
  shots: [],
  games: [
    ...gameSeeds,
    {
      competition: LIGA_DOS_COMPETITION,
      phase: "Zona B",
      week: "3",
      date: "2026-04-11",
      homeTeam: "Hrvatski Sokol",
      awayTeam: "San Luis Basquet",
      homeScore: "77",
      awayScore: "79",
      status: "Final",
      notes: "MVP: Andres Jaimes (23)"
    },
    {
      competition: LIGA_DOS_COMPETITION,
      phase: "Zona B",
      week: "3",
      date: "2026-04-11",
      homeTeam: "Arturo Prat",
      awayTeam: "Stadio Italiano",
      homeScore: "62",
      awayScore: "85",
      status: "Final",
      notes: "MVP: Luis Cuttis (18)"
    },
    {
      competition: LIGA_DOS_COMPETITION,
      phase: "Zona C",
      week: "3",
      date: "2026-04-11",
      homeTeam: "Aleman de Concepcion",
      awayTeam: "CDSB Constitucion",
      homeScore: "84",
      awayScore: "76",
      status: "Final",
      notes: "MVP: Diego Velasquez (17)"
    },
    {
      competition: LIGA_DOS_COMPETITION,
      phase: "Zona D",
      week: "3",
      date: "2026-04-12",
      homeTeam: "CDB La Union",
      awayTeam: "UDE Temuco",
      homeScore: "",
      awayScore: "",
      status: "Proximo",
      notes: "Link FIBA disponible en fixture"
    },
    {
      competition: LNF_COMPETITION,
      phase: "Fase Regular",
      week: "1",
      date: "2026-04-10",
      homeTeam: "Sergio Ceppi",
      awayTeam: "Azul y Rojo",
      homeScore: "67",
      awayScore: "78",
      status: "Final",
      notes: "MVP: Javiera Novion (27)"
    },
    {
      competition: LNF_COMPETITION,
      phase: "Fase Regular",
      week: "1",
      date: "2026-04-11",
      homeTeam: "Municipal Puente Alto",
      awayTeam: "Sportiva Italiana",
      homeScore: "",
      awayScore: "",
      status: "Proximo",
      notes: "Programado"
    },
    {
      competition: LNF_COMPETITION,
      phase: "Fase Regular",
      week: "1",
      date: "2026-04-11",
      homeTeam: "Colegio Los Leones",
      awayTeam: "Gimnastico Vina del Mar",
      homeScore: "",
      awayScore: "",
      status: "Proximo",
      notes: "Programado"
    },
    {
      competition: LNF_COMPETITION,
      phase: "Fase Regular",
      week: "1",
      date: "2026-04-11",
      homeTeam: "Santiago Morning Quilicura",
      awayTeam: "Universidad de Concepcion",
      homeScore: "",
      awayScore: "",
      status: "Proximo",
      notes: "Programado"
    }
  ].map((game, index) => ({
    gameId: `G${index + 1}`,
    ...game
  }))
};

export function parseNumber(value: string | number | undefined): number {
  const numeric = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^cd\s+/, "")
    .replace(/^csd\s+/, "")
    .replace(/^corp\.\s*dep\.\s*/, "")
    .replace(/^mun\.\s*/, "municipal ")
    .replace(/[-_]+/g, " ")
    .replace(/\bde\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function areSameTeam(teamA: string, teamB: string) {
  const normalizedA = normalizeTeamName(teamA);
  const normalizedB = normalizeTeamName(teamB);
  return normalizedA === normalizedB || normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}

export function getWinPct(team: TeamRow): number {
  const wins = parseNumber(team.wins);
  const losses = parseNumber(team.losses);
  const total = wins + losses;
  return total === 0 ? 0 : wins / total;
}

export function getPointsForPerGame(team: TeamRow): number {
  const gamesPlayed = parseNumber(team.gamesPlayed);
  return gamesPlayed === 0 ? 0 : parseNumber(team.pointsFor) / gamesPlayed;
}

export function getPointsAgainstPerGame(team: TeamRow): number {
  const gamesPlayed = parseNumber(team.gamesPlayed);
  return gamesPlayed === 0 ? 0 : parseNumber(team.pointsAgainst) / gamesPlayed;
}

export function getPointDifferential(team: TeamRow): number {
  return getPointsForPerGame(team) - getPointsAgainstPerGame(team);
}

export function getReboundsPerGame(team: TeamRow): number {
  return parseNumber(team.reboundsPerGame);
}

export function getAssistsPerGame(team: TeamRow): number {
  return parseNumber(team.assistsPerGame);
}

export function getTeamRecentForm(games: GameRow[], teamName: string) {
  const recentGames = games
    .filter((game) => game.status === "Final" && (game.homeTeam === teamName || game.awayTeam === teamName))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  const wins = recentGames.filter((game) => {
    const homeWon = parseNumber(game.homeScore) > parseNumber(game.awayScore);
    return game.homeTeam === teamName ? homeWon : !homeWon;
  }).length;

  const averageFor =
    recentGames.length === 0
      ? 0
      : recentGames.reduce((sum, game) => {
          return sum + (game.homeTeam === teamName ? parseNumber(game.homeScore) : parseNumber(game.awayScore));
        }, 0) / recentGames.length;

  const averageAgainst =
    recentGames.length === 0
      ? 0
      : recentGames.reduce((sum, game) => {
          return sum + (game.homeTeam === teamName ? parseNumber(game.awayScore) : parseNumber(game.homeScore));
        }, 0) / recentGames.length;

  return {
    record: `${wins}-${Math.max(recentGames.length - wins, 0)}`,
    averageFor,
    averageAgainst
  };
}

export function getPlayersByTeam(players: PlayerRow[], teamName: string) {
  return players.filter((player) => player.teamName === teamName);
}

export function getGamesByCompetition(games: GameRow[], competition: string) {
  return games.filter((game) => game.competition === competition);
}

export function calculateTeamStrength(team: TeamRow) {
  const winPct = getWinPct(team) * 100;
  return (
    getPointsForPerGame(team) * 0.5 -
    getPointsAgainstPerGame(team) * 0.2 +
    getPointDifferential(team) * 0.2 +
    getReboundsPerGame(team) * 0.06 +
    getAssistsPerGame(team) * 0.04 +
    winPct * 0.1
  );
}

export function buildPrediction(homeTeam: TeamRow, awayTeam: TeamRow): PredictionResult {
  const homeStrength = calculateTeamStrength(homeTeam) + 3;
  const awayStrength = calculateTeamStrength(awayTeam);
  const strengthDelta = homeStrength - awayStrength;
  const logistic = 1 / (1 + Math.exp(-strengthDelta / 5));

  const estimatedHomeScore = Math.round(
    (getPointsForPerGame(homeTeam) + getPointsAgainstPerGame(awayTeam)) / 2 + 3
  );
  const estimatedAwayScore = Math.round(
    (getPointsForPerGame(awayTeam) + getPointsAgainstPerGame(homeTeam)) / 2 - 1
  );

  return {
    homeWinProbability: Math.round(logistic * 100),
    awayWinProbability: Math.round((1 - logistic) * 100),
    estimatedHomeScore,
    estimatedAwayScore,
    strengthDelta: Number(strengthDelta.toFixed(2)),
    explanation: [
      "La fuerza usa record, puntos a favor, puntos en contra y diferencial de la tabla actual 2026.",
      "La localia suma una bonificacion base para aproximar el impacto del gimnasio propio.",
      "La proyeccion cruza el ataque medio del equipo con la defensa media del rival."
    ]
  };
}

function findMatchingTeam(teams: TeamRow[], teamName: string) {
  return teams.find((team) => areSameTeam(team.name, teamName));
}

function mergeRowsByKey<T>(current: T[], incoming: T[], getKey: (row: T) => string) {
  const next = new Map(current.map((row) => [getKey(row), row]));
  incoming.forEach((row) => next.set(getKey(row), row));
  return Array.from(next.values());
}

function matchIdFromStoredGame(game: GameRow) {
  return game.gameId.match(/(?:FIBA|GENIUS)-(\d+)/)?.[1] ?? game.notes.match(/(?:FIBA|Genius)\s+(\d+)/)?.[1];
}

function gameIdentityKey(game: GameRow) {
  const matchId = matchIdFromStoredGame(game);
  if (matchId) {
    return `${game.competition}-match-${matchId}`;
  }
  return `${game.competition}-${game.date}-${normalizeTeamName(game.homeTeam)}-${normalizeTeamName(game.awayTeam)}`;
}

function mergeGameRows(existing: GameRow, incoming: GameRow): GameRow {
  const official = existing.gameId.startsWith("GENIUS-") ? existing : incoming.gameId.startsWith("GENIUS-") ? incoming : existing;
  const latest = incoming.status === "Final" || incoming.notes.toLowerCase().includes("importado desde fiba") ? incoming : existing;
  const notes = Array.from(new Set([official.notes, existing.notes, incoming.notes].filter(Boolean))).join(" · ");

  return {
    ...official,
    homeScore: latest.homeScore || official.homeScore,
    awayScore: latest.awayScore || official.awayScore,
    status: latest.status === "Final" ? "Final" : official.status,
    notes
  };
}

function mergeGamesByIdentity(current: GameRow[], incoming: GameRow[]) {
  const next = new Map<string, GameRow>();
  [...current, ...incoming].forEach((game) => {
    const key = gameIdentityKey(game);
    const existing = next.get(key);
    next.set(key, existing ? mergeGameRows(existing, game) : game);
  });
  return Array.from(next.values());
}

export function applyBoxscoreImports(data: DatasetMap, imports: BoxscoreImport[]): DatasetMap {
  const importedGames = imports.map((item) => item.game);
  const importedPlayers = imports.flatMap((item) => item.players);
  const importedPlayerGameStats = imports.flatMap((item) => item.playerGameStats ?? []);
  const importedShots = imports.flatMap((item) => item.shots ?? []);
  const games = mergeGamesByIdentity(data.games, importedGames);
  const players = mergeRowsByKey(
    data.players,
    importedPlayers,
    (player) => `${player.teamName}-${player.name}`
  );
  const playerGameStats = mergeRowsByKey<PlayerGameStatRow>(
    data.playerGameStats ?? [],
    importedPlayerGameStats,
    (stat) => stat.statId
  );
  const shots = mergeRowsByKey<ShotRow>(
    data.shots ?? [],
    importedShots,
    (shot) => shot.shotId
  );

  const importedTeamNames = imports.flatMap((item) => [
    { competition: item.game.competition, phase: item.game.phase, name: item.game.homeTeam },
    { competition: item.game.competition, phase: item.game.phase, name: item.game.awayTeam }
  ]);
  const createdTeams = importedTeamNames
    .filter((item) => !data.teams.some((team) => team.competition === item.competition && areSameTeam(team.name, item.name)))
    .map<TeamRow>((item, index) => ({
      teamId: `IMPORT-${normalizeTeamName(item.competition)}-${normalizeTeamName(item.name)}-${index + 1}`,
      competition: item.competition,
      zone: item.phase || "Importado desde FIBA",
      name: item.name,
      city: "",
      coach: "",
      gamesPlayed: "0",
      wins: "0",
      losses: "0",
      pointsFor: "0",
      pointsAgainst: "0",
      reboundsPerGame: "0",
      assistsPerGame: "0"
    }));
  const baseTeams = [...data.teams, ...createdTeams];

  const teamTotals = baseTeams.map((team) => {
    const importedStats = imports
      .flatMap((item) => item.teamStats)
      .filter((stat) => areSameTeam(stat.teamName, team.name));

    if (team.teamId.startsWith("GENIUS-")) {
      return team;
    }

    const teamGames = games.filter((game) => {
      return game.status === "Final" && (areSameTeam(game.homeTeam, team.name) || areSameTeam(game.awayTeam, team.name));
    });

    if (teamGames.length === 0) {
      return team;
    }

    const totals = teamGames.reduce(
      (acc, game) => {
        const isHome = areSameTeam(game.homeTeam, team.name);
        const pointsFor = parseNumber(isHome ? game.homeScore : game.awayScore);
        const pointsAgainst = parseNumber(isHome ? game.awayScore : game.homeScore);
        const won = pointsFor > pointsAgainst;

        return {
          pointsFor: acc.pointsFor + pointsFor,
          pointsAgainst: acc.pointsAgainst + pointsAgainst,
          wins: acc.wins + (won ? 1 : 0),
          losses: acc.losses + (won ? 0 : 1)
        };
      },
      { pointsFor: 0, pointsAgainst: 0, wins: 0, losses: 0 }
    );

    const rebounds =
      importedStats.length === 0
        ? team.reboundsPerGame
        : (importedStats.reduce((sum, stat) => sum + stat.rebounds, 0) / importedStats.length).toFixed(1);
    const assists =
      importedStats.length === 0
        ? team.assistsPerGame
        : (importedStats.reduce((sum, stat) => sum + stat.assists, 0) / importedStats.length).toFixed(1);

    return {
      ...team,
      gamesPlayed: String(teamGames.length),
      wins: String(totals.wins),
      losses: String(totals.losses),
      pointsFor: String(totals.pointsFor),
      pointsAgainst: String(totals.pointsAgainst),
      reboundsPerGame: rebounds,
      assistsPerGame: assists
    };
  });

  const resolvedImportedGames = games.map((game) => {
    const homeTeam = findMatchingTeam(teamTotals, game.homeTeam)?.name ?? game.homeTeam;
    const awayTeam = findMatchingTeam(teamTotals, game.awayTeam)?.name ?? game.awayTeam;
    return { ...game, homeTeam, awayTeam };
  });

  return {
    teams: teamTotals,
    players,
    games: resolvedImportedGames,
    playerGameStats,
    shots
  };
}
