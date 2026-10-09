// The stranger model sets sold in the store: armies of snails and geese,
// fleets of swans and washtubs, towns of toadstools. Drawn from the margins
// of medieval manuscripts as much as from history. Built from the same
// primitives as everything else; importing this file registers them.

import { box, build, cone, cyl, gable, hull, log, Model, Part, register } from "./Models";
import { ball, ballista, crystal, dome, flag, ring } from "./Styles";

const SKIN = 0xd9b38c;
const STEEL = 0x9aa0a6;
const WOOD = 0x6b4a2e;
const WOODL = 0x9a7648;
const DARK = 0x16110d;
const WHITE = 0xf4f1e6;
const ORANGE = 0xf08a1c;

/** Move a group of parts, e.g. a house placed in a town. */
function at(parts: Part[], x: number, y: number, z: number, ry = 0): Part[] {
  for (const p of parts) {
    if (ry) p.g.rotateY(ry);
    p.g.translate(x, y, z);
  }
  return parts;
}

// ===================================================================== troops

/** A knight's oldest enemy in the margins of every psalter: the snail. */
function snail(): Model {
  const SLUG = 0xc9b98a;
  return build([
    ball(0.2, 0, 0.13, 0.05, SLUG, false, 0.75, 0.6, 2.1),
    ball(0.14, 0, 0.36, 0.34, SLUG, false, 0.85, 1.25, 0.85),
    cyl(0.018, 0.018, 0.26, -0.06, 0.48, 0.38, SLUG, 4),
    cyl(0.018, 0.018, 0.26, 0.06, 0.48, 0.38, SLUG, 4),
    ball(0.04, -0.06, 0.76, 0.38, DARK),
    ball(0.04, 0.06, 0.76, 0.38, DARK),
    // The shell, in its owner's colours, with a darker whorl on either side.
    ball(0.33, 0, 0.48, -0.08, 0, true, 0.62, 1, 1),
    ball(0.2, 0.17, 0.48, -0.08, 0x3b2a1a, false, 0.3, 1, 1),
    ball(0.2, -0.17, 0.48, -0.08, 0x3b2a1a, false, 0.3, 1, 1),
    // A very small lance, couched.
    cyl(0.018, 0.018, 0.95, 0.2, 0.3, 0.2, WOODL, 4),
    cone(0.035, 0.14, 0.2, 1.25, 0.2, 0xd8dce2, 4),
    box(0.2, 0.1, 0.02, 0.31, 1.08, 0.2, 0, true),
  ]);
}

/** The rabbit that hunts the hunter. */
function rabbit(): Model {
  return build([
    box(0.1, 0.16, 0.2, -0.09, 0, 0.04, WHITE),
    box(0.1, 0.16, 0.2, 0.09, 0, 0.04, WHITE),
    ball(0.24, 0, 0.4, 0, WHITE, false, 0.9, 1.15, 0.85),
    box(0.36, 0.3, 0.26, 0, 0.24, 0, 0, true),
    ball(0.17, 0, 0.8, 0.04, WHITE),
    box(0.07, 0.36, 0.05, -0.08, 0.9, 0, WHITE, false, 0, 0, 0.12),
    box(0.07, 0.36, 0.05, 0.08, 0.9, 0, WHITE, false, 0, 0, -0.12),
    box(0.03, 0.26, 0.02, -0.08, 0.95, 0.03, 0xf0a8b0, false, 0, 0, 0.12),
    box(0.03, 0.26, 0.02, 0.08, 0.95, 0.03, 0xf0a8b0, false, 0, 0, -0.12),
    ball(0.035, -0.07, 0.84, 0.18, 0xc0201c),
    ball(0.035, 0.07, 0.84, 0.18, 0xc0201c),
    box(0.05, 0.04, 0.03, 0, 0.76, 0.2, 0xf0a8b0),
    ball(0.08, 0, 0.3, -0.22, WHITE),
    // A battle-axe, taller than the rabbit.
    cyl(0.02, 0.02, 1.0, 0.27, 0.15, 0.08, WOODL, 4),
    box(0.22, 0.2, 0.03, 0.36, 0.98, 0.08, 0xc8ccd2),
  ]);
}

/** A militant order, mostly militant. */
function monk(): Model {
  const HABIT = 0x5a4632;
  return build([
    cyl(0.17, 0.25, 0.62, 0, 0, 0, HABIT, 8),
    box(0.2, 0.52, 0.03, 0, 0.12, 0.2, 0, true),
    box(0.2, 0.52, 0.03, 0, 0.12, -0.2, 0, true),
    cyl(0.185, 0.2, 0.05, 0, 0.36, 0, WHITE, 8),
    ball(0.13, 0, 0.76, 0, SKIN),
    // The tonsure: a ring of hair round a shaven crown.
    cyl(0.135, 0.135, 0.06, 0, 0.8, 0, 0x4a3320, 8),
    ball(0.1, 0, 0.84, 0, SKIN, false, 1, 0.6, 1),
    ball(0.17, 0, 0.62, -0.1, HABIT, false, 1, 0.7, 0.8),
    // A staff topped with a cross, which also works as a club.
    cyl(0.022, 0.022, 1.15, 0.25, 0, 0.05, WOODL, 4),
    box(0.2, 0.04, 0.04, 0.25, 1.02, 0.05, 0xe0b84a),
    box(0.04, 0.22, 0.04, 0.25, 0.95, 0.05, 0xe0b84a),
  ]);
}

/** The court fool, conscripted. */
function jester(): Model {
  const YELLOW = 0xf2c23c;
  return build([
    box(0.11, 0.38, 0.14, -0.08, 0, 0, 0, true),
    box(0.11, 0.38, 0.14, 0.08, 0, 0, YELLOW),
    box(0.17, 0.4, 0.22, -0.085, 0.36, 0, YELLOW),
    box(0.17, 0.4, 0.22, 0.085, 0.36, 0, 0, true),
    ...ring(6, 0.17, (x, z, a) => cone(0.07, 0.12, x, 0.66, z, a % 2 < 1 ? 0xd0322a : YELLOW, 4)),
    box(0.2, 0.2, 0.2, 0, 0.76, 0, SKIN),
    box(0.12, 0.03, 0.02, 0, 0.8, 0.1, 0xb0201c),
    // The cap: three horns, each with its bell.
    box(0.22, 0.08, 0.22, 0, 0.95, 0, 0, true),
    box(0.07, 0.28, 0.07, -0.13, 1.0, 0, YELLOW, false, 0, 0, 0.75),
    box(0.07, 0.28, 0.07, 0.13, 1.0, 0, 0, true, 0, 0, -0.75),
    box(0.07, 0.26, 0.07, 0, 1.02, -0.04, 0xd0322a, false, 0, -0.5),
    ball(0.045, -0.3, 1.14, 0, 0xe0b84a),
    ball(0.045, 0.3, 1.14, 0, 0xe0b84a),
    ball(0.045, 0, 1.24, -0.17, 0xe0b84a),
    // The marotte: a stick with his own head on it.
    cyl(0.018, 0.018, 0.7, 0.26, 0.3, 0.08, WOODL, 4),
    ball(0.07, 0.26, 1.04, 0.08, SKIN),
    cone(0.07, 0.12, 0.26, 1.08, 0.08, 0xd0322a, 4),
  ]);
}

