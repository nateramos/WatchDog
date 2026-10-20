// Results of tracking/eval_clips.py at the demo's settings (firearms only, two frames in a row)
// on the hard-case clips in tracking/eval/clips.csv.
// Each flag snapshot was checked by hand to see if the box was on the weapon.

export const NO_WEAPON = [
  { clip: 'Students walking down a school hallway with books', flagged: 'nothing', correct: true },
  { clip: 'Phone in one hand, dim room', flagged: 'nothing', correct: true },
  { clip: 'Two people under an open umbrella', flagged: 'nothing', correct: true },
  { clip: 'Woman holding a black umbrella by its handle', flagged: 'nothing', correct: true },
  { clip: 'Cordless drill at a workbench', flagged: 'gun 46%, gun 75% on the drill', correct: false },
  { clip: 'Close-up of a power drill', flagged: 'nothing', correct: true },
  { clip: 'Hair dryer pointed at the camera', flagged: 'nothing', correct: true },
  { clip: 'Black saxophone case carried through a dim room', flagged: 'gun 73% on the saxophone', correct: false },
  { clip: 'Flashlight held in a dark room', flagged: 'nothing', correct: true },
  { clip: 'Photographer carrying a tripod in snow', flagged: 'gun 51 to 70% on the tripod, 3 times', correct: false },
  { clip: 'Worker pushing a metal cart down a hospital hallway', flagged: 'gun 48% on the worker and cart', correct: false },
]

export const WEAPON = [
  { clip: 'Rifle in full view outdoors, daylight (demo clip)', flagged: 'gun 87%, every checked frame', correct: true },
  { clip: 'Handgun at an indoor range, green light', flagged: 'gun 89%, 24 of 28 frames', correct: true },
  { clip: 'Handgun raised beside a face for a few seconds', flagged: 'gun 60%, 3 of 73 frames', correct: true },
  { clip: 'Reenactor with a musket and ramrod', flagged: 'gun up to 81% on the musket', correct: true },
  { clip: 'Hunter with a rifle slung on his back', flagged: 'gun 58% on the barrel, plus a false box on trees', correct: true },
  { clip: 'Handgun with a flashlight, very dark apartment', flagged: 'gun up to 66% on the gun', correct: true },
  { clip: 'Handgun drawn in a dark hallway (vertical video)', flagged: 'nothing', correct: false },
  { clip: 'Silhouette with a gun light, dim hallway (vertical video)', flagged: 'nothing', correct: false },
]
