/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text } from '@react-three/drei';

const ENEMY_SPEED = 6; // 2x slower than player speed (12)
const SHOOT_DIST = 15;
const SHOOT_COOLDOWN = 3000;

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const lastShootTime = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state_fiber) => {
    if (!body.current || gameState !== 'playing') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    // Always target the player
    const playerPos = camera.position.clone();
    playerPos.y = pos.y; 
    const distToPlayer = currentPos.distanceTo(playerPos);

    const direction = new THREE.Vector3();
    direction.subVectors(playerPos, currentPos).normalize();

    // Shooting logic
    const now = Date.now();
    if (distToPlayer < SHOOT_DIST && now - lastShootTime.current > SHOOT_COOLDOWN && playerState === 'active') {
      const rayDir = new THREE.Vector3().subVectors(playerPos, currentPos).normalize();
      
      // Add random spread
      const spread = 0.1;
      rayDir.x += (Math.random() - 0.5) * spread;
      rayDir.y += (Math.random() - 0.5) * spread;
      rayDir.z += (Math.random() - 0.5) * spread;
      rayDir.normalize();
      
      const startPos = new THREE.Vector3(currentPos.x, currentPos.y + 0.5, currentPos.z);
      startPos.add(rayDir.clone().multiplyScalar(1.5));

      const ray = new rapier.Ray(startPos, rayDir);
      const hit = world.castRay(ray, SHOOT_DIST, true);

      if (hit) {
        const collider = hit.collider;
        const rb = collider.parent();
        if (rb && rb.userData && (rb.userData as any).name === 'player') {
          hitPlayer();
          addParticles([camera.position.x, camera.position.y, camera.position.z], data.color);
          addLaser(
            [startPos.x, startPos.y, startPos.z],
            [camera.position.x, camera.position.y, camera.position.z],
            data.color
          );
        } else {
          const hitPoint = ray.pointAt(hit.timeOfImpact);
          addParticles([hitPoint.x, hitPoint.y, hitPoint.z], data.color);
          addLaser(
            [startPos.x, startPos.y, startPos.z],
            [hitPoint.x, hitPoint.y, hitPoint.z],
            data.color
          );
        }
        lastShootTime.current = now;
      }
    }

    // Apply movement
    const velocity = body.current.linvel();
    body.current.setLinvel({
      x: direction.x * ENEMY_SPEED,
      y: velocity.y,
      z: direction.z * ENEMY_SPEED
    }, true);

    // Rotate to face player
    if (groupRef.current) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      groupRef.current.rotation.y = targetRotation;
    }
  });

  const color = data.color;

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={groupRef} position={[0, 0, 0]}>
        <mesh castShadow position={[0, 1, 0]}>
          <capsuleGeometry args={[0.5, 1]} />
          <meshStandardMaterial 
            color={color} 
            roughness={0.3} 
            metalness={0.8} 
            emissive={color}
            emissiveIntensity={0.4}
          />
        </mesh>
        
        <mesh position={[0, 1.6, 0.45]}>
          <boxGeometry args={[0.6, 0.2, 0.2]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </RigidBody>
  );
}