/** Hedge wizards: all beard and hat. */
function wizard(): Model {
  return build([
    cyl(0.14, 0.27, 0.68, 0, 0, 0, 0, 8, true),
    cyl(0.275, 0.28, 0.05, 0, 0, 0, 0xe0b84a, 8),
    ball(0.12, 0, 0.78, 0, SKIN),
    box(0.16, 0.34, 0.07, 0, 0.36, 0.12, 0xe8e8e8),
    cone(0.1, 0.16, 0, 0.26, 0.13, 0xe8e8e8, 4),
    cyl(0.26, 0.28, 0.03, 0, 0.87, 0, 0, 10, true),
    cone(0.16, 0.5, 0, 0.9, 0, 0, 8, true),
    box(0.1, 0.1, 0.02, 0, 0.98, 0.14, 0xe0b84a, false, 0, 0, 0.785),
    cyl(0.022, 0.03, 1.2, 0.27, 0, 0.06, WOOD, 5),
    ball(0.08, 0.27, 1.26, 0.06, 0x9ff3ff),
  ]);
}

/** The dead who did not bother with the bones. */
function ghost(): Model {
  const SHEET = 0xe9eef2;
  return build([
    dome(0.26, 0, 0.74, 0, SHEET, false, 1.15),
    cyl(0.26, 0.3, 0.5, 0, 0.24, 0, SHEET, 10),
    ...ring(7, 0.23, (x, z) => ball(0.1, x, 0.22, z, SHEET, false, 1, 1.4, 1)),
    ball(0.05, -0.09, 0.8, 0.22, DARK, false, 1, 1.4, 0.6),
    ball(0.05, 0.09, 0.8, 0.22, DARK, false, 1, 1.4, 0.6),
    ball(0.045, 0, 0.66, 0.25, DARK, false, 1, 1.7, 0.6),
    // Still loyal: it carries the colours it died under.
    box(0.05, 0.34, 0.26, -0.3, 0.42, 0.06, 0, true),
    box(0.44, 0.07, 0.02, 0, 0.5, 0.29, 0, true, 0, 0, 0.5),
    cyl(0.018, 0.018, 0.9, 0.31, 0.3, 0.1, 0x7a8a8a, 4),
    box(0.04, 0.26, 0.2, 0.31, 1.0, 0.16, 0xb8c4c4),
  ]);
}

/** Geese. Nobody has ever won a fight with one. */
function goose(): Model {
  return build([
    box(0.04, 0.2, 0.04, -0.08, 0, 0, ORANGE),
    box(0.04, 0.2, 0.04, 0.08, 0, 0, ORANGE),
    box(0.1, 0.02, 0.14, -0.08, 0, 0.05, ORANGE),
    box(0.1, 0.02, 0.14, 0.08, 0, 0.05, ORANGE),
    ball(0.25, 0, 0.4, -0.04, WHITE, false, 0.85, 0.8, 1.35),
    box(0.08, 0.2, 0.2, 0, 0.42, -0.4, WHITE, false, 0, -0.7),
    box(0.06, 0.2, 0.34, -0.22, 0.34, -0.04, 0xdedad0),
    box(0.06, 0.2, 0.34, 0.22, 0.34, -0.04, 0xdedad0),
    // A long neck, held high and angry.
    cyl(0.065, 0.08, 0.46, 0, 0.5, 0.2, WHITE, 6),
    ball(0.1, 0, 1.0, 0.22, WHITE),
    box(0.08, 0.06, 0.2, 0, 0.96, 0.36, ORANGE),
    ball(0.025, -0.08, 1.03, 0.27, DARK),
    ball(0.025, 0.08, 1.03, 0.27, DARK),
    cyl(0.09, 0.1, 0.08, 0, 0.62, 0.2, 0, 6, true),
    box(0.06, 0.22, 0.02, 0.07, 0.42, 0.26, 0, true),
    // It has found a knife.
    box(0.03, 0.03, 0.12, 0.1, 0.97, 0.42, WOOD),
    box(0.02, 0.05, 0.3, 0.1, 0.97, 0.62, 0xd8dce2),
  ]);
}

register("snail", { soldier: snail() });
register("rabbit", { soldier: rabbit() });
register("monk", { soldier: monk() });
register("jester", { soldier: jester() });
register("wizard", { soldier: wizard() });
register("ghost", { soldier: ghost() });
register("goose", { soldier: goose() });

// ====================================================================== fleets

/** Swan boats, for a more elegant invasion. */
function swan(s: number, crate = false): Model {
  const parts: Part[] = [
    ball(1.0, 0, 0.5, -0.1, WHITE, false, 0.85, 0.62, 1.45),
    box(0.5, 0.5, 0.7, 0, 0.75, -1.45, WHITE, false, 0, -0.7),
    // Wings, half raised.
    ball(0.8, -0.78, 0.95, -0.25, WHITE, false, 0.22, 0.75, 1.15),
    ball(0.8, 0.78, 0.95, -0.25, WHITE, false, 0.22, 0.75, 1.15),
    // The neck: an S in four pieces.
    cyl(0.2, 0.26, 0.7, 0, 0.8, 1.05, WHITE, 8),
    box(0.36, 0.7, 0.36, 0, 1.4, 1.0, WHITE, false, 0, -0.35),
    box(0.34, 0.6, 0.34, 0, 1.95, 0.9, WHITE, false, 0, 0.3),
    ball(0.27, 0, 2.6, 1.12, WHITE, false, 1, 1, 1.2),
    box(0.2, 0.14, 0.42, 0, 2.5, 1.5, ORANGE),
    box(0.22, 0.14, 0.14, 0, 2.62, 1.3, DARK),
    ball(0.045, -0.2, 2.66, 1.2, DARK),
    ball(0.045, 0.2, 2.66, 1.2, DARK),
    // A little crown, and a collar in the owner's colours.
    cyl(0.16, 0.13, 0.14, 0, 2.86, 1.08, 0xe0b84a, 6),
    cyl(0.27, 0.29, 0.16, 0, 1.05, 1.05, 0, 8, true),
    cyl(0.04, 0.04, 1.2, 0, 1.0, -0.7, WOOD, 5),
    box(0.8, 0.45, 0.05, 0.42, 1.75, -0.7, 0, true),
  ];
  if (crate) parts.push(box(0.7, 0.5, 0.7, 0, 1.05, -0.1, 0x8a7a55));
  return build(parts, s);
}

