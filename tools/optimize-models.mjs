// Optimize the game's GLB models in place.
//   cd tools && npm install && node optimize-models.mjs ../assets/models
//
// arena.glb : replace the solid "stand" discs (a generator bug that buried the
//             arena floor) with proper stepped seating rings, restore the lava /
//             flame glow the exporter dropped, then merge everything by material.
// characters: merge meshes by material.
// all       : weld (index) vertices, dedupe, prune, quantize.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, prune, quantize } from '@gltf-transform/functions';
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
const io  = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

const CHARACTERS = ['agile', 'brute', 'dps', 'hero_mage', 'support', 'tank', 'villain_mage'];

// ── seating ring geometry: top annulus + outer wall + inner wall ─────────────
function ringGeometry(inner, outer, bottom, top, segments) {
  const pos = [], nor = [], idx = [];
  const quad = (a, b, c, d, n) => {
    const base = pos.length / 3;
    for (const v of [a, b, c, d]) { pos.push(...v); nor.push(...n(v)); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (r, a, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
    const radial = (v) => { const l = Math.hypot(v[0], v[2]); return [v[0] / l, 0, v[2] / l]; };
    quad(p(inner, a0, top), p(outer, a0, top), p(outer, a1, top), p(inner, a1, top), () => [0, 1, 0]);
    quad(p(outer, a0, top), p(outer, a0, bottom), p(outer, a1, bottom), p(outer, a1, top), radial);
    quad(p(inner, a1, top), p(inner, a1, bottom), p(inner, a0, bottom), p(inner, a0, top),
      (v) => radial(v).map(c => -c));
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}

async function optimize(file, { arena = false } = {}) {
  const doc  = await io.read(file);
  const root = doc.getRoot();

  if (arena) {
    const buffer = root.listBuffers()[0];
    for (const node of root.listNodes()) {
      const m = node.getName().match(/^stand_tier_(\d)$/);
      if (!m) continue;
      const tier  = +m[1];
      const outer = 16.9 + tier * 1.3;
      const g     = ringGeometry(outer - 1.3, outer, -0.26, 0.95 + tier * 0.9, 48);
      const prim  = node.getMesh().listPrimitives()[0];
      prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos).setBuffer(buffer));
      prim.setAttribute('NORMAL',   doc.createAccessor().setType('VEC3').setArray(g.nor).setBuffer(buffer));
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(g.idx).setBuffer(buffer));
      node.setTranslation([0, 0, 0]);
    }
    // the mini exporter dropped emissive: make lava and flames glow again
    for (const mat of root.listMaterials()) {
      const hex = mat.getBaseColorFactor().slice(0, 3).map(v => Math.round(v * 255));
      if (hex.join() === '255,68,0')  mat.setEmissiveFactor([1, 0.13, 0]);    // lava
      if (hex.join() === '255,102,0') mat.setEmissiveFactor([1, 0.25, 0]);    // magma / torch flames
    }
  }

  await doc.transform(
    dedup(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    prune(),
    quantize(),
  );
  await io.write(file, doc);
}

const sizes = {};
const before = (f) => fs.statSync(f).size;

for (const name of [...CHARACTERS, 'arena']) {
  const file = path.join(dir, `${name}.glb`);
  const b = before(file);
  await optimize(file, { arena: name === 'arena' });
  sizes[name] = `${(b / 1024).toFixed(0)} KB -> ${(fs.statSync(file).size / 1024).toFixed(0)} KB`;
}
console.table(sizes);
