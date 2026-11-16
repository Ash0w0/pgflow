/**
 * The floors every PG is offered when adding a room. A preset floor that does
 * not exist yet is created automatically when its first room is saved, so an
 * owner never has to set up floors as a separate step.
 */
export type FloorChoice = {
  /** Stable key for the picker. */
  key: string;
  name: string;
  sortOrder: number;
  /** Set when the floor already exists in this PG. */
  floorId: string | null;
  roomCount: number;
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

export const PRESET_FLOORS: ReadonlyArray<{ name: string; sortOrder: number }> = [
  { name: "Basement", sortOrder: 0 },
  { name: "Ground Floor", sortOrder: 1 },
  ...ORDINALS.map((ordinal, index) => ({ name: `${ordinal} Floor`, sortOrder: index + 2 })),
  { name: "Terrace", sortOrder: 12 },
];

/** "First", "first floor", "1st Floor" and "Floor 1" all mean the same level. */
export function floorNameKey(name: string) {
  let key = name.trim().toLowerCase().replace(/\bfloor\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const word = WORDS.indexOf(key);
  if (word >= 0) return String(word + 1);
  const ordinal = /^(\d{1,2})(st|nd|rd|th)?$/.exec(key);
  if (ordinal) return String(Number(ordinal[1]));
  if (key === "g" || key === "gf") key = "ground";
  return key;
}

export function isPresetFloor(name: string, sortOrder: number) {
  return PRESET_FLOORS.some((preset) => preset.name === name && preset.sortOrder === sortOrder);
}

/**
 * Existing floors first-class, then every preset level the PG does not have
 * yet, in building order from the basement up.
 */
export function floorChoices(existing: ReadonlyArray<{ id: string; name: string; sortOrder: number; roomCount: number }>): FloorChoice[] {
  const taken = new Map<string, (typeof existing)[number]>();
  for (const floor of existing) if (!taken.has(floorNameKey(floor.name))) taken.set(floorNameKey(floor.name), floor);

  const choices: FloorChoice[] = [];
  const placed = new Set<string>();
  for (const preset of PRESET_FLOORS) {
    const match = taken.get(floorNameKey(preset.name));
    if (match) {
      placed.add(match.id);
      choices.push({ key: match.id, name: match.name, sortOrder: preset.sortOrder, floorId: match.id, roomCount: match.roomCount });
    } else {
      choices.push({ key: `new:${preset.name}`, name: preset.name, sortOrder: preset.sortOrder, floorId: null, roomCount: 0 });
    }
  }
  // Floors with their own names (an annex, a block) keep a place at the end, in their saved order.
  const custom = existing.filter((floor) => !placed.has(floor.id)).sort((left, right) => left.sortOrder - right.sortOrder);
  for (const floor of custom) {
    choices.push({ key: floor.id, name: floor.name, sortOrder: floor.sortOrder, floorId: floor.id, roomCount: floor.roomCount });
  }
  return choices;
}