/** Three men in a tub: a washtub, a broom for a mast, and somebody's shirt. */
function tub(s: number, crate = false): Model {
  const parts: Part[] = [
    cyl(1.15, 0.95, 0.95, 0, 0, 0, 0x8a6a45, 12),
    cyl(1.0, 0.85, 0.2, 0, 0.8, 0, 0x3b2a1a, 12),
    cyl(1.17, 1.13, 0.1, 0, 0.72, 0, 0x4a4e55, 12),
    cyl(1.03, 1.0, 0.1, 0, 0.2, 0, 0x4a4e55, 12),
    box(0.26, 0.2, 0.5, -1.2, 0.85, 0, 0x8a6a45),
    box(0.26, 0.2, 0.5, 1.2, 0.85, 0, 0x8a6a45),
    // The broom, bristles up.
    cyl(0.05, 0.05, 2.5, 0, 0.8, 0, WOODL, 5),
    cone(0.22, 0.5, 0, 3.3, 0, 0xd9c36a, 6),
    box(1.5, 0.05, 0.05, 0, 2.75, 0, WOODL),
    // The shirt.
    box(0.9, 1.0, 0.05, 0, 1.7, 0.03, 0, true),
    box(0.4, 0.3, 0.05, -0.6, 2.38, 0.03, 0, true, 0, 0, 0.3),
    box(0.4, 0.3, 0.05, 0.6, 2.38, 0.03, 0, true, 0, 0, -0.3),
    // Oars, which are spoons.
    box(1.5, 0.05, 0.08, -1.7, 0.6, 0.3, WOODL, false, 0, 0, 0.25),
    box(1.5, 0.05, 0.08, 1.7, 0.6, 0.3, WOODL, false, 0, 0, -0.25),
    ball(0.2, -2.4, 0.3, 0.3, WOODL, false, 1, 0.3, 1.3),
    ball(0.2, 2.4, 0.3, 0.3, WOODL, false, 1, 0.3, 1.3),
    // The crew: three heads, just visible over the rim.
    ball(0.2, -0.45, 1.05, 0.45, SKIN),
    ball(0.2, 0.45, 1.05, 0.45, SKIN),
    ball(0.2, 0, 1.05, -0.55, SKIN),
    cyl(0.21, 0.21, 0.1, -0.45, 1.16, 0.45, STEEL, 6),
    cyl(0.21, 0.21, 0.1, 0.45, 1.16, 0.45, STEEL, 6),
  ];
  if (crate) parts.push(cyl(0.3, 0.3, 0.5, 0.1, 0.95, 0.05, WOOD, 8));
  return build(parts, s);
}

/** A sea serpent, saddled. */
function serpent(s: number, humps: number, crate = false): Model {
  const SCALE = 0x2f7a5a;
  const BELLY = 0xc9d98a;
  const parts: Part[] = [];
  const span = humps * 1.25;
  for (let i = 0; i < humps; i++) {
    const z = span / 2 - 0.9 - i * 1.25;
    const r = 0.62 - i * 0.07;
    parts.push(ball(r, 0, 0.1, z, SCALE, false, 0.8, 1.25, 1.15));
    parts.push(cone(0.16, 0.5, 0, 0.1 + r * 1.2, z, 0, 4, true));
    parts.push(cone(0.12, 0.36, 0, 0.1 + r * 1.05, z + 0.4, 0, 4, true));
  }
  const hz = span / 2;
  parts.push(
    // Neck and head, reared up at the bow.
    box(0.5, 1.5, 0.5, 0, 0.1, hz - 0.2, SCALE, false, 0, 0.35),
    box(0.3, 1.3, 0.1, 0, 0.3, hz + 0.1, BELLY, false, 0, 0.35),
    box(0.56, 0.42, 1.0, 0, 1.55, hz + 0.75, SCALE),
    box(0.5, 0.14, 0.9, 0, 1.36, hz + 0.78, BELLY, false, 0, 0.18),
    cone(0.07, 0.22, -0.16, 1.3, hz + 1.1, WHITE, 4),
    cone(0.07, 0.22, 0.16, 1.3, hz + 1.1, WHITE, 4),
    ball(0.09, -0.26, 1.86, hz + 0.9, 0xf2c23c),
    ball(0.09, 0.26, 1.86, hz + 0.9, 0xf2c23c),
    cone(0.09, 0.4, -0.18, 1.95, hz + 0.45, WHITE, 4),
    cone(0.09, 0.4, 0.18, 1.95, hz + 0.45, WHITE, 4),
    // The tail, breaking the surface astern.
    cone(0.2, 0.9, 0, 0, -span / 2 - 0.5, SCALE, 5),
    box(0.06, 0.5, 0.5, 0, 0.7, -span / 2 - 0.5, 0, true, 0, 0.785),
    // A saddle on the first hump, with the colours flying.
    box(0.7, 0.14, 0.8, 0, 0.82, span / 2 - 0.9, WOOD),
    box(0.74, 0.3, 0.1, 0, 0.9, span / 2 - 1.3, WOODL),
    cyl(0.035, 0.035, 1.4, 0, 0.9, span / 2 - 1.3, WOOD, 5),
    box(0.75, 0.42, 0.05, 0.4, 1.86, span / 2 - 1.3, 0, true),
  );
  if (crate) parts.push(box(0.6, 0.45, 0.6, 0, 0.95, span / 2 - 0.85, 0x8a7a55));
  return build(parts, s);
}

/** A ship that went down with all hands, and came back up with them. */
function wraith(len: number, w: number, masts: number, crate = false): Model {
  const ROT = 0x3a4640;
  const GLOW = 0x7dffb0;
  const parts: Part[] = [
    ...hull(w, 0.6, len, ROT),
    box(w * 0.86, 0.06, len * 0.94, 0, 0.6, 0, 0x55645c),
    box(w * 0.92, 0.6, len * 0.22, 0, 0.66, -len * 0.38, ROT),
    // Holes in the planking, lit from inside.
    box(0.06, 0.2, 0.5, w / 2, 0.22, len * 0.1, GLOW),
    box(0.06, 0.16, 0.36, -w / 2, 0.26, -len * 0.14, GLOW),
    box(0.4, 0.26, 0.06, 0, 0.84, -len * 0.265, GLOW),
    // A skull for a figurehead.
    ball(0.26, 0, 0.95, len / 2 + len * 0.3, 0xe9e4d4, false, 0.9, 1, 1),
    ball(0.06, -0.1, 1.0, len / 2 + len * 0.3 + 0.22, DARK),
    ball(0.06, 0.1, 1.0, len / 2 + len * 0.3 + 0.22, DARK),
    box(0.1, 0.9, 0.1, 0, 0.3, len / 2 + len * 0.2, ROT, false, 0, 0.5),
    // Corpse-lanterns fore and aft.
    ball(0.13, 0, 1.55, -len * 0.47, GLOW),
    cyl(0.025, 0.025, 0.4, 0, 1.2, -len * 0.47, DARK, 4),
  ];
  for (let m = 0; m < masts; m++) {
    const z = masts === 1 ? 0.1 : len * 0.22 - m * len * 0.42;
    const h = 2.9 - m * 0.4;
    const sw = w * (1.5 - m * 0.2);
    parts.push(cyl(0.06, 0.09, h, 0, 0.6, z, ROT, 6));
    parts.push(log(0.045, sw + 0.3, 0, 0.6 + h * 0.9, z + 0.08, ROT, 5, false, true));
    parts.push(ball(0.09, 0, 0.66 + h, z, GLOW));
    // What is left of the sail: rags of different lengths.
    const rags = 5;
    for (let i = 0; i < rags; i++) {
      const drop = h * [0.62, 0.3, 0.5, 0.2, 0.56][i];
      parts.push(box(sw / rags - 0.05, drop, 0.04, (i - (rags - 1) / 2) * (sw / rags), 0.6 + h * 0.9 - drop, z + 0.1, 0xc9d6cc, i % 2 === 0));
    }
  }
  if (crate) parts.push(box(w * 0.5, 0.4, 0.6, 0, 0.66, len * 0.12, 0x55645c), box(w * 0.4, 0.3, 0.26, 0.1, 0.66, len * 0.3, 0x2a2420));
  return build(parts);
}

