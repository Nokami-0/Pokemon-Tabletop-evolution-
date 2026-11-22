import {readdirSync} from "node:fs";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {removeCheckerboard} from "./checkerboard.mjs";

const folder = process.argv[2] || "assets/pte-tokens";
const portraitFolder = join(folder, "Portraits");
const tokenFolder = join(folder, "Ringed Tokens");
const convert = (args, input) => execFileSync("convert", args, {input, maxBuffer: 2_000_000});
const failures = [];

function maskElectrode(pixels, width, height) {
  // Electrode's light half dominates the neutral pixels, so use its circular outline.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const radius = Math.hypot((x - 95.8) / 79.8, (y - 98) / 80.5);
      const index = 4 * (y * width + x) + 3;
      pixels[index] = Math.min(pixels[index], Math.round(255 * Math.max(0, Math.min(1, (1.005 - radius) * 80))));
    }
  }
  return true;
}
let processed = 0;

for (const name of readdirSync(portraitFolder).filter(name => name.endsWith(".webp"))) {
  const portrait = join(portraitFolder, name);
  const token = join(tokenFolder, name);
  const [width, height] = execFileSync("identify", ["-format", "%w %h", portrait], {encoding: "utf8"}).split(" ").map(Number);
  const raw = convert([portrait, "-depth", "8", "rgba:-"]);
  const cleaned = name === "electrode-429.webp" && width === 192 && height === 192
    ? maskElectrode(raw, width, height)
    : removeCheckerboard(raw, width, height);
  if (!cleaned) {
    failures.push(name);
    continue;
  }
  const input = ["-size", `${width}x${height}`, "-depth", "8", "rgba:-", "-trim", "+repage"];
  convert([...input, "-resize", "178x178", "-gravity", "center", "-background", "none",
    "-extent", "192x192", "-define", "webp:lossless=true", portrait], raw);
  convert([...input, "-resize", "226x226", "-gravity", "center", "-background", "none",
    "-extent", "320x320", "-fill", "none", "-stroke", "#152443", "-strokewidth", "10",
    "-draw", "circle 159.5,159.5 159.5,8",
    "-stroke", "#6799de", "-strokewidth", "4", "-draw", "circle 159.5,159.5 159.5,8",
    "-define", "webp:lossless=true", token], raw);
  processed++;
}

console.log(`Prepared ${processed} transparent portrait and token pairs.`);
if (failures.length) console.log(`Kept ${failures.length} originals with no confident checkerboard match: ${failures.join(", ")}`);
