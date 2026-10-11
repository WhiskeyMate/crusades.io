// Brings in real-world maps from OpenFront's open map data (CC BY-SA 4.0,
// github.com/openfrontio/OpenFrontIO, resources/maps). For each map named it
// takes the half-size terrain (map4x.bin), which is the size this game plays
// at, and writes public/maps/<dir>/main.bin with a starter info.json. Run
// tools/mapfix.ts on each afterwards, as for a drawn map.
//
//   node tools/mapimport.mjs <theirName>[:<ourDir>] ...
//
// Prints, for each, the size, the land and how many nations upstream seats
// there (a guide to how many kingdoms it holds).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/maps";

for (const arg of process.argv.slice(2)) {
  const [theirs, ours = theirs] = arg.split(":");
  try {
    const manifest = await (await fetch(`${BASE}/${theirs}/manifest.json`)).json();
    const { width, height, num_land_tiles } = manifest.map4x;
    const bin = new Uint8Array(await (await fetch(`${BASE}/${theirs}/map4x.bin`)).arrayBuffer());
    if (bin.length !== width * height) throw new Error(`size mismatch: ${bin.length} bytes for ${width}x${height}`);
    const dir = join("public", "maps", ours);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "main.bin"), bin);
    writeFileSync(join(dir, "info.json"), JSON.stringify({ source: theirs, width, height, numLandTiles: num_land_tiles }));
    console.log(`${ours}\t${width}x${height}\tland ${num_land_tiles}\tnations ${(manifest.nations ?? []).length}\t"${manifest.name}"`);
  } catch (e) {
    console.log(`${ours}\tFAILED: ${e.message}`);
  }
}