/** A great turtle with a tower on its back. It goes where it likes; so far that has suited everyone. */
function turtle(s: number, crate = false): Model {
  const SHELL = 0x5a6e3a;
  const HIDE = 0x8a9a5a;
  const STONE = 0xa9a394;
  const parts: Part[] = [
    dome(1.3, 0, 0.1, 0, SHELL, false, 0.62),
    cyl(1.36, 1.2, 0.22, 0, -0.06, 0, 0x4a5a30, 10),
    ...ring(6, 0.8, (x, z) => dome(0.34, x, 0.5, z, 0x6e8246, false, 0.4)),
    ball(0.36, 0, 0.3, 1.6, HIDE, false, 0.9, 0.8, 1.2),
    box(0.3, 0.3, 0.6, 0, 0.1, 1.25, HIDE),
    ball(0.05, -0.22, 0.42, 1.78, DARK),
    ball(0.05, 0.22, 0.42, 1.78, DARK),
    ...[-1, 1].flatMap((sx) => [1, -1].map((sz) => ball(0.4, sx * 1.25, 0.02, sz * 0.85, HIDE, false, 1.2, 0.3, 0.7))),
    cone(0.14, 0.5, 0, 0, -1.55, HIDE, 4),
    // The tower.
    cyl(0.5, 0.56, 1.3, 0, 0.82, -0.1, STONE, 8),
    cyl(0.62, 0.52, 0.18, 0, 2.1, -0.1, STONE, 8),
    ...ring(6, 0.56, (x, z) => box(0.2, 0.2, 0.2, x, 2.28, z - 0.1, STONE)),
    cone(0.5, 0.8, 0, 2.28, -0.1, 0, 8, true),
    box(0.2, 0.34, 0.05, 0, 0.9, 0.44, 0x3b2a1a),
    cyl(0.03, 0.03, 0.7, 0, 3.0, -0.1, WOOD, 4),
    box(0.55, 0.3, 0.04, 0.3, 3.42, -0.1, 0, true),
  ];
  if (crate) parts.push(box(0.5, 0.4, 0.5, 0.75, 0.72, -0.5, 0x8a7a55), cyl(0.2, 0.2, 0.4, -0.75, 0.72, -0.4, WOOD, 6));
  return build(parts, s);
}

register("swan", { galley: swan(1.15), longship: swan(0.8), cog: swan(0.95, true) });
register("tub", { galley: tub(1.2), longship: tub(0.82), cog: tub(1.0, true) });
register("serpent", { galley: serpent(1.0, 4), longship: serpent(0.8, 3), cog: serpent(0.85, 3, true) });
register("wraith", { galley: wraith(4.0, 1.2, 2), longship: wraith(2.9, 0.9, 1), cog: wraith(2.8, 1.4, 2, true) });
register("turtle", { galley: turtle(1.25), longship: turtle(0.85), cog: turtle(1.05, true) });

// ================================================================ architecture

const jetties = (plank: number, post: number): Part[] => [
  box(3.6, 0.22, 0.9, 0, 0.1, 0.6, plank),
  box(0.9, 0.22, 2.6, -1.1, 0.1, 1.9, plank),
  box(0.9, 0.22, 2.2, 1.2, 0.1, 1.7, plank),
  ...[[-1.5, 3.0], [-0.7, 3.0], [0.8, 2.6], [1.6, 2.6]].map(([x, z]) => cyl(0.09, 0.09, 0.9, x, -0.4, z, post, 5)),
];

// ---- Toadstools: a fairy ring that got out of hand.
const STALK = 0xefe6d0;
const CAP = 0xc0281e;

/** A toadstool: `r` is the cap's radius, `h` the height of the stalk. */
function shroom(r: number, h: number, team = false, cap = CAP, door = false): Part[] {
  const p: Part[] = [
    cyl(r * 0.34, r * 0.46, h, 0, 0, 0, STALK, 8),
    cyl(r * 0.5, r * 0.4, h * 0.1, 0, h * 0.72, 0, 0xd9cfb4, 8),
    dome(r, 0, h, 0, cap, team, 0.7),
    cyl(r, r * 0.9, r * 0.08, 0, h - r * 0.06, 0, 0xe6dcc2, 10),
    // The spots.
    ...ring(5, r * 0.62, (x, z) => ball(r * 0.13, x, h + r * 0.5, z, 0xfbf7ea, false, 1, 0.5, 1)),
    ball(r * 0.15, 0, h + r * 0.69, 0, 0xfbf7ea, false, 1, 0.5, 1),
  ];
  if (door) {
    p.push(box(r * 0.26, h * 0.5, 0.05, 0, 0, r * 0.42, 0x5b3f27));
    p.push(box(r * 0.16, r * 0.16, 0.05, r * 0.2, h * 0.6, r * 0.36, 0xf2c23c, false, 0.5));
  }
  return p;
}

