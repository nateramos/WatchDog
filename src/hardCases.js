// Firearm-only results of tracking/eval_clips.py on the hard-case clips in tracking/eval/clips.csv.
// Each flag snapshot was checked by hand to see if the box was on the weapon.

export const NO_WEAPON = [
  { clip: 'Students walking down a school hallway with books', flagged: "gun 48% on a student's jacket, hand in pocket", correct: false },
  { clip: 'Phone in one hand, dim room', flagged: 'gun 45% on a houseplant', correct: false },
  { clip: 'Two people under an open umbrella', flagged: 'nothing', correct: true },
  { clip: 'Woman holding a black umbrella by its handle', flagged: 'nothing', correct: true },
  { clip: 'Cordless drill at a workbench', flagged: 'gun 46%, gun 41% on the drill', correct: false },
  { clip: 'Close-up of a power drill', flagged: 'nothing', correct: true },
  { clip: 'Hair dryer pointed at the camera', flagged: 'gun 49%, gun 52% on the dryer and the woman', correct: false },
  { clip: 'Black saxophone case carried through a dim room', flagged: 'gun 73% on the saxophone, gun 65% on a strap', correct: false },
  { clip: 'Flashlight held in a dark room', flagged: 'nothing', correct: true },
  { clip: 'Photographer carrying a tripod in snow', flagged: 'gun 45 to 61% on the tripod, 3 times', correct: false },
  { clip: 'Worker pushing a metal cart down a hospital hallway', flagged: 'gun 48%, gun 42% on the worker and cart', correct: false },
]

export const WEAPON = [
  { clip: 'Rifle in full view outdoors, daylight (demo clip)', flagged: 'gun 86%, every checked frame', correct: true },
  { clip: 'Handgun at an indoor range, green light', flagged: 'gun 89%, 12 of 14 frames', correct: true },
  { clip: 'Handgun raised beside a face for a few seconds', flagged: 'gun 55%, 1 of 37 frames', correct: true },
  { clip: 'Reenactor with a musket and ramrod', flagged: 'gun up to 79% on the musket', correct: true },
  { clip: 'Hunter with a rifle slung on his back', flagged: 'gun 53% on the barrel, plus a false box on trees', correct: true },
  { clip: 'Handgun with a flashlight, very dark apartment', flagged: 'gun 72% on the gun', correct: true },
  { clip: 'Handgun drawn in a dark hallway (vertical video)', flagged: 'nothing', correct: false },
  { clip: 'Silhouette with a gun light, dim hallway (vertical video)', flagged: 'nothing', correct: false },
]
