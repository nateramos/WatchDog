import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda'

// The demo's one-click "question" has no secret answer; verify-challenge.ts only checks that
// the account signing in is the demo account.
export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  event.response.publicChallengeParameters = { kind: 'demo' }
  event.response.privateChallengeParameters = {}
  event.response.challengeMetadata = 'DEMO_SIGN_IN'
  return event
}