const toadstool = (): Record<string, Model> => ({
  town: build([
    ...ring(16, 2.5, (x, z, _a, i) => (i === 3 ? null : at(shroom(0.3, 0.42, false, i % 2 ? 0xd9a441 : CAP), x, 0, z))),
    ...at(shroom(0.6, 0.6, true, CAP, true), -1.15, 0, -0.9, 0.4),
    ...at(shroom(0.55, 0.5, false, 0xd9a441, true), 1.15, 0, -1.0, -0.4),
    ...at(shroom(0.55, 0.55, true, CAP, true), 1.25, 0, 0.9, 1.0),
    ...at(shroom(0.5, 0.45, false, 0x8a5a9a, true), -1.3, 0, 1.0, 2.2),
    ...at(shroom(0.95, 1.25, true, CAP, true), 0, 0, 0),
    cyl(0.07, 0.07, 0.34, 0.5, 1.9, 0, 0x77736b, 5),
  ]),
  keep: build([
    cyl(2.0, 2.3, 0.5, 0, 0, 0, 0x5d7038, 12),
    ...ring(14, 1.95, (x, z, _a, i) => at(shroom(0.26, 0.36, false, i % 2 ? CAP : 0xd9a441), x, 0.5, z)),
    cyl(0.95, 1.2, 2.2, 0, 0.5, 0, STALK, 10),
    cyl(1.3, 1.0, 0.24, 0, 2.2, 0, 0xd9cfb4, 10),
    dome(2.0, 0, 2.7, 0, CAP, true, 0.66),
    cyl(2.0, 1.8, 0.16, 0, 2.6, 0, 0xe6dcc2, 12),
    ...ring(7, 1.3, (x, z) => ball(0.28, x, 3.62, z, 0xfbf7ea, false, 1, 0.5, 1)),
    ball(0.32, 0, 4.0, 0, 0xfbf7ea, false, 1, 0.5, 1),
    box(0.6, 1.0, 0.08, 0, 0.5, 1.14, 0x5b3f27),
    ...ring(4, 1.02, (x, z, a) => box(0.26, 0.3, 0.06, x, 1.6, z, 0xf2c23c, false, a + 0.6)),
    ...flag(0, 4.05, 0),
  ]),
  harbour: build([
    ...jetties(WOODL, WOOD),
    ...at(shroom(0.85, 0.85, true, CAP, true), -0.6, 0.1, -0.7),
    ...at(shroom(0.4, 1.5, false, 0xd9a441), 1.3, 0.1, -0.8),
    ball(0.14, 1.3, 1.25, -0.5, 0xf2c23c),
    cyl(0.2, 0.2, 0.36, 0.5, 0.32, 0.5, WOOD, 6),
    // A boat made from an acorn cup.
    dome(0.4, 1.25, 0.3, 1.0, 0x8a6a45, false, -0.6),
  ]),
  market: build([
    ...at(shroom(0.75, 0.9, true), -1.25, 0, 0.8),
    ...at(shroom(0.7, 0.8, false, 0xd9a441), 0.1, 0, 1.0),
    ...at(shroom(0.75, 0.95, false, 0x8a5a9a), 1.4, 0, 0.75),
    ...[-1.25, 0.1, 1.4].map((x) => box(0.8, 0.28, 0.45, x, 0, 1.55, WOODL)),
    ...at(shroom(1.0, 0.8, true, CAP, true), 0, 0, -1.0),
    cyl(0.3, 0.3, 0.3, -1.9, 0, -0.6, 0x77736b, 8),
    ...at(shroom(0.22, 0.3), 2.0, 0, -0.4),
  ]),
  mageTower: build([
    cyl(0.9, 1.15, 0.5, 0, 0, 0, 0x5d7038, 10),
    cyl(0.42, 0.62, 5.6, 0, 0.5, 0, STALK, 10),
    // Caps up the stalk like brackets on a tree, and one at the top.
    dome(1.25, 0, 2.0, 0, 0xd9a441, false, 0.45),
    dome(1.0, 0, 3.6, 0, 0x8a5a9a, false, 0.45),
    dome(1.15, 0, 6.0, 0, CAP, true, 0.75),
    cyl(1.15, 1.0, 0.1, 0, 5.95, 0, 0xe6dcc2, 10),
    ...ring(5, 0.72, (x, z) => ball(0.16, x, 6.55, z, 0xfbf7ea, false, 1, 0.5, 1)),
    crystal(7.9),
  ]),
  ballistaTower: build([
    // A tree stump, with its rings showing.
    cyl(1.2, 1.4, 1.9, 0, 0, 0, 0x6e5236, 10),
    cyl(1.22, 1.22, 0.06, 0, 1.9, 0, 0xc9a56a, 10),
    cyl(0.8, 0.8, 0.07, 0, 1.9, 0, 0xa8834e, 10),
    cyl(0.4, 0.4, 0.08, 0, 1.9, 0, 0xc9a56a, 10),
    box(0.5, 0.22, 0.9, 1.25, 0, 0.3, 0x6e5236, false, 0.4),
    box(0.5, 0.22, 0.9, -1.2, 0, -0.4, 0x6e5236, false, -0.7),
    ...at(shroom(0.3, 0.3, true), 1.0, 1.95, -0.6),
    ...at(shroom(0.22, 0.24, false, 0xd9a441), -0.95, 1.95, 0.7),
    ...ballista(1.98),
  ]),
});

// ---- Necropolis: a city of the dead, for those who command them.
const TOMB = 0x7b8088;
const TOMB_D = 0x4a4e58;
const CORPSE = 0x7dffb0;

function headstone(x: number, z: number, ry: number, cross = false): Part[] {
  const p = cross
    ? [box(0.1, 0.55, 0.08, 0, 0, 0, TOMB), box(0.34, 0.1, 0.08, 0, 0.3, 0, TOMB)]
    : [box(0.3, 0.36, 0.09, 0, 0, 0, TOMB), ball(0.15, 0, 0.36, 0, TOMB, false, 1, 0.8, 0.3)];
  return at(p, x, 0, z, ry);
}

function crypt(x: number, z: number, ry: number, s = 1): Part[] {
  return at([
    box(0.9 * s, 0.6 * s, 1.1 * s, 0, 0, 0, TOMB),
    gable(1.0 * s, 0.4 * s, 1.2 * s, 0, 0.6 * s, 0, TOMB_D),
    box(0.3 * s, 0.42 * s, 0.05, 0, 0, 0.56 * s, DARK),
    box(0.08, 0.08, 0.05, 0, 0.74 * s, 0.6 * s, 0, true),
  ], x, 0, z, ry);
}

function deadTree(x: number, z: number): Part[] {
  return [
    cyl(0.07, 0.12, 1.2, x, 0, z, 0x2a2420, 5),
    box(0.06, 0.7, 0.06, x + 0.2, 0.9, z, 0x2a2420, false, 0, 0, -0.8),
    box(0.05, 0.6, 0.05, x - 0.2, 1.05, z, 0x2a2420, false, 0, 0, 0.7),
    box(0.04, 0.4, 0.04, x, 1.2, z + 0.12, 0x2a2420, false, 0, 0.6),
  ];
}

