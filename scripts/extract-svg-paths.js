/**
 * Script to update GAME_PATH in mapPathData.ts using the source SVG.
 * This avoids depending on a generated MiddleEarthMapSvg.tsx file.
 */

const fs = require('fs');
const path = require('path');

const svgFile = path.join(
  __dirname,
  '../src/assets/maps/middle-earth-map-full.svg',
);
const dataFile = path.join(__dirname, '../src/data/mapPathData.ts');

if (!fs.existsSync(svgFile)) {
  console.error(`✗ SVG not found: ${svgFile}`);
  process.exit(1);
}
if (!fs.existsSync(dataFile)) {
  console.error(`✗ Data file not found: ${dataFile}`);
  process.exit(1);
}

const svgContent = fs.readFileSync(svgFile, 'utf-8');
let dataContent = fs.readFileSync(dataFile, 'utf-8');

// Extract the Frodo path directly from the SVG by id
const frodoRegex = /<path[^>]*id="Frodo-Path_New"[^>]*d="([^"]+)"/s;
const frodoMatch = svgContent.match(frodoRegex);

if (!frodoMatch) {
  console.error('✗ Could not find Frodo-Path_New in the SVG');
  process.exit(1);
}

const newGamePath = frodoMatch[1].replace(/`/g, '`').replace(/\$/g, '$');
console.log(`✓ Extracted Frodo-Path_New (d length: ${newGamePath.length})`);

// Replace the GAME_PATH export in the existing data file
const gamePathExportRegex = /export const GAME_PATH\s*=\s*`[\s\S]*?`;/m;
if (!gamePathExportRegex.test(dataContent)) {
  console.error(
    '✗ export const GAME_PATH = `...`; not found in mapPathData.ts',
  );
  process.exit(1);
}

const updatedDataContent = dataContent.replace(
  gamePathExportRegex,
  `export const GAME_PATH = \`${newGamePath}\`;`,
);

dataContent = updatedDataContent;
console.log(`\n✓ Updated GAME_PATH in ${dataFile}`);

// Also extract the Titles fill path from the SVG and update TITLES_FILL_PATH
const titlesRegex = /<path[^>]*id="titles-2"[^>]*d="([^"]+)"/s;
const titlesMatch = svgContent.match(titlesRegex);
if (!titlesMatch) {
  console.warn(
    '! Could not find titles-2 path in the SVG. Skipping TITLES_FILL_PATH update.',
  );
} else {
  const newTitlesPath = titlesMatch[1]
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
  console.log(`✓ Extracted titles-2 (d length: ${newTitlesPath.length})`);
  const titlesExportRegex = /export const TITLES_FILL_PATH\s*=\s*`[\s\S]*?`;/m;
  if (titlesExportRegex.test(dataContent)) {
    dataContent = dataContent.replace(
      titlesExportRegex,
      `export const TITLES_FILL_PATH = \`${newTitlesPath}\`;`,
    );
  } else {
    // Append at the end
    dataContent += `\n\nexport const TITLES_FILL_PATH = \`${newTitlesPath}\`;\n`;
  }
}

fs.writeFileSync(dataFile, dataContent, 'utf-8');
console.log(`\n✓ Wrote updates to ${dataFile}`);
