// Every player-facing name. The engine keeps its own identifiers for unit
// types; this is where they turn into the medieval world the player sees.

import { MessageType, UnitType } from "@vassal/engine-api/game/GameTypes";

export interface UnitLore {
  name: string;
  glyph: string;
  blurb: string;
}

export const UNIT_LORE: Record<UnitType, UnitLore> = {
  [UnitType.City]: {
    name: "Town",
    glyph: "🏘",
    blurb: "Raises the number of levies your realm can muster.",
  },
  [UnitType.DefensePost]: {
    name: "Keep",
    glyph: "🏰",
    blurb: "Stone walls. Nearby land is far harder to take.",
  },
  [UnitType.Port]: {
    name: "Harbour",
    glyph: "⚓",
    blurb: "Sends merchant cogs for gold and lets you build war galleys.",
  },
  [UnitType.Factory]: {
    name: "Market",
    glyph: "⚖",
    blurb: "Lays roads between your holdings; caravans bring gold.",
  },
  [UnitType.SAMLauncher]: {
    name: "Ballista Tower",
    glyph: "🏹",
    blurb: "Shoots dragons, fireballs and falling stars out of the sky.",
  },
  [UnitType.MissileSilo]: {
    name: "Mage Tower",
    glyph: "🔮",
    blurb: "Lets you hurl fireballs, loose a dragon or call a starfall.",
  },
  [UnitType.Warship]: {
    name: "War Galley",
    glyph: "⛵",
    blurb: "Patrols the sea, sinks longships and seizes merchant cogs.",
  },
  [UnitType.AtomBomb]: {
    name: "Fireball",
    glyph: "☄",
    blurb: "A mage's fireball. Burns a town-sized hole in a realm.",
  },
  [UnitType.HydrogenBomb]: {
    name: "Dragon",
    glyph: "🐉",
    blurb: "A wyrm bound to your will. Lays a whole province to waste.",
  },
  [UnitType.MIRV]: {
    name: "Starfall",
    glyph: "🌠",
    blurb: "Pulls down the sky on one enemy, everywhere at once.",
  },
  [UnitType.MIRVWarhead]: { name: "Falling Star", glyph: "🌠", blurb: "" },
  [UnitType.TransportShip]: {
    name: "Longship",
    glyph: "🛶",
    blurb: "Carries levies across the water.",
  },
  [UnitType.TradeShip]: { name: "Merchant Cog", glyph: "⛵", blurb: "" },
  [UnitType.Train]: { name: "Caravan", glyph: "🐂", blurb: "" },
  [UnitType.Shell]: { name: "Bolt", glyph: "➶", blurb: "" },
  [UnitType.SAMMissile]: { name: "Ballista Bolt", glyph: "➶", blurb: "" },
};

/** Build bar order. */
export const BUILD_ORDER: UnitType[] = [
  UnitType.City,
  UnitType.DefensePost,
  UnitType.Port,
  UnitType.Factory,
  UnitType.Warship,
  UnitType.SAMLauncher,
  UnitType.MissileSilo,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
];

const EVENT_TEXT: Record<string, string> = {
  "events_display.alliance_nukes_destroyed_incoming":
    "{name} broke faith; the sorceries they sent against you fizzled.",
  "events_display.alliance_nukes_destroyed_outgoing":
    "Your pact with {name} dispelled the sorceries you had sent.",
  "events_display.alliance_renewed": "Your pact with {name} is renewed.",
  "events_display.attack_cancelled_retreat":
    "Attack called off; {troops} levies lost on the march home.",
  "events_display.conquered_no_gold": "You have conquered {name}.",
  "events_display.received_gold_from_conquest":
    "You conquered {name} and seized {gold} gold.",
  "events_display.missile_intercepted": "Your ballista brought down a {unit}.",
  "events_display.no_boats_available": "No longships left to launch.",
  "events_display.received_gold_from_captured_ship":
    "Seized {gold} gold from a cog of {name}.",
  "events_display.trade_ship_captured":
    "Your merchant cog was seized by {name}.",
  "events_display.unit_destroyed": "Your {unit} was destroyed.",
  "events_display.wants_to_renew_alliance": "{name} wishes to renew your pact.",
  "events_display.unit_voluntarily_deleted": "Your {unit} was torn down.",
};

function loreName(raw: string): string {
  const hit = (Object.keys(UNIT_LORE) as UnitType[]).find(
    (k) => k.toLowerCase() === raw.toLowerCase(),
  );
  return hit ? UNIT_LORE[hit].name : raw;
}

export function eventText(
  message: string,
  params?: Record<string, string | number>,
): string {
  let text = EVENT_TEXT[message] ?? message;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const s = k === "unit" ? loreName(String(v)) : String(v);
      text = text.replaceAll(`{${k}}`, s);
    }
  }
  return text.replace(/\{[a-z_]+\}/g, "");
}

export function eventTone(t: MessageType): "bad" | "good" | "warn" | "info" {
  switch (t) {
    case MessageType.ATTACK_FAILED:
    case MessageType.UNIT_DESTROYED:
    case MessageType.ALLIANCE_BROKEN:
    case MessageType.SAM_MISS:
      return "bad";
    case MessageType.MIRV_INBOUND:
    case MessageType.NUKE_INBOUND:
    case MessageType.HYDROGEN_BOMB_INBOUND:
    case MessageType.NAVAL_INVASION_INBOUND:
    case MessageType.ATTACK_REQUEST:
      return "warn";
    case MessageType.CONQUERED_PLAYER:
    case MessageType.CAPTURED_ENEMY_UNIT:
    case MessageType.ALLIANCE_ACCEPTED:
    case MessageType.SAM_HIT:
    case MessageType.DONATION_RECEIVED:
      return "good";
    default:
      return "info";
  }
}

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "K";
  return Math.round(n).toLocaleString("en-US");
}

/** Troop counts are stored tenfold in the engine. */
export const fmtTroops = (n: number) => fmt(n / 10);