const necropolis = (): Record<string, Model> => ({
  town: build([
    // Iron railings, with a gap for the gate.
    ...ring(30, 2.5, (x, z, _a, i) => (i === 6 || i === 7 ? null : [cyl(0.03, 0.03, 0.7, x, 0, z, DARK, 4), cone(0.05, 0.14, x, 0.7, z, DARK, 4)])),
    ...ring(10, 2.5, (x, z, a) => box(1.6, 0.04, 0.04, x, 0.5, z, DARK, false, a)),
    ...crypt(-1.2, -0.9, 0.4),
    ...crypt(1.2, -1.0, -0.4),
    ...headstone(1.5, 0.5, 0.3),
    ...headstone(1.0, 1.3, -0.2, true),
    ...headstone(0.2, 1.7, 0.1),
    ...headstone(-0.8, 1.5, 0.4, true),
    ...headstone(-1.6, 0.7, -0.3),
    ...deadTree(-1.7, 1.7),
    // The mausoleum.
    box(1.4, 0.2, 1.4, 0, 0, 0, TOMB_D),
    box(1.1, 0.9, 1.1, 0, 0.2, 0, TOMB),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.08, 0.08, 0.9, sx * 0.6, 0.2, sz * 0.6, 0xa9adb4, 6))),
    box(1.4, 0.14, 1.4, 0, 1.1, 0, TOMB_D),
    dome(0.55, 0, 1.24, 0, 0, true),
    box(0.3, 0.55, 0.05, 0, 0.2, 0.56, CORPSE),
  ]),
  keep: build([
    box(3.4, 0.5, 3.4, 0, 0, 0, TOMB_D),
    box(2.2, 3.0, 2.2, 0, 0.5, 0, TOMB),
    // A face in the wall: it was not designed that way, it just happened.
    box(0.4, 0.5, 0.06, -0.5, 2.3, 1.1, CORPSE),
    box(0.4, 0.5, 0.06, 0.5, 2.3, 1.1, CORPSE),
    box(0.2, 0.3, 0.06, 0, 1.8, 1.1, DARK),
    box(0.7, 1.0, 0.06, 0, 0.5, 1.1, DARK),
    ...[-0.24, 0, 0.24].map((x) => box(0.14, 0.2, 0.07, x, 1.3, 1.1, 0xe9e4d4)),
    // Battlements like broken teeth.
    ...ring(12, 1.2, (x, z, _a, i) => box(0.3, 0.3 + (i % 3) * 0.22, 0.3, Math.sign(Math.round(x * 2)) * Math.min(1.0, Math.abs(x) * 1.3), 3.5, Math.sign(Math.round(z * 2)) * Math.min(1.0, Math.abs(z) * 1.3), TOMB_D)),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [cyl(0.3, 0.4, 2.2, sx * 1.4, 0.5, sz * 1.4, TOMB_D, 6), cone(0.36, 1.3, sx * 1.4, 2.7, sz * 1.4, 0, 6, true)])),
    ...flag(0, 3.6, 0),
  ]),
  harbour: build([
    ...jetties(0x55524c, 0x2a2420),
    ...crypt(-0.6, -0.7, 0, 1.4).map((p) => (p.g.translate(0, 0.1, 0), p)),
    // The ferryman's lantern.
    cyl(0.04, 0.04, 2.0, 1.3, 0.1, -0.8, DARK, 5),
    box(0.5, 0.04, 0.04, 1.5, 2.0, -0.8, DARK),
    ball(0.16, 1.72, 1.78, -0.8, CORPSE),
    // And his boat.
    ...hull(0.45, 0.2, 1.4, 0x2a2420).map((p) => (p.g.translate(1.25, 0.25, 1.0), p)),
    box(0.3, 0.6, 0.3, 0.3, 0.32, 0.5, DARK),
    ball(0.13, 0.3, 1.0, 0.5, 0xe9e4d4),
  ]),
  market: build([
    // Coffins, in three sizes.
    box(0.5, 0.25, 1.3, -1.3, 0, 0.9, WOOD, false, 0.2),
    box(0.45, 0.22, 1.1, -0.5, 0, 1.1, 0x4a3526, false, -0.1),
    box(0.3, 0.18, 0.7, 0.2, 0, 1.3, WOODL, false, 0.4),
    box(0.1, 0.3, 0.02, -1.3, 0.26, 0.9, 0, true, 0.2),
    // The undertaker's.
    box(2.6, 1.0, 1.3, 0, 0, -1.0, 0x3b3128),
    gable(2.8, 0.8, 1.5, 0, 1.0, -1.0, TOMB_D, false, Math.PI / 2),
    box(0.4, 0.7, 0.06, -0.6, 0, -0.34, DARK),
    box(0.5, 0.4, 0.06, 0.5, 0.4, -0.34, CORPSE),
    // A gibbet, for advertising.
    cyl(0.06, 0.06, 2.0, 1.7, 0, 0.9, 0x2a2420, 5),
    box(0.8, 0.07, 0.07, 1.35, 1.95, 0.9, 0x2a2420),
    box(0.02, 0.5, 0.02, 1.0, 1.45, 0.9, WOODL),
    box(0.3, 0.44, 0.3, 1.0, 1.0, 0.9, 0x4a4e55),
    ...headstone(-1.9, -0.2, 0.6, true),
  ]),
  mageTower: build([
    cyl(1.0, 1.25, 0.6, 0, 0, 0, TOMB_D, 7),
    // A spire that leans the way a spire should not.
    box(1.0, 2.2, 1.0, 0, 0.6, 0, TOMB, false, 0.2),
    box(0.85, 2.0, 0.85, 0.08, 2.7, 0, TOMB_D, false, 0.6, 0, -0.06),
    box(0.65, 1.8, 0.65, 0.2, 4.6, 0, TOMB, false, 1.0, 0, -0.1),
    cone(0.6, 1.4, 0.36, 6.3, 0, 0, 4, true),
    ...ring(5, 1.5, (x, z, a) => box(0.26, 0.26, 0.26, x, 3.0 + Math.sin(a * 2) * 0.9, z, TOMB_D, false, a, a)),
    box(0.3, 0.5, 0.05, 0.1, 3.4, 0.46, CORPSE, false, 0.6),
    box(0.3, 0.5, 0.05, 0, 1.4, 0.52, CORPSE, false, 0.2),
    crystal(7.9),
  ]),
  ballistaTower: build([
    box(2.3, 1.9, 2.3, 0, 0, 0, TOMB),
    box(2.5, 0.2, 2.5, 0, 1.9, 0, TOMB_D),
    box(0.6, 1.0, 0.06, 0, 0, 1.16, DARK),
    ...[-0.7, 0.7].map((x) => ball(0.2, x, 1.3, 1.16, 0xe9e4d4)),
    ...ring(8, 1.2, (x, z, _a, i) => box(0.36, 0.26 + (i % 2) * 0.2, 0.36, Math.sign(Math.round(x * 2)) * 1.05, 2.1, Math.sign(Math.round(z * 2)) * 1.05, TOMB_D)),
    ...ballista(2.1),
    ...flag(-0.9, 2.1, -0.9),
  ]),
});

// ---- The tourney: a city of pavilions, struck and pitched again each season.
const CANVAS = 0xf1ead8;

/** A round pavilion: striped walls, a peaked roof, a pennon. */
function pavilion(r: number, h: number, stripe = 0xc0281e): Part[] {
  return [
    cyl(r, r, h, 0, 0, 0, CANVAS, 10),
    ...ring(5, r * 1.005, (x, z, a) => box(r * 0.34, h, 0.04, x, 0, z, stripe, stripe === 0, a)),
    cone(r * 1.14, r * 1.1, 0, h, 0, 0, 10, true),
    cyl(r * 1.16, r * 1.12, h * 0.14, 0, h * 0.9, 0, 0xe0b84a, 10),
    cyl(0.03, 0.03, r * 0.9, 0, h + r * 1.0, 0, WOOD, 4),
    box(r * 0.6, r * 0.24, 0.03, r * 0.3, h + r * 1.6, 0, 0, true),
    box(r * 0.5, h * 0.7, 0.05, 0, 0, r * 0.98, 0x5b3f27),
  ];
}

