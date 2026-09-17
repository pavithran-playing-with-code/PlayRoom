// src/components/games/jigsawScene.jsx
// The pictures for Missing Piece, drawn in code from a seed: a critter in one
// of four little worlds. Deliberately busy. Every part of the picture needs
// something to look at, or two pieces of plain sky would be impossible to tell apart.
import React from "react";
import { seededRand } from "./seededRand";

const INK = "#2E2140";
const W = 400;
const H = 500;

const CRITTERS = [
  { body: "#5B8DEF", belly: "#C4D8FF", spot: "#8FB4FF" },
  { body: "#FF6B6B", belly: "#FFD3CB", spot: "#FF9C8F" },
  { body: "#3DD6C0", belly: "#CBF6EE", spot: "#8BE9D9" },
  { body: "#9B5DE5", belly: "#E4D0FB", spot: "#C39DF1" },
  { body: "#FFC53D", belly: "#FFEFC2", spot: "#FFDA80" },
  { body: "#FF8FC7", belly: "#FFE2F0", spot: "#FFBADD" },
];

const n1 = (v) => Math.round(v * 10) / 10;

// A soft rolling line across the picture, filled down to the bottom.
function hill(R, y, amp, segments) {
  const pts = Array.from({ length: segments + 1 }, (_, i) => [((W + 40) * i) / segments - 20, y + R(-amp, amp)]);
  let d = `M-20 ${H + 20} L${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y2] = pts[i];
    const mx = n1((px + x) / 2);
    d += ` C${mx} ${n1(py)} ${mx} ${n1(y2)} ${n1(x)} ${n1(y2)}`;
  }
  return `${d} L${W + 20} ${H + 20} Z`;
}

function starPoints(cx, cy, r, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${n1(cx + Math.cos(a) * rr)},${n1(cy + Math.sin(a) * rr)}`);
  }
  return pts.join(" ");
}

