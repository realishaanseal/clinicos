"use client";

/**
 * The 3D half of the motion smoke test.
 *
 * Never imported directly — MotionLab pulls this in through next/dynamic with
 * ssr:false. That is required, not an optimisation: R3F touches window and WebGL
 * during render and will break the server build otherwise. It also keeps three.js
 * (~600KB) out of every clinical route's bundle.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, AdaptiveDpr } from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";

function Blob({ still }: { still: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!still && ref.current) ref.current.rotation.y += delta * 0.25;
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.25, 24]} />
      <MeshDistortMaterial
        color="#14918a"
        speed={still ? 0 : 1.4}
        distort={still ? 0.15 : 0.35}
        roughness={0.35}
        metalness={0.1}
      />
    </mesh>
  );
}

export default function Scene({ still }: { still: boolean }) {
  return (
    <Canvas
      // Capped for the low-end laptops this is actually meant to run on.
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
      camera={{ position: [0, 0, 4], fov: 45 }}
      frameloop={still ? "demand" : "always"}
    >
      <AdaptiveDpr pixelated />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 2]} intensity={1.6} />
      <Float speed={still ? 0 : 1.2} rotationIntensity={still ? 0 : 0.4} floatIntensity={still ? 0 : 0.6}>
        <Blob still={still} />
      </Float>
    </Canvas>
  );
}
