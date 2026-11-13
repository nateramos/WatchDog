import { defineFunction } from '@aws-amplify/backend'

// The judges' demo account. It is a username, not a secret: anyone may sign in as the demo,
// which only holds made-up data. Every other account needs its own password.
export const DEMO_EMAIL = 'demo@watchdog-demo.example'

const environment = { DEMO_EMAIL }

export const defineAuthChallenge = defineFunction({
  name: 'demo-define-challenge',
  entry: './define-challenge.ts',
  environment,
})

export const createAuthChallenge = defineFunction({
  name: 'demo-create-challenge',
  entry: './create-challenge.ts',
  environment,
})

export const verifyAuthChallengeResponse = defineFunction({
  name: 'demo-verify-challenge',
  entry: './verify-challenge.ts',
  environment,
})
