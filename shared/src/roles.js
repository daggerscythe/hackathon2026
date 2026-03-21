export const Role = /** @type {const} */ ({
  HERO: 'hero',
  VILLAIN: 'villain',
  SPECTATOR: 'spectator',
});

export function isRole(value) {
  return value === Role.HERO || value === Role.VILLAIN || value === Role.SPECTATOR;
}
