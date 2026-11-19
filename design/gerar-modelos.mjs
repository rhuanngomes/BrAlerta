// Gera os modelos 3D do BR ALERTA em .glb
// Unidade: metros | Eixo Y para cima | Origem (0,0,0) no centro da base, no chão.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'node:fs';

// O exportador usa FileReader (existe no navegador, não no Node)
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type};base64,` + Buffer.from(r).toString('base64');
      this.onloadend?.(); this.onload?.({ target: this });
    });
  }
};

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// Aleatório com semente, para o modelo sair sempre igual
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const mat = (name, color, o = {}) =>
  new THREE.MeshStandardMaterial({ name, color, roughness: 0.8, metalness: 0, ...o });

const mesh = (name, geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
};

/* ---------------- POSTE ---------------- */
function poste(aceso) {
  const g = new THREE.Group();
  g.name = aceso ? 'Poste_Aceso' : 'Poste_Apagado';

  const concreto = mat('Concreto', 0x8a8f98, { roughness: 0.95 });
  const metal = mat('Metal_Poste', 0x4a5262, { roughness: 0.45, metalness: 0.6 });
  const carcaca = mat('Carcaca_Luminaria', 0x2f3542, { roughness: 0.4, metalness: 0.5 });
  const lente = aceso
    ? mat('Lente_Acesa', 0xfff1c9, { emissive: 0xffc861, emissiveIntensity: 2.2, roughness: 0.2 })
    : mat('Lente_Apagada', 0x1b1f27, { roughness: 0.15, metalness: 0.2 });

  g.add(mesh('Poste_Base', new THREE.CylinderGeometry(0.2, 0.26, 0.5, 16), concreto, [0, 0.25, 0]));
  g.add(mesh('Poste_Haste', new THREE.CylinderGeometry(0.065, 0.1, 6.2, 16), metal, [0, 3.6, 0]));

  // Braço curvo
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 6.5, 0),
    new THREE.Vector3(0.1, 7.1, 0),
    new THREE.Vector3(1.5, 7.05, 0),
  );
  g.add(mesh('Poste_Braco', new THREE.TubeGeometry(curva, 24, 0.045, 10, false), metal));

  // Luminária
  const lum = new THREE.Group();
  lum.name = 'Poste_Luminaria';
  lum.position.set(1.75, 6.98, 0);
  lum.rotation.z = -0.08;
  lum.add(mesh('Luminaria_Carcaca', new THREE.BoxGeometry(0.8, 0.14, 0.34), carcaca));
  lum.add(mesh('Luminaria_Topo', new THREE.BoxGeometry(0.66, 0.06, 0.26), carcaca, [-0.02, 0.09, 0]));
  lum.add(mesh('Luminaria_Lente', new THREE.BoxGeometry(0.66, 0.03, 0.26), lente, [0.02, -0.08, 0]));
  g.add(lum);

  if (aceso) {
    // Cone de luz suave (só no poste consertado)
    const cone = new THREE.ConeGeometry(2.2, 6.6, 32, 1, true);
    cone.translate(0, -3.3, 0);
    const luz = mat('Cone_Luz', 0xffd98a, {
      emissive: 0xffc861, emissiveIntensity: 0.6, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    g.add(mesh('Poste_ConeLuz', cone, luz, [1.77, 6.9, 0]));
  } else {
    // Fio solto pendurado: detalhe que mostra o defeito
    const fio = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.4, 6.95, 0.12),
      new THREE.Vector3(1.38, 6.6, 0.16),
      new THREE.Vector3(1.45, 6.3, 0.1),
    ]);
    g.add(mesh('Poste_FioSolto', new THREE.TubeGeometry(fio, 12, 0.012, 6, false), mat('Fio', 0x111111)));
  }
  return g;
}

/* ---------------- BURACO ---------------- */
function contorno(raio, variacao, pontos) {
  const arr = [];
  for (let i = 0; i < pontos; i++) {
    const a = (i / pontos) * Math.PI * 2;
    const r = raio * (1 - variacao / 2 + rnd() * variacao);
    arr.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return arr;
}

function buraco() {
  seed = 7;
  const g = new THREE.Group();
  g.name = 'Buraco_Rua';

  const asfalto = mat('Asfalto_Quebrado', 0x454a53, { roughness: 1 });
  const fundo = mat('Fundo_Buraco', 0x17191d, { roughness: 1 });
  const rachadura = mat('Rachadura', 0x2a2d33, { roughness: 1 });
  const fundo2 = mat('Fundo_Buraco_Escuro', 0x0b0c0e, { roughness: 1 });
  const agua = mat('Poca_Agua', 0x3c5a75, { roughness: 0.08, metalness: 0.3 });
  const entulho = [mat('Entulho_1', 0x5a5f68, { roughness: 1 }), mat('Entulho_2', 0x3a3e45, { roughness: 1 })];

  const externo = contorno(1.05, 0.25, 22);
  const interno = contorno(0.72, 0.3, 18);

  // Borda de asfalto quebrado (anel elevado)
  const borda = new THREE.Shape(externo);
  borda.holes.push(new THREE.Path([...interno].reverse()));
  const geoBorda = new THREE.ExtrudeGeometry(borda, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.03, bevelSegments: 1,
  });
  g.add(mesh('Buraco_Borda', geoBorda, asfalto, [0, 0, 0], [-Math.PI / 2, 0, 0]));

  // Fundo do buraco (dois tons para dar sensação de profundidade)
  g.add(mesh('Buraco_Fundo', new THREE.ShapeGeometry(new THREE.Shape(interno)), fundo, [0, 0.004, 0], [-Math.PI / 2, 0, 0]));
  const miolo = new THREE.Shape(interno.map((p) => p.clone().multiplyScalar(0.7)));
  g.add(mesh('Buraco_Profundo', new THREE.ShapeGeometry(miolo), fundo2, [0.04, 0.006, -0.03], [-Math.PI / 2, 0, 0]));

  // Poça de água
  const poca = new THREE.Shape(contorno(0.32, 0.35, 14));
  g.add(mesh('Buraco_Poca', new THREE.ShapeGeometry(poca), agua, [0.12, 0.009, 0.1], [-Math.PI / 2, 0, 0]));

  // Rachaduras saindo da borda
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    const len = 0.45 + rnd() * 0.6;
    const r = 0.92 + len / 2;
    const crack = mesh('Rachadura_' + (i + 1), new THREE.BoxGeometry(len, 0.008, 0.014 + rnd() * 0.014), rachadura,
      [Math.cos(a) * r, 0.006, -Math.sin(a) * r], [0, a + (rnd() - 0.5) * 0.3, 0]);
    g.add(crack);
  }

  // Pedaços de asfalto soltos
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.7 + rnd() * 0.7;
    const s = 0.05 + rnd() * 0.08;
    const pedra = mesh('Entulho_' + (i + 1), new THREE.DodecahedronGeometry(s, 0), entulho[i % 2],
      [Math.cos(a) * r, s * 0.5 + 0.02, Math.sin(a) * r], [rnd() * 3, rnd() * 3, rnd() * 3]);
    pedra.scale.y = 0.55;
    g.add(pedra);
  }

  // Cone de sinalização ao lado (ajuda a ver o buraco de longe no mapa)
  const cone = new THREE.Group();
  cone.name = 'Cone_Sinalizacao';
  cone.position.set(1.6, 0, 0.8);
  const laranja = mat('Cone_Laranja', 0xff6a2b, { roughness: 0.55 });
  const branco = mat('Cone_Faixa', 0xf3f4f6, { roughness: 0.4 });
  const preto = mat('Cone_Base', 0x1d1f24, { roughness: 0.9 });
  cone.add(mesh('Cone_Base', new THREE.BoxGeometry(0.42, 0.04, 0.42), preto, [0, 0.02, 0]));
  cone.add(mesh('Cone_Corpo', new THREE.CylinderGeometry(0.025, 0.16, 0.66, 20), laranja, [0, 0.37, 0]));
  cone.add(mesh('Cone_Faixa_1', new THREE.CylinderGeometry(0.083, 0.1, 0.07, 20), branco, [0, 0.48, 0]));
  cone.add(mesh('Cone_Faixa_2', new THREE.CylinderGeometry(0.115, 0.13, 0.07, 20), branco, [0, 0.3, 0]));
  g.add(cone);

  return g;
}

/* ---------------- EXPORTAR ---------------- */
const exporter = new GLTFExporter();
async function salvar(obj, nome) {
  const scene = new THREE.Scene();
  scene.add(obj);
  const glb = await exporter.parseAsync(scene, { binary: true });
  const buf = Buffer.from(glb);
  writeFileSync(`${OUT}/${nome}`, buf);
  console.log(nome, (buf.length / 1024).toFixed(1) + ' KB');
}

await salvar(poste(false), 'poste-apagado.glb');
await salvar(poste(true), 'poste-aceso.glb');
await salvar(buraco(), 'buraco.glb');
