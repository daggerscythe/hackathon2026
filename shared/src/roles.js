export const Role = /** @type {const} */ ({
  UNASSIGNED: 'unassigned',
  HERO: 'hero',
  VILLAIN: 'villain',
  SPECTATOR: 'spectator',
});

export function isRole(value) {
  return value === Role.UNASSIGNED || value === Role.HERO || value === Role.VILLAIN || value === Role.SPECTATOR;
}
