import * as THREE from 'three';

/**
 * Extract bone names from a model's skeleton.
 */
export function getBoneNames(object: THREE.Object3D): string[] {
  const names: string[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Bone) {
      names.push(child.name);
    }
  });
  return [...new Set(names)];
}

/**
 * Strip common prefixes from a bone name to get a normalized form.
 * e.g. "mixamorigHips" → "Hips", "mixamorig:Hips" → "Hips"
 */
function normalizeBoneName(name: string): string {
  return name
    .replace(/^mixamorig[:\s]?/i, '')
    .replace(/^Armature[/|]/, '')
    .trim();
}

// Aliases: normalized name → list of alternative normalized names
const BONE_ALIASES: Record<string, string[]> = {
  hips: ['pelvis', 'hip', 'root'],
  spine: ['spine1', 'spine_01'],
  spine1: ['spine_01', 'spine2'],
  spine2: ['spine_02', 'chest', 'upperchest'],
  neck: ['neck1'],
  head: ['head'],
  leftshoulder: ['shoulder_l', 'l_shoulder', 'l_clavicle'],
  leftarm: ['upperarm_l', 'l_upperarm', 'leftupperarm'],
  leftforearm: ['lowerarm_l', 'l_lowerarm', 'leftlowerarm'],
  lefthand: ['hand_l', 'l_hand'],
  rightshoulder: ['shoulder_r', 'r_shoulder', 'r_clavicle'],
  rightarm: ['upperarm_r', 'r_upperarm', 'rightupperarm'],
  rightforearm: ['lowerarm_r', 'r_lowerarm', 'rightlowerarm'],
  righthand: ['hand_r', 'r_hand'],
  leftupleg: ['thigh_l', 'l_thigh', 'leftupperleg'],
  leftleg: ['calf_l', 'l_calf', 'leftlowerleg'],
  leftfoot: ['foot_l', 'l_foot'],
  lefttoebase: ['toe_l', 'l_toe'],
  rightupleg: ['thigh_r', 'r_thigh', 'rightupperleg'],
  rightleg: ['calf_r', 'r_calf', 'rightlowerleg'],
  rightfoot: ['foot_r', 'r_foot'],
  righttoebase: ['toe_r', 'r_toe'],
};

/**
 * Build a mapping from source bone names → target bone names by
 * normalizing both sides and matching by name / alias.
 */
export function buildBoneMapping(
  sourceBones: string[],
  targetBones: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Build a lookup: normalizedName → actual target bone name
  const targetLookup = new Map<string, string>();
  for (const tb of targetBones) {
    const norm = normalizeBoneName(tb).toLowerCase();
    targetLookup.set(norm, tb);
  }

  for (const sb of sourceBones) {
    const normSource = normalizeBoneName(sb).toLowerCase();

    // Direct normalized match
    if (targetLookup.has(normSource)) {
      mapping[sb] = targetLookup.get(normSource)!;
      continue;
    }

    // Try aliases
    const aliases = BONE_ALIASES[normSource];
    if (aliases) {
      for (const alias of aliases) {
        if (targetLookup.has(alias.toLowerCase())) {
          mapping[sb] = targetLookup.get(alias.toLowerCase())!;
          break;
        }
      }
    }
  }

  return mapping;
}

/**
 * Remap animation clip track names from source skeleton bone names
 * to target skeleton bone names. This is the most reliable approach
 * for applying Mixamo animations to AI-generated models.
 *
 * Each track name has the format: "boneName.property" (e.g. "mixamorigHips.position")
 * We replace the boneName part using the mapping.
 */
export function remapClipTrackNames(
  clip: THREE.AnimationClip,
  boneMapping: Record<string, string>,
): THREE.AnimationClip {
  const newTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    // Track name format: "boneName.property" or "boneName.property[index]"
    const dotIndex = track.name.indexOf('.');
    if (dotIndex === -1) {
      newTracks.push(track);
      continue;
    }

    const boneName = track.name.substring(0, dotIndex);
    const property = track.name.substring(dotIndex);

    const mappedBone = boneMapping[boneName];
    if (mappedBone) {
      const newTrack = track.clone();
      newTrack.name = mappedBone + property;
      newTracks.push(newTrack);
    }
    // If no mapping found, skip the track (it targets a bone the model doesn't have)
  }

  return new THREE.AnimationClip(clip.name, clip.duration, newTracks, clip.blendMode);
}