const tourney = (): Record<string, Model> => ({
  town: build([
    // The lists: a tilt-yard fence all round, with bunting.
    ...ring(14, 2.5, (x, z, _a, i) => (i === 3 ? null : cyl(0.05, 0.05, 0.7, x, 0, z, WOODL, 5))),
    ...ring(14, 2.5, (x, z, a, i) => (i === 3 || i === 2 ? null : box(1.15, 0.06, 0.05, x, 0.45, z, WOODL, false, a + 0.224))),
    ...ring(28, 2.5, (x, z, a, i) => (i >= 5 && i <= 7 ? null : box(0.14, 0.16, 0.02, x, 0.72, z, [0xc0281e, 0xf2c23c, 0x2c6fb3][i % 3], i % 4 === 0, a))),
    ...at(pavilion(0.5, 0.55), -1.2, 0, -0.9, 0.4),
    ...at(pavilion(0.5, 0.55, 0x2c6fb3), 1.15, 0, -1.05, -0.5),
    ...at(pavilion(0.46, 0.5, 0x2f8a4a), 1.3, 0, 0.85, 1.2),
    ...at(pavilion(0.46, 0.5, 0), -1.3, 0, 0.95, 2.0),
    ...at(pavilion(0.85, 0.9, 0), 0, 0, 0),
  ]),
  keep: build([
    // A timber stand, hung with cloth, and the royal box on top.
    box(3.4, 0.9, 3.4, 0, 0, 0, WOODL),
    box(3.5, 0.5, 0.06, 0, 0.4, 1.72, 0, true),
    box(3.5, 0.5, 0.06, 0, 0.4, -1.72, 0, true),
    box(0.06, 0.5, 3.5, 1.72, 0.4, 0, CANVAS),
    box(0.06, 0.5, 3.5, -1.72, 0.4, 0, CANVAS),
    ...ring(4, 2.0, (x, z) => at(pavilion(0.5, 0.9, 0xc0281e), Math.sign(Math.round(x)) * 1.25 + Math.sign(Math.round(z)) * 0, 0.9, Math.sign(Math.round(z)) * 1.25)),
    ...[-1, 1].flatMap((sx) => at(pavilion(0.5, 0.9, 0xf2c23c), sx * 1.25, 0.9, sx * 1.25)),
    ...[-1, 1].flatMap((sx) => at(pavilion(0.5, 0.9, 0xf2c23c), sx * 1.25, 0.9, -sx * 1.25)),
    ...at(pavilion(1.05, 2.0, 0), 0, 0.9, 0),
    ...flag(0, 4.9, 0),
  ]),
  harbour: build([
    ...jetties(WOODL, WOOD),
    ...at(pavilion(0.75, 0.8, 0x2c6fb3), -0.6, 0.1, -0.7),
    ...at(pavilion(0.4, 0.6, 0), 1.3, 0.1, -0.8),
    cyl(0.2, 0.2, 0.36, 0.5, 0.32, 0.5, WOOD, 6),
    box(0.5, 0.36, 0.5, 0.0, 0.32, 0.8, 0x8a7a55),
    ...[-1.5, -0.3, 0.9].flatMap((x, i) => [cyl(0.03, 0.03, 0.9, x, 0.32, 0.25, WOOD, 4), box(0.3, 0.2, 0.02, x + 0.16, 1.0, 0.25, [0xc0281e, 0xf2c23c, 0x2f8a4a][i], i === 1)]),
  ]),
  market: build([
    ...[-1.3, 0, 1.3].flatMap((x, i) => [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.03, 0.03, 0.95, x + sx * 0.45, 0, 1.0 + sz * 0.4, WOOD, 4))),
      gable(1.05, 0.4, 0.95, x, 0.95, 1.0, [0xc0281e, 0xf2c23c, 0x2c6fb3][i], i === 1),
      box(0.8, 0.32, 0.5, x, 0, 1.0, WOODL),
    ]),
    ...at(pavilion(0.8, 0.8, 0), -0.9, 0, -1.0),
    // The quintain: a dummy on a post, for practice.
    cyl(0.06, 0.06, 1.3, 1.4, 0, -1.0, WOOD, 5),
    box(1.1, 0.07, 0.07, 1.4, 1.3, -1.0, WOODL),
    box(0.36, 0.42, 0.06, 1.85, 0.95, -1.0, 0, true),
    ball(0.13, 0.95, 1.1, -1.0, 0x8a7a55),
    // A rack of lances.
    ...[0, 1, 2].map((i) => box(0.04, 1.8, 0.04, 0.3 + i * 0.18, 0, -1.4, WOODL, false, 0, 0.25)),
  ]),
  mageTower: build([
    // The fortune-teller's: tent upon tent upon tent.
    ...pavilion(1.0, 1.6, 0x6a3fa6).slice(0, 3),
    cyl(1.16, 1.12, 0.2, 0, 1.45, 0, 0xe0b84a, 10),
    ...at(pavilion(0.72, 1.4, 0x6a3fa6).slice(0, 4), 0, 2.5, 0),
    ...at(pavilion(0.5, 1.2, 0x6a3fa6).slice(0, 4), 0, 4.55, 0),
    cyl(0.06, 0.06, 1.6, 0, 6.2, 0, WOOD, 5),
    ...ring(6, 1.3, (x, z) => [cyl(0.02, 0.02, 0.9, x, 0, z, WOOD, 4), ball(0.07, x, 0.92, z, 0xf2c23c)]),
    box(0.5, 1.1, 0.05, 0, 0, 0.99, 0x2a1d3a),
    crystal(7.9),
  ]),
  ballistaTower: build([
    // A siege wagon: the engine on a cart, under an awning.
    box(2.4, 0.3, 1.8, 0, 0.7, 0, WOODL),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => log(0.55, 0.16, sx * 0.9, 0.55, sz * 1.0, WOOD, 10))),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.05, 0.05, 1.5, sx * 1.1, 1.0, sz * 0.8, WOOD, 4))),
    box(2.4, 0.06, 1.8, 0, 2.5, 0, 0, true),
    ...[-1, 1].map((sz) => box(2.4, 0.3, 0.04, 0, 2.2, sz * 0.9, CANVAS)),
    box(2.6, 0.5, 0.06, 0, 0.8, 0.92, 0, true),
    ...ballista(1.0),
    ...flag(-1.1, 2.5, -0.8),
  ]),
});

// ---- The apiary: a town kept in straw skeps. The inhabitants are busy.
const STRAW = 0xd9b45a;
const STRAW_D = 0xb08a3a;

