import { TileRef } from "@crusades/engine-api/game/GameMap";
import {
  Difficulty,
  Structures,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import {
  SCOUT_MAX_RADIUS,
  WARD_RANGE,
} from "@crusades/engine-api/game/Scouting";
import { PseudoRandom } from "@crusades/engine-lib/PseudoRandom";
import { Game, Player, Unit } from "../../game/Game";
import { realmsLinkedByRoad } from "../../game/RoadLinks";
import { ConstructionExecution } from "../ConstructionExecution";
import { RoutScoutsExecution } from "../ScoutingPartyExecution";

/** How a nation of each difficulty goes about scouting and warding. */
interface Manner {
  /** One chance in this many, each time it thinks, to send a party when it could. */
  scoutOdds: number;
  /** It keeps this many times the price in its treasury before sending one. */
  purse: number;
  /** Whether it looks where the ward towers are and sends its party clear of them. */
  avoidsWards: boolean;
  /** Ward towers it wants for each town it holds. */
  wardsPerCity: number;
  /** One chance in this many, each time it thinks, to rout a party it can see. */
  routOdds: number;
}

const MANNER: Record<Difficulty, Manner> = {
  [Difficulty.Easy]: { scoutOdds: 14, purse: 3, avoidsWards: false, wardsPerCity: 0.1, routOdds: 4 },
  [Difficulty.Medium]: { scoutOdds: 8, purse: 2, avoidsWards: false, wardsPerCity: 0.15, routOdds: 2 },
  [Difficulty.Hard]: { scoutOdds: 5, purse: 1.5, avoidsWards: true, wardsPerCity: 0.2, routOdds: 1 },
  [Difficulty.Impossible]: { scoutOdds: 3, purse: 1.2, avoidsWards: true, wardsPerCity: 0.25, routOdds: 1 },
};

/** Most ward towers a nation raises, however many towns it holds. */
const MAX_WARDS = 6;
/** How many spots it tries before giving up on sending a party this time. */
const SPOT_TRIES = 24;

/**
 * A nation's use of scouting parties and ward towers. Each time the nation
 * thinks, it does at most one of three things: sets upon a scouting party a
 * ward tower has uncovered on its own or a friend's land; raises a ward
 * tower by a holding that has none in sight, once some realm that is no
 * friend has a road into its own; or sends a scouting party down one of its
 * roads into such a realm.
 *
 * It keeps nothing between one thought and the next, so it has nothing to
 * put in a snapshot.
 */
export class NationScoutBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  act(): void {
    if (!this.player.isAlive() || this.game.inSpawnPhase()) return;
    const manner = MANNER[this.game.config().gameConfig().difficulty];
    if (this.rout(manner)) return;
    const config = this.game.config();
    const wards = !config.isUnitDisabled(UnitType.WardTower);
    const scouts = !config.isUnitDisabled(UnitType.ScoutingParty);
    if (!wards && !scouts) return;
    // Both turn on the roads: a party goes in by one, and comes in by one.
    const reach = [...realmsLinkedByRoad(this.game, this.player)]
      .filter(
        (p) =>
          p.isAlive() &&
          !this.player.isFriendly(p) &&
          !this.player.isAlliedWith(p) &&
          !this.player.isOnSameTeam(p),
      )
      .sort((a, b) => a.smallID() - b.smallID());
    if (reach.length === 0) return;
    if (wards && this.ward(manner)) return;
    if (scouts) this.scout(manner, reach);
  }

  /** Sets upon an uncovered party on this nation's land, or a friend's. */
  private rout(manner: Manner): boolean {
    for (const party of this.game.units(UnitType.ScoutingParty)) {
      if (!party.isActive() || party.reachedTarget() || !party.isTargetable()) {
        continue;
      }
      const owner = party.owner();
      if (owner === this.player || owner.isFriendly(this.player)) continue;
      const holder = this.game.owner(party.tile());
      if (!holder.isPlayer()) continue;
      if (holder !== this.player && !holder.isFriendly(this.player)) continue;
      if (manner.routOdds > 1 && !this.random.chance(manner.routOdds)) continue;
      this.game.addExecution(new RoutScoutsExecution(this.player, party.id()));
      return true;
    }
    return false;
  }

  /** Raises a ward tower by the holding furthest from any it has. */
  private ward(manner: Manner): boolean {
    const have = this.player.units(UnitType.WardTower);
    const cities = this.player.unitsOwned(UnitType.City);
    const want = Math.min(MAX_WARDS, Math.ceil(cities * manner.wardsPerCity));
    if (have.length >= want) return false;
    const cost = this.game.unitInfo(UnitType.WardTower).cost(this.game, this.player);
    if (this.player.gold() < cost * 2n) return false;

    let spot: Unit | null = null;
    let furthest = -1;
    for (const holding of this.player.units(Structures.types)) {
      if (!holding.isActive() || holding.type() === UnitType.WardTower) continue;
      let nearest = Infinity;
      for (const w of have) {
        const d = this.game.euclideanDistSquared(holding.tile(), w.tile());
        if (d < nearest) nearest = d;
      }
      // Between equals, the older holding: the same choice on every machine.
      if (nearest > furthest || (nearest === furthest && spot !== null && holding.id() < spot.id())) {
        furthest = nearest;
        spot = holding;
      }
    }
    // Nothing to guard, or everything already under a tower's eye.
    if (spot === null || furthest <= (WARD_RANGE * WARD_RANGE) / 4) return false;
    // Buildings keep their distance from one another, so the tower goes a
    // little way off the holding: whichever side has room, tried in turn
    // from a side picked at random.
    const mg = this.game;
    const off = mg.config().structureMinDist() + 6;
    const diag = Math.round(off * 0.7);
    const sides = [
      [off, 0], [diag, diag], [0, off], [-diag, diag],
      [-off, 0], [-diag, -diag], [0, -off], [diag, -diag],
    ];
    const from = this.random.nextInt(0, sides.length);
    for (let i = 0; i < sides.length; i++) {
      const [dx, dy] = sides[(from + i) % sides.length];
      const x = mg.x(spot.tile()) + dx;
      const y = mg.y(spot.tile()) + dy;
      if (x < 0 || y < 0 || x >= mg.width() || y >= mg.height()) continue;
      const tile = this.player.canBuild(UnitType.WardTower, mg.ref(x, y));
      if (tile === false) continue;
      mg.addExecution(
        new ConstructionExecution(this.player, UnitType.WardTower, tile),
      );
      return true;
    }
    return false;
  }

  /** Sends a party into one of the realms its roads reach. */
  private scout(manner: Manner, reach: Player[]): boolean {
    if (this.game.isSpawnImmunityActive()) return false;
    if (
      this.player
        .units(UnitType.ScoutingParty)
        .some((u) => u.isActive() && !u.reachedTarget())
    ) {
      return false;
    }
    const cost = this.game.unitInfo(UnitType.ScoutingParty).cost(this.game, this.player);
    // The purse is counted in hundredths, to stay in whole gold.
    const purse = (cost * BigInt(Math.round(manner.purse * 100))) / 100n;
    if (this.player.gold() < purse) return false;
    if (!this.random.chance(manner.scoutOdds)) return false;

    const target = this.random.randElement(reach);
    const spot = this.spotIn(target, manner);
    if (spot === null) return false;
    this.game.addExecution(
      new ConstructionExecution(this.player, UnitType.ScoutingParty, spot),
    );
    return true;
  }

  /**
   * Open ground in a realm to send a party to: a little way off one of its
   * buildings, which is where its land is worth having. The cleverer nations
   * pass over ground a ward tower would see.
   */
  private spotIn(target: Player, manner: Manner): TileRef | null {
    const holdings = target
      .units(Structures.types)
      .filter((u) => u.isActive());
    if (holdings.length === 0) return null;
    const mg = this.game;
    const w = mg.width();
    const h = mg.height();
    for (let i = 0; i < SPOT_TRIES; i++) {
      const by = this.random.randElement(holdings).tile();
      const dx = this.random.nextInt(-40, 41);
      const dy = this.random.nextInt(-40, 41);
      if (dx * dx + dy * dy < 12 * 12) continue;
      const x = mg.x(by) + dx;
      const y = mg.y(by) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const tile = mg.ref(x, y);
      if (mg.owner(tile) !== target) continue;
      if (this.player.canBuild(UnitType.ScoutingParty, tile) === false) continue;
      if (manner.avoidsWards && this.watched(tile)) continue;
      return tile;
    }
    return null;
  }

  /** Whether a party sent here would grow into the sight of a ward tower that is no friend's. */
  private watched(tile: TileRef): boolean {
    return this.game
      .nearbyUnits(tile, WARD_RANGE + SCOUT_MAX_RADIUS, UnitType.WardTower)
      .some(
        ({ unit }) =>
          unit.owner() !== this.player &&
          !unit.owner().isFriendly(this.player),
      );
  }
}
