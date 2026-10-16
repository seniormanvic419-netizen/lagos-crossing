import * as THREE from 'three';

// The start.ng character, built the way start.ng itself does (body, colours,
// hair, hat and accessory), so the player looks the same here as on start.ng.

export const DEFAULT_STYLE = {
  body: 'male',
  primaryColor: '#9aa3b5',
  secondaryColor: '#4a4f60',
  skinColor: '#d9a066',
  hairColor: '#2b1d14',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
};

// How far a hat sits above the head so it rests on the hair.
const HAT_LIFT = { short: 0.08, afro: 0.3, braids: 0.08, bun: 0.08, ponytail: 0.08, dreads: 0.08, bald: 0 };

const BLACK = new THREE.MeshStandardMaterial({ color: '#1b1b22', roughness: 0.5 });
const GOLD = new THREE.MeshStandardMaterial({ color: '#ffcf4d', metalness: 0.6, roughness: 0.3 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function shape(geometry, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function clear(slot) {
  for (const child of [...slot.children]) {
    slot.remove(child);
    child.traverse((o) => o.geometry?.dispose());
  }
}

/**
 * A blocky character facing -z, feet at y = 0, about 2.6 units tall.
 * Returns { root, applyStyle(style), animate(time, state) }.
 */
export function createCharacter(style) {
  const mats = {
    primary: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    secondary: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    hair: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Limbs pivot at the hip or shoulder so rotation.x swings them.
  const limb = (x, y, mat, length, width) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(box(width, length, width, mat, 0, -length / 2, 0));
    body.add(pivot);
    return pivot;
  };
  const legL = limb(-0.18, 0.8, mats.secondary, 0.8, 0.28);
  const legR = limb(0.18, 0.8, mats.secondary, 0.8, 0.28);
  const torso = box(0.75, 0.85, 0.45, mats.primary, 0, 1.225, 0);
  const skirt = box(0.82, 0.32, 0.52, mats.secondary, 0, 0.74, 0);
  body.add(torso, skirt);
  const armL = limb(-0.5, 1.6, mats.primary, 0.7, 0.22);
  const armR = limb(0.5, 1.6, mats.primary, 0.7, 0.22);
  armL.add(box(0.2, 0.18, 0.2, mats.skin, 0, -0.78, 0));
  armR.add(box(0.2, 0.18, 0.2, mats.skin, 0, -0.78, 0));

  const head = new THREE.Group();
  head.position.y = 1.95;
  body.add(head);
  head.add(box(0.6, 0.6, 0.6, mats.skin));
  head.add(box(0.1, 0.12, 0.02, BLACK, -0.13, 0.05, -0.31));
  head.add(box(0.1, 0.12, 0.02, BLACK, 0.13, 0.05, -0.31));

  const hairSlot = new THREE.Group();
  const hatSlot = new THREE.Group();
  hatSlot.position.y = 0.3;
  head.add(hairSlot, hatSlot);
  const accessorySlot = new THREE.Group();
  body.add(accessorySlot);

  const hats = {
    none: () => [],
    cap: () => [
      box(0.64, 0.2, 0.64, mats.secondary, 0, 0.08, 0),
      box(0.56, 0.05, 0.32, mats.secondary, 0, 0, -0.44),
    ],
    beanie: () => [
      box(0.66, 0.32, 0.66, mats.secondary, 0, 0.1, 0),
      shape(new THREE.SphereGeometry(0.12, 12, 8), mats.primary, 0, 0.34, 0),
    ],
    tophat: () => [
      shape(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), BLACK, 0, 0.03, 0),
      shape(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 20), BLACK, 0, 0.3, 0),
      shape(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 20), mats.secondary, 0, 0.11, 0),
    ],
    crown: () => [
      shape(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 8, 1, true), GOLD, 0, 0.11, 0),
      ...Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return shape(new THREE.ConeGeometry(0.07, 0.18, 4), GOLD, Math.sin(a) * 0.3, 0.3, Math.cos(a) * 0.3);
      }),
    ],
  };

  // The head is a 0.6 cube at the origin; the face is at -z, the back at +z.
  const hairTop = () => [
    box(0.64, 0.12, 0.64, mats.hair, 0, 0.34, 0),
    box(0.64, 0.42, 0.08, mats.hair, 0, 0.1, 0.31),
  ];
  const hairs = {
    bald: () => [],
    short: () => [box(0.64, 0.12, 0.64, mats.hair, 0, 0.34, 0), box(0.64, 0.3, 0.08, mats.hair, 0, 0.17, 0.31)],
    afro: () => {
      const afro = shape(new THREE.SphereGeometry(0.42, 14, 10), mats.hair, 0, 0.24, 0.06);
      afro.scale.y = 0.9;
      return [afro];
    },
    braids: () => [
      ...hairTop(),
      ...[-0.24, -0.12, 0, 0.12, 0.24].map((x) => box(0.08, 0.75, 0.08, mats.hair, x, -0.2, 0.35)),
    ],
    bun: () => [...hairTop(), shape(new THREE.SphereGeometry(0.17, 12, 8), mats.hair, 0, 0.45, 0.16)],
    ponytail: () => {
      const tail = box(0.14, 0.55, 0.14, mats.hair, 0, -0.05, 0.42);
      tail.rotation.x = -0.35;
      return [...hairTop(), tail, box(0.17, 0.08, 0.17, mats.primary, 0, 0.2, 0.36)];
    },
    dreads: () => [
      ...hairTop(),
      ...Array.from({ length: 9 }, (_, i) => {
        const a = -2 + i * 0.5;
        return shape(new THREE.CylinderGeometry(0.045, 0.045, 0.65, 6), mats.hair, Math.sin(a) * 0.33, -0.1, Math.cos(a) * 0.33);
      }),
    ],
  };

  const accessories = {
    none: () => [],
    earrings: () => [
      shape(new THREE.SphereGeometry(0.05, 8, 6), GOLD, -0.32, 1.84, 0),
      shape(new THREE.SphereGeometry(0.05, 8, 6), GOLD, 0.32, 1.84, 0),
    ],
    beard: () => [box(0.52, 0.22, 0.08, mats.hair, 0, 1.76, -0.31)],
    glasses: () => [
      box(0.2, 0.14, 0.04, BLACK, -0.14, 2.0, -0.32),
      box(0.2, 0.14, 0.04, BLACK, 0.14, 2.0, -0.32),
      box(0.1, 0.03, 0.03, BLACK, 0, 2.02, -0.32),
    ],
    scarf: () => [
      box(0.7, 0.16, 0.5, mats.secondary, 0, 1.66, 0),
      box(0.16, 0.45, 0.06, mats.secondary, 0.18, 1.45, 0.26),
    ],
    backpack: () => [
      box(0.56, 0.62, 0.26, mats.secondary, 0, 1.25, 0.34),
      box(0.58, 0.14, 0.28, mats.primary, 0, 1.5, 0.34),
    ],
  };

  let hair = null;
  let hat = null;
  let accessory = null;

  function applyStyle(next) {
    const s = { ...DEFAULT_STYLE, ...(next ?? {}) };
    mats.primary.color.set(s.primaryColor);
    mats.secondary.color.set(s.secondaryColor);
    mats.skin.color.set(s.skinColor);
    mats.hair.color.set(s.hairColor);

    const female = s.body === 'female';
    torso.scale.x = female ? 0.88 : 1;
    skirt.visible = female;

    if (s.hair !== hair) {
      clear(hairSlot);
      hairSlot.add(...((hairs[s.hair] ?? hairs.short)()));
      hatSlot.position.y = 0.3 + (HAT_LIFT[s.hair] ?? HAT_LIFT.short);
      hair = s.hair;
    }
    if (s.hat !== hat) {
      clear(hatSlot);
      const parts = (hats[s.hat] ?? hats.none)();
      if (parts.length) hatSlot.add(...parts);
      hat = s.hat;
    }
    if (s.accessory !== accessory) {
      clear(accessorySlot);
      const parts = (accessories[s.accessory] ?? accessories.none)();
      if (parts.length) accessorySlot.add(...parts);
      accessory = s.accessory;
    }
  }

  /**
   * t is the clock in seconds. hop is 0..1 through the current hop, or null
   * when standing. squashed flattens the character after a hit.
   */
  function animate(t, { hop = null, squashed = false } = {}) {
    if (squashed) {
      body.scale.set(1.3, 0.25, 1.3);
      body.position.y = 0;
      return;
    }
    body.scale.set(1, 1, 1);
    if (hop !== null) {
      // Legs tuck and arms lift in the middle of the hop.
      const k = Math.sin(hop * Math.PI);
      legL.rotation.x = legR.rotation.x = k * 0.9;
      armL.rotation.x = armR.rotation.x = k * 1.6;
      body.position.y = 0;
    } else {
      const breathe = Math.sin(t * 2);
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = armR.rotation.x = breathe * 0.05;
      body.position.y = (breathe + 1) * 0.015;
    }
  }

  applyStyle(style);
  return { root, applyStyle, animate };
}