/** A straw beehive: coils of rope, narrowing to the top. */
function skep(r: number, h: number, door = true, team = false): Part[] {
  const coils = Math.max(3, Math.round(h / (r * 0.34)));
  const p: Part[] = [];
  for (let i = 0; i < coils; i++) {
    const t = i / coils;
    const rr = r * Math.cos(t * 1.35);
    p.push(cyl(rr * 0.94, rr, h / coils, 0, t * h, 0, i === coils - 2 && team ? 0 : i % 2 ? STRAW_D : STRAW, 10, i === coils - 2 && team));
  }
  p.push(ball(r * 0.14, 0, h, 0, STRAW_D));
  if (door) p.push(box(r * 0.36, h * 0.24, 0.06, 0, 0, r * 0.97, DARK));
  return p;
}

function bee(x: number, y: number, z: number, s = 1): Part[] {
  return [
    ball(0.09 * s, x, y, z, 0xf2c23c, false, 1, 1, 1.5),
    box(0.19 * s, 0.19 * s, 0.035 * s, x, y - 0.095 * s, z, DARK),
    box(0.16 * s, 0.01, 0.1 * s, x + 0.08 * s, y + 0.08 * s, z, 0xdfeaf0, false, 0, 0, 0.5),
    box(0.16 * s, 0.01, 0.1 * s, x - 0.08 * s, y + 0.08 * s, z, 0xdfeaf0, false, 0, 0, -0.5),
  ];
}

const apiary = (): Record<string, Model> => ({
  town: build([
    // A wattle fence.
    ...ring(18, 2.5, (x, z, _a, i) => (i === 4 ? null : cyl(0.04, 0.04, 0.55, x, 0, z, WOOD, 4))),
    ...ring(18, 2.5, (x, z, a, i) => (i === 4 || i === 3 ? null : [box(0.9, 0.05, 0.04, x, 0.18, z, WOODL, false, a + 0.175), box(0.9, 0.05, 0.04, x, 0.38, z, WOODL, false, a + 0.175)])),
    ...at(skep(0.52, 0.8, true, true), -1.15, 0, -0.9, 0.4),
    ...at(skep(0.5, 0.75), 1.15, 0, -1.0, -0.4),
    ...at(skep(0.5, 0.8, true, true), 1.25, 0, 0.9, 1.0),
    ...at(skep(0.46, 0.7), -1.3, 0, 1.0, 2.2),
    box(1.3, 0.24, 1.3, 0, 0, 0, WOODL),
    ...at(skep(0.75, 1.5, true, true), 0, 0.24, 0),
    ...bee(0.9, 1.6, 0.3),
    ...bee(-0.7, 1.9, -0.4),
    ...bee(0.2, 2.2, 0.9),
    // Flowers, for the workers.
    ...ring(6, 1.9, (x, z, _a, i) => [cyl(0.015, 0.015, 0.26, x, 0, z, 0x3f7a34, 4), ball(0.07, x, 0.3, z, [0xf0527a, 0xf2c23c, 0x8a5a9a][i % 3])]),
  ]),
  keep: build([
    cyl(1.9, 2.2, 0.5, 0, 0, 0, 0x5d7038, 12),
    box(2.6, 0.3, 2.6, 0, 0.5, 0, WOODL),
    ...at(skep(1.25, 3.2, true, true), 0, 0.8, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => at(skep(0.42, 0.9, false, true), sx * 1.25, 0.8, sz * 1.25))),
    ...ring(5, 1.0, (x, z, a) => box(0.26, 0.3, 0.06, x * 0.95, 2.2, z * 0.95, 0xf2c23c, false, a)),
    ...bee(1.5, 3.0, 0.5, 1.6),
    ...bee(-1.2, 3.8, -0.8, 1.6),
    ...bee(0.3, 4.4, 1.2, 1.6),
    ...flag(0, 4.05, 0),
  ]),
  harbour: build([
    ...jetties(WOODL, WOOD),
    ...at(skep(0.85, 1.2, true, true), -0.6, 0.1, -0.7),
    // Honey, by the barrel.
    ...[[0.4, 0.5], [0.9, 0.7], [0.65, 0.2]].map(([x, z]) => cyl(0.2, 0.2, 0.4, x, 0.32, z, 0x8a6a45, 8)),
    cyl(0.16, 0.2, 0.3, 1.3, 0.1, -0.8, 0xe6a820, 8),
    ...at(skep(0.3, 0.5, false), 1.3, 0.4, -0.8),
    ...bee(1.5, 1.2, -0.4),
  ]),
  market: build([
    // Hives on a long bench, and a stall selling what comes out of them.
    box(2.8, 0.1, 0.7, 0, 0.5, -1.1, WOODL),
    ...[-1.2, 0, 1.2].map((x) => box(0.1, 0.5, 0.6, x, 0, -1.1, WOOD)),
    ...[-0.95, -0.3, 0.35, 1.0].flatMap((x, i) => at(skep(0.28, 0.48, true, i % 2 === 0), x, 0.6, -1.1)),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.03, 0.03, 0.95, sx * 0.7, 0, 1.0 + sz * 0.4, WOOD, 4))),
    gable(1.6, 0.4, 0.95, 0, 0.95, 1.0, 0, true),
    box(1.3, 0.32, 0.5, 0, 0, 1.0, WOODL),
    ...[-0.4, 0, 0.4].map((x) => cyl(0.1, 0.1, 0.18, x, 0.32, 1.0, 0xe6a820, 6)),
    ...bee(1.3, 1.0, 0.2),
    ...bee(-1.4, 1.3, -0.3),
  ]),
  mageTower: build([
    cyl(1.0, 1.2, 0.5, 0, 0, 0, 0x77736b, 10),
    // Skep on skep on skep, and the queen's chamber at the top.
    ...at(skep(0.95, 2.6, true), 0, 0.5, 0),
    ...at(skep(0.78, 2.2, false, true), 0, 2.5, 0),
    ...at(skep(0.6, 1.9, false), 0, 4.2, 0),
    ...at(skep(0.42, 1.4, false, true), 0, 5.7, 0),
    ...ring(4, 0.86, (x, z, a) => box(0.2, 0.26, 0.05, x * 0.8, 3.2, z * 0.8, 0xf2c23c, false, a)),
    ...bee(1.2, 4.0, 0.4, 1.5),
    ...bee(-1.0, 5.4, -0.6, 1.5),
    crystal(7.9),
  ]),
  ballistaTower: build([
    ...skep(1.35, 1.9, true).slice(0, 4),
    cyl(1.05, 1.05, 0.14, 0, 1.52, 0, WOODL, 10),
    ...ring(10, 1.0, (x, z) => cyl(0.04, 0.04, 0.4, x, 1.66, z, WOOD, 4)),
    box(0.4, 0.6, 0.06, 0, 0, 1.31, DARK),
    ...ballista(1.66),
    ...bee(1.3, 2.6, 0.2, 1.4),
    ...flag(-0.7, 1.66, -0.6),
  ]),
});

register("toadstool", toadstool());
register("necropolis", necropolis());
register("tourney", tourney());
register("apiary", apiary());
