// Scouting parties and the ward towers that uncover them. Kept here, beside
// the unit types, because the engine decides by these numbers and the client
// draws by them.

/** How many tiles a party covers before it is done. */
export const SCOUT_MAX_TILES = 1200;
/** How many tiles it spreads over each tick. */
export const SCOUT_TILES_PER_TICK = 2;
/** So: how long a party with room to spread takes, in ticks. */
export const SCOUT_GROW_TICKS = SCOUT_MAX_TILES / SCOUT_TILES_PER_TICK;
/** However it winds round what is in its way, a party goes no further than this from where it was sent, in tiles. */
export const SCOUT_MAX_RADIUS = 24;
/** A party keeps this far from any building: it takes the land around them, not under them. */
export const SCOUT_CLEARANCE = 3;
/** What a party costs, in gold: more than a fireball, less than a dragon. */
export const SCOUT_COST = 2_500_000;
/** How far a ward tower sees. A party is uncovered when this circle meets the ground it has covered. */
export const WARD_RANGE = 50;
