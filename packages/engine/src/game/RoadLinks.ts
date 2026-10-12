import { Game, Player } from "./Game";
import { Cluster } from "./TrainStation";

/**
 * The realms a player's roads reach: every other player with a building on
 * the same run of road as one of the player's own. Roads join whatever
 * stands near enough, whoever holds it, so a run of road often crosses a
 * border; that is the way a scouting party goes in.
 */
export function realmsLinkedByRoad(mg: Game, player: Player): Set<Player> {
  const stations = mg.railNetwork().stationManager().getAll();
  const mine = new Set<Cluster>();
  for (const s of stations) {
    if (!s.isActive() || s.unit.owner() !== player) continue;
    const c = s.getCluster();
    if (c !== null) mine.add(c);
  }
  const linked = new Set<Player>();
  if (mine.size === 0) return linked;
  for (const s of stations) {
    if (!s.isActive()) continue;
    const owner = s.unit.owner();
    if (owner === player) continue;
    const c = s.getCluster();
    if (c !== null && mine.has(c)) linked.add(owner);
  }
  return linked;
}

/** Whether a road runs between a building of one player and a building of the other. */
export function linkedByRoad(mg: Game, a: Player, b: Player): boolean {
  return realmsLinkedByRoad(mg, a).has(b);
}
