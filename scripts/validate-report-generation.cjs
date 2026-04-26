const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");

function transpile(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']@\/([^"']+)["']/g, (_match, target) => {
    return `from "${path.join(projectRoot, target).replace(/\\/g, "/")}"`;
  });
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true
    },
    fileName: filename
  });
  module._compile(output.outputText, filename);
}

require.extensions[".ts"] = transpile;
require.extensions[".tsx"] = transpile;

const { seedData, CURRENT_COMPETITION, LIGA_DOS_COMPETITION, LNF_COMPETITION } = require(path.join(projectRoot, "lib/data.ts"));
const { buildScoutingModel } = require(path.join(projectRoot, "lib/scouting.ts"));
const {
  buildTacticalDossierPdf,
  buildTechnicalLongPdf,
  buildPlayerDefenseReportPdf,
  buildExpressReportPdf
} = require(path.join(projectRoot, "components/ScoutingPlatform.tsx"));

const outDir = path.join("/tmp", "report-validation");
fs.mkdirSync(outDir, { recursive: true });

const competitions = [
  { key: LIGA_DOS_COMPETITION, slug: "liga-dos" },
  { key: CURRENT_COMPETITION, slug: "lnb" },
  { key: LNF_COMPETITION, slug: "lnf" }
];

function pickTeams(competition) {
  const teams = seedData.teams.filter((team) => team.competition === competition);
  const players = seedData.players.filter((player) => player.competition === competition);
  const ranked = teams
    .map((team) => ({
      team,
      playerCount: players.filter((player) => player.teamName === team.name).length
    }))
    .sort((a, b) => b.playerCount - a.playerCount || a.team.name.localeCompare(b.team.name));
  return [ranked[0]?.team?.name, ranked[1]?.team?.name].filter(Boolean);
}

function countPages(pdf) {
  return (pdf.match(/\/Type \/Page\b/g) || []).length;
}

const generators = [
  { key: "dossier", builder: buildTacticalDossierPdf },
  { key: "tecnico", builder: buildTechnicalLongPdf },
  { key: "jugadores", builder: buildPlayerDefenseReportPdf },
  { key: "express", builder: buildExpressReportPdf }
];

const lines = [];

for (const competition of competitions) {
  const [ownTeam, rivalTeam] = pickTeams(competition.key);
  if (!ownTeam || !rivalTeam) {
    lines.push(`${competition.slug}: sin equipos suficientes`);
    continue;
  }

  const model = buildScoutingModel(seedData, competition.key, ownTeam, rivalTeam, []);
  if (!model) {
    lines.push(`${competition.slug}: no se pudo construir modelo`);
    continue;
  }

  lines.push(`${competition.slug}: ${ownTeam} vs ${rivalTeam}`);

  for (const generator of generators) {
    const pdf = generator.builder(model, [], []);
    const file = path.join(outDir, `${competition.slug}-${generator.key}.pdf`);
    fs.writeFileSync(file, pdf, "binary");
    const stats = fs.statSync(file);
    lines.push(`  - ${generator.key}: ok | ${Math.round(stats.size / 1024)} KB | ${countPages(pdf)} paginas | ${path.basename(file)}`);
  }
}

console.log(lines.join("\n"));