function gradient(g, name, top, bottom) {
  g.out.push(
    <defs key={g.key()}>
      <linearGradient id={g.id(name)} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={top} />
        <stop offset="1" stopColor={bottom} />
      </linearGradient>
    </defs>
  );
  g.out.push(<rect key={g.key()} x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${g.id(name)})`} />);
}

// Cartoon cloud: ink circles underneath, fill circles on top, so the outline merges.
function cloud(g, x, y, s, fill = "#FFFFFF") {
  const blobs = [[0, 0, 26], [28, -12, 30], [58, 0, 24], [30, 8, 24]];
  g.out.push(
    <g key={g.key()} transform={`translate(${n1(x)} ${n1(y)}) scale(${n1(s * 10) / 10})`}>
      {blobs.map(([bx, by, r], i) => <circle key={`o${i}`} cx={bx} cy={by} r={r + 4} fill={INK} />)}
      {blobs.map(([bx, by, r], i) => <circle key={`f${i}`} cx={bx} cy={by} r={r} fill={fill} />)}
    </g>
  );
}

function flower(g, x, y, r, color) {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2;
    return <circle key={i} cx={n1(Math.cos(a) * r * 0.62)} cy={n1(Math.sin(a) * r * 0.62)} r={n1(r * 0.52)} fill={color} stroke={INK} strokeWidth={2.5} />;
  });
  g.out.push(
    <g key={g.key()} transform={`translate(${n1(x)} ${n1(y)})`}>
      <line x1={0} y1={0} x2={0} y2={r * 2.2} stroke="#2C7A3A" strokeWidth={4} strokeLinecap="round" />
      {petals}
      <circle r={n1(r * 0.36)} fill="#FFC53D" stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

function leaf(g, x, y, scale, rot) {
  g.out.push(
    <g key={g.key()} transform={`translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)}) scale(${n1(scale * 100) / 100})`}>
      <path d="M0 0 C30 -34 90 -34 124 0 C90 34 30 34 0 0 Z" fill="#3E9E4F" stroke={INK} strokeWidth={4} />
      <path d="M10 0 L112 0 M40 0 L58 -14 M70 0 L88 -13 M40 0 L58 14 M70 0 L88 13" stroke="#2C7A3A" strokeWidth={3} strokeLinecap="round" fill="none" />
    </g>
  );
}

// ── The four worlds. Each draws its background and returns its foreground,
//    which is drawn after the critter. ─────────────────────────────────────────
const WORLDS = {
  meadow(g) {
    const { out, R, pick, key } = g;
    gradient(g, "sky", "#8FD3FF", "#FFF3B0");
    const sx = R(60, 340), sy = R(55, 105);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push(<line key={key()} x1={n1(sx + Math.cos(a) * 54)} y1={n1(sy + Math.sin(a) * 54)}
        x2={n1(sx + Math.cos(a) * 80)} y2={n1(sy + Math.sin(a) * 80)} stroke="#FFB300" strokeWidth={7} strokeLinecap="round" />);
    }
    out.push(<circle key={key()} cx={n1(sx)} cy={n1(sy)} r={42} fill="#FFD54F" stroke={INK} strokeWidth={4} />);
    for (let i = 0; i < 3; i++) cloud(g, R(-20, 330), R(40, 200), R(0.6, 1));
    out.push(<path key={key()} d={hill(R, R(280, 320), 28, 4)} fill="#A6E08A" stroke={INK} strokeWidth={4} />);
    out.push(<path key={key()} d={hill(R, R(360, 395), 24, 3)} fill="#5DBB5A" stroke={INK} strokeWidth={4} />);
    for (let i = 0; i < 11; i++) flower(g, R(12, 388), R(320, 470), R(9, 15), pick(["#FF8FC7", "#FFFFFF", "#FFC53D", "#FF6B6B", "#B69CFF"]));
    leaf(g, R(-30, 10), R(380, 470), R(0.9, 1.3), R(-70, -30));
    leaf(g, R(390, 420), R(330, 450), R(0.9, 1.3), R(200, 245));
    return () => {
      for (let i = 0; i < 14; i++) {
        const x = R(0, 400), y = R(430, 505);
        out.push(<path key={key()} d={`M${n1(x)} ${n1(y)} l-7 -20 M${n1(x)} ${n1(y)} l0 -26 M${n1(x)} ${n1(y)} l7 -20`}
          stroke="#2C7A3A" strokeWidth={4} strokeLinecap="round" fill="none" />);
      }
      for (let i = 0; i < 34; i++) {
        out.push(<circle key={key()} cx={n1(R(0, 400))} cy={n1(R(0, 420))} r={n1(R(2, 4))} fill="#FFF7B0" stroke={INK} strokeWidth={1.2} />);
      }
    };
  },

  ocean(g) {
    const { out, R, pick, key } = g;
    gradient(g, "sea", "#8BE3F7", "#2B7CC9");
    for (let i = 0; i < 4; i++) {
      const x = R(-40, 360), wdt = R(30, 70), lean = R(40, 120);
      out.push(<polygon key={key()} points={`${n1(x)},-10 ${n1(x + wdt)},-10 ${n1(x + wdt + lean)},${H} ${n1(x + lean)},${H}`} fill="#FFFFFF" opacity={0.16} />);
    }
    for (let i = 0; i < 3; i++) {
      const x = R(20, 360), y = R(60, 220), s = R(0.7, 1.1);
      out.push(<g key={key()} transform={`translate(${n1(x)} ${n1(y)}) scale(${n1(s * 10) / 10})`} opacity={0.4}>
        <ellipse rx={22} ry={11} fill="#FFFFFF" /><polygon points="18,0 34,-10 34,10" fill="#FFFFFF" />
      </g>);
    }
    for (let i = 0; i < 6; i++) {
      const x = R(0, 400), top = R(260, 380), sway = R(18, 34);
      const d = `M${n1(x)} ${H + 10} C${n1(x + sway)} ${n1(top + 140)} ${n1(x - sway)} ${n1(top + 70)} ${n1(x + sway * 0.4)} ${n1(top)}`;
      out.push(<path key={key()} d={d} stroke={INK} strokeWidth={20} strokeLinecap="round" fill="none" />);
      out.push(<path key={key()} d={d} stroke={pick(["#2FA36B", "#46C07E", "#248F5C"])} strokeWidth={13} strokeLinecap="round" fill="none" />);
    }
    out.push(<path key={key()} d={hill(R, R(415, 440), 16, 4)} fill="#F4D58D" stroke={INK} strokeWidth={4} />);
    for (let i = 0; i < 4; i++) {
      out.push(<polygon key={key()} points={starPoints(R(20, 380), R(450, 490), R(11, 17))} fill={pick(["#FF9F68", "#FF6B6B", "#FFC53D"])} stroke={INK} strokeWidth={3} strokeLinejoin="round" />);
    }
    for (let i = 0; i < 2; i++) {
      const cx = R(30, 370), cy = R(400, 440);
      for (let j = 0; j < 5; j++) {
        out.push(<circle key={key()} cx={n1(cx + R(-26, 26))} cy={n1(cy + R(-30, 5))} r={n1(R(8, 15))} fill="#FF7A8A" stroke={INK} strokeWidth={3} />);
      }
    }
    return () => {
      for (let i = 0; i < 32; i++) {
        const x = R(0, 400), y = R(0, 470), r = R(4, 14);
        out.push(<g key={key()}>
          <circle cx={n1(x)} cy={n1(y)} r={n1(r)} fill="#FFFFFF" fillOpacity={0.3} stroke="#FFFFFF" strokeWidth={2.5} />
          <circle cx={n1(x - r * 0.35)} cy={n1(y - r * 0.35)} r={n1(r * 0.22)} fill="#FFFFFF" />
        </g>);
      }
    };
  },

  night(g) {
    const { out, R, pick, key } = g;
    gradient(g, "night", "#1D1B4A", "#5A4AA0");
    for (let i = 0; i < 60; i++) {
      out.push(<polygon key={key()} points={starPoints(R(0, 400), R(0, 340), R(3, 10))} fill={pick(["#FFE27A", "#FFFFFF", "#9FE6FF"])} />);
    }
    const mx = R(60, 340), my = R(60, 120);
    out.push(<circle key={key()} cx={n1(mx)} cy={n1(my)} r={40} fill="#FFF1B8" stroke={INK} strokeWidth={4} />);
    for (let i = 0; i < 3; i++) {
      out.push(<circle key={key()} cx={n1(mx + R(-20, 20))} cy={n1(my + R(-20, 20))} r={n1(R(5, 9))} fill="#F0D98A" />);
    }
    for (const [base, fill] of [[R(300, 330), "#4A3D86"], [R(370, 400), "#2F2766"]]) {
      let d = `M-20 ${H + 20} L-20 ${n1(base)}`;
      for (let x = 0; x <= W + 40; x += R(50, 90)) d += ` L${n1(x)} ${n1(base - R(10, 110))} L${n1(x + R(25, 45))} ${n1(base + R(-10, 20))}`;
      out.push(<path key={key()} d={`${d} L${W + 20} ${H + 20} Z`} fill={fill} stroke={INK} strokeWidth={4} strokeLinejoin="round" />);
    }
    return () => {
      for (let i = 0; i < 16; i++) {
        const x = R(0, 400), y = R(150, 490);
        out.push(<g key={key()}>
          <circle cx={n1(x)} cy={n1(y)} r={10} fill="#FFF59D" opacity={0.28} />
          <circle cx={n1(x)} cy={n1(y)} r={3.5} fill="#FFF59D" />
        </g>);
      }
    };
  },

  candy(g) {
    const { out, R, pick, key } = g;
    gradient(g, "candy", "#FFD1E6", "#FFEFD2");
    for (let i = 0; i < 40; i++) {
      out.push(<circle key={key()} cx={n1(R(0, 400))} cy={n1(R(0, 400))} r={n1(R(5, 12))}
        fill={pick(["#FFFFFF", "#FFB3D6", "#FFE08A", "#C9F0FF"])} opacity={0.7} />);
    }
    for (let i = 0; i < 3; i++) cloud(g, R(-20, 330), R(40, 220), R(0.6, 1), "#FFF8FC");
    for (let i = 0; i < 3; i++) {
      const x = R(30, 370), top = R(170, 300), r = R(24, 36);
      out.push(<g key={key()}>
        <line x1={n1(x)} y1={n1(top)} x2={n1(x)} y2={H} stroke={INK} strokeWidth={10} strokeLinecap="round" />
        <line x1={n1(x)} y1={n1(top)} x2={n1(x)} y2={H} stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
        <circle cx={n1(x)} cy={n1(top)} r={n1(r)} fill={pick(["#FF6B6B", "#9B5DE5", "#3DD6C0", "#FFC53D"])} stroke={INK} strokeWidth={4} />
        <circle cx={n1(x)} cy={n1(top)} r={n1(r * 0.62)} fill="none" stroke="#FFFFFF" strokeWidth={5} />
        <circle cx={n1(x)} cy={n1(top)} r={n1(r * 0.25)} fill="none" stroke="#FFFFFF" strokeWidth={4} />
      </g>);
    }
    out.push(<path key={key()} d={hill(R, R(385, 415), 18, 5)} fill="#FF8FC7" stroke={INK} strokeWidth={4} />);
    for (let i = 0; i < 6; i++) {
      const x = R(10, 390), y = R(440, 495), s = R(16, 24);
      out.push(<path key={key()} d={`M${n1(x - s)} ${n1(y)} C${n1(x - s)} ${n1(y - s * 1.5)} ${n1(x + s)} ${n1(y - s * 1.5)} ${n1(x + s)} ${n1(y)} Z`}
        fill={pick(["#B5E655", "#4CC9F0", "#FFC53D", "#FF6B6B"])} stroke={INK} strokeWidth={3} />);
    }
    return () => {
      const colors = ["#FF6B6B", "#4CC9F0", "#B5E655", "#9B5DE5", "#FFC53D", "#FFFFFF"];
      for (let i = 0; i < 90; i++) {
        const x = R(0, 400), y = R(0, 500);
        out.push(<rect key={key()} x={n1(x)} y={n1(y)} width={11} height={4} rx={2} fill={pick(colors)}
          transform={`rotate(${Math.round(R(0, 180))} ${n1(x + 5.5)} ${n1(y + 2)})`} />);
      }
    };
  },
};

function critter(g) {
  const { R, pick, key } = g;
  const c = pick(CRITTERS);
  const cx = R(140, 260), cy = R(235, 300), s = R(72, 92);
  const kind = pick(["ears", "horns", "antenna", "fins"]);
  const oneEye = R(0, 1) < 0.3;
  const tilt = R(-12, 12);
  const look = [R(-0.25, 0.25), R(-0.2, 0.2)];
  const parts = [];
  const add = (el) => parts.push(React.cloneElement(el, { key: parts.length }));
  const stroke = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" };

  if (kind !== "fins") {
    const d = `M${n1(s * 0.85)} ${n1(s * 0.35)} C${n1(s * 1.35)} ${n1(s * 0.3)} ${n1(s * 1.45)} ${n1(-s * 0.2)} ${n1(s * 1.15)} ${n1(-s * 0.45)}`;
    add(<path d={d} stroke={INK} strokeWidth={s * 0.2} strokeLinecap="round" fill="none" />);
    add(<path d={d} stroke={c.body} strokeWidth={s * 0.11} strokeLinecap="round" fill="none" />);
  }
  for (const side of [-1, 1]) add(<ellipse cx={side * s * 0.45} cy={s * 0.82} rx={s * 0.22} ry={s * 0.14} fill={c.body} {...stroke} />);
  if (kind === "fins") {
    for (const side of [-1, 1]) {
      add(<ellipse cx={side * s * 0.98} cy={s * 0.02} rx={s * 0.4} ry={s * 0.18} fill={c.belly} {...stroke}
        transform={`rotate(${side * -28} ${n1(side * s * 0.98)} ${n1(s * 0.02)})`} />);
    }
  }
  if (kind === "ears") {
    for (const side of [-1, 1]) {
      add(<circle cx={side * s * 0.6} cy={-s * 0.7} r={s * 0.28} fill={c.body} {...stroke} />);
      add(<circle cx={side * s * 0.6} cy={-s * 0.7} r={s * 0.14} fill={c.belly} />);
    }
  }
  if (kind === "horns") {
    for (const side of [-1, 1]) {
      add(<path d="M-12 6 Q-4 -40 20 -52 Q8 -22 14 8 Z" fill="#FFF1CF" {...stroke}
        transform={`translate(${n1(side * s * 0.45)} ${n1(-s * 0.72)}) scale(${n1((side * s) / 80 * 100) / 100} ${n1((s / 80) * 100) / 100})`} />);
    }
  }
  if (kind === "antenna") {
    for (const side of [-1, 1]) {
      add(<line x1={side * s * 0.28} y1={-s * 0.78} x2={side * s * 0.55} y2={-s * 1.25} stroke={INK} strokeWidth={5} strokeLinecap="round" />);
      add(<circle cx={side * s * 0.55} cy={-s * 1.25} r={s * 0.13} fill={c.spot} {...stroke} />);
    }
  }
  add(<ellipse rx={s} ry={s * 0.86} fill={c.body} stroke={INK} strokeWidth={6} />);
  add(<ellipse cy={s * 0.36} rx={s * 0.58} ry={s * 0.4} fill={c.belly} />);
  for (let i = 0; i < 3; i++) {
    add(<circle cx={R(-0.6, 0.6) * s} cy={R(-0.7, -0.45) * s} r={R(0.07, 0.12) * s} fill={c.spot} />);
  }
  const eyes = oneEye ? [[0, -s * 0.16, s * 0.38]] : [[-s * 0.36, -s * 0.12, s * 0.27], [s * 0.36, -s * 0.12, s * 0.27]];
  for (const [ex, ey, er] of eyes) {
    add(<circle cx={ex} cy={ey} r={er} fill="#FFFFFF" {...stroke} />);
    add(<circle cx={ex + look[0] * er} cy={ey + look[1] * er} r={er * 0.55} fill={INK} />);
    add(<circle cx={ex + look[0] * er - er * 0.2} cy={ey + look[1] * er - er * 0.22} r={er * 0.2} fill="#FFFFFF" />);
  }
  for (const side of [-1, 1]) add(<ellipse cx={side * s * 0.64} cy={s * 0.22} rx={s * 0.14} ry={s * 0.09} fill="#FF7A9A" opacity={0.65} />);
  add(<path d={`M${n1(-s * 0.15)} ${n1(s * 0.3)} Q0 ${n1(s * 0.46)} ${n1(s * 0.15)} ${n1(s * 0.3)}`} stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />);

  g.out.push(<g key={key()} transform={`translate(${n1(cx)} ${n1(cy)}) rotate(${n1(tilt)})`}>{parts}</g>);
}

// The picture for one puzzle, as a React element that can be drawn more than
// once (the board, and every candidate piece). `uid` keeps gradient ids apart
// between puzzles.
export function buildScene(sceneSeed, uid) {
  const rand = seededRand(sceneSeed);
  for (let i = 0; i < 6; i++) rand();
  let k = 0;
  const g = {
    out: [],
    R: (a, b) => a + rand() * (b - a),
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    id: (name) => `pz${uid}-${name}`,
    key: () => k++,
  };
  const world = g.pick(Object.keys(WORLDS));
  const front = WORLDS[world](g);
  critter(g);
  front();
  return <g>{g.out}</g>;
}
